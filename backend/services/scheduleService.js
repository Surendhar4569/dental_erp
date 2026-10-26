/**
 * Doctor Schedule Service
 * Handles working schedules, sessions, date exceptions, conflict detection, and consultation fees.
 */

const { query, pool } = require('../config/database');
const { recordAuditLog } = require('../utils/auditLogger');

/**
 * List doctors assigned to a specific clinic branch
 */
const getBranchDoctors = async (clinicId, branchId) => {
  const text = `
    SELECT u.id, u.first_name, u.last_name, u.email, u.phone,
           COALESCE(s.staff_number, '') AS staff_number,
           COALESCE(s.specialization, u.specialization) AS specialization,
           COALESCE(s.license_number, u.license_number) AS license_number,
           r.name AS role_name, r.display_name AS role_display,
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
  const result = await query(text, [clinicId, branchId]);
  return result.rows;
};

/**
 * Get weekly schedule and sessions for a doctor at a branch
 */
const getDoctorWeeklySchedule = async (clinicId, branchId, doctorId) => {
  const schedRes = await query(
    `SELECT ds.id, ds.day_of_week, ds.slot_duration_minutes, ds.buffer_minutes, ds.is_active,
            ds.is_active AS is_working
     FROM doctor_schedules ds
     WHERE ds.clinic_id = $1 AND ds.branch_id = $2 AND ds.doctor_id = $3
     ORDER BY ds.day_of_week ASC`,
    [clinicId, branchId, doctorId]
  );

  const schedules = schedRes.rows;
  if (schedules.length === 0) {
    return [];
  }

  const scheduleIds = schedules.map((s) => s.id);
  const sessRes = await query(
    `SELECT dss.id, dss.schedule_id, dss.session_name, dss.start_time, dss.end_time, dss.session_order,
            dss.is_break, dss.break_reason
     FROM doctor_schedule_sessions dss
     WHERE dss.schedule_id = ANY($1::uuid[])
     ORDER BY dss.session_order ASC, dss.start_time ASC`,
    [scheduleIds]
  );

  const sessionsBySchedule = {};
  for (const sess of sessRes.rows) {
    if (!sessionsBySchedule[sess.schedule_id]) {
      sessionsBySchedule[sess.schedule_id] = [];
    }
    sessionsBySchedule[sess.schedule_id].push({
      id: sess.id,
      session_name: sess.session_name,
      start_time: sess.start_time,
      end_time: sess.end_time,
      session_order: sess.session_order,
      is_break: Boolean(sess.is_break),
      break_reason: sess.break_reason || null,
    });
  }

  return schedules.map((s) => ({
    ...s,
    sessions: sessionsBySchedule[s.id] || [],
  }));
};

/**
 * Save weekly schedules and sessions for a doctor at a branch.
 * Checks for conflicts against existing active future appointments.
 */
const saveDoctorWeeklySchedule = async (clinicId, branchId, doctorId, schedulesArray, userId) => {
  // 1. Verify doctor exists and is assigned to this branch
  const docCheck = await query(
    `SELECT u.id, u.first_name, u.last_name, s.id AS staff_id
     FROM users u
     LEFT JOIN staff s ON s.user_id = u.id
     JOIN roles r ON u.role_id = r.id
     WHERE u.id = $1 AND u.clinic_id = $2
       AND (
         (s.id IS NOT NULL AND s.staff_category IN ('dentist', 'specialist') AND s.is_active = true)
         OR (s.id IS NULL AND r.name IN ('dentist', 'specialist'))
       )
       AND u.is_active = true`,
    [doctorId, clinicId]
  );

  if (docCheck.rows.length === 0) {
    const err = new Error('Doctor not found or is not an active clinical practitioner in this clinic.');
    err.statusCode = 404;
    throw err;
  }

  const staffId = docCheck.rows[0].staff_id;
  const assignCheck = await query(
    `SELECT 1 FROM user_branches ub
     WHERE ub.user_id = $1 AND ub.branch_id = $2
     UNION
     SELECT 1 FROM staff_branches sb
     WHERE $3::uuid IS NOT NULL AND sb.staff_id = $3 AND sb.branch_id = $2`,
    [doctorId, branchId, staffId]
  );
  if (assignCheck.rows.length === 0) {
    const err = new Error('Doctor is not assigned to this branch.');
    err.statusCode = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updatedSchedules = [];

    for (const item of schedulesArray) {
      const dayOfWeek = Number(item.day_of_week);
      const slotDuration = item.slot_duration_minutes ? Number(item.slot_duration_minutes) : 30;
      const bufferMinutes = item.buffer_minutes ? Number(item.buffer_minutes) : 0;
      const isActive = item.is_active !== undefined
        ? Boolean(item.is_active)
        : (item.is_working !== undefined ? Boolean(item.is_working) : true);

      // Upsert day schedule
      const upsertSched = await client.query(
        `INSERT INTO doctor_schedules (clinic_id, branch_id, doctor_id, day_of_week, slot_duration_minutes, buffer_minutes, is_active, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (clinic_id, branch_id, doctor_id, day_of_week)
         DO UPDATE SET 
           slot_duration_minutes = EXCLUDED.slot_duration_minutes,
           buffer_minutes = EXCLUDED.buffer_minutes,
           is_active = EXCLUDED.is_active,
           updated_at = now()
         RETURNING id, day_of_week, slot_duration_minutes, buffer_minutes, is_active`,
        [clinicId, branchId, doctorId, dayOfWeek, slotDuration, bufferMinutes, isActive]
      );

      const scheduleId = upsertSched.rows[0].id;

      // Delete existing sessions for this day schedule
      await client.query('DELETE FROM doctor_schedule_sessions WHERE schedule_id = $1', [scheduleId]);

      // Insert new sessions if active
      const insertedSessions = [];
      if (isActive && Array.isArray(item.sessions)) {
        for (let i = 0; i < item.sessions.length; i++) {
          const sess = item.sessions[i];
          const isBreak = Boolean(sess.is_break);
          const breakReason = sess.break_reason || null;
          const ins = await client.query(
            `INSERT INTO doctor_schedule_sessions (schedule_id, session_name, start_time, end_time, session_order, is_break, break_reason)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, session_name, start_time, end_time, session_order, is_break, break_reason`,
            [
              scheduleId,
              sess.session_name || (isBreak ? 'Break' : `Session ${i + 1}`),
              sess.start_time,
              sess.end_time,
              sess.session_order || i + 1,
              isBreak,
              breakReason,
            ]
          );
          insertedSessions.push(ins.rows[0]);
        }
      }

      updatedSchedules.push({
        ...upsertSched.rows[0],
        sessions: insertedSessions,
      });
    }

    // Check for conflict warnings with existing active future appointments
    const conflictRes = await client.query(
      `SELECT a.id, a.appointment_number, a.appointment_date, a.start_time, a.end_time,
              p.first_name, p.last_name, p.patient_number
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       WHERE a.clinic_id = $1
         AND a.branch_id = $2
         AND a.doctor_id = $3
         AND a.appointment_date >= CURRENT_DATE
         AND a.status NOT IN ('cancelled', 'completed')
       ORDER BY a.appointment_date ASC, a.start_time ASC`,
      [clinicId, branchId, doctorId]
    );

    const warnings = [];
    if (conflictRes.rows.length > 0) {
      // Build lookup for active doctor working times per day of week
      const dayMap = {};
      for (const s of updatedSchedules) {
        dayMap[s.day_of_week] = s;
      }

      for (const appt of conflictRes.rows) {
        const apptDate = new Date(appt.appointment_date);
        const dow = apptDate.getDay();
        const sched = dayMap[dow];

        if (!sched || !sched.is_active || sched.sessions.length === 0) {
          warnings.push({
            appointmentId: appt.id,
            appointmentNumber: appt.appointment_number,
            appointmentDate: appt.appointment_date,
            startTime: appt.start_time,
            patientName: `${appt.first_name} ${appt.last_name}`,
            patientNumber: appt.patient_number,
            issue: 'Day is now marked inactive or has no sessions.',
          });
        } else {
          // Check if appointment falls within any session
          const apptStart = appt.start_time;
          const apptEnd = appt.end_time;
          const fallsInSession = sched.sessions.some(
            (sess) => apptStart >= sess.start_time && apptEnd <= sess.end_time
          );
          if (!fallsInSession) {
            warnings.push({
              appointmentId: appt.id,
              appointmentNumber: appt.appointment_number,
              appointmentDate: appt.appointment_date,
              startTime: appt.start_time,
              patientName: `${appt.first_name} ${appt.last_name}`,
              patientNumber: appt.patient_number,
              issue: 'Appointment time falls outside updated working sessions.',
            });
          }
        }
      }
    }

    await client.query('COMMIT');
    return {
      schedules: updatedSchedules,
      warnings,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * List exceptions (leaves, holidays, blocked times, custom hours)
 */
const getDoctorExceptions = async (clinicId, branchId, doctorId, startDate, endDate) => {
  let queryText = `
    SELECT dse.id, dse.clinic_id, dse.branch_id, dse.doctor_id,
           dse.exception_date, dse.exception_type, dse.start_time, dse.end_time,
           dse.reason, dse.created_at,
           u.first_name AS created_by_first_name, u.last_name AS created_by_last_name
    FROM doctor_schedule_exceptions dse
    LEFT JOIN users u ON dse.created_by = u.id
    WHERE dse.clinic_id = $1 AND dse.branch_id = $2 AND dse.doctor_id = $3
  `;
  const params = [clinicId, branchId, doctorId];

  if (startDate) {
    params.push(startDate);
    queryText += ` AND dse.exception_date >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    queryText += ` AND dse.exception_date <= $${params.length}`;
  }

  queryText += ` ORDER BY dse.exception_date ASC, dse.start_time ASC`;

  const result = await query(queryText, params);
  return result.rows;
};

/**
 * Create a doctor schedule exception (leave, holiday, block, or custom hours)
 * Detects conflicts with existing non-cancelled appointments.
 */
const createDoctorException = async (clinicId, branchId, doctorId, data, userId) => {
  const { exception_date, exception_type, start_time, end_time, reason } = data;

  // 1. Verify doctor is assigned to this branch
  const docCheck = await query(
    `SELECT u.id, s.id AS staff_id
     FROM users u
     LEFT JOIN staff s ON s.user_id = u.id
     JOIN roles r ON u.role_id = r.id
     WHERE u.id = $1 AND u.clinic_id = $2
       AND (
         (s.id IS NOT NULL AND s.staff_category IN ('dentist', 'specialist') AND s.is_active = true)
         OR (s.id IS NULL AND r.name IN ('dentist', 'specialist'))
       )
       AND u.is_active = true`,
    [doctorId, clinicId]
  );
  if (docCheck.rows.length === 0) {
    const err = new Error('Doctor not found or is not an active clinical practitioner in this clinic.');
    err.statusCode = 404;
    throw err;
  }

  const staffId = docCheck.rows[0].staff_id;
  const assignCheck = await query(
    `SELECT 1 FROM user_branches ub
     WHERE ub.user_id = $1 AND ub.branch_id = $2
     UNION
     SELECT 1 FROM staff_branches sb
     WHERE $3::uuid IS NOT NULL AND sb.staff_id = $3 AND sb.branch_id = $2`,
    [doctorId, branchId, staffId]
  );
  if (assignCheck.rows.length === 0) {
    const err = new Error('Doctor is not assigned to this branch.');
    err.statusCode = 400;
    throw err;
  }

  // 2. Check for existing active appointments on that date/time
  let conflictQuery = `
    SELECT a.id, a.appointment_number, a.appointment_date, a.start_time, a.end_time, a.status,
           p.first_name, p.last_name, p.patient_number
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    WHERE a.clinic_id = $1
      AND a.branch_id = $2
      AND a.doctor_id = $3
      AND a.appointment_date = $4
      AND a.status NOT IN ('cancelled')
  `;
  const conflictParams = [clinicId, branchId, doctorId, exception_date];

  if (start_time && end_time && exception_type !== 'custom_hours') {
    conflictParams.push(start_time, end_time);
    conflictQuery += ` AND (a.start_time < $6 AND a.end_time > $5)`;
  }

  const conflicts = await query(conflictQuery, conflictParams);

  // If active appointments exist, guard against silent disruption
  if (conflicts.rows.length > 0) {
    const err = new Error(
      `Cannot register exception: Doctor has ${conflicts.rows.length} active appointment(s) during this period. Please reschedule or cancel conflicting appointments first.`
    );
    err.statusCode = 409;
    err.conflicts = conflicts.rows.map((c) => ({
      appointmentId: c.id,
      appointmentNumber: c.appointment_number,
      appointmentDate: c.appointment_date,
      startTime: c.start_time,
      endTime: c.end_time,
      patientName: `${c.first_name} ${c.last_name}`,
      patientNumber: c.patient_number,
      status: c.status,
    }));
    throw err;
  }

  // Insert exception record
  const insertRes = await query(
    `INSERT INTO doctor_schedule_exceptions 
       (clinic_id, branch_id, doctor_id, exception_date, exception_type, start_time, end_time, reason, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, clinic_id, branch_id, doctor_id, exception_date, exception_type, start_time, end_time, reason, created_at`,
    [
      clinicId,
      branchId,
      doctorId,
      exception_date,
      exception_type,
      start_time || null,
      end_time || null,
      reason || null,
      userId || null,
    ]
  );

  return {
    exception: insertRes.rows[0],
    conflicts: [],
  };
};

/**
 * Delete a doctor schedule exception
 */
const deleteDoctorException = async (clinicId, branchId, exceptionId) => {
  const result = await query(
    `DELETE FROM doctor_schedule_exceptions
     WHERE id = $1 AND clinic_id = $2 AND branch_id = $3
     RETURNING id`,
    [exceptionId, clinicId, branchId]
  );
  return result.rows.length > 0;
};

/**
 * Fee Precedence Lookup:
 * 1. Exact Doctor + Branch: (clinic_id, branch_id, doctor_id)
 * 2. Doctor Clinic-wide: (clinic_id, branch_id IS NULL, doctor_id)
 * 3. Branch-wide default: (clinic_id, branch_id, doctor_id IS NULL)
 * 4. Clinic-wide default: (clinic_id, branch_id IS NULL, doctor_id IS NULL)
 * 5. Not Configured: Returns fee_not_configured with null amounts (NO silent fallback)
 */
const getDoctorFee = async (clinicId, branchId, doctorId) => {
  const result = await query(
    `SELECT consultation_fee, followup_fee, emergency_fee, branch_id, doctor_id,
            CASE 
              WHEN branch_id = $2 AND doctor_id = $3 THEN 1
              WHEN branch_id IS NULL AND doctor_id = $3 THEN 2
              WHEN branch_id = $2 AND doctor_id IS NULL THEN 3
              WHEN branch_id IS NULL AND doctor_id IS NULL THEN 4
              ELSE 5
            END AS precedence
     FROM doctor_branch_fees
     WHERE clinic_id = $1
       AND (branch_id = $2 OR branch_id IS NULL)
       AND (doctor_id = $3 OR doctor_id IS NULL)
     ORDER BY precedence ASC
     LIMIT 1`,
    [clinicId, branchId, doctorId]
  );

  if (result.rows.length > 0) {
    const row = result.rows[0];
    const cFee = row.consultation_fee !== null ? parseFloat(row.consultation_fee) : null;
    const fFee = row.followup_fee !== null ? parseFloat(row.followup_fee) : null;
    const eFee = row.emergency_fee !== null ? parseFloat(row.emergency_fee) : null;

    if (cFee !== null) {
      return {
        is_configured: true,
        fee_not_configured: false,
        consultation_fee: cFee,
        followup_fee: fFee,
        emergency_fee: eFee,
        source:
          row.precedence === 1
            ? 'doctor_branch_specific'
            : row.precedence === 2
            ? 'doctor_clinic_default'
            : row.precedence === 3
            ? 'branch_default'
            : 'clinic_default',
      };
    }
  }

  // Explicit unconfigured state - NO hardcoded fallback
  return {
    is_configured: false,
    fee_not_configured: true,
    consultation_fee: null,
    followup_fee: null,
    emergency_fee: null,
    source: 'not_configured',
    message: 'Consultation fee not configured for this doctor at this branch.',
  };
};

/**
 * Upsert doctor consultation fee configuration
 * Strictly verifies doctor eligibility, clinic scope, and branch assignment
 */
const saveDoctorFee = async (clinicId, branchId, doctorId, feeData) => {
  // 1. Verify doctor exists and is an active clinical practitioner in this clinic
  const docCheck = await query(
    `SELECT u.id, u.first_name, u.last_name, s.id AS staff_id
     FROM users u
     LEFT JOIN staff s ON s.user_id = u.id
     JOIN roles r ON u.role_id = r.id
     WHERE u.id = $1 AND u.clinic_id = $2
       AND (
         (s.id IS NOT NULL AND s.staff_category IN ('dentist', 'specialist') AND s.is_active = true)
         OR (s.id IS NULL AND r.name IN ('dentist', 'specialist'))
       )
       AND u.is_active = true`,
    [doctorId, clinicId]
  );

  if (docCheck.rows.length === 0) {
    const err = new Error('Doctor not found or is not an active clinical practitioner in this clinic.');
    err.statusCode = 404;
    throw err;
  }

  const isClinicStandard = feeData.scope === 'clinic_standard';

  // 2. If branch-scoped, verify doctor is actively assigned to this branch
  if (!isClinicStandard) {
    const staffId = docCheck.rows[0].staff_id;
    const assignCheck = await query(
      `SELECT 1 FROM user_branches ub
       WHERE ub.user_id = $1 AND ub.branch_id = $2
       UNION
       SELECT 1 FROM staff_branches sb
       WHERE $3::uuid IS NOT NULL AND sb.staff_id = $3 AND sb.branch_id = $2`,
      [doctorId, branchId, staffId]
    );
    if (assignCheck.rows.length === 0) {
      const err = new Error('Doctor is not assigned to this branch.');
      err.statusCode = 400;
      throw err;
    }
  }

  // 3. Strict fee validations - no silent defaults
  const consultation_fee = parseFloat(feeData.consultation_fee);
  if (isNaN(consultation_fee) || consultation_fee < 0) {
    const err = new Error('consultation_fee must be a non-negative number.');
    err.statusCode = 400;
    throw err;
  }

  const followup_fee = feeData.followup_fee !== undefined && feeData.followup_fee !== null && feeData.followup_fee !== ''
    ? parseFloat(feeData.followup_fee)
    : null;
  if (followup_fee !== null && (isNaN(followup_fee) || followup_fee < 0)) {
    const err = new Error('followup_fee must be a non-negative number.');
    err.statusCode = 400;
    throw err;
  }

  const emergency_fee = feeData.emergency_fee !== undefined && feeData.emergency_fee !== null && feeData.emergency_fee !== ''
    ? parseFloat(feeData.emergency_fee)
    : null;
  if (emergency_fee !== null && (isNaN(emergency_fee) || emergency_fee < 0)) {
    const err = new Error('emergency_fee must be a non-negative number.');
    err.statusCode = 400;
    throw err;
  }

  const targetBranchId = isClinicStandard ? null : branchId;

  const result = await query(
    `INSERT INTO doctor_branch_fees 
       (clinic_id, branch_id, doctor_id, fee_amount, consultation_fee, followup_fee, emergency_fee, updated_at)
     VALUES ($1, $2, $3, $4, $4, $5, $6, now())
     ON CONFLICT (clinic_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(doctor_id, '00000000-0000-0000-0000-000000000000'::uuid))
     DO UPDATE SET
       fee_amount = EXCLUDED.fee_amount,
       consultation_fee = EXCLUDED.consultation_fee,
       followup_fee = EXCLUDED.followup_fee,
       emergency_fee = EXCLUDED.emergency_fee,
       updated_at = now()
     RETURNING id, clinic_id, branch_id, doctor_id, fee_amount, consultation_fee, followup_fee, emergency_fee, updated_at`,
    [clinicId, targetBranchId, doctorId, consultation_fee, followup_fee, emergency_fee]
  );

  const resolved = await getDoctorFee(clinicId, branchId, doctorId);

  return {
    ...result.rows[0],
    resolved,
  };
};

/**
 * Get all doctors assigned to a branch with their fee matrix and override status
 */
const getBranchDoctorsWithFees = async (clinicId, branchId, options = {}) => {
  const page = Math.max(1, parseInt(options.page || 1, 10));
  const limit = Math.min(100, Math.max(1, parseInt(options.limit || 15, 10)));
  const offset = (page - 1) * limit;

  const conditions = [
    's.clinic_id = $1',
    'sb.branch_id = $2',
    `s.staff_category IN ('dentist', 'specialist')`,
    's.is_active = true',
    `s.employment_status = 'active'`,
  ];
  const params = [clinicId, branchId];
  let paramIdx = 3;

  if (options.search && options.search.trim()) {
    const term = `%${options.search.trim()}%`;
    conditions.push(`(
      s.staff_number ILIKE $${paramIdx} OR
      s.first_name ILIKE $${paramIdx} OR
      s.last_name ILIKE $${paramIdx} OR
      CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) ILIKE $${paramIdx} OR
      s.specialization ILIKE $${paramIdx} OR
      s.license_number ILIKE $${paramIdx}
    )`);
    params.push(term);
    paramIdx++;
  }

  const whereClause = conditions.join(' AND ');

  const countRes = await query(
    `SELECT COUNT(DISTINCT s.id)::int AS total
     FROM staff s
     JOIN staff_branches sb ON s.id = sb.staff_id
     WHERE ${whereClause}`,
    params
  );
  const totalCount = countRes.rows[0]?.total || 0;

  const dataQuery = `
    SELECT s.id AS staff_id, s.staff_number, s.first_name, s.last_name,
           CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS full_name,
           s.specialization, s.license_number, s.staff_category, s.designation,
           s.user_id, s.is_active,
           b.branch_name, b.branch_code
    FROM staff s
    JOIN staff_branches sb ON s.id = sb.staff_id
    JOIN branches b ON sb.branch_id = b.id
    WHERE ${whereClause}
    GROUP BY s.id, b.branch_name, b.branch_code
    ORDER BY s.first_name ASC, s.last_name ASC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `;

  const dataRes = await query(dataQuery, [...params, limit, offset]);
  const doctors = [];

  for (const doc of dataRes.rows) {
    const doctorUserId = doc.user_id;
    let feeInfo = {
      is_configured: false,
      fee_not_configured: true,
      consultation_fee: null,
      followup_fee: null,
      emergency_fee: null,
      source: 'not_configured',
      message: 'Consultation fee not configured for this doctor at this branch.',
      has_branch_override: false,
    };

    if (doctorUserId) {
      feeInfo = await getDoctorFee(clinicId, branchId, doctorUserId);
      const exactCheck = await query(
        `SELECT id FROM doctor_branch_fees 
         WHERE clinic_id = $1 AND branch_id = $2 AND doctor_id = $3 AND consultation_fee IS NOT NULL`,
        [clinicId, branchId, doctorUserId]
      );
      feeInfo.has_branch_override = exactCheck.rows.length > 0;
    }

    doctors.push({
      ...doc,
      fees: feeInfo,
    });
  }

  return {
    doctors,
    pagination: {
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit) || 1,
    },
  };
};

/**
 * Pre-flight conflict check for proposed schedule changes or exceptions
 */
const checkScheduleConflicts = async (clinicId, branchId, doctorId, options = {}) => {
  const { exception, schedules } = options;
  const conflicts = [];

  if (exception) {
    const { exception_date, start_time, end_time, exception_type } = exception;
    let conflictQuery = `
      SELECT a.id, a.appointment_number, a.appointment_date, a.start_time, a.end_time, a.status,
             p.first_name, p.last_name, p.patient_number
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      WHERE a.clinic_id = $1
        AND a.branch_id = $2
        AND a.doctor_id = $3
        AND a.appointment_date = $4
        AND a.status NOT IN ('cancelled', 'completed')
    `;
    const params = [clinicId, branchId, doctorId, exception_date];
    if (start_time && end_time && exception_type !== 'custom_hours') {
      params.push(start_time, end_time);
      conflictQuery += ` AND (a.start_time < $6 AND a.end_time > $5)`;
    }
    const res = await query(conflictQuery, params);
    conflicts.push(...res.rows);
  }

  if (schedules && Array.isArray(schedules)) {
    const conflictRes = await query(
      `SELECT a.id, a.appointment_number, a.appointment_date, a.start_time, a.end_time, a.status,
              p.first_name, p.last_name, p.patient_number
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       WHERE a.clinic_id = $1
         AND a.branch_id = $2
         AND a.doctor_id = $3
         AND a.appointment_date >= CURRENT_DATE
         AND a.status NOT IN ('cancelled', 'completed')
       ORDER BY a.appointment_date ASC, a.start_time ASC`,
      [clinicId, branchId, doctorId]
    );

    const dayMap = {};
    for (const s of schedules) {
      dayMap[s.day_of_week] = s;
    }

    for (const appt of conflictRes.rows) {
      const apptDate = new Date(appt.appointment_date);
      const dow = apptDate.getDay();
      const sched = dayMap[dow];

      if (!sched || !sched.is_active || !sched.sessions || sched.sessions.length === 0) {
        conflicts.push({
          ...appt,
          issue: 'Day marked inactive or has no sessions.',
        });
      } else {
        const apptStart = appt.start_time;
        const apptEnd = appt.end_time;
        const workingSessions = sched.sessions.filter((s) => !s.is_break);
        const breaks = sched.sessions.filter((s) => s.is_break);

        const inWorkingSession = workingSessions.some(
          (sess) => apptStart >= sess.start_time && apptEnd <= sess.end_time
        );
        const overlapsBreak = breaks.some(
          (b) => apptStart < b.end_time && apptEnd > b.start_time
        );

        if (!inWorkingSession || overlapsBreak) {
          conflicts.push({
            ...appt,
            issue: !inWorkingSession
              ? 'Appointment outside updated working sessions.'
              : 'Appointment overlaps with updated break period.',
          });
        }
      }
    }
  }

  if (options.multiDate) {
    const { dates, sessions = [], mode = 'uniform', date_configs = {} } = options.multiDate;
    for (const dStr of (dates || [])) {
      let targetSessions = sessions;
      if (mode === 'custom' && date_configs[dStr]) {
        targetSessions = date_configs[dStr].sessions || [];
      }
      const working = targetSessions.filter((s) => !s.is_break);
      const breaks = targetSessions.filter((s) => s.is_break);

      const apptRes = await query(
        `SELECT a.id, a.appointment_number, a.appointment_date, a.start_time, a.end_time, a.status,
                p.first_name, p.last_name, p.patient_number
         FROM appointments a
         JOIN patients p ON a.patient_id = p.id
         WHERE a.clinic_id = $1 AND a.branch_id = $2 AND a.doctor_id = $3
           AND a.appointment_date = $4 AND a.status NOT IN ('cancelled', 'completed')`,
        [clinicId, branchId, doctorId, dStr]
      );

      for (const appt of apptRes.rows) {
        if (working.length === 0) {
          conflicts.push({
            ...appt,
            issue: 'No working sessions configured for this date.',
          });
          continue;
        }
        const apptStart = appt.start_time;
        const apptEnd = appt.end_time;
        const inWorking = working.some((s) => apptStart >= s.start_time && apptEnd <= s.end_time);
        const overlapsBreak = breaks.some((b) => apptStart < b.end_time && apptEnd > b.start_time);
        if (!inWorking || overlapsBreak) {
          conflicts.push({
            ...appt,
            issue: !inWorking
              ? 'Appointment outside updated working sessions.'
              : 'Appointment overlaps with break session.',
          });
        }
      }
    }
  }

  return {
    conflictCount: conflicts.length,
    conflictingAppointments: conflicts.map((c) => ({
      appointmentId: c.id,
      appointmentNumber: c.appointment_number,
      appointmentDate: c.appointment_date,
      startTime: c.start_time,
      endTime: c.end_time,
      patientName: `${c.first_name} ${c.last_name}`,
      patientNumber: c.patient_number,
      status: c.status,
      issue: c.issue || null,
    })),
  };
};

/**
 * Get date-specific schedules for a doctor across a date range
 */
const getDoctorDateSchedules = async (clinicId, branchId, doctorId, startDate, endDate) => {
  const schedRes = await query(
    `SELECT dds.id, dds.clinic_id, dds.branch_id, dds.doctor_id, dds.schedule_date,
            to_char(dds.schedule_date, 'YYYY-MM-DD') AS schedule_date_str,
            dds.slot_duration_minutes, dds.buffer_minutes, dds.chair_id,
            dc.chair_number, dc.chair_name,
            dds.is_active,
            dds.is_working_override, dds.override_reason, dds.created_at, dds.updated_at
     FROM doctor_date_schedules dds
     LEFT JOIN dental_chairs dc ON dds.chair_id = dc.id
     WHERE dds.clinic_id = $1 AND dds.branch_id = $2 AND dds.doctor_id = $3
       AND dds.schedule_date >= $4 AND dds.schedule_date <= $5
       AND dds.is_active = true
     ORDER BY dds.schedule_date ASC`,
    [clinicId, branchId, doctorId, startDate, endDate]
  );

  const schedules = schedRes.rows;
  if (schedules.length === 0) return [];

  const ids = schedules.map((s) => s.id);
  const sessRes = await query(
    `SELECT id, date_schedule_id, session_name, start_time, end_time, session_order, is_break, break_reason
     FROM doctor_date_schedule_sessions
     WHERE date_schedule_id = ANY($1::uuid[])
     ORDER BY session_order ASC, start_time ASC`,
    [ids]
  );

  const sessMap = {};
  for (const sess of sessRes.rows) {
    if (!sessMap[sess.date_schedule_id]) sessMap[sess.date_schedule_id] = [];
    sessMap[sess.date_schedule_id].push({
      id: sess.id,
      session_name: sess.session_name,
      start_time: sess.start_time,
      end_time: sess.end_time,
      session_order: sess.session_order,
      is_break: Boolean(sess.is_break),
      break_reason: sess.break_reason,
    });
  }

  return schedules.map((s) => ({
    ...s,
    schedule_date: s.schedule_date_str,
    sessions: sessMap[s.id] || [],
  }));
};

/**
 * Save multi-date doctor schedules transactionally
 * Never alters recurring weekly schedules (doctor_schedules)
 */
const saveDoctorMultiDateSchedule = async (clinicId, branchId, doctorId, payload, userId, ipAddress = '127.0.0.1') => {
  // 1. Verify doctor is assigned to branch
  const docCheck = await query(
    `SELECT u.id, u.first_name, u.last_name
     FROM users u
     JOIN user_branches ub ON u.id = ub.user_id
     WHERE u.id = $1 AND u.clinic_id = $2 AND ub.branch_id = $3 AND u.is_active = true`,
    [doctorId, clinicId, branchId]
  );
  if (docCheck.rows.length === 0) {
    const err = new Error('Doctor not found or not assigned to this branch.');
    err.statusCode = 404;
    throw err;
  }

  const {
    dates,
    mode = 'uniform',
    slot_duration_minutes = 30,
    buffer_minutes = 0,
    chair_id = null,
    sessions = [],
    is_working_override = false,
    override_reason = null,
    date_configs = {},
  } = payload;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch recurring weekly schedule if mode is weekly_template
    let weeklyTemplatesByDow = {};
    if (mode === 'weekly_template') {
      const weeklyRes = await client.query(
        `SELECT ds.id, ds.day_of_week, ds.slot_duration_minutes, ds.buffer_minutes, ds.is_active
         FROM doctor_schedules ds
         WHERE ds.clinic_id = $1 AND ds.branch_id = $2 AND ds.doctor_id = $3`,
        [clinicId, branchId, doctorId]
      );
      if (weeklyRes.rows.length > 0) {
        const sIds = weeklyRes.rows.map((r) => r.id);
        const sSessRes = await client.query(
          `SELECT schedule_id, session_name, start_time, end_time, session_order, is_break, break_reason
           FROM doctor_schedule_sessions
           WHERE schedule_id = ANY($1::uuid[])
           ORDER BY session_order ASC`,
          [sIds]
        );
        for (const w of weeklyRes.rows) {
          weeklyTemplatesByDow[w.day_of_week] = {
            ...w,
            sessions: sSessRes.rows.filter((s) => s.schedule_id === w.id),
          };
        }
      }
    }

    // Build configuration per date
    const datePlan = [];
    for (const dStr of dates) {
      const dObj = new Date(dStr);
      const dow = dObj.getDay();

      let dSlotDuration = slot_duration_minutes;
      let dBuffer = buffer_minutes;
      let dChairId = chair_id;
      let dSessions = sessions;
      let dOverride = is_working_override;
      let dReason = override_reason;

      if (mode === 'custom' && date_configs[dStr]) {
        const cfg = date_configs[dStr];
        dSlotDuration = cfg.slot_duration_minutes || slot_duration_minutes;
        dBuffer = cfg.buffer_minutes !== undefined ? cfg.buffer_minutes : buffer_minutes;
        dChairId = cfg.chair_id !== undefined ? cfg.chair_id : chair_id;
        dSessions = cfg.sessions || [];
        dOverride = cfg.is_working_override !== undefined ? cfg.is_working_override : is_working_override;
        dReason = cfg.override_reason || override_reason;
      } else if (mode === 'weekly_template') {
        const template = weeklyTemplatesByDow[dow];
        if (template && template.sessions && template.sessions.length > 0) {
          dSlotDuration = template.slot_duration_minutes || slot_duration_minutes;
          dBuffer = template.buffer_minutes !== undefined ? template.buffer_minutes : buffer_minutes;
          dSessions = template.sessions;
        }
      }

      datePlan.push({
        date: dStr,
        slot_duration_minutes: dSlotDuration,
        buffer_minutes: dBuffer,
        chair_id: dChairId || null,
        sessions: dSessions,
        is_working_override: Boolean(dOverride),
        override_reason: dReason,
      });
    }

    // Authoritative Closed Holiday Guard:
    // Check if any selected date is marked as an active closed holiday for this clinic/branch
    const holidayRes = await client.query(
      `SELECT holiday_date, to_char(holiday_date, 'YYYY-MM-DD') AS holiday_date_str, name, is_closed
       FROM clinic_holidays
       WHERE clinic_id = $1
         AND (branch_id IS NULL OR branch_id = $2)
         AND holiday_date = ANY($3::date[])
         AND is_active = true
         AND is_closed = true`,
      [clinicId, branchId, dates]
    );

    const closedHolidaysMap = {};
    for (const h of holidayRes.rows) {
      closedHolidaysMap[h.holiday_date_str] = h.name;
    }

    for (const plan of datePlan) {
      if (closedHolidaysMap[plan.date]) {
        const holidayName = closedHolidaysMap[plan.date];
        if (!plan.is_working_override || !plan.override_reason || !plan.override_reason.trim()) {
          const err = new Error(
            `Date ${plan.date} is a closed holiday ("${holidayName}"). An explicit working override and override reason are required to schedule shifts on this date.`
          );
          err.statusCode = 422;
          err.holidayDate = plan.date;
          err.holidayName = holidayName;
          throw err;
        }
      }
    }

    // Pre-flight check: active appointments guard
    const conflicts = [];
    for (const plan of datePlan) {
      // 1. Appointments at this branch
      const apptRes = await client.query(
        `SELECT a.id, a.appointment_number, a.appointment_date, a.start_time, a.end_time, a.status,
                p.first_name, p.last_name, p.patient_number
         FROM appointments a
         JOIN patients p ON a.patient_id = p.id
         WHERE a.clinic_id = $1 AND a.branch_id = $2 AND a.doctor_id = $3
           AND a.appointment_date = $4 AND a.status NOT IN ('cancelled', 'completed')`,
        [clinicId, branchId, doctorId, plan.date]
      );

      const workingSessions = plan.sessions.filter((s) => !s.is_break);
      const breakSessions = plan.sessions.filter((s) => s.is_break);

      for (const appt of apptRes.rows) {
        if (workingSessions.length === 0) {
          conflicts.push({
            appointmentId: appt.id,
            appointmentNumber: appt.appointment_number,
            appointmentDate: plan.date,
            startTime: appt.start_time,
            endTime: appt.end_time,
            patientName: `${appt.first_name} ${appt.last_name}`,
            issue: 'No working sessions configured for this date.',
          });
          continue;
        }
        const apptStart = appt.start_time;
        const apptEnd = appt.end_time;
        const inWorking = workingSessions.some((s) => apptStart >= s.start_time && apptEnd <= s.end_time);
        const overlapsBreak = breakSessions.some((b) => apptStart < b.end_time && apptEnd > b.start_time);
        if (!inWorking || overlapsBreak) {
          conflicts.push({
            appointmentId: appt.id,
            appointmentNumber: appt.appointment_number,
            appointmentDate: plan.date,
            startTime: appt.start_time,
            endTime: appt.end_time,
            patientName: `${appt.first_name} ${appt.last_name}`,
            issue: !inWorking
              ? 'Appointment outside updated working sessions.'
              : 'Appointment overlaps with break session.',
          });
        }
      }

      // 2. Cross-branch doctor appointments check
      const crossApptRes = await client.query(
        `SELECT a.id, a.appointment_number, a.appointment_date, a.start_time, a.end_time, b.branch_name
         FROM appointments a
         JOIN branches b ON a.branch_id = b.id
         WHERE a.clinic_id = $1 AND a.doctor_id = $2 AND a.branch_id != $3
           AND a.appointment_date = $4 AND a.status NOT IN ('cancelled', 'completed')`,
        [clinicId, doctorId, branchId, plan.date]
      );


      for (const cAppt of crossApptRes.rows) {
        const overlaps = workingSessions.some((s) => cAppt.start_time < s.end_time && cAppt.end_time > s.start_time);
        if (overlaps) {
          conflicts.push({
            appointmentId: cAppt.id,
            appointmentNumber: cAppt.appointment_number,
            appointmentDate: plan.date,
            startTime: cAppt.start_time,
            endTime: cAppt.end_time,
            issue: `Doctor already has appointment ${cAppt.appointment_number} at branch "${cAppt.branch_name}" during this shift.`,
          });
        }
      }
    }

    if (conflicts.length > 0) {
      const err = new Error(`Cannot save multi-date schedule: ${conflicts.length} conflicting active appointment(s) found.`);
      err.statusCode = 409;
      err.conflictCount = conflicts.length;
      err.conflictingAppointments = conflicts;
      throw err;
    }

    // Upsert date schedules and sessions
    const savedSchedules = [];
    for (const plan of datePlan) {
      const upsertSql = `
        INSERT INTO doctor_date_schedules (
          clinic_id, branch_id, doctor_id, schedule_date,
          slot_duration_minutes, buffer_minutes, chair_id, is_active,
          is_working_override, override_reason, created_by, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10, now())
        ON CONFLICT (clinic_id, branch_id, doctor_id, schedule_date)
        DO UPDATE SET
          slot_duration_minutes = EXCLUDED.slot_duration_minutes,
          buffer_minutes = EXCLUDED.buffer_minutes,
          chair_id = EXCLUDED.chair_id,
          is_active = true,
          is_working_override = EXCLUDED.is_working_override,
          override_reason = EXCLUDED.override_reason,
          updated_at = now()
        RETURNING id, schedule_date, slot_duration_minutes, buffer_minutes, chair_id, is_working_override, override_reason
      `;

      const schedRes = await client.query(upsertSql, [
        clinicId,
        branchId,
        doctorId,
        plan.date,
        plan.slot_duration_minutes,
        plan.buffer_minutes,
        plan.chair_id,
        plan.is_working_override,
        plan.override_reason,
        userId,
      ]);

      const dateSched = schedRes.rows[0];

      // Remove existing sessions for this date schedule
      await client.query(
        `DELETE FROM doctor_date_schedule_sessions WHERE date_schedule_id = $1`,
        [dateSched.id]
      );

      // Insert new sessions
      const insertedSessions = [];
      for (let sIdx = 0; sIdx < plan.sessions.length; sIdx++) {
        const sess = plan.sessions[sIdx];
        const sRes = await client.query(
          `INSERT INTO doctor_date_schedule_sessions (
            date_schedule_id, session_name, start_time, end_time, session_order, is_break, break_reason
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *`,
          [
            dateSched.id,
            sess.session_name || (sess.is_break ? 'Break' : 'Session'),
            sess.start_time,
            sess.end_time,
            sess.session_order || (sIdx + 1),
            Boolean(sess.is_break),
            sess.break_reason || null,
          ]
        );
        insertedSessions.push(sRes.rows[0]);
      }

      savedSchedules.push({
        ...dateSched,
        sessions: insertedSessions,
      });
    }

    await client.query('COMMIT');

    await recordAuditLog({
      userId,
      action: 'DOCTOR_MULTI_DATE_SCHEDULE_SAVED',
      entityType: 'doctor_date_schedules',
      branchId,
      ipAddress,
      details: {
        doctorId,
        dateCount: dates.length,
        dates,
        mode,
      },
    });

    return {
      success: true,
      count: savedSchedules.length,
      schedules: savedSchedules,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Remove or deactivate a date-specific schedule
 */
const deleteDoctorDateSchedule = async (clinicId, branchId, doctorId, scheduleDate, userId, ipAddress = '127.0.0.1') => {
  const existRes = await query(
    `SELECT id FROM doctor_date_schedules
     WHERE clinic_id = $1 AND branch_id = $2 AND doctor_id = $3 AND schedule_date = $4 AND is_active = true`,
    [clinicId, branchId, doctorId, scheduleDate]
  );
  if (existRes.rows.length === 0) {
    const err = new Error('Date-specific schedule not found.');
    err.statusCode = 404;
    throw err;
  }

  // Active appointments guard
  const apptRes = await query(
    `SELECT id, appointment_number, start_time, end_time
     FROM appointments
     WHERE clinic_id = $1 AND branch_id = $2 AND doctor_id = $3
       AND appointment_date = $4 AND status NOT IN ('cancelled', 'completed')`,
    [clinicId, branchId, doctorId, scheduleDate]
  );

  if (apptRes.rows.length > 0) {
    const dObj = new Date(scheduleDate);
    const dow = dObj.getDay();
    const weeklySched = await getDoctorWeeklySchedule(clinicId, branchId, doctorId);
    const daySched = weeklySched.find((s) => s.day_of_week === dow);
    const workingSessions = daySched && daySched.is_active ? daySched.sessions.filter((s) => !s.is_break) : [];

    const uncovered = apptRes.rows.filter(
      (appt) => !workingSessions.some((w) => appt.start_time >= w.start_time && appt.end_time <= w.end_time)
    );
    if (uncovered.length > 0) {
      const err = new Error(
        `Cannot remove date schedule: ${uncovered.length} active appointment(s) would be left outside doctor working hours.`
      );
      err.statusCode = 409;
      err.conflictingAppointments = uncovered;
      throw err;
    }
  }

  await query(
    `UPDATE doctor_date_schedules
     SET is_active = false, updated_at = now()
     WHERE clinic_id = $1 AND branch_id = $2 AND doctor_id = $3 AND schedule_date = $4`,
    [clinicId, branchId, doctorId, scheduleDate]
  );

  await recordAuditLog({
    userId,
    action: 'DOCTOR_DATE_SCHEDULE_DELETED',
    entityType: 'doctor_date_schedules',
    branchId,
    ipAddress,
    details: { doctorId, scheduleDate },
  });

  return { success: true, scheduleDate };
};

/**
 * Get annual 12-month calendar aggregation for clinic, branch, and doctor
 */
const getAnnualOverview = async (clinicId, branchId, year, doctorId = null) => {
  const y = parseInt(year, 10);
  const startDate = `${y}-01-01`;
  const endDate = `${y}-12-31`;

  // 1. Fetch holidays in this year
  const holidaySql = `
    SELECT id, name, category, holiday_date, to_char(holiday_date, 'YYYY-MM-DD') AS holiday_date_str,
           is_closed, branch_id, doctor_id, description
    FROM clinic_holidays
    WHERE clinic_id = $1
      AND holiday_year = $2
      AND is_active = true
      AND (branch_id IS NULL OR branch_id = $3)
      AND ($4::uuid IS NULL OR doctor_id IS NULL OR doctor_id = $4::uuid)
    ORDER BY holiday_date ASC
  `;
  const holidayRes = await query(holidaySql, [clinicId, y, branchId, doctorId]);

  // 2. Fetch doctor leaves/exceptions in this year
  let excSql = `
    SELECT id, doctor_id, exception_date, to_char(exception_date, 'YYYY-MM-DD') AS exception_date_str,
           exception_type, start_time, end_time, reason
    FROM doctor_schedule_exceptions
    WHERE clinic_id = $1 AND branch_id = $2
      AND exception_date >= $3 AND exception_date <= $4
  `;
  const excParams = [clinicId, branchId, startDate, endDate];
  if (doctorId) {
    excSql += ` AND doctor_id = $5`;
    excParams.push(doctorId);
  }
  excSql += ` ORDER BY exception_date ASC`;
  const excRes = await query(excSql, excParams);

  // 3. Fetch doctor date-specific schedules & overrides in this year
  let dateSchedSql = `
    SELECT dds.id, dds.doctor_id, dds.schedule_date, to_char(dds.schedule_date, 'YYYY-MM-DD') AS schedule_date_str,
           dds.is_working_override, dds.override_reason, dds.slot_duration_minutes
    FROM doctor_date_schedules dds
    WHERE dds.clinic_id = $1 AND dds.branch_id = $2
      AND dds.schedule_date >= $3 AND dds.schedule_date <= $4
      AND dds.is_active = true
  `;
  const dateSchedParams = [clinicId, branchId, startDate, endDate];
  if (doctorId) {
    dateSchedSql += ` AND dds.doctor_id = $5`;
    dateSchedParams.push(doctorId);
  }
  const dateSchedRes = await query(dateSchedSql, dateSchedParams);

  // 4. Fetch appointment counts per day
  let apptCountSql = `
    SELECT to_char(appointment_date, 'YYYY-MM-DD') AS appt_date, COUNT(*)::int AS count
    FROM appointments
    WHERE clinic_id = $1 AND branch_id = $2
      AND appointment_date >= $3 AND appointment_date <= $4
      AND status NOT IN ('cancelled')
  `;
  const apptCountParams = [clinicId, branchId, startDate, endDate];
  if (doctorId) {
    apptCountSql += ` AND doctor_id = $5`;
    apptCountParams.push(doctorId);
  }
  apptCountSql += ` GROUP BY appointment_date ORDER BY appointment_date ASC`;
  const apptCountRes = await query(apptCountSql, apptCountParams);

  const apptCounts = {};
  for (const r of apptCountRes.rows) {
    apptCounts[r.appt_date] = r.count;
  }

  // 5. Structure events by date for fast frontend lookup
  const dateEvents = {};

  for (const h of holidayRes.rows) {
    const dStr = h.holiday_date_str;
    if (!dateEvents[dStr]) dateEvents[dStr] = { holidays: [], leaves: [], overrides: [], dateSchedules: [], appointmentCount: 0 };
    dateEvents[dStr].holidays.push({
      id: h.id,
      name: h.name,
      category: h.category,
      isClosed: h.is_closed,
      description: h.description,
      isBranchSpecific: Boolean(h.branch_id),
    });
  }

  for (const ex of excRes.rows) {
    const dStr = ex.exception_date_str;
    if (!dateEvents[dStr]) dateEvents[dStr] = { holidays: [], leaves: [], overrides: [], dateSchedules: [], appointmentCount: 0 };
    dateEvents[dStr].leaves.push({
      id: ex.id,
      doctorId: ex.doctor_id,
      type: ex.exception_type,
      startTime: ex.start_time,
      endTime: ex.end_time,
      reason: ex.reason,
    });
  }

  for (const ds of dateSchedRes.rows) {
    const dStr = ds.schedule_date_str;
    if (!dateEvents[dStr]) dateEvents[dStr] = { holidays: [], leaves: [], overrides: [], dateSchedules: [], appointmentCount: 0 };
    if (ds.is_working_override) {
      dateEvents[dStr].overrides.push({
        id: ds.id,
        doctorId: ds.doctor_id,
        reason: ds.override_reason,
      });
    }
    dateEvents[dStr].dateSchedules.push({
      id: ds.id,
      doctorId: ds.doctor_id,
      isOverride: ds.is_working_override,
    });
  }

  for (const [dStr, cnt] of Object.entries(apptCounts)) {
    if (!dateEvents[dStr]) dateEvents[dStr] = { holidays: [], leaves: [], overrides: [], dateSchedules: [], appointmentCount: 0 };
    dateEvents[dStr].appointmentCount = cnt;
  }

  return {
    year: y,
    clinicId,
    branchId,
    doctorId,
    holidays: holidayRes.rows.map((h) => ({
      ...h,
      holiday_date: h.holiday_date_str,
    })),
    leaves: excRes.rows.map((e) => ({
      ...e,
      exception_date: e.exception_date_str,
    })),
    overrides: dateSchedRes.rows.filter((d) => d.is_working_override).map((d) => ({
      ...d,
      schedule_date: d.schedule_date_str,
    })),
    appointmentCounts: apptCounts,
    dateEvents,
  };
};

/**
 * Retrieve calendar events for Doctor Schedule Management
 * Returns working hours, breaks, exceptions, date schedules, holidays, and appointment intervals
 */
const getDoctorCalendarEvents = async (clinicId, branchId, doctorId, startDate, endDate) => {
  // 1. Weekly schedule templates
  const weeklySchedules = await getDoctorWeeklySchedule(clinicId, branchId, doctorId);

  // 2. Date-specific schedules in range
  const dateSchedules = await getDoctorDateSchedules(clinicId, branchId, doctorId, startDate, endDate);

  // 3. Exceptions in date range
  const exceptions = await getDoctorExceptions(clinicId, branchId, doctorId, startDate, endDate);

  // 4. Clinic / branch holidays in date range
  const holidayRes = await query(
    `SELECT id, name, category, holiday_date, to_char(holiday_date, 'YYYY-MM-DD') AS holiday_date_str,
            is_closed, description
     FROM clinic_holidays
     WHERE clinic_id = $1 AND (branch_id IS NULL OR branch_id = $2)
       AND holiday_date >= $3 AND holiday_date <= $4 AND is_active = true
     ORDER BY holiday_date ASC`,
    [clinicId, branchId, startDate, endDate]
  );

  // 5. Appointments in date range for this doctor at this branch
  const apptRes = await query(
    `SELECT a.id, a.appointment_number, a.appointment_date, a.start_time, a.end_time,
            a.status, a.appointment_type, a.patient_id,
            p.first_name, p.last_name, p.patient_number, p.phone
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     WHERE a.clinic_id = $1
       AND a.branch_id = $2
       AND a.doctor_id = $3
       AND a.appointment_date >= $4
       AND a.appointment_date <= $5
       AND a.status NOT IN ('cancelled')
     ORDER BY a.appointment_date ASC, a.start_time ASC`,
    [clinicId, branchId, doctorId, startDate, endDate]
  );

  return {
    doctorId,
    branchId,
    startDate,
    endDate,
    weeklySchedules,
    dateSchedules,
    exceptions,
    holidays: holidayRes.rows.map((h) => ({
      ...h,
      holiday_date: h.holiday_date_str,
    })),
    appointments: apptRes.rows.map((a) => ({
      id: a.id,
      appointmentNumber: a.appointment_number,
      appointmentDate: a.appointment_date,
      startTime: a.start_time,
      endTime: a.end_time,
      status: a.status,
      appointmentType: a.appointment_type,
      patientName: `${a.first_name} ${a.last_name}`,
      patientNumber: a.patient_number,
      phone: a.phone,
    })),
  };
};

/**
 * Get branch dental chairs
 */
const getBranchChairs = async (clinicId, branchId) => {
  const result = await query(
    `SELECT id, chair_number, chair_name, is_active
     FROM dental_chairs
     WHERE clinic_id = $1 AND branch_id = $2
     ORDER BY chair_number ASC`,
    [clinicId, branchId]
  );
  return result.rows;
};

module.exports = {
  getBranchDoctors,
  getBranchDoctorsWithFees,
  getDoctorWeeklySchedule,
  saveDoctorWeeklySchedule,
  getDoctorExceptions,
  createDoctorException,
  deleteDoctorException,
  getDoctorFee,
  saveDoctorFee,
  checkScheduleConflicts,
  getDoctorCalendarEvents,
  getBranchChairs,
  getDoctorDateSchedules,
  saveDoctorMultiDateSchedule,
  deleteDoctorDateSchedule,
  getAnnualOverview,
};

