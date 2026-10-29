/**
 * Central Billing & Receipt Service
 * Decimal-safe fee collection, sequential receipt numbers (REC-10001+), and reprint tracking.
 * Unified financial source of truth for consultations, investigations, and clinical encounters.
 */

const { query, pool } = require('../config/database');
const { generateReceiptNumber } = require('../utils/receiptNumberGenerator');

const VALID_PAYMENT_METHODS = ['cash', 'upi', 'card', 'bank_transfer', 'insurance', 'other'];

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
         clinic_id, branch_id, appointment_id, visit_id, patient_id, receipt_number,
         gross_amount, discount_amount, amount_paid, remaining_balance,
         payment_method, transaction_reference, notes, reprint_count,
         received_by, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, $14, now())
       RETURNING *`,
      [
        clinicId,
        branchId,
        appointmentId,
        appt.visit_id || null,
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

    // 5. Sync to Central Billing charges table (consultation charge)
    await client.query(
      `INSERT INTO billing_charges (
         clinic_id, branch_id, patient_id, visit_id, appointment_id,
         charge_type, source_id, source_reference, item_code, description,
         unit_price, quantity, gross_amount, discount_amount, net_amount,
         amount_paid, status, created_by, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, 'consultation', $5, $6, 'CONSULT', 'Doctor Consultation Fee', $7, 1, $7, $8, $9, $10, $11, $12, now(), now())
       ON CONFLICT (clinic_id, charge_type, source_id)
       DO UPDATE SET
         discount_amount = EXCLUDED.discount_amount,
         net_amount = EXCLUDED.net_amount,
         amount_paid = EXCLUDED.amount_paid,
         status = EXCLUDED.status,
         updated_at = now()`,
      [
        clinicId,
        branchId,
        appt.patient_id,
        appt.visit_id || null,
        appointmentId,
        appt.appointment_number,
        grossAmount,
        discountAmount,
        netBillable,
        newTotalPaid,
        newPaymentStatus,
        userId,
      ]
    );

    // 6. Audit in appointment status history
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
 * Record Central Billing payment for an entire visit or specific investigation order
 * Single source of financial truth.
 */
const recordCentralBillingPayment = async (clinicId, branchId, paymentData, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      visit_id: visitId,
      appointment_id: appointmentId,
      patient_id: inputPatientId,
      investigation_order_id: investigationOrderId,
      amount_paid: rawAmountPaid,
      discount_amount: rawDiscountAmount = 0,
      payment_method: paymentMethod = 'cash',
      transaction_reference = null,
      notes = null,
    } = paymentData;

    const amountPaid = parseFloat(rawAmountPaid);
    if (isNaN(amountPaid) || amountPaid <= 0) {
      const err = new Error('amount_paid must be a positive number.');
      err.statusCode = 400;
      throw err;
    }

    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      const err = new Error(`payment_method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}.`);
      err.statusCode = 400;
      throw err;
    }

    const discountAmount = Math.max(0, parseFloat(rawDiscountAmount) || 0);

    // Resolve patient & visit details
    let resolvedPatientId = inputPatientId;
    let resolvedAppointmentId = appointmentId;
    let resolvedVisitId = visitId;

    if (resolvedVisitId) {
      const visitRes = await client.query(
        `SELECT id, patient_id, appointment_id FROM patient_visits WHERE id = $1 AND clinic_id = $2`,
        [resolvedVisitId, clinicId]
      );
      if (visitRes.rows.length === 0) {
        const err = new Error('Visit record not found.');
        err.statusCode = 404;
        throw err;
      }
      resolvedPatientId = visitRes.rows[0].patient_id;
      if (!resolvedAppointmentId) {
        resolvedAppointmentId = visitRes.rows[0].appointment_id;
      }
    } else if (resolvedAppointmentId) {
      const apptRes = await client.query(
        `SELECT id, patient_id, visit_id FROM appointments WHERE id = $1 AND clinic_id = $2`,
        [resolvedAppointmentId, clinicId]
      );
      if (apptRes.rows.length === 0) {
        const err = new Error('Appointment record not found.');
        err.statusCode = 404;
        throw err;
      }
      resolvedPatientId = apptRes.rows[0].patient_id;
      resolvedVisitId = apptRes.rows[0].visit_id;
    }

    if (!resolvedPatientId) {
      const err = new Error('patient_id or a valid visit_id / appointment_id is required.');
      err.statusCode = 400;
      throw err;
    }

    // Query pending charges for this encounter/order with row lock FOR UPDATE
    let chargeQuery = `
      SELECT * FROM billing_charges
      WHERE clinic_id = $1 AND patient_id = $2 AND status NOT IN ('paid', 'cancelled', 'refunded')
    `;
    const chargeParams = [clinicId, resolvedPatientId];

    if (investigationOrderId) {
      chargeQuery += ` AND source_id IN (SELECT id FROM investigation_order_items WHERE order_id = $3)`;
      chargeParams.push(investigationOrderId);
    } else if (resolvedVisitId) {
      chargeQuery += ` AND (visit_id = $3 OR appointment_id = $4)`;
      chargeParams.push(resolvedVisitId, resolvedAppointmentId || '00000000-0000-0000-0000-000000000000');
    }

    chargeQuery += ` FOR UPDATE`;

    const chargesRes = await client.query(chargeQuery, chargeParams);
    const charges = chargesRes.rows;

    let totalPendingNet = 0;
    let totalGross = 0;

    for (const c of charges) {
      const net = parseFloat(c.net_amount);
      const paid = parseFloat(c.amount_paid);
      const due = Math.max(0, net - paid);
      totalPendingNet += due;
      totalGross += parseFloat(c.gross_amount);
    }

    // Check if appointment consultation fee applies and is not already in billing_charges
    let consultFee = 0;
    let consultPaid = 0;
    let consultDue = 0;
    const hasConsultInCharges = charges.some((c) => c.charge_type === 'consultation');

    if (!hasConsultInCharges && resolvedAppointmentId && !investigationOrderId) {
      const singleApptRes = await client.query(
        `SELECT consultation_fee, amount_paid FROM appointments WHERE id = $1 AND clinic_id = $2 FOR UPDATE`,
        [resolvedAppointmentId, clinicId]
      );
      if (singleApptRes.rows.length > 0) {
        consultFee = parseFloat(singleApptRes.rows[0].consultation_fee || 0);
        consultPaid = parseFloat(singleApptRes.rows[0].amount_paid || 0);
        consultDue = Math.max(0, consultFee - consultPaid);
        totalPendingNet += consultDue;
        totalGross += consultFee;
      }
    }

    const netPayable = Math.max(0, totalPendingNet - discountAmount);

    if (totalPendingNet <= 0 || netPayable <= 0) {
      const err = new Error('All charges for this encounter are already fully settled. No payment is due.');
      err.statusCode = 400;
      throw err;
    }

    if (amountPaid > netPayable) {
      const err = new Error(`Payment amount (₹${amountPaid.toFixed(2)}) exceeds remaining balance due (₹${netPayable.toFixed(2)}).`);
      err.statusCode = 400;
      throw err;
    }

    const remainingBalance = Math.max(0, parseFloat((netPayable - amountPaid).toFixed(2)));

    // Generate atomic sequential receipt number (REC-10001+)
    const receiptNumber = await generateReceiptNumber(client, clinicId);

    // Insert payment record into central appointment_payments ledger
    const payRes = await client.query(
      `INSERT INTO appointment_payments (
         clinic_id, branch_id, appointment_id, visit_id, patient_id, investigation_order_id,
         receipt_number, gross_amount, discount_amount, amount_paid, remaining_balance,
         payment_method, transaction_reference, notes, reprint_count, received_by, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 0, $15, now())
       RETURNING *`,
      [
        clinicId,
        branchId,
        resolvedAppointmentId || null,
        resolvedVisitId || null,
        resolvedPatientId,
        investigationOrderId || null,
        receiptNumber,
        totalGross,
        discountAmount,
        amountPaid,
        remainingBalance,
        paymentMethod,
        transaction_reference,
        notes,
        userId,
      ]
    );

    const paymentRecord = payRes.rows[0];

    // Allocate payment across consultation fee and charges
    let unallocatedPayment = amountPaid;

    if (consultDue > 0 && unallocatedPayment > 0) {
      const payToConsult = Math.min(unallocatedPayment, consultDue);
      const newConsultPaid = parseFloat((consultPaid + payToConsult).toFixed(2));
      const consultStatus = newConsultPaid >= consultFee ? 'paid' : (newConsultPaid > 0 ? 'partial' : 'pending');

      await client.query(
        `UPDATE appointments
         SET amount_paid = $1, payment_status = $2, updated_by = $3, updated_at = now()
         WHERE id = $4`,
        [newConsultPaid, consultStatus, userId, resolvedAppointmentId]
      );

      unallocatedPayment = parseFloat((unallocatedPayment - payToConsult).toFixed(2));
    }

    for (const c of charges) {
      if (unallocatedPayment <= 0) break;

      const chargeNet = parseFloat(c.net_amount);
      const chargePaid = parseFloat(c.amount_paid);
      const chargeDue = Math.max(0, chargeNet - chargePaid);

      const toPay = Math.min(unallocatedPayment, chargeDue);
      const newPaid = parseFloat((chargePaid + toPay).toFixed(2));
      const newStatus = newPaid >= chargeNet ? 'paid' : 'partial';

      await client.query(
        `UPDATE billing_charges
         SET amount_paid = $1, status = $2, updated_at = now()
         WHERE id = $3`,
        [newPaid, newStatus, c.id]
      );

      unallocatedPayment = parseFloat((unallocatedPayment - toPay).toFixed(2));
    }

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
           c.name AS clinic_name, c.code AS clinic_code,
           pv.token_display AS visit_token,
           io.order_number AS investigation_order_number
    FROM appointment_payments ap
    JOIN patients p ON ap.patient_id = p.id
    JOIN branches b ON ap.branch_id = b.id
    JOIN clinics c ON ap.clinic_id = c.id
    LEFT JOIN appointments a ON ap.appointment_id = a.id
    LEFT JOIN patient_visits pv ON ap.visit_id = pv.id
    LEFT JOIN investigation_orders io ON ap.investigation_order_id = io.id
    LEFT JOIN users d ON a.doctor_id = d.id
    LEFT JOIN users u ON ap.received_by = u.id
    WHERE ap.id = $1 AND ap.clinic_id = $2 AND ap.branch_id = $3
  `;
  const res = await query(text, [paymentId, clinicId, branchId]);
  if (res.rows.length === 0) {
    return null;
  }

  const receipt = res.rows[0];

  // Fetch line items covered by this receipt/encounter
  const lineItemsRes = await query(
    `SELECT bc.*
     FROM billing_charges bc
     WHERE bc.clinic_id = $1
       AND (bc.visit_id = $2 OR (bc.appointment_id IS NOT NULL AND bc.appointment_id = $3))
       AND bc.status != 'cancelled'`,
    [clinicId, receipt.visit_id, receipt.appointment_id]
  );

  return {
    ...receipt,
    lineItems: lineItemsRes.rows,
  };
};

/**
 * Get unified Central Billing summary for a patient visit
 */
const getVisitBillingSummary = async (clinicId, branchId, visitId) => {
  const visitRes = await query(
    `SELECT pv.*, a.id AS appt_id, a.appointment_number, a.consultation_fee, a.amount_paid AS appt_amount_paid, a.payment_status AS appt_payment_status,
            p.first_name, p.last_name, p.patient_number, p.phone
     FROM patient_visits pv
     JOIN patients p ON pv.patient_id = p.id
     LEFT JOIN appointments a ON pv.appointment_id = a.id
     WHERE pv.id = $1 AND pv.clinic_id = $2`,
    [visitId, clinicId]
  );

  if (visitRes.rows.length === 0) {
    const err = new Error('Visit record not found.');
    err.statusCode = 404;
    throw err;
  }

  const visit = visitRes.rows[0];

  // Fetch all billing charges for this visit (investigations, procedures, etc.)
  const chargesRes = await query(
    `SELECT bc.*,
            io.order_number, io.priority AS order_priority, io.status AS order_status
     FROM billing_charges bc
     LEFT JOIN investigation_order_items ioi ON bc.source_id = ioi.id AND bc.charge_type = 'investigation'
     LEFT JOIN investigation_orders io ON ioi.order_id = io.id
     WHERE bc.clinic_id = $1
       AND (bc.visit_id = $2 OR (bc.appointment_id IS NOT NULL AND bc.appointment_id = $3))
       AND bc.status != 'cancelled'
     ORDER BY bc.created_at ASC`,
    [clinicId, visitId, visit.appt_id]
  );

  // Fetch all payments/receipts for this visit or appointment
  const paymentsRes = await query(
    `SELECT ap.*,
            TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS cashier_name
     FROM appointment_payments ap
     LEFT JOIN users u ON ap.received_by = u.id
     WHERE ap.clinic_id = $1
       AND (ap.visit_id = $2 OR (ap.appointment_id IS NOT NULL AND ap.appointment_id = $3))
     ORDER BY ap.created_at ASC`,
    [clinicId, visitId, visit.appt_id]
  );

  let totalGross = 0;
  let totalNet = 0;
  let totalPaid = 0;

  const lineItems = [];

  // Add Consultation Fee if applicable and not already in billing_charges
  const hasConsultChargeInTable = chargesRes.rows.some((c) => c.charge_type === 'consultation');
  if (!hasConsultChargeInTable && visit.consultation_fee && parseFloat(visit.consultation_fee) > 0) {
    const consultFee = parseFloat(visit.consultation_fee);
    const consultPaid = parseFloat(visit.appt_amount_paid || 0);
    totalGross += consultFee;
    totalNet += consultFee;
    totalPaid += consultPaid;

    lineItems.push({
      charge_type: 'consultation',
      item_code: 'CONSULT',
      description: 'Consultation Fee',
      unit_price: consultFee,
      quantity: 1,
      gross_amount: consultFee,
      discount_amount: 0.00,
      net_amount: consultFee,
      amount_paid: consultPaid,
      status: consultPaid >= consultFee ? 'paid' : (consultPaid > 0 ? 'partial' : 'pending'),
    });
  }

  for (const c of chargesRes.rows) {
    const gross = parseFloat(c.gross_amount);
    const net = parseFloat(c.net_amount);
    const paid = parseFloat(c.amount_paid);
    totalGross += gross;
    totalNet += net;
    totalPaid += paid;

    lineItems.push(c);
  }

  const remainingBalance = Math.max(0, parseFloat((totalNet - totalPaid).toFixed(2)));
  const paymentStatus = remainingBalance <= 0 && totalNet > 0 ? 'paid' : (totalPaid > 0 ? 'partial' : 'pending');

  return {
    visitId,
    appointmentId: visit.appt_id,
    patient: {
      id: visit.patient_id,
      name: `${visit.first_name} ${visit.last_name}`,
      patientNumber: visit.patient_number,
      phone: visit.phone,
    },
    tokenDisplay: visit.token_display,
    summary: {
      totalGross,
      totalNet,
      totalPaid,
      remainingBalance,
      paymentStatus,
    },
    lineItems,
    receipts: paymentsRes.rows,
  };
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
  recordCentralBillingPayment,
  getReceiptById,
  getVisitBillingSummary,
  getAppointmentPayments,
};
