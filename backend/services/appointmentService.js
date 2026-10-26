/**
 * Appointment Scheduling & Front-Desk Service
 * Concurrency-safe booking, lifecycle management, token generation, and walk-in encounters.
 */

const { query, pool } = require('../config/database');
const { generateAppointmentNumber } = require('../utils/appointmentNumberGenerator');
const { generateBookingReference } = require('../utils/bookingReferenceGenerator');
const { generatePatientNumber } = require('../utils/patientNumberGenerator');
const { generateVisitToken, getClinicLocalDate } = require('../utils/visitTokenGenerator');
const { getDoctorFee } = require('./scheduleService');
const { isValidStatusTransition } = require('../validations/appointmentValidation');
const availabilityService = require('./availabilityService');

/**
 * Verifies that a doctor exists, is active in the clinic, and is actively assigned to the target branch.
 */
const validateDoctorBranchEligibility = async (clinicId, branchId, doctorId) => {
  const queryText = `
    SELECT u.id, u.first_name, u.last_name, u.is_active
    FROM users u
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN staff s ON s.user_id = u.id
    WHERE u.id = $1 AND u.clinic_id = $2
      AND (
        (s.id IS NOT NULL AND s.staff_category IN ('dentist', 'specialist') AND s.is_active = true)
        OR (s.id IS NULL AND r.name IN ('dentist', 'specialist'))
      )
      AND u.is_active = true
      AND (
        EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id = u.id AND ub.branch_id = $3)
        OR EXISTS (SELECT 1 FROM staff_branches sb WHERE s.id IS NOT NULL AND sb.staff_id = s.id AND sb.branch_id = $3)
      )
  `;
  const res = await query(queryText, [doctorId, clinicId, branchId]);
  if (res.rows.length === 0) {
    const err = new Error('Doctor is not assigned to or eligible at this branch location.');
    err.statusCode = 400;
    throw err;
  }
  return res.rows[0];
};

/**
 * Creates an appointment with transactional double-booking prevention and fee snapshot.
 */
const createAppointment = async (clinicId, branchId, data, userId) => {
  // Validate doctor is actively assigned to this branch location
  await validateDoctorBranchEligibility(clinicId, branchId, data.doctor_id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let patientId = data.patient_id;

    // 1. Quick-register or link existing patient if new_patient provided
    if (!patientId && data.new_patient) {
      const np = data.new_patient;
      const rawPhone = (np.phone || '').trim();

      // Check if patient with same phone already exists in this clinic organization
      if (rawPhone) {
        const existPat = await client.query(
          `SELECT id, patient_number, first_name, last_name, phone
           FROM patients
           WHERE clinic_id = $1 AND phone = $2 AND status != 'archived'
           ORDER BY created_at ASC
           LIMIT 1`,
          [clinicId, rawPhone]
        );
        if (existPat.rows.length > 0) {
          patientId = existPat.rows[0].id;
        }
      }

      if (!patientId) {
        const patientNumber = await generatePatientNumber(client, clinicId);
        const insPatient = await client.query(
          `INSERT INTO patients (
             clinic_id, branch_id, patient_number,
             first_name, last_name, phone, email, date_of_birth, gender,
             address, status, created_by, updated_by
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11, $11)
           RETURNING id, patient_number, first_name, last_name, phone`,
          [
            clinicId,
            branchId,
            patientNumber,
            np.first_name.trim(),
            np.last_name.trim(),
            rawPhone,
            np.email ? np.email.trim() : null,
            np.date_of_birth || null,
            np.gender || 'unspecified',
            np.address || null,
            userId,
          ]
        );
        patientId = insPatient.rows[0].id;
      }
    }

    const {
      doctor_id,
      appointment_date,
      start_time,
      end_time,
      appointment_type = 'consultation',
      chief_complaint = null,
    } = data;

    // 2. Concurrency-aware cross-branch slot check with row-level locks
    const conflictQuery = `
      SELECT a.id, a.appointment_number, a.start_time, a.end_time, a.branch_id, b.branch_name
      FROM appointments a
      JOIN branches b ON a.branch_id = b.id
      WHERE a.clinic_id = $1
        AND a.doctor_id = $2
        AND a.appointment_date = $3
        AND a.status NOT IN ('cancelled')
        AND (a.start_time < $5 AND a.end_time > $4)
      FOR UPDATE OF a
    `;
    const conflictRes = await client.query(conflictQuery, [
      clinicId,
      doctor_id,
      appointment_date,
      start_time,
      end_time,
    ]);

    if (conflictRes.rows.length > 0) {
      const conflict = conflictRes.rows[0];
      const isSameBranch = conflict.branch_id === branchId;
      const err = new Error(
        isSameBranch
          ? `Doctor is already booked for this time interval (${conflict.appointment_number}: ${conflict.start_time} - ${conflict.end_time}).`
          : `Doctor has a conflicting appointment at another branch (${conflict.branch_name}) during this time interval (${conflict.appointment_number}: ${conflict.start_time} - ${conflict.end_time}).`
      );
      err.statusCode = 409;
      throw err;
    }

    // Optional dental chair conflict check
    if (data.chair_id) {
      const chairConflict = await client.query(
        `SELECT id, appointment_number, start_time, end_time
         FROM appointments
         WHERE clinic_id = $1
           AND branch_id = $2
           AND chair_id = $3
           AND appointment_date = $4
           AND status NOT IN ('cancelled')
           AND (start_time < $6 AND end_time > $5)
         FOR UPDATE`,
        [clinicId, branchId, data.chair_id, appointment_date, start_time, end_time]
      );
      if (chairConflict.rows.length > 0) {
        const cConflict = chairConflict.rows[0];
        const err = new Error(
          `Dental chair is already booked for this time interval (${cConflict.appointment_number}: ${cConflict.start_time} - ${cConflict.end_time}).`
        );
        err.statusCode = 409;
        throw err;
      }
    }

    // 3. Consultation Fee Snapshot (authoritative backend resolution)
    const feeMatrix = await getDoctorFee(clinicId, branchId, doctor_id);
    if (!feeMatrix || feeMatrix.fee_not_configured || feeMatrix.consultation_fee === null) {
      const err = new Error('Consultation fee not configured for this doctor at this branch.');
      err.statusCode = 400;
      throw err;
    }

    let feeAmount = feeMatrix.consultation_fee;
    if (appointment_type === 'followup') {
      if (feeMatrix.followup_fee === null) {
        const err = new Error('Follow-up consultation fee not configured for this doctor at this branch.');
        err.statusCode = 400;
        throw err;
      }
      feeAmount = feeMatrix.followup_fee;
    } else if (appointment_type === 'emergency') {
      if (feeMatrix.emergency_fee === null) {
        const err = new Error('Emergency consultation fee not configured for this doctor at this branch.');
        err.statusCode = 400;
        throw err;
      }
      feeAmount = feeMatrix.emergency_fee;
    }

    // 4. Generate Atomic Sequential Appointment Number & Unguessable Booking Reference
    const appointmentNumber = await generateAppointmentNumber(client, clinicId);
    const bookingReference = generateBookingReference();
    const bookingSource = data.booking_source || data.booking_channel || 'reception';
    const bookingMetadata = data.booking_metadata || {};

    // 5. Insert Appointment Record
    const insertAppt = await client.query(
      `INSERT INTO appointments (
         clinic_id, branch_id, appointment_number, booking_reference, booking_source, booking_metadata,
         patient_id, doctor_id, appointment_date, start_time, end_time, appointment_type, status,
         consultation_fee, amount_paid, payment_status, chief_complaint, chair_id,
         created_by, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'scheduled', $13, 0.00, 'pending', $14, $15, $16, $16)
       RETURNING *`,
      [
        clinicId,
        branchId,
        appointmentNumber,
        bookingReference,
        bookingSource,
        bookingMetadata,
        patientId,
        doctor_id,
        appointment_date,
        start_time,
        end_time,
        appointment_type,
        feeAmount,
        chief_complaint,
        data.chair_id || null,
        userId,
      ]
    );

    const appt = insertAppt.rows[0];

    // 6. Record Status History
    await client.query(
      `INSERT INTO appointment_status_history (appointment_id, from_status, to_status, notes, changed_by)
       VALUES ($1, NULL, 'scheduled', 'Appointment booked via VoiceGate Scheduling Engine', $2)`,
      [appt.id, userId]
    );

    await client.query('COMMIT');

    // Fetch complete appointment details with patient and doctor details
    return await getAppointmentById(clinicId, branchId, appt.id);
  } catch (error) {
    await client.query('ROLLBACK');
    // Check for PostgreSQL unique constraint violation on partial unique indexes
    if (error.code === '23505' && (error.constraint === 'uq_doctor_active_slot' || error.constraint === 'uq_doctor_clinic_active_slot')) {
      const err = new Error('Doctor already has an active appointment at this exact date and start time.');
      err.statusCode = 409;
      throw err;
    }
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Reschedules an appointment to a new date and time slot
 */
const rescheduleAppointment = async (clinicId, branchId, appointmentId, data, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch current appointment with FOR UPDATE
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

    const targetDoctorId = data.doctor_id || appt.doctor_id;

    // Validate target doctor eligibility at this branch
    await validateDoctorBranchEligibility(clinicId, branchId, targetDoctorId);

    if (appt.status === 'cancelled') {
      const err = new Error('Cannot reschedule a cancelled appointment.');
      err.statusCode = 400;
      throw err;
    }
    if (appt.status === 'completed') {
      const err = new Error('Cannot reschedule an already completed appointment.');
      err.statusCode = 400;
      throw err;
    }

    const { appointment_date, start_time, end_time, reason = 'Patient requested reschedule' } = data;

    // 2. Concurrency-aware cross-branch slot check for target slot
    const conflictRes = await client.query(
      `SELECT a.id, a.appointment_number, a.start_time, a.end_time, a.branch_id, b.branch_name
       FROM appointments a
       JOIN branches b ON a.branch_id = b.id
       WHERE a.clinic_id = $1
         AND a.doctor_id = $2
         AND a.appointment_date = $3
         AND a.status NOT IN ('cancelled')
         AND a.id != $4
         AND (a.start_time < $6 AND a.end_time > $5)
       FOR UPDATE OF a`,
      [clinicId, targetDoctorId, appointment_date, appointmentId, start_time, end_time]
    );

    if (conflictRes.rows.length > 0) {
      const c = conflictRes.rows[0];
      const isSameBranch = c.branch_id === branchId;
      const err = new Error(
        isSameBranch
          ? `Target slot conflicts with existing booking (${c.appointment_number}: ${c.start_time} - ${c.end_time}).`
          : `Doctor has a conflicting appointment at another branch (${c.branch_name}) during this target slot (${c.appointment_number}: ${c.start_time} - ${c.end_time}).`
      );
      err.statusCode = 409;
      throw err;
    }

    // 3. Update appointment
    const oldDetails = `${appt.appointment_date} (${appt.start_time} - ${appt.end_time})`;
    const newDetails = `${appointment_date} (${start_time} - ${end_time})`;

    await client.query(
      `UPDATE appointments
       SET appointment_date = $1, start_time = $2, end_time = $3, doctor_id = $4, updated_by = $5, updated_at = now()
       WHERE id = $6`,
      [appointment_date, start_time, end_time, targetDoctorId, userId, appointmentId]
    );

    // 4. Record History
    await client.query(
      `INSERT INTO appointment_status_history (appointment_id, from_status, to_status, notes, changed_by)
       VALUES ($1, $2, $2, $3, $4)`,
      [
        appointmentId,
        appt.status,
        `Rescheduled from ${oldDetails} to ${newDetails}. Reason: ${reason}`,
        userId,
      ]
    );

    await client.query('COMMIT');
    return await getAppointmentById(clinicId, branchId, appointmentId);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505' && error.constraint === 'uq_doctor_active_slot') {
      const err = new Error('Target slot is already booked for this doctor.');
      err.statusCode = 409;
      throw err;
    }
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Cancels an appointment, recording reason and freeing slot for re-booking
 */
const cancelAppointment = async (clinicId, branchId, appointmentId, reason, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const apptRes = await client.query(
      `SELECT * FROM appointments WHERE id = $1 AND clinic_id = $2 AND branch_id = $3 FOR UPDATE`,
      [appointmentId, clinicId, branchId]
    );

    if (apptRes.rows.length === 0) {
      const err = new Error('Appointment not found.');
      err.statusCode = 404;
      throw err;
    }

    const appt = apptRes.rows[0];
    if (appt.status === 'cancelled') {
      const err = new Error('Appointment is already cancelled.');
      err.statusCode = 400;
      throw err;
    }
    if (appt.status === 'completed') {
      const err = new Error('Cannot cancel a completed appointment.');
      err.statusCode = 400;
      throw err;
    }

    await client.query(
      `UPDATE appointments
       SET status = 'cancelled', cancellation_reason = $1, updated_by = $2, updated_at = now()
       WHERE id = $3`,
      [reason, userId, appointmentId]
    );

    await client.query(
      `INSERT INTO appointment_status_history (appointment_id, from_status, to_status, notes, changed_by)
       VALUES ($1, $2, 'cancelled', $3, $4)`,
      [appointmentId, appt.status, `Cancellation reason: ${reason}`, userId]
    );

    await client.query('COMMIT');
    return await getAppointmentById(clinicId, branchId, appointmentId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Updates status of an appointment (e.g. confirmed, in_consultation, completed, no_show)
 */
const updateAppointmentStatus = async (clinicId, branchId, appointmentId, newStatus, notes, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const apptRes = await client.query(
      `SELECT * FROM appointments WHERE id = $1 AND clinic_id = $2 AND branch_id = $3 FOR UPDATE`,
      [appointmentId, clinicId, branchId]
    );

    if (apptRes.rows.length === 0) {
      const err = new Error('Appointment not found.');
      err.statusCode = 404;
      throw err;
    }

    const appt = apptRes.rows[0];

    if (!isValidStatusTransition(appt.status, newStatus)) {
      const err = new Error(`Invalid status transition from '${appt.status}' to '${newStatus}'.`);
      err.statusCode = 400;
      throw err;
    }

    // When confirming an appointment, re-verify slot availability
    if (newStatus === 'confirmed' && appt.status !== 'confirmed') {
      await validateDoctorBranchEligibility(clinicId, branchId, appt.doctor_id);

      const availability = await availabilityService.getDoctorAvailableSlots(
        clinicId,
        branchId,
        appt.doctor_id,
        appt.appointment_date,
        appt.duration_minutes || 30,
        appt.id
      );

      if (!availability.isAvailable) {
        const err = new Error(
          `Cannot confirm appointment: The target slot is no longer available (${availability.reason || 'Doctor unavailable or holiday declared'}).`
        );
        err.statusCode = 409;
        throw err;
      }

      const apptStart = (appt.start_time || '').slice(0, 5);
      const matchedSlot = (availability.slots || []).find(
        (s) => s.startTime === apptStart || (s.startTime <= apptStart && s.endTime > apptStart)
      );

      if (matchedSlot && !matchedSlot.isAvailable) {
        const err = new Error(
          `Cannot confirm appointment: Target slot is ${matchedSlot.status} (${matchedSlot.reason || 'Unavailable'}).`
        );
        err.statusCode = 409;
        throw err;
      }
    }

    await client.query(
      `UPDATE appointments
       SET status = $1, updated_by = $2, updated_at = now()
       WHERE id = $3`,
      [newStatus, userId, appointmentId]
    );

    await client.query(
      `INSERT INTO appointment_status_history (appointment_id, from_status, to_status, notes, changed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [appointmentId, appt.status, newStatus, notes || `Status changed to ${newStatus}`, userId]
    );

    await client.query('COMMIT');
    return await getAppointmentById(clinicId, branchId, appointmentId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Checks in an appointment and generates daily visit token for front desk queue
 */
const checkInAppointment = async (clinicId, branchId, appointmentId, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const apptRes = await client.query(
      `SELECT * FROM appointments WHERE id = $1 AND clinic_id = $2 AND branch_id = $3 FOR UPDATE`,
      [appointmentId, clinicId, branchId]
    );

    if (apptRes.rows.length === 0) {
      const err = new Error('Appointment not found.');
      err.statusCode = 404;
      throw err;
    }

    const appt = apptRes.rows[0];

    if (appt.status === 'checked_in' || appt.status === 'in_consultation' || appt.status === 'completed') {
      const err = new Error(`Appointment has already been checked in (current status: ${appt.status}).`);
      err.statusCode = 400;
      throw err;
    }

    if (appt.status === 'cancelled') {
      const err = new Error('Cannot check in a cancelled appointment.');
      err.statusCode = 400;
      throw err;
    }

    // Branch timezone & today's local date
    const branchRes = await client.query(`SELECT timezone FROM branches WHERE id = $1`, [branchId]);
    const timezone = branchRes.rows.length > 0 ? branchRes.rows[0].timezone : 'Asia/Kolkata';
    const todayLocalDate = getClinicLocalDate(timezone);

    // Generate atomic daily visit token (e.g. '001', '002'...)
    const tokenData = await generateVisitToken(client, clinicId, branchId, todayLocalDate);

    // Create encounter record in patient_visits
    const visitRes = await client.query(
      `INSERT INTO patient_visits (
         clinic_id, branch_id, patient_id, appointment_id, doctor_id,
         visit_date, token_number, token_display, visit_type,
         status, reason_for_visit, created_by, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'queued', $10, $11, $11)
       RETURNING *`,
      [
        clinicId,
        branchId,
        appt.patient_id,
        appt.id,
        appt.doctor_id,
        todayLocalDate,
        tokenData.tokenNumber,
        tokenData.tokenDisplay,
        appt.appointment_type || 'consultation',
        appt.chief_complaint,
        userId,
      ]
    );

    // Update appointment status to 'checked_in'
    await client.query(
      `UPDATE appointments SET status = 'checked_in', updated_by = $1, updated_at = now() WHERE id = $2`,
      [userId, appointmentId]
    );

    // Status history
    await client.query(
      `INSERT INTO appointment_status_history (appointment_id, from_status, to_status, notes, changed_by)
       VALUES ($1, $2, 'checked_in', $3, $4)`,
      [
        appointmentId,
        appt.status,
        `Patient checked in at reception. Token #${tokenData.tokenDisplay} assigned.`,
        userId,
      ]
    );

    await client.query('COMMIT');

    const updatedAppt = await getAppointmentById(clinicId, branchId, appointmentId);
    return {
      appointment: updatedAppt,
      visit: visitRes.rows[0],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Creates an immediate walk-in appointment and allocates a queue token
 */
const createWalkInAppointment = async (clinicId, branchId, data, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let patientId = data.patient_id;

    // Quick register if new patient
    if (!patientId && data.new_patient) {
      const np = data.new_patient;
      const patientNumber = await generatePatientNumber(client, clinicId);

      const insPatient = await client.query(
        `INSERT INTO patients (
           clinic_id, branch_id, patient_number,
           first_name, last_name, phone, email, date_of_birth, gender,
           status, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10, $10)
         RETURNING id`,
        [
          clinicId,
          branchId,
          patientNumber,
          np.first_name.trim(),
          np.last_name.trim(),
          np.phone.trim(),
          np.email ? np.email.trim() : null,
          np.date_of_birth || null,
          np.gender || 'unspecified',
          userId,
        ]
      );
      patientId = insPatient.rows[0].id;
    }

    if (!patientId) {
      const err = new Error('Either existing patient_id or new_patient details are required.');
      err.statusCode = 400;
      throw err;
    }

    const { doctor_id, chief_complaint = 'Walk-in consultation' } = data;

    // Fetch branch timezone & today's date
    const branchRes = await client.query(`SELECT timezone FROM branches WHERE id = $1`, [branchId]);
    const timezone = branchRes.rows.length > 0 ? branchRes.rows[0].timezone : 'Asia/Kolkata';
    const todayLocalDate = getClinicLocalDate(timezone);

    // Current time
    const nowFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const [h, m] = nowFormatter.format(new Date()).split(':').map(Number);
    const startTimeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const endMinutes = h * 60 + m + 30;
    const endTimeStr = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

    // Fee lookup (authoritative backend resolution)
    const feeMatrix = await getDoctorFee(clinicId, branchId, doctor_id);
    if (!feeMatrix || feeMatrix.fee_not_configured || feeMatrix.consultation_fee === null) {
      const err = new Error('Consultation fee not configured for this doctor at this branch.');
      err.statusCode = 400;
      throw err;
    }
    const appointmentNumber = await generateAppointmentNumber(client, clinicId);
    const bookingReference = generateBookingReference();

    // Insert appointment as 'checked_in'
    const apptRes = await client.query(
      `INSERT INTO appointments (
         clinic_id, branch_id, appointment_number, booking_reference, booking_source, booking_metadata,
         patient_id, doctor_id, appointment_date, start_time, end_time, appointment_type, status,
         consultation_fee, amount_paid, payment_status, chief_complaint,
         created_by, updated_by
       ) VALUES ($1, $2, $3, $4, 'walk_in', '{}'::jsonb, $5, $6, $7, $8, $9, 'walk_in', 'checked_in', $10, 0.00, 'pending', $11, $12, $12)
       RETURNING *`,
      [
        clinicId,
        branchId,
        appointmentNumber,
        bookingReference,
        patientId,
        doctor_id,
        todayLocalDate,
        startTimeStr,
        endTimeStr,
        feeMatrix.consultation_fee,
        chief_complaint,
        userId,
      ]
    );

    const appt = apptRes.rows[0];

    // Daily visit token
    const tokenData = await generateVisitToken(client, clinicId, branchId, todayLocalDate);

    // Patient visit record
    const visitRes = await client.query(
      `INSERT INTO patient_visits (
         clinic_id, branch_id, patient_id, appointment_id, doctor_id,
         visit_date, token_number, token_display, visit_type,
         status, reason_for_visit, created_by, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'walk_in', 'queued', $9, $10, $10)
       RETURNING *`,
      [
        clinicId,
        branchId,
        patientId,
        appt.id,
        doctor_id,
        todayLocalDate,
        tokenData.tokenNumber,
        tokenData.tokenDisplay,
        chief_complaint,
        userId,
      ]
    );

    // History
    await client.query(
      `INSERT INTO appointment_status_history (appointment_id, from_status, to_status, notes, changed_by)
       VALUES ($1, NULL, 'checked_in', $2, $3)`,
      [appt.id, `Walk-in registration at reception. Token #${tokenData.tokenDisplay} assigned.`, userId]
    );

    await client.query('COMMIT');

    const completeAppt = await getAppointmentById(clinicId, branchId, appt.id);
    return {
      appointment: completeAppt,
      visit: visitRes.rows[0],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get single appointment with patient, doctor, status history, and payment details
 */
const getAppointmentById = async (clinicId, branchId, appointmentId) => {
  const text = `
    SELECT a.*,
           p.first_name AS patient_first_name, p.last_name AS patient_last_name,
           p.patient_number, p.phone AS patient_phone, p.email AS patient_email,
           p.gender AS patient_gender, p.date_of_birth AS patient_dob,
           d.first_name AS doctor_first_name, d.last_name AS doctor_last_name,
           d.email AS doctor_email,
           b.branch_name, b.branch_code, b.timezone
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    JOIN users d ON a.doctor_id = d.id
    JOIN branches b ON a.branch_id = b.id
    WHERE a.id = $1 AND a.clinic_id = $2 AND a.branch_id = $3
  `;
  const res = await query(text, [appointmentId, clinicId, branchId]);
  if (res.rows.length === 0) {
    return null;
  }

  const appt = res.rows[0];

  // Fetch status history
  const histRes = await query(
    `SELECT ash.*, u.first_name AS changed_by_first_name, u.last_name AS changed_by_last_name
     FROM appointment_status_history ash
     LEFT JOIN users u ON ash.changed_by = u.id
     WHERE ash.appointment_id = $1
     ORDER BY ash.created_at ASC`,
    [appointmentId]
  );

  // Fetch payments
  const payRes = await query(
    `SELECT ap.*, u.first_name AS received_by_first_name, u.last_name AS received_by_last_name
     FROM appointment_payments ap
     LEFT JOIN users u ON ap.received_by = u.id
     WHERE ap.appointment_id = $1
     ORDER BY ap.created_at ASC`,
    [appointmentId]
  );

  // Fetch visit token if checked in
  const visitRes = await query(
    `SELECT id, token_number, token_display, status AS visit_status, visit_date
     FROM patient_visits
     WHERE appointment_id = $1`,
    [appointmentId]
  );

  return {
    ...appt,
    statusHistory: histRes.rows,
    payments: payRes.rows,
    visit: visitRes.rows[0] || null,
  };
};

/**
 * Filtered, paginated appointments list
 */
const getAppointmentsList = async (clinicId, branchId, filters) => {
  const {
    doctorId,
    patientId,
    status,
    date,
    startDate,
    endDate,
    appointmentType,
    search,
    page = 1,
    limit = 20,
  } = filters;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = ['a.clinic_id = $1', 'a.branch_id = $2'];
  const params = [clinicId, branchId];

  if (doctorId) {
    params.push(doctorId);
    conditions.push(`a.doctor_id = $${params.length}`);
  }

  if (patientId) {
    params.push(patientId);
    conditions.push(`a.patient_id = $${params.length}`);
  }

  if (status) {
    params.push(status);
    conditions.push(`a.status = $${params.length}`);
  }

  if (appointmentType) {
    params.push(appointmentType);
    conditions.push(`a.appointment_type = $${params.length}`);
  }

  if (date) {
    params.push(date);
    conditions.push(`a.appointment_date = $${params.length}`);
  } else {
    if (startDate) {
      params.push(startDate);
      conditions.push(`a.appointment_date >= $${params.length}`);
    }
    if (endDate) {
      params.push(endDate);
      conditions.push(`a.appointment_date <= $${params.length}`);
    }
  }

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    const pIdx = params.length;
    conditions.push(`(
      a.appointment_number ILIKE $${pIdx} OR
      p.first_name ILIKE $${pIdx} OR
      p.last_name ILIKE $${pIdx} OR
      p.patient_number ILIKE $${pIdx} OR
      p.phone ILIKE $${pIdx}
    )`);
  }

  const whereClause = conditions.join(' AND ');

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    WHERE ${whereClause}
  `;
  const countRes = await query(countQuery, params);
  const total = parseInt(countRes.rows[0].total, 10);

  const dataQuery = `
    SELECT a.*,
           p.first_name AS patient_first_name, p.last_name AS patient_last_name,
           p.patient_number, p.phone AS patient_phone,
           d.first_name AS doctor_first_name, d.last_name AS doctor_last_name,
           pv.id AS visit_id,
           pv.token_display AS visit_token_display
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    JOIN users d ON a.doctor_id = d.id
    LEFT JOIN patient_visits pv ON a.id = pv.appointment_id
    WHERE ${whereClause}
    ORDER BY a.appointment_date DESC, a.start_time ASC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  params.push(limitNum, offset);

  const dataRes = await query(dataQuery, params);

  return {
    appointments: dataRes.rows,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1,
  };
};

/**
 * Reception Desk Real-time Dashboard Metrics for Today
 */
const getReceptionMetrics = async (clinicId, branchId) => {
  const branchRes = await query(`SELECT timezone FROM branches WHERE id = $1`, [branchId]);
  const timezone = branchRes.rows.length > 0 ? branchRes.rows[0].timezone : 'Asia/Kolkata';
  const todayLocalDate = getClinicLocalDate(timezone);

  const res = await query(
    `SELECT 
       COUNT(*) FILTER (WHERE status NOT IN ('cancelled')) AS total_active_today,
       COUNT(*) FILTER (WHERE status = 'scheduled') AS scheduled_count,
       COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_count,
       COUNT(*) FILTER (WHERE status = 'checked_in') AS checked_in_count,
       COUNT(*) FILTER (WHERE status = 'in_consultation') AS in_consultation_count,
       COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
       COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
       COUNT(*) FILTER (WHERE status = 'no_show') AS no_show_count,
       COUNT(*) FILTER (WHERE appointment_type = 'walk_in') AS walk_in_count,
       COALESCE(SUM(consultation_fee) FILTER (WHERE status != 'cancelled'), 0) AS total_billable_amount,
       COALESCE(SUM(amount_paid), 0) AS total_collected_amount,
       COALESCE(SUM(consultation_fee - amount_paid) FILTER (WHERE status != 'cancelled' AND payment_status != 'paid'), 0) AS total_pending_balance
     FROM appointments
     WHERE clinic_id = $1 AND branch_id = $2 AND appointment_date = $3`,
    [clinicId, branchId, todayLocalDate]
  );

  return {
    todayDate: todayLocalDate,
    timezone,
    ...res.rows[0],
  };
};

/**
 * Retrieves bookable active branches for a clinic organization with sanitized public attributes
 */
const getBookableBranches = async (clinicId) => {
  const text = `
    SELECT id, clinic_id, branch_code, branch_name,
           address_line1, address_line2, city, state, postal_code, country,
           phone, email, timezone, is_default
    FROM branches
    WHERE clinic_id = $1 AND is_active = true
    ORDER BY is_default DESC, branch_name ASC
  `;
  const res = await query(text, [clinicId]);
  return res.rows;
};

/**
 * Retrieves eligible doctors actively assigned to a branch with sanitized public profile
 */
const getBookableDoctors = async (clinicId, branchId) => {
  const text = `
    SELECT u.id, u.first_name, u.last_name,
           COALESCE(s.specialization, u.specialization, 'General Dentistry') AS specialization,
           COALESCE(s.license_number, u.license_number) AS license_number,
           r.display_name AS role_display,
           ub.is_default AS is_branch_default
    FROM users u
    JOIN user_branches ub ON u.id = ub.user_id
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN staff s ON s.user_id = u.id
    WHERE u.clinic_id = $1
      AND ub.branch_id = $2
      AND (
        (s.id IS NOT NULL AND s.staff_category IN ('dentist', 'specialist') AND s.is_active = true)
        OR (s.id IS NULL AND r.name IN ('dentist', 'specialist'))
      )
      AND u.is_active = true
    ORDER BY u.first_name ASC, u.last_name ASC
  `;
  const res = await query(text, [clinicId, branchId]);
  return res.rows;
};

/**
 * Retrieves booking confirmation by unguessable secure booking reference
 */
const getBookingConfirmationByReference = async (clinicId, bookingReference) => {
  const text = `
    SELECT a.id, a.booking_reference, a.appointment_number,
           to_char(a.appointment_date, 'YYYY-MM-DD') AS appointment_date,
           a.start_time, a.end_time,
           a.duration_minutes, a.appointment_type, a.status,
           a.booking_source, a.consultation_fee, a.amount_paid, a.payment_status,
           a.created_at,
           b.id AS branch_id, b.branch_name, b.branch_code, b.address_line1, b.city, b.phone AS branch_phone, b.timezone,
           d.id AS doctor_id, d.first_name AS doctor_first_name, d.last_name AS doctor_last_name,
           COALESCE(s.specialization, d.specialization, 'General Dentistry') AS doctor_specialization,
           p.first_name AS patient_first_name, p.last_name AS patient_last_name,
           p.patient_number, p.phone AS patient_phone
    FROM appointments a
    JOIN branches b ON a.branch_id = b.id
    JOIN users d ON a.doctor_id = d.id
    LEFT JOIN staff s ON s.user_id = d.id
    JOIN patients p ON a.patient_id = p.id
    WHERE a.clinic_id = $1 AND a.booking_reference = $2
  `;
  const res = await query(text, [clinicId, bookingReference]);
  if (res.rows.length === 0) {
    return null;
  }
  return res.rows[0];
};

module.exports = {
  validateDoctorBranchEligibility,
  createAppointment,
  rescheduleAppointment,
  cancelAppointment,
  updateAppointmentStatus,
  checkInAppointment,
  createWalkInAppointment,
  getAppointmentById,
  getAppointmentsList,
  getReceptionMetrics,
  getBookableBranches,
  getBookableDoctors,
  getBookingConfirmationByReference,
};
