const { query, pool } = require('../config/database');
const { generatePatientNumber } = require('../utils/patientNumberGenerator');
const { generateVisitToken, getClinicLocalDate } = require('../utils/visitTokenGenerator');
const { recordAuditLog } = require('../utils/auditLogger');
const {
  UUID_REGEX,
  validateRegisterPatient,
  validateUpdatePatient,
  validateMedicalRecord,
  validateStatusChange,
  validateCreateVisit,
  validateVisitStatus,
} = require('../validations/patientValidation');

const CLINICAL_ROLES = ['admin', 'dentist', 'specialist', 'radiologist', 'assistant'];
const CLINICAL_EDIT_ROLES = ['admin', 'dentist', 'specialist'];
const NUMERIC_REGEX = /^[0-9]+$/;

/**
 * Register a new patient
 * POST /api/patients
 */
const registerPatient = async (req, res, next) => {
  try {
    const { clinicId, id: userId, role } = req.user;

    if (!clinicId) {
      return res.status(400).json({
        success: false,
        message: 'Clinic context is required to register a patient.',
      });
    }

    const validation = validateRegisterPatient(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: validation.errors,
      });
    }

    const {
      first_name,
      firstName,
      last_name,
      lastName,
      date_of_birth,
      dateOfBirth,
      gender = 'unspecified',
      phone,
      email,
      address,
      city,
      state,
      postal_code,
      postalCode,
      emergency_contact_name,
      emergencyContactName,
      emergency_contact_phone,
      emergencyContactPhone,
      emergency_contact_relation,
      emergencyContactRelation,
      branch_id,
      branchId: reqBranchId,
      // Medical information
      allergies,
      medical_conditions,
      medicalConditions,
      current_medications,
      currentMedications,
      medical_history,
      medicalHistory,
      dental_treatment_notes,
      dentalTreatmentNotes,
      has_medical_alerts,
      hasMedicalAlerts,
      medical_alert_details,
      medicalAlertDetails,
    } = req.body;

    const finalFirstName = (first_name || firstName).trim();
    const finalLastName = (last_name || lastName || '').trim() || null;
    const finalDob = date_of_birth || dateOfBirth || null;
    const finalGender = (gender || 'unspecified').toLowerCase();
    const finalPhone = phone.trim();
    const finalEmail = (email && email.trim()) ? email.trim().toLowerCase() : null;
    const finalAddress = address ? address.trim() : null;
    const finalCity = city ? city.trim() : null;
    const finalState = state ? state.trim() : null;
    const finalPostalCode = postal_code || postalCode || null;
    const finalEmergencyName = emergency_contact_name || emergencyContactName || null;
    const finalEmergencyPhone = emergency_contact_phone || emergencyContactPhone || null;
    const finalEmergencyRelation = emergency_contact_relation || emergencyContactRelation || null;

    // Determine target registration branch from request or server-authorized branch context
    let targetBranchId = branch_id || reqBranchId || req.headers['x-branch-id'];

    if (!targetBranchId) {
      targetBranchId = req.user.authorizedBranchId;
    }

    if (!targetBranchId) {
      return res.status(400).json({
        success: false,
        message: 'No authorized branch assigned to your user account.',
      });
    }

    // STRICT BRANCH-LEVEL ISOLATION: User must be assigned to the registration branch (NO ROLE BYPASS)
    if (!req.user.assignedBranchIds || !req.user.assignedBranchIds.includes(targetBranchId)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You are not assigned to this registration branch.',
      });
    }

    // Verify branch belongs to user's clinic and is active
    const branchRes = await query(
      `SELECT id, clinic_id, branch_name, branch_code, is_active FROM branches WHERE id = $1 AND clinic_id = $2`,
      [targetBranchId, clinicId]
    );

    if (branchRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Selected registration branch not found in this clinic organization.',
      });
    }

    const branch = branchRes.rows[0];
    if (!branch.is_active) {
      return res.status(400).json({
        success: false,
        message: 'Cannot register a patient at an inactive branch.',
      });
    }

    // Execute atomic registration in transaction
    const client = await pool.connect();
    let createdPatient;
    let createdMedicalRecord = null;

    try {
      await client.query('BEGIN');

      // Concurrency-safe permanent numeric Patient ID generation (starts at 100001, organization-wide)
      const patientNumber = await generatePatientNumber(client, clinicId);

      const insertPatientQuery = `
        INSERT INTO patients (
          clinic_id, branch_id, patient_number, first_name, last_name,
          date_of_birth, gender, phone, email, address, city, state, postal_code,
          emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
          status, created_by, updated_by
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11, $12, $13,
          $14, $15, $16,
          'active', $17, $17
        )
        RETURNING *;
      `;

      const patientValues = [
        clinicId,
        targetBranchId,
        patientNumber,
        finalFirstName,
        finalLastName,
        finalDob,
        finalGender,
        finalPhone,
        finalEmail,
        finalAddress,
        finalCity,
        finalState,
        finalPostalCode,
        finalEmergencyName,
        finalEmergencyPhone,
        finalEmergencyRelation,
        userId,
      ];

      const patientResult = await client.query(insertPatientQuery, patientValues);
      createdPatient = patientResult.rows[0];

      // Medical information record
      const finalAllergies = allergies ? allergies.trim() : null;
      const finalConditions = medical_conditions || medicalConditions || null;
      const finalMeds = current_medications || currentMedications || null;
      const finalHistory = medical_history || medicalHistory || null;
      const finalTreatmentNotes = dental_treatment_notes || dentalTreatmentNotes || null;
      const finalHasAlerts = Boolean(has_medical_alerts || hasMedicalAlerts);
      const finalAlertDetails = medical_alert_details || medicalAlertDetails || null;

      // Always create a corresponding medical profile record
      const insertMedicalQuery = `
        INSERT INTO patient_medical_records (
          patient_id, clinic_id, allergies, medical_conditions, current_medications,
          medical_history, dental_treatment_notes, has_medical_alerts, medical_alert_details,
          created_by, updated_by
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $10
        )
        RETURNING *;
      `;

      const medicalValues = [
        createdPatient.id,
        clinicId,
        finalAllergies,
        finalConditions,
        finalMeds,
        finalHistory,
        finalTreatmentNotes,
        finalHasAlerts,
        finalAlertDetails,
        userId,
      ];

      const medicalResult = await client.query(insertMedicalQuery, medicalValues);
      createdMedicalRecord = medicalResult.rows[0];

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    // Safe Audit Trail: Never log full medical text
    await recordAuditLog({
      userId,
      action: 'PATIENT_REGISTERED',
      entityType: 'patients',
      entityId: createdPatient.id,
      branchId: targetBranchId,
      ipAddress: req.ip || '127.0.0.1',
      details: {
        patientNumber: createdPatient.patient_number,
        branchName: branch.branch_name,
        branchCode: branch.branch_code,
        hasMedicalAlerts: createdMedicalRecord.has_medical_alerts,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Patient registered successfully.',
      patient: {
        ...createdPatient,
        patient_id: createdPatient.patient_number,
        branch_name: branch.branch_name,
        branch_code: branch.branch_code,
        has_medical_alerts: createdMedicalRecord.has_medical_alerts,
        medical_alert_details: createdMedicalRecord.medical_alert_details,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List patients with pagination, multi-field search, and branch filtering
 * GET /api/patients
 */
const listPatients = async (req, res, next) => {
  try {
    const { clinicId, id: userId, role } = req.user;

    if (!clinicId) {
      return res.status(400).json({
        success: false,
        message: 'Clinic context is required to view patients.',
      });
    }

    const {
      page = 1,
      limit = 10,
      search = '',
      branchId = '',
      status = '',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    // STRICT BRANCH-LEVEL SCOPING: A user only sees patients belonging to their authorized branch(es)
    let baseSql = `
      FROM patients p
      JOIN branches b ON p.branch_id = b.id
      LEFT JOIN patient_medical_records pmr ON p.id = pmr.patient_id
      WHERE p.clinic_id = $1
    `;
    const params = [clinicId];
    let paramIndex = 2;

    // Specific branch filter requested
    if (branchId && UUID_REGEX.test(branchId)) {
      if (!req.user.assignedBranchIds || !req.user.assignedBranchIds.includes(branchId)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. You are not authorized to access patients from this branch.',
        });
      }
      baseSql += ` AND p.branch_id = $${paramIndex}`;
      params.push(branchId);
      paramIndex++;
    } else {
      if (!req.user.assignedBranchIds || req.user.assignedBranchIds.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. No authorized branch assigned to your user account.',
        });
      }
      baseSql += ` AND p.branch_id = ANY($${paramIndex}::uuid[])`;
      params.push(req.user.assignedBranchIds);
      paramIndex++;
    }

    // Status filter
    if (status && ['active', 'inactive', 'archived'].includes(status)) {
      baseSql += ` AND p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // Search query across patient_number (numeric), legacy_patient_number, name, phone, email
    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      baseSql += ` AND (
        p.patient_number ILIKE $${paramIndex} OR
        p.legacy_patient_number ILIKE $${paramIndex} OR
        p.first_name ILIKE $${paramIndex} OR
        p.last_name ILIKE $${paramIndex} OR
        CONCAT(p.first_name, ' ', p.last_name) ILIKE $${paramIndex} OR
        p.phone ILIKE $${paramIndex} OR
        p.email ILIKE $${paramIndex}
      )`;
      params.push(searchPattern);
      paramIndex++;
    }

    // Count query
    const countSql = `SELECT COUNT(*)::int AS total ${baseSql}`;
    const countResult = await query(countSql, params);
    const total = countResult.rows[0].total;
    const totalPages = Math.ceil(total / limitNum);

    // Data query
    const dataSql = `
      SELECT 
        p.id, p.clinic_id, p.branch_id, p.patient_number, p.legacy_patient_number,
        p.first_name, p.last_name, p.date_of_birth, p.gender,
        p.phone, p.email, p.city, p.registration_date, p.status,
        p.created_at, p.updated_at,
        b.branch_name, b.branch_code,
        COALESCE(pmr.has_medical_alerts, false) AS has_medical_alerts,
        pmr.medical_alert_details
      ${baseSql}
      ORDER BY p.registration_date DESC, p.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limitNum, offset);

    const patientsResult = await query(dataSql, params);

    return res.json({
      success: true,
      patients: patientsResult.rows.map((p) => ({
        ...p,
        patient_id: p.patient_number,
      })),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check for duplicate patients before registration
 * GET /api/patients/check-duplicate
 */
const checkDuplicate = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { phone, email } = req.query;

    if (!clinicId) {
      return res.status(400).json({ success: false, message: 'Clinic context is required.' });
    }

    if (!phone && !email) {
      return res.json({ success: true, hasDuplicate: false, duplicates: [] });
    }

    let sql = `
      SELECT p.id, p.patient_number, p.legacy_patient_number, p.first_name, p.last_name, p.phone, p.email, p.registration_date, b.branch_name
      FROM patients p
      JOIN branches b ON p.branch_id = b.id
      WHERE p.clinic_id = $1 AND p.status != 'archived'
    `;
    const params = [clinicId];
    let paramIndex = 2;

    const conditions = [];
    if (phone && phone.trim()) {
      conditions.push(`p.phone = $${paramIndex}`);
      params.push(phone.trim());
      paramIndex++;
    }
    if (email && email.trim()) {
      conditions.push(`LOWER(p.email) = LOWER($${paramIndex})`);
      params.push(email.trim());
      paramIndex++;
    }

    sql += ` AND (${conditions.join(' OR ')}) LIMIT 5`;

    const result = await query(sql, params);

    return res.json({
      success: true,
      hasDuplicate: result.rows.length > 0,
      duplicates: result.rows.map((r) => ({
        ...r,
        patient_id: r.patient_number,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve patient full profile with medical records
 * Supports lookup by UUID or by permanent numeric Patient ID
 * GET /api/patients/:id
 */
const getPatientById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { clinicId, role, id: userId } = req.user;

    const isUuid = UUID_REGEX.test(id);
    const isNumericId = NUMERIC_REGEX.test(id);

    if (!isUuid && !isNumericId) {
      return res.status(400).json({ success: false, message: 'Invalid patient ID format. Must be UUID or numeric Patient ID.' });
    }

    let patientRes;
    if (isUuid) {
      patientRes = await query(
        `SELECT p.*,
                b.branch_name, b.branch_code, b.is_active AS branch_is_active,
                u1.first_name AS created_by_first_name, u1.last_name AS created_by_last_name,
                u2.first_name AS updated_by_first_name, u2.last_name AS updated_by_last_name
         FROM patients p
         JOIN branches b ON p.branch_id = b.id
         LEFT JOIN users u1 ON p.created_by = u1.id
         LEFT JOIN users u2 ON p.updated_by = u2.id
         WHERE p.id = $1`,
        [id]
      );
    } else {
      patientRes = await query(
        `SELECT p.*,
                b.branch_name, b.branch_code, b.is_active AS branch_is_active,
                u1.first_name AS created_by_first_name, u1.last_name AS created_by_last_name,
                u2.first_name AS updated_by_first_name, u2.last_name AS updated_by_last_name
         FROM patients p
         JOIN branches b ON p.branch_id = b.id
         LEFT JOIN users u1 ON p.created_by = u1.id
         LEFT JOIN users u2 ON p.updated_by = u2.id
         WHERE p.patient_number = $1 AND p.clinic_id = $2`,
        [id, clinicId]
      );
    }

    if (patientRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }

    const patient = patientRes.rows[0];

    // Multi-tenant Security Check: Isolation by clinic
    if (patient.clinic_id !== clinicId) {
      await recordAuditLog({
        userId,
        action: 'SECURITY_CROSS_TENANT_ACCESS_DENIED',
        entityType: 'patients',
        entityId: patient.id,
        branchId: patient.branch_id,
        ipAddress: req.ip || '127.0.0.1',
        details: {
          targetPatientId: patient.id,
          targetClinicId: patient.clinic_id,
          userClinicId: clinicId,
        },
      });

      return res.status(404).json({
        success: false,
        message: 'Patient not found.',
      });
    }

    // STRICT BRANCH-LEVEL ISOLATION: User must be assigned to the patient's branch
    // Or patient must have had an encounter / visit at the user's assigned branch
    const isDirectBranchPatient = req.user.assignedBranchIds && req.user.assignedBranchIds.includes(patient.branch_id);

    if (!isDirectBranchPatient) {
      // Check if patient has any visit at the user's assigned branch
      const crossBranchVisitCheck = await query(
        `SELECT id FROM patient_visits WHERE patient_id = $1 AND branch_id = ANY($2::uuid[]) LIMIT 1`,
        [patient.id, req.user.assignedBranchIds || []]
      );

      if (crossBranchVisitCheck.rows.length === 0) {
        await recordAuditLog({
          userId,
          action: 'SECURITY_BRANCH_ACCESS_DENIED',
          entityType: 'patients',
          entityId: patient.id,
          branchId: patient.branch_id,
          ipAddress: req.ip || '127.0.0.1',
          details: {
            targetPatientId: patient.id,
            targetPatientBranch: patient.branch_id,
            userAssignedBranches: req.user.assignedBranchIds,
            role,
          },
        });

        return res.status(403).json({
          success: false,
          message: 'Forbidden. You are not authorized to access patient records from another branch.',
        });
      }
    }

    // Medical record access: Cross-branch medical-record access is denied
    let medicalRecord = null;
    if (isDirectBranchPatient) {
      const medRes = await query(
        `SELECT * FROM patient_medical_records WHERE patient_id = $1`,
        [patient.id]
      );
      medicalRecord = medRes.rows[0] || null;

      // RBAC Security: Only clinical roles may inspect detailed notes and medications
      const isClinicalUser = CLINICAL_ROLES.includes(role);
      if (medicalRecord && !isClinicalUser) {
        // Redact sensitive clinical history for front desk/billing staff while preserving emergency alert flags
        medicalRecord = {
          has_medical_alerts: medicalRecord.has_medical_alerts,
          medical_alert_details: medicalRecord.medical_alert_details,
          allergies: medicalRecord.allergies ? 'Recorded (Clinical Access Required)' : null,
          medical_conditions: null,
          current_medications: null,
          medical_history: null,
          dental_treatment_notes: null,
        };
      }
    }

    return res.json({
      success: true,
      patient: {
        ...patient,
        patient_id: patient.patient_number,
      },
      medicalRecord,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update patient demographic information
 * PUT /api/patients/:id
 */
const updatePatient = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { clinicId, id: userId } = req.user;

    const isUuid = UUID_REGEX.test(id);
    const isNumericId = NUMERIC_REGEX.test(id);

    if (!isUuid && !isNumericId) {
      return res.status(400).json({ success: false, message: 'Invalid patient ID format.' });
    }

    const validation = validateUpdatePatient(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: validation.errors,
      });
    }

    // Verify patient exists and belongs to clinic
    const existingRes = await query(
      isUuid
        ? `SELECT id, clinic_id, branch_id, patient_number FROM patients WHERE id = $1`
        : `SELECT id, clinic_id, branch_id, patient_number FROM patients WHERE patient_number = $1 AND clinic_id = $2`,
      isUuid ? [id] : [id, clinicId]
    );

    if (existingRes.rows.length === 0 || existingRes.rows[0].clinic_id !== clinicId) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }

    const existingPatient = existingRes.rows[0];

    // STRICT BRANCH-LEVEL ACCESS: User must be assigned to the patient's branch
    if (!req.user.assignedBranchIds || !req.user.assignedBranchIds.includes(existingPatient.branch_id)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You cannot modify patient records belonging to another branch.',
      });
    }

    const patientInternalId = existingPatient.id;

    const {
      first_name,
      firstName,
      last_name,
      lastName,
      date_of_birth,
      dateOfBirth,
      gender,
      phone,
      email,
      address,
      city,
      state,
      postal_code,
      postalCode,
      emergency_contact_name,
      emergencyContactName,
      emergency_contact_phone,
      emergencyContactPhone,
      emergency_contact_relation,
      emergencyContactRelation,
    } = req.body;

    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    if (first_name !== undefined || firstName !== undefined) {
      updateFields.push(`first_name = $${paramIndex}`);
      values.push((first_name || firstName).trim());
      paramIndex++;
    }
    if (last_name !== undefined || lastName !== undefined) {
      updateFields.push(`last_name = $${paramIndex}`);
      values.push((last_name || lastName || '').trim() || null);
      paramIndex++;
    }
    if (date_of_birth !== undefined || dateOfBirth !== undefined) {
      updateFields.push(`date_of_birth = $${paramIndex}`);
      values.push(date_of_birth || dateOfBirth || null);
      paramIndex++;
    }
    if (gender !== undefined) {
      updateFields.push(`gender = $${paramIndex}`);
      values.push(gender.toLowerCase());
      paramIndex++;
    }
    if (phone !== undefined) {
      updateFields.push(`phone = $${paramIndex}`);
      values.push(phone.trim());
      paramIndex++;
    }
    if (email !== undefined) {
      updateFields.push(`email = $${paramIndex}`);
      values.push((email && email.trim()) ? email.trim().toLowerCase() : null);
      paramIndex++;
    }
    if (address !== undefined) {
      updateFields.push(`address = $${paramIndex}`);
      values.push(address ? address.trim() : null);
      paramIndex++;
    }
    if (city !== undefined) {
      updateFields.push(`city = $${paramIndex}`);
      values.push(city ? city.trim() : null);
      paramIndex++;
    }
    if (state !== undefined) {
      updateFields.push(`state = $${paramIndex}`);
      values.push(state ? state.trim() : null);
      paramIndex++;
    }
    if (postal_code !== undefined || postalCode !== undefined) {
      updateFields.push(`postal_code = $${paramIndex}`);
      values.push(postal_code || postalCode || null);
      paramIndex++;
    }
    if (emergency_contact_name !== undefined || emergencyContactName !== undefined) {
      updateFields.push(`emergency_contact_name = $${paramIndex}`);
      values.push(emergency_contact_name || emergencyContactName || null);
      paramIndex++;
    }
    if (emergency_contact_phone !== undefined || emergencyContactPhone !== undefined) {
      updateFields.push(`emergency_contact_phone = $${paramIndex}`);
      values.push(emergency_contact_phone || emergencyContactPhone || null);
      paramIndex++;
    }
    if (emergency_contact_relation !== undefined || emergencyContactRelation !== undefined) {
      updateFields.push(`emergency_contact_relation = $${paramIndex}`);
      values.push(emergency_contact_relation || emergencyContactRelation || null);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields provided for update.' });
    }

    updateFields.push(`updated_by = $${paramIndex}`);
    values.push(userId);
    paramIndex++;

    updateFields.push(`updated_at = now()`);

    const updateSql = `
      UPDATE patients
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND clinic_id = $${paramIndex + 1}
      RETURNING *;
    `;
    values.push(patientInternalId, clinicId);

    const result = await query(updateSql, values);

    // Audit log
    await recordAuditLog({
      userId,
      action: 'PATIENT_UPDATED',
      entityType: 'patients',
      entityId: patientInternalId,
      branchId: existingPatient.branch_id,
      ipAddress: req.ip || '127.0.0.1',
      details: {
        patientNumber: existingPatient.patient_number,
        updatedFields: Object.keys(req.body),
      },
    });

    return res.json({
      success: true,
      message: 'Patient profile updated successfully.',
      patient: {
        ...result.rows[0],
        patient_id: result.rows[0].patient_number,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add or update medical information
 * PUT /api/patients/:id/medical
 */
const updateMedicalRecord = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { clinicId, id: userId, role } = req.user;

    const isUuid = UUID_REGEX.test(id);
    const isNumericId = NUMERIC_REGEX.test(id);

    if (!isUuid && !isNumericId) {
      return res.status(400).json({ success: false, message: 'Invalid patient ID format.' });
    }

    if (!CLINICAL_EDIT_ROLES.includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Only clinical practitioners may edit medical profiles.',
      });
    }

    const validation = validateMedicalRecord(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: validation.errors,
      });
    }

    // Verify patient exists and belongs to clinic
    const patientRes = await query(
      isUuid
        ? `SELECT id, clinic_id, branch_id, patient_number FROM patients WHERE id = $1`
        : `SELECT id, clinic_id, branch_id, patient_number FROM patients WHERE patient_number = $1 AND clinic_id = $2`,
      isUuid ? [id] : [id, clinicId]
    );

    if (patientRes.rows.length === 0 || patientRes.rows[0].clinic_id !== clinicId) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }

    const patient = patientRes.rows[0];

    // STRICT BRANCH-LEVEL ACCESS: User must be assigned to the patient's branch
    if (!req.user.assignedBranchIds || !req.user.assignedBranchIds.includes(patient.branch_id)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You cannot modify medical records for another branch.',
      });
    }

    const {
      allergies,
      medical_conditions,
      medicalConditions,
      current_medications,
      currentMedications,
      medical_history,
      medicalHistory,
      dental_treatment_notes,
      dentalTreatmentNotes,
      has_medical_alerts,
      hasMedicalAlerts,
      medical_alert_details,
      medicalAlertDetails,
    } = req.body;

    const finalAllergies = allergies !== undefined ? (allergies ? allergies.trim() : null) : undefined;
    const finalConditions = (medical_conditions !== undefined || medicalConditions !== undefined)
      ? (medical_conditions || medicalConditions || null)
      : undefined;
    const finalMeds = (current_medications !== undefined || currentMedications !== undefined)
      ? (current_medications || currentMedications || null)
      : undefined;
    const finalHistory = (medical_history !== undefined || medicalHistory !== undefined)
      ? (medical_history || medicalHistory || null)
      : undefined;
    const finalNotes = (dental_treatment_notes !== undefined || dentalTreatmentNotes !== undefined)
      ? (dental_treatment_notes || dentalTreatmentNotes || null)
      : undefined;
    const finalHasAlerts = (has_medical_alerts !== undefined || hasMedicalAlerts !== undefined)
      ? Boolean(has_medical_alerts || hasMedicalAlerts)
      : undefined;
    const finalAlertDetails = (medical_alert_details !== undefined || medicalAlertDetails !== undefined)
      ? (medical_alert_details || medicalAlertDetails || null)
      : undefined;

    const upsertSql = `
      INSERT INTO patient_medical_records (
        patient_id, clinic_id, allergies, medical_conditions, current_medications,
        medical_history, dental_treatment_notes, has_medical_alerts, medical_alert_details,
        created_by, updated_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, COALESCE($8, false), $9,
        $10, $10, now(), now()
      )
      ON CONFLICT (patient_id)
      DO UPDATE SET
        allergies = COALESCE(EXCLUDED.allergies, patient_medical_records.allergies),
        medical_conditions = COALESCE(EXCLUDED.medical_conditions, patient_medical_records.medical_conditions),
        current_medications = COALESCE(EXCLUDED.current_medications, patient_medical_records.current_medications),
        medical_history = COALESCE(EXCLUDED.medical_history, patient_medical_records.medical_history),
        dental_treatment_notes = COALESCE(EXCLUDED.dental_treatment_notes, patient_medical_records.dental_treatment_notes),
        has_medical_alerts = COALESCE(EXCLUDED.has_medical_alerts, patient_medical_records.has_medical_alerts),
        medical_alert_details = COALESCE(EXCLUDED.medical_alert_details, patient_medical_records.medical_alert_details),
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
      RETURNING *;
    `;

    const values = [
      patient.id,
      clinicId,
      finalAllergies,
      finalConditions,
      finalMeds,
      finalHistory,
      finalNotes,
      finalHasAlerts,
      finalAlertDetails,
      userId,
    ];

    const result = await query(upsertSql, values);

    // Audit log without logging sensitive medical notes
    await recordAuditLog({
      userId,
      action: 'PATIENT_MEDICAL_UPDATED',
      entityType: 'patient_medical_records',
      entityId: result.rows[0].id,
      branchId: patient.branch_id,
      ipAddress: req.ip || '127.0.0.1',
      details: {
        patientId: patient.id,
        patientNumber: patient.patient_number,
        hasMedicalAlerts: result.rows[0].has_medical_alerts,
      },
    });

    return res.json({
      success: true,
      message: 'Medical profile updated successfully.',
      medicalRecord: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update patient record status (active / inactive / archived)
 * PATCH /api/patients/:id/status
 */
const updatePatientStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    const { clinicId, id: userId, role } = req.user;

    const isUuid = UUID_REGEX.test(id);
    const isNumericId = NUMERIC_REGEX.test(id);

    if (!isUuid && !isNumericId) {
      return res.status(400).json({ success: false, message: 'Invalid patient ID format.' });
    }

    if (!['admin', 'dentist'].includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Only administrators or dentists may change patient status.',
      });
    }

    const validation = validateStatusChange(status);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: validation.errors,
      });
    }

    const patientRes = await query(
      isUuid
        ? `SELECT id, clinic_id, branch_id, patient_number, status FROM patients WHERE id = $1`
        : `SELECT id, clinic_id, branch_id, patient_number, status FROM patients WHERE patient_number = $1 AND clinic_id = $2`,
      isUuid ? [id] : [id, clinicId]
    );

    if (patientRes.rows.length === 0 || patientRes.rows[0].clinic_id !== clinicId) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }

    const patient = patientRes.rows[0];

    // Branch isolation check for all roles
    if (!req.user.assignedBranchIds || !req.user.assignedBranchIds.includes(patient.branch_id)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have access to this patient branch.',
      });
    }

    const updateRes = await query(
      `UPDATE patients SET status = $1, updated_by = $2, updated_at = now() WHERE id = $3 RETURNING *`,
      [status, userId, patient.id]
    );

    // Audit status change
    await recordAuditLog({
      userId,
      action: 'PATIENT_STATUS_CHANGED',
      entityType: 'patients',
      entityId: patient.id,
      branchId: patient.branch_id,
      ipAddress: req.ip || '127.0.0.1',
      details: {
        patientNumber: patient.patient_number,
        previousStatus: patient.status,
        newStatus: status,
        reason: reason || 'Not specified',
      },
    });

    return res.json({
      success: true,
      message: `Patient status updated to '${status}'.`,
      patient: {
        ...updateRes.rows[0],
        patient_id: updateRes.rows[0].patient_number,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * =============================================================================
 * Visit & Daily Branch Token Management
 * =============================================================================
 */

/**
 * Create a new visit and generate its daily branch-specific token
 * POST /api/patients/:id/visits
 */
const createPatientVisit = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { clinicId, id: userId, role } = req.user;

    const isUuid = UUID_REGEX.test(id);
    const isNumericId = NUMERIC_REGEX.test(id);

    if (!isUuid && !isNumericId) {
      return res.status(400).json({ success: false, message: 'Invalid patient ID format.' });
    }

    const validation = validateCreateVisit(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: validation.errors,
      });
    }

    // 1. Fetch patient
    const patientRes = await query(
      isUuid
        ? `SELECT id, clinic_id, branch_id, patient_number, first_name, last_name, status FROM patients WHERE id = $1`
        : `SELECT id, clinic_id, branch_id, patient_number, first_name, last_name, status FROM patients WHERE patient_number = $1 AND clinic_id = $2`,
      isUuid ? [id] : [id, clinicId]
    );

    if (patientRes.rows.length === 0 || patientRes.rows[0].clinic_id !== clinicId) {
      return res.status(404).json({ success: false, message: 'Patient not found in this clinic organization.' });
    }

    const patient = patientRes.rows[0];

    // 2. Determine target visit branch (from body or header or default to user/patient branch)
    const targetBranchId =
      req.body.branch_id ||
      req.body.branchId ||
      req.headers['x-branch-id'] ||
      patient.branch_id;

    if (!UUID_REGEX.test(targetBranchId)) {
      return res.status(400).json({ success: false, message: 'Valid branch ID is required for the visit.' });
    }

    // 3. Verify target branch belongs to clinic and is active
    const branchRes = await query(
      `SELECT id, clinic_id, branch_code, branch_name, timezone, is_active FROM branches WHERE id = $1 AND clinic_id = $2`,
      [targetBranchId, clinicId]
    );

    if (branchRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Branch not found in this clinic organization.' });
    }

    const branch = branchRes.rows[0];
    if (!branch.is_active) {
      return res.status(400).json({ success: false, message: 'Cannot create a visit at an inactive branch.' });
    }

    // 4. Verify user branch permission for all roles (including admin)
    if (!req.user.assignedBranchIds || !req.user.assignedBranchIds.includes(targetBranchId)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You are not assigned to create visits for this branch location.',
      });
    }

    const {
      visit_type = 'consultation',
      visitType,
      reason_for_visit,
      reasonForVisit,
      doctor_id,
      doctorId,
      notes,
    } = req.body;

    const finalVisitType = (visit_type || visitType || 'consultation').toLowerCase();
    const finalReason = reason_for_visit || reasonForVisit || null;
    const finalDoctorId = doctor_id || doctorId || null;
    const finalNotes = notes || null;

    // 5. Timezone-aware clinic-local calendar date
    const visitDate = getClinicLocalDate(branch.timezone || 'Asia/Kolkata');

    // 6. Transactional generation of daily token and visit record
    const client = await pool.connect();
    let createdVisit;

    try {
      await client.query('BEGIN');

      // Concurrency-safe atomic token allocation scoped per (clinic_id, branch_id, visit_date)
      const tokenData = await generateVisitToken(client, clinicId, targetBranchId, visitDate);

      const insertVisitSql = `
        INSERT INTO patient_visits (
          clinic_id, patient_id, branch_id, visit_date, token_number, token_display,
          status, visit_type, reason_for_visit, doctor_id, notes, created_by, updated_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          'queued', $7, $8, $9, $10, $11, $11
        )
        RETURNING *;
      `;

      const insertValues = [
        clinicId,
        patient.id,
        targetBranchId,
        visitDate,
        tokenData.tokenNumber,
        tokenData.tokenDisplay,
        finalVisitType,
        finalReason,
        finalDoctorId,
        finalNotes,
        userId,
      ];

      const visitResult = await client.query(insertVisitSql, insertValues);
      createdVisit = visitResult.rows[0];

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    // Safe Audit Trail
    await recordAuditLog({
      userId,
      action: 'VISIT_TOKEN_GENERATED',
      entityType: 'patient_visits',
      entityId: createdVisit.id,
      branchId: targetBranchId,
      ipAddress: req.ip || '127.0.0.1',
      details: {
        patientNumber: patient.patient_number,
        tokenDisplay: createdVisit.token_display,
        visitDate: createdVisit.visit_date,
        branchName: branch.branch_name,
        branchCode: branch.branch_code,
      },
    });

    return res.status(201).json({
      success: true,
      message: `Visit token ${createdVisit.token_display} generated for ${branch.branch_name}.`,
      visit: {
        ...createdVisit,
        branch_name: branch.branch_name,
        branch_code: branch.branch_code,
      },
      patient: {
        id: patient.id,
        patient_id: patient.patient_number,
        patient_number: patient.patient_number,
        first_name: patient.first_name,
        last_name: patient.last_name,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List patient visit history across all branches
 * GET /api/patients/:id/visits
 */
const getPatientVisits = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { clinicId } = req.user;

    const isUuid = UUID_REGEX.test(id);
    const isNumericId = NUMERIC_REGEX.test(id);

    if (!isUuid && !isNumericId) {
      return res.status(400).json({ success: false, message: 'Invalid patient ID format.' });
    }

    const patientRes = await query(
      isUuid
        ? `SELECT id, clinic_id, branch_id, patient_number FROM patients WHERE id = $1`
        : `SELECT id, clinic_id, branch_id, patient_number FROM patients WHERE patient_number = $1 AND clinic_id = $2`,
      isUuid ? [id] : [id, clinicId]
    );

    if (patientRes.rows.length === 0 || patientRes.rows[0].clinic_id !== clinicId) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }

    const patient = patientRes.rows[0];
    const assignedBranchIds = req.user.assignedBranchIds || [];

    // Verify branch isolation: patient must belong to one of user's assigned branches,
    // OR have had a visit at one of user's assigned branches.
    const isPrimaryBranch = assignedBranchIds.includes(patient.branch_id);
    if (!isPrimaryBranch) {
      const crossVisitRes = await query(
        `SELECT id FROM patient_visits WHERE patient_id = $1 AND branch_id = ANY($2::uuid[]) LIMIT 1`,
        [patient.id, assignedBranchIds]
      );
      if (crossVisitRes.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. You do not have access to patients from other branches.',
        });
      }
    }

    const visitsRes = await query(
      `SELECT pv.*,
              b.branch_name, b.branch_code,
              u1.first_name AS doctor_first_name, u1.last_name AS doctor_last_name,
              u2.first_name AS created_by_first_name, u2.last_name AS created_by_last_name
       FROM patient_visits pv
       JOIN branches b ON pv.branch_id = b.id
       LEFT JOIN users u1 ON pv.doctor_id = u1.id
       LEFT JOIN users u2 ON pv.created_by = u2.id
       WHERE pv.patient_id = $1 AND pv.clinic_id = $2 AND pv.branch_id = ANY($3::uuid[])
       ORDER BY pv.visit_date DESC, pv.created_at DESC`,
      [patient.id, clinicId, assignedBranchIds]
    );

    return res.json({
      success: true,
      visits: visitsRes.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve daily visit queue for a branch
 * GET /api/branches/:branchId/visits/today
 */
const getBranchDailyQueue = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { clinicId, id: userId, role } = req.user;
    const { date, status } = req.query;

    if (!UUID_REGEX.test(branchId)) {
      return res.status(400).json({ success: false, message: 'Invalid branch ID format.' });
    }

    // Verify branch belongs to clinic
    const branchRes = await query(
      `SELECT id, clinic_id, branch_name, branch_code, timezone, is_active FROM branches WHERE id = $1 AND clinic_id = $2`,
      [branchId, clinicId]
    );

    if (branchRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Branch not found.' });
    }

    const branch = branchRes.rows[0];

    // Branch authorization check for all roles (including admin)
    if (!req.user.assignedBranchIds || !req.user.assignedBranchIds.includes(branchId)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You are not authorized to view visits for this branch.',
      });
    }

    const targetDate = date || getClinicLocalDate(branch.timezone || 'Asia/Kolkata');

    let sql = `
      SELECT pv.*,
             p.patient_number, p.first_name, p.last_name, p.phone, p.gender, p.date_of_birth,
             COALESCE(pmr.has_medical_alerts, false) AS has_medical_alerts,
             pmr.medical_alert_details,
             b.branch_name, b.branch_code,
             u1.first_name AS doctor_first_name, u1.last_name AS doctor_last_name
      FROM patient_visits pv
      JOIN patients p ON pv.patient_id = p.id
      JOIN branches b ON pv.branch_id = b.id
      LEFT JOIN patient_medical_records pmr ON p.id = pmr.patient_id
      LEFT JOIN users u1 ON pv.doctor_id = u1.id
      WHERE pv.clinic_id = $1 AND pv.branch_id = $2 AND pv.visit_date = $3
    `;
    const params = [clinicId, branchId, targetDate];

    if (status && ['queued', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      sql += ` AND pv.status = $4`;
      params.push(status);
    }

    sql += ` ORDER BY pv.token_number ASC`;

    const result = await query(sql, params);
    const mappedRows = result.rows.map((row) => ({
      ...row,
      patient_id: row.patient_number,
    }));

    return res.json({
      success: true,
      branch: {
        id: branch.id,
        name: branch.branch_name,
        code: branch.branch_code,
      },
      visitDate: targetDate,
      queue: mappedRows,
      visits: mappedRows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update visit status (e.g. queued -> in_progress -> completed / cancelled)
 * PATCH /api/visits/:visitId/status
 */
const updateVisitStatus = async (req, res, next) => {
  try {
    const { visitId } = req.params;
    const { status, notes } = req.body;
    const { clinicId, id: userId, role } = req.user;

    if (!UUID_REGEX.test(visitId)) {
      return res.status(400).json({ success: false, message: 'Invalid visit ID format.' });
    }

    const validation = validateVisitStatus(status);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: validation.errors,
      });
    }

    const visitRes = await query(
      `SELECT pv.*, b.branch_name, p.patient_number 
       FROM patient_visits pv
       JOIN branches b ON pv.branch_id = b.id
       JOIN patients p ON pv.patient_id = p.id
       WHERE pv.id = $1`,
      [visitId]
    );

    if (visitRes.rows.length === 0 || visitRes.rows[0].clinic_id !== clinicId) {
      return res.status(404).json({ success: false, message: 'Visit record not found.' });
    }

    const existingVisit = visitRes.rows[0];

    // Branch authorization check for all roles (including admin)
    if (!req.user.assignedBranchIds || !req.user.assignedBranchIds.includes(existingVisit.branch_id)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You are not authorized to update visits for this branch location.',
      });
    }

    const updateSql = `
      UPDATE patient_visits
      SET status = $1, 
          notes = COALESCE($2, notes),
          updated_by = $3,
          updated_at = now()
      WHERE id = $4
      RETURNING *;
    `;

    const updateResult = await query(updateSql, [status, notes || null, userId, visitId]);

    // Audit visit status update
    await recordAuditLog({
      userId,
      action: 'VISIT_STATUS_CHANGED',
      entityType: 'patient_visits',
      entityId: visitId,
      branchId: existingVisit.branch_id,
      ipAddress: req.ip || '127.0.0.1',
      details: {
        tokenDisplay: existingVisit.token_display,
        patientNumber: existingVisit.patient_number,
        previousStatus: existingVisit.status,
        newStatus: status,
      },
    });

    return res.json({
      success: true,
      message: `Visit token ${existingVisit.token_display} status updated to '${status}'.`,
      visit: updateResult.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve visit details by visit ID
 * GET /api/visits/:visitId
 */
const getVisitById = async (req, res, next) => {
  try {
    const { visitId } = req.params;
    const { clinicId } = req.user;

    if (!UUID_REGEX.test(visitId)) {
      return res.status(400).json({ success: false, message: 'Invalid visit ID format.' });
    }

    const visitRes = await query(
      `SELECT pv.*,
              p.patient_number, p.first_name, p.last_name, p.phone, p.email, p.gender, p.date_of_birth,
              b.branch_name, b.branch_code,
              COALESCE(pmr.has_medical_alerts, false) AS has_medical_alerts,
              pmr.medical_alert_details,
              u1.first_name AS doctor_first_name, u1.last_name AS doctor_last_name
       FROM patient_visits pv
       JOIN patients p ON pv.patient_id = p.id
       JOIN branches b ON pv.branch_id = b.id
       LEFT JOIN patient_medical_records pmr ON p.id = pmr.patient_id
       LEFT JOIN users u1 ON pv.doctor_id = u1.id
       WHERE pv.id = $1 AND pv.clinic_id = $2`,
      [visitId, clinicId]
    );

    if (visitRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Visit record not found.' });
    }

    const visit = visitRes.rows[0];

    // Branch authorization check for all roles (including admin)
    if (!req.user.assignedBranchIds || !req.user.assignedBranchIds.includes(visit.branch_id)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You are not authorized to access visits for this branch location.',
      });
    }

    return res.json({
      success: true,
      visit,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerPatient,
  listPatients,
  checkDuplicate,
  getPatientById,
  updatePatient,
  updateMedicalRecord,
  updatePatientStatus,
  createPatientVisit,
  getPatientVisits,
  getBranchDailyQueue,
  updateVisitStatus,
  getVisitById,
};
