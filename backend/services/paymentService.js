/**
 * Consultation Billing & Receipt Service
 * Decimal-safe fee collection, sequential receipt numbers (REC-10001+), and reprint tracking.
 */

const { query, pool } = require('../config/database');
const { generateReceiptNumber } = require('../utils/receiptNumberGenerator');

const VALID_PAYMENT_METHODS = ['cash', 'upi', 'card', 'bank_transfer', 'insurance'];

/**
 * Record payment for an appointment, generate atomic receipt number, and update balance
 */
const recordPayment = async (clinicId, branchId, appointmentId, paymentData, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch appointment with row lock
    const apptRes = await client.query(
      `SELECT * FROM appointments 
       WHERE id = $1 AND clinic_id = $2 AND branch_id = $3
       FOR UPDATE`,
      [appointmentId, clinicId, branchId]
    );

    if (apptRes.rows.length === 0) {
      const err = new Error('Appointment not found.');
      err.statusCode = 404;
      throw err;
    }

    const appt = apptRes.rows[0];

    if (appt.status === 'cancelled') {
      const err = new Error('Cannot collect payment for a cancelled appointment.');
      err.statusCode = 400;
      throw err;
    }

    const amountPaid = parseFloat(paymentData.amount_paid);
    if (isNaN(amountPaid) || amountPaid <= 0) {
      const err = new Error('amount_paid must be a positive number.');
      err.statusCode = 400;
      throw err;
    }

    const paymentMethod = paymentData.payment_method || 'cash';
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      const err = new Error(`payment_method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}.`);
      err.statusCode = 400;
      throw err;
    }

    // Verify appointment has a valid, configured consultation fee snapshot
    const consultationFee = parseFloat(appt.consultation_fee);
    if (isNaN(consultationFee) || consultationFee <= 0) {
      const err = new Error('Cannot collect payment: Consultation fee is not configured for this appointment.');
      err.statusCode = 400;
      throw err;
    }

    const discountAmount = parseFloat(paymentData.discount_amount || 0);
    // Authoritative gross amount directly from immutable appointment snapshot (no client payload bypass)
    const grossAmount = consultationFee;

    const currentPaid = parseFloat(appt.amount_paid || 0);
    const netBillable = Math.max(0, grossAmount - discountAmount);

    // Prevent duplicate payment collections if fee is already fully settled
    if (appt.payment_status === 'paid' || (currentPaid >= netBillable && netBillable > 0)) {
      const err = new Error('Fee for this appointment is already fully settled. No additional payment is due.');
      err.statusCode = 400;
      throw err;
    }

    const newTotalPaid = currentPaid + amountPaid;
    if (newTotalPaid > netBillable) {
      const remainingDue = Math.max(0, parseFloat((netBillable - currentPaid).toFixed(2)));
      const err = new Error(`Payment amount (₹${amountPaid.toFixed(2)}) exceeds remaining balance due (₹${remainingDue.toFixed(2)}).`);
      err.statusCode = 400;
      throw err;
    }

    const remainingBalance = Math.max(0, parseFloat((netBillable - newTotalPaid).toFixed(2)));

    // 2. Generate atomic receipt number (REC-10001+)
    const receiptNumber = await generateReceiptNumber(client, clinicId);

    // 3. Insert payment record
    const payRes = await client.query(
      `INSERT INTO appointment_payments (
         clinic_id, branch_id, appointment_id, patient_id, receipt_number,
         gross_amount, discount_amount, amount_paid, remaining_balance,
         payment_method, transaction_reference, notes, reprint_count,
         received_by, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, $13, now())
       RETURNING *`,
      [
        clinicId,
        branchId,
        appointmentId,
        appt.patient_id,
        receiptNumber,
        grossAmount,
        discountAmount,
        amountPaid,
        remainingBalance,
        paymentMethod,
        paymentData.transaction_reference || null,
        paymentData.notes || null,
        userId,
      ]
    );

    const paymentRecord = payRes.rows[0];

    // 4. Update appointment payment status and amounts
    let newPaymentStatus = 'partial';
    if (remainingBalance <= 0) {
      newPaymentStatus = 'paid';
    } else if (newTotalPaid === 0) {
      newPaymentStatus = 'pending';
    }

    await client.query(
      `UPDATE appointments
       SET amount_paid = $1, payment_status = $2, updated_by = $3, updated_at = now()
       WHERE id = $4`,
      [newTotalPaid, newPaymentStatus, userId, appointmentId]
    );

    // 5. Audit in appointment status history
    await client.query(
      `INSERT INTO appointment_status_history (appointment_id, from_status, to_status, notes, changed_by)
       VALUES ($1, $2, $2, $3, $4)`,
      [
        appointmentId,
        appt.status,
        `Payment collected: ₹${amountPaid.toFixed(2)} via ${paymentMethod.toUpperCase()} (Receipt: ${receiptNumber}). Remaining balance: ₹${remainingBalance.toFixed(2)}`,
        userId,
      ]
    );

    await client.query('COMMIT');

    return await getReceiptById(clinicId, branchId, paymentRecord.id, false);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Retrieve receipt details and optionally increment reprint counter
 */
const getReceiptById = async (clinicId, branchId, paymentId, isReprint = false) => {
  if (isReprint) {
    await query(
      `UPDATE appointment_payments 
       SET reprint_count = reprint_count + 1 
       WHERE id = $1 AND clinic_id = $2 AND branch_id = $3`,
      [paymentId, clinicId, branchId]
    );
  }

  const text = `
    SELECT ap.*,
           a.appointment_number, a.appointment_date, a.start_time, a.end_time,
           a.appointment_type, a.status AS appointment_status,
           p.id AS patient_id, p.first_name AS patient_first_name, p.last_name AS patient_last_name,
           p.patient_number, p.phone AS patient_phone, p.email AS patient_email,
           d.first_name AS doctor_first_name, d.last_name AS doctor_last_name,
           u.first_name AS cashier_first_name, u.last_name AS cashier_last_name,
           b.branch_name, b.branch_code, b.phone AS branch_phone, b.email AS branch_email,
           b.address_line1, b.address_line2, b.city, b.state, b.postal_code,
           c.name AS clinic_name, c.code AS clinic_code
    FROM appointment_payments ap
    JOIN appointments a ON ap.appointment_id = a.id
    JOIN patients p ON a.patient_id = p.id
    JOIN users d ON a.doctor_id = d.id
    JOIN branches b ON ap.branch_id = b.id
    JOIN clinics c ON ap.clinic_id = c.id
    LEFT JOIN users u ON ap.received_by = u.id
    WHERE ap.id = $1 AND ap.clinic_id = $2 AND ap.branch_id = $3
  `;
  const res = await query(text, [paymentId, clinicId, branchId]);
  if (res.rows.length === 0) {
    return null;
  }
  return res.rows[0];
};

/**
 * List payments for an appointment
 */
const getAppointmentPayments = async (clinicId, branchId, appointmentId) => {
  const text = `
    SELECT ap.*,
           u.first_name AS cashier_first_name, u.last_name AS cashier_last_name
    FROM appointment_payments ap
    LEFT JOIN users u ON ap.received_by = u.id
    WHERE ap.appointment_id = $1 AND ap.clinic_id = $2 AND ap.branch_id = $3
    ORDER BY ap.created_at ASC
  `;
  const res = await query(text, [appointmentId, clinicId, branchId]);
  return res.rows;
};

module.exports = {
  VALID_PAYMENT_METHODS,
  recordPayment,
  getReceiptById,
  getAppointmentPayments,
};
