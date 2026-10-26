const crypto = require('crypto');
const { query, pool } = require('../config/database');
const { recordAuditLog } = require('../utils/auditLogger');

/**
 * Clinical Examination & Case Notes Service
 * Enforces encounter integrity, legal sign-off, immutable records,
 * append-only amendments, and patient portal release governance.
 */
class ClinicalService {
  /**
   * Create or retrieve existing clinical examination draft for a visit encounter
   */
  async createOrGetDraft(clinicId, branchId, userId, payload) {
    const {
      visit_id,
      patient_id,
      appointment_id,
      chief_complaint,
      vital_signs = {},
      examination_notes,
      diagnosis,
      diagnosis_icd10,
      patient_facing_summary,
      follow_up_instructions,
    } = payload;

    if (!visit_id) {
      const err = new Error('visit_id is required to anchor the clinical examination.');
      err.statusCode = 400;
      throw err;
    }

    if (!patient_id) {
      const err = new Error('patient_id is required.');
      err.statusCode = 400;
      throw err;
    }

    // 1. Verify patient_visit exists and belongs strictly to this clinic and branch
    const visitRes = await query(
      `SELECT pv.id, pv.clinic_id, pv.branch_id, pv.patient_id, pv.doctor_id, pv.visit_date, pv.status
       FROM patient_visits pv
       WHERE pv.id = $1 AND pv.clinic_id = $2 AND pv.branch_id = $3`,
      [visit_id, clinicId, branchId]
    );

    if (visitRes.rows.length === 0) {
      const err = new Error('Visit record not found or does not belong to the active branch.');
      err.statusCode = 404;
      throw err;
    }

    const visit = visitRes.rows[0];

    // 2. Validate patient relationship
    if (visit.patient_id !== patient_id) {
      const err = new Error('Supplied patient_id does not match the visit encounter patient.');
      err.statusCode = 400;
      throw err;
    }

    // 3. If appointment_id is provided, validate appointment relationship
    if (appointment_id) {
      const apptRes = await query(
        `SELECT id, clinic_id, branch_id, patient_id, visit_id
         FROM appointments
         WHERE id = $1 AND clinic_id = $2 AND branch_id = $3`,
        [appointment_id, clinicId, branchId]
      );

      if (apptRes.rows.length === 0) {
        const err = new Error('Linked appointment not found in this branch.');
        err.statusCode = 404;
        throw err;
      }

      const appt = apptRes.rows[0];
      if (appt.patient_id !== patient_id) {
        const err = new Error('Linked appointment does not match the patient.');
        err.statusCode = 400;
        throw err;
      }

      if (appt.visit_id && appt.visit_id !== visit_id) {
        const err = new Error('Linked appointment is associated with a different visit encounter.');
        err.statusCode = 400;
        throw err;
      }
    }

    // 4. Check if examination already exists for this visit
    const existingExamRes = await query(
      `SELECT * FROM clinical_examinations WHERE clinic_id = $1 AND visit_id = $2`,
      [clinicId, visit_id]
    );

    if (existingExamRes.rows.length > 0) {
      const exam = existingExamRes.rows[0];
      return await this.getExaminationById(clinicId, branchId, exam.id);
    }

    // 5. Determine default doctor (visit assigned doctor or current practitioner)
    const assignedDoctorId = visit.doctor_id || userId;

    // Check if pre-consultation triage vitals exist for this visit to pre-populate draft
    let initialVitals = vital_signs && Object.keys(vital_signs).length > 0 ? vital_signs : null;
    if (!initialVitals) {
      const latestVitalsRes = await query(
        `SELECT pvv.*, u.first_name AS recorded_by_first_name, u.last_name AS recorded_by_last_name
         FROM patient_visit_vitals pvv
         JOIN users u ON pvv.recorded_by = u.id
         WHERE pvv.clinic_id = $1 AND pvv.branch_id = $2 AND pvv.visit_id = $3
         ORDER BY pvv.recorded_at DESC
         LIMIT 1`,
        [clinicId, branchId, visit_id]
      );
      if (latestVitalsRes.rows.length > 0) {
        const lv = latestVitalsRes.rows[0];
        initialVitals = {
          blood_pressure: lv.blood_pressure || '',
          pulse_bpm: lv.pulse_bpm || null,
          temperature_f: lv.temperature_f ? parseFloat(lv.temperature_f) : null,
          spo2_percent: lv.spo2_percent || null,
          respiratory_rate: lv.respiratory_rate || null,
          weight_kg: lv.weight_kg ? parseFloat(lv.weight_kg) : null,
          height_cm: lv.height_cm ? parseFloat(lv.height_cm) : null,
          bmi: lv.bmi ? parseFloat(lv.bmi) : null,
          triage_priority: lv.triage_priority || 'routine',
          triage_notes: lv.triage_notes || '',
          triage_recorded_by: `${lv.recorded_by_first_name} ${lv.recorded_by_last_name}`,
          triage_recorded_at: lv.recorded_at,
        };
      }
    }

    // 6. Insert new draft
    const insertRes = await query(
      `INSERT INTO clinical_examinations (
         clinic_id, branch_id, patient_id, visit_id, appointment_id,
         doctor_id, chief_complaint, vital_signs, examination_notes,
         diagnosis, diagnosis_icd10, patient_facing_summary, follow_up_instructions,
         status, is_released_to_patient, created_by, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'draft', false, $14, $14)
       RETURNING *`,
      [
        clinicId,
        branchId,
        patient_id,
        visit_id,
        appointment_id || null,
        assignedDoctorId,
        chief_complaint || null,
        JSON.stringify(initialVitals || {}),
        examination_notes || null,
        diagnosis || null,
        diagnosis_icd10 || null,
        patient_facing_summary || null,
        follow_up_instructions || null,
        userId,
      ]
    );

    const createdExam = insertRes.rows[0];

    await recordAuditLog({
      userId,
      action: 'CLINICAL_EXAMINATION_DRAFT_CREATED',
      entityType: 'clinical_examinations',
      entityId: createdExam.id,
      branchId,
      details: {
        visitId: visit_id,
        patientId: patient_id,
        status: 'draft',
      },
    });

    return await this.getExaminationById(clinicId, branchId, createdExam.id);
  }

  /**
   * Get examination by ID with patient details, consulting doctor, and amendments
   */
  async getExaminationById(clinicId, branchId, examinationId) {
    const examRes = await query(
      `SELECT ce.*,
              p.first_name AS patient_first_name, p.last_name AS patient_last_name,
              p.patient_number, p.phone AS patient_phone, p.date_of_birth, p.gender,
              pv.visit_date, pv.token_display AS visit_token_display, pv.status AS visit_status,
              d.first_name AS doctor_first_name, d.last_name AS doctor_last_name,
              sb.first_name AS signed_by_first_name, sb.last_name AS signed_by_last_name,
              lb.first_name AS locked_by_first_name, lb.last_name AS locked_by_last_name
       FROM clinical_examinations ce
       JOIN patients p ON ce.patient_id = p.id
       JOIN patient_visits pv ON ce.visit_id = pv.id
       JOIN users d ON ce.doctor_id = d.id
       LEFT JOIN users sb ON ce.signed_by = sb.id
       LEFT JOIN users lb ON ce.locked_by = lb.id
       WHERE ce.id = $1 AND ce.clinic_id = $2 AND ce.branch_id = $3`,
      [examinationId, clinicId, branchId]
    );

    if (examRes.rows.length === 0) {
      const err = new Error('Clinical examination record not found in this branch.');
      err.statusCode = 404;
      throw err;
    }

    const exam = examRes.rows[0];

    // Fetch amendments
    const amendmentsRes = await query(
      `SELECT cea.*,
              u.first_name AS amended_by_first_name, u.last_name AS amended_by_last_name
       FROM clinical_examination_amendments cea
       JOIN users u ON cea.amended_by = u.id
       WHERE cea.examination_id = $1
       ORDER BY cea.amended_at ASC`,
      [examinationId]
    );

    // Fetch pre-consultation triage vitals for the visit encounter
    const triageVitalsRes = await query(
      `SELECT pvv.*,
              u.first_name AS recorded_by_first_name, u.last_name AS recorded_by_last_name,
              r.name AS recorded_by_role
       FROM patient_visit_vitals pvv
       JOIN users u ON pvv.recorded_by = u.id
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE pvv.clinic_id = $1 AND pvv.branch_id = $2 AND pvv.visit_id = $3
       ORDER BY pvv.recorded_at DESC`,
      [clinicId, branchId, exam.visit_id]
    );

    return {
      ...exam,
      amendments: amendmentsRes.rows,
      triage_vitals: triageVitalsRes.rows,
    };
  }

  /**
   * Get examination by visit ID
   */
  async getExaminationByVisitId(clinicId, branchId, visitId) {
    const examRes = await query(
      `SELECT id FROM clinical_examinations 
       WHERE clinic_id = $1 AND branch_id = $2 AND visit_id = $3`,
      [clinicId, branchId, visitId]
    );

    if (examRes.rows.length === 0) {
      return null;
    }

    return await this.getExaminationById(clinicId, branchId, examRes.rows[0].id);
  }

  /**
   * Update clinical examination draft
   */
  async updateDraft(clinicId, branchId, examinationId, payload, userId) {
    const examRes = await query(
      `SELECT * FROM clinical_examinations 
       WHERE id = $1 AND clinic_id = $2 AND branch_id = $3`,
      [examinationId, clinicId, branchId]
    );

    if (examRes.rows.length === 0) {
      const err = new Error('Clinical examination not found.');
      err.statusCode = 404;
      throw err;
    }

    const exam = examRes.rows[0];

    if (exam.status !== 'draft') {
      const err = new Error(
        `Cannot modify clinical content of ${exam.status} examination records. Please add an authorized amendment addendum.`
      );
      err.statusCode = 409;
      throw err;
    }

    const {
      chief_complaint,
      vital_signs,
      examination_notes,
      diagnosis,
      diagnosis_icd10,
      patient_facing_summary,
      follow_up_instructions,
      doctor_id,
    } = payload;

    // Preserve vitals snapshot and triage metadata anchored to patient_visit_vitals
    let finalVitals = exam.vital_signs;
    if (vital_signs !== undefined) {
      if (vital_signs && typeof vital_signs === 'object') {
        finalVitals = {
          ...(exam.vital_signs || {}),
          ...vital_signs,
          // Authoritative triage assessment from staff cannot be altered or cleared by draft updates
          triage_priority: exam.vital_signs?.triage_priority || vital_signs.triage_priority || 'routine',
          triage_notes: exam.vital_signs?.triage_notes !== undefined ? exam.vital_signs.triage_notes : vital_signs.triage_notes,
          triage_recorded_by: exam.vital_signs?.triage_recorded_by || vital_signs.triage_recorded_by,
          triage_recorded_at: exam.vital_signs?.triage_recorded_at || vital_signs.triage_recorded_at,
        };
      }
    }

    await query(
      `UPDATE clinical_examinations
       SET chief_complaint = COALESCE($1, chief_complaint),
           vital_signs = $2,
           examination_notes = COALESCE($3, examination_notes),
           diagnosis = COALESCE($4, diagnosis),
           diagnosis_icd10 = COALESCE($5, diagnosis_icd10),
           patient_facing_summary = COALESCE($6, patient_facing_summary),
           follow_up_instructions = COALESCE($7, follow_up_instructions),
           doctor_id = COALESCE($8, doctor_id),
           updated_by = $9,
           updated_at = now()
       WHERE id = $10`,
      [
        chief_complaint !== undefined ? chief_complaint : null,
        JSON.stringify(finalVitals || {}),
        examination_notes !== undefined ? examination_notes : null,
        diagnosis !== undefined ? diagnosis : null,
        diagnosis_icd10 !== undefined ? diagnosis_icd10 : null,
        patient_facing_summary !== undefined ? patient_facing_summary : null,
        follow_up_instructions !== undefined ? follow_up_instructions : null,
        doctor_id || null,
        userId,
        examinationId,
      ]
    );

    await recordAuditLog({
      userId,
      action: 'CLINICAL_EXAMINATION_DRAFT_UPDATED',
      entityType: 'clinical_examinations',
      entityId: examinationId,
      branchId,
      details: {
        updatedFields: Object.keys(payload),
      },
    });

    return await this.getExaminationById(clinicId, branchId, examinationId);
  }

  /**
   * Digitally sign examination note
   */
  async signExamination(clinicId, branchId, examinationId, userId) {
    const examRes = await query(
      `SELECT * FROM clinical_examinations 
       WHERE id = $1 AND clinic_id = $2 AND branch_id = $3
       FOR UPDATE`,
      [examinationId, clinicId, branchId]
    );

    if (examRes.rows.length === 0) {
      const err = new Error('Clinical examination record not found.');
      err.statusCode = 404;
      throw err;
    }

    const exam = examRes.rows[0];

    if (exam.status !== 'draft') {
      const err = new Error(`Examination is already ${exam.status}. Cannot re-sign.`);
      err.statusCode = 400;
      throw err;
    }

    // Verify clinical completeness before signing
    const hasClinicalDetails =
      Boolean(exam.chief_complaint?.trim()) ||
      Boolean(exam.diagnosis?.trim()) ||
      Boolean(exam.examination_notes?.trim());

    if (!hasClinicalDetails) {
      const err = new Error('Cannot sign an empty examination. Chief complaint, diagnosis, or clinical notes must be recorded.');
      err.statusCode = 400;
      throw err;
    }

    const signedAt = new Date();

    // Compute cryptographic SHA-256 digest of clinical content
    const digestPayload = JSON.stringify({
      id: exam.id,
      clinic_id: exam.clinic_id,
      patient_id: exam.patient_id,
      visit_id: exam.visit_id,
      doctor_id: exam.doctor_id,
      chief_complaint: exam.chief_complaint || '',
      vital_signs: exam.vital_signs || {},
      examination_notes: exam.examination_notes || '',
      diagnosis: exam.diagnosis || '',
      diagnosis_icd10: exam.diagnosis_icd10 || '',
      patient_facing_summary: exam.patient_facing_summary || '',
      follow_up_instructions: exam.follow_up_instructions || '',
      signed_by: userId,
      signed_at: signedAt.toISOString(),
    });

    const signatureHash = crypto.createHash('sha256').update(digestPayload).digest('hex');

    await query(
      `UPDATE clinical_examinations
       SET status = 'signed',
           signed_by = $1,
           signed_at = $2,
           signature_hash = $3,
           updated_by = $1,
           updated_at = now()
       WHERE id = $4`,
      [userId, signedAt, signatureHash, examinationId]
    );

    await recordAuditLog({
      userId,
      action: 'CLINICAL_EXAMINATION_SIGNED',
      entityType: 'clinical_examinations',
      entityId: examinationId,
      branchId,
      details: {
        signatureHash,
        signedAt: signedAt.toISOString(),
      },
    });

    return await this.getExaminationById(clinicId, branchId, examinationId);
  }

  /**
   * Explicitly lock examination record
   */
  async lockExamination(clinicId, branchId, examinationId, userId) {
    const examRes = await query(
      `SELECT * FROM clinical_examinations 
       WHERE id = $1 AND clinic_id = $2 AND branch_id = $3
       FOR UPDATE`,
      [examinationId, clinicId, branchId]
    );

    if (examRes.rows.length === 0) {
      const err = new Error('Clinical examination record not found.');
      err.statusCode = 404;
      throw err;
    }

    const exam = examRes.rows[0];

    if (exam.status === 'draft') {
      const err = new Error('Cannot lock an unsigned draft. Please sign the examination note first.');
      err.statusCode = 400;
      throw err;
    }

    if (exam.status === 'locked') {
      return await this.getExaminationById(clinicId, branchId, examinationId);
    }

    const lockedAt = new Date();

    await query(
      `UPDATE clinical_examinations
       SET status = 'locked',
           locked_by = $1,
           locked_at = $2,
           updated_by = $1,
           updated_at = now()
       WHERE id = $3`,
      [userId, lockedAt, examinationId]
    );

    await recordAuditLog({
      userId,
      action: 'CLINICAL_EXAMINATION_LOCKED',
      entityType: 'clinical_examinations',
      entityId: examinationId,
      branchId,
      details: {
        lockedAt: lockedAt.toISOString(),
      },
    });

    return await this.getExaminationById(clinicId, branchId, examinationId);
  }

  /**
   * Add append-only legal amendment to signed or locked examination
   */
  async addAmendment(clinicId, branchId, examinationId, payload, userId) {
    const { amendment_reason, addendum_notes } = payload;

    if (!amendment_reason || !amendment_reason.trim()) {
      const err = new Error('amendment_reason is required to document why this clinical correction is being made.');
      err.statusCode = 400;
      throw err;
    }

    if (!addendum_notes || !addendum_notes.trim()) {
      const err = new Error('addendum_notes content is required for the amendment.');
      err.statusCode = 400;
      throw err;
    }

    const examRes = await query(
      `SELECT * FROM clinical_examinations 
       WHERE id = $1 AND clinic_id = $2 AND branch_id = $3`,
      [examinationId, clinicId, branchId]
    );

    if (examRes.rows.length === 0) {
      const err = new Error('Clinical examination record not found.');
      err.statusCode = 404;
      throw err;
    }

    const exam = examRes.rows[0];

    if (exam.status === 'draft') {
      const err = new Error('Cannot add amendment to a draft. Drafts can be edited directly before signing.');
      err.statusCode = 400;
      throw err;
    }

    const amendedAt = new Date();
    const prevHash = exam.signature_hash || 'INITIAL_HASH';

    const newHash = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          examination_id: exam.id,
          previous_signature_hash: prevHash,
          amendment_reason: amendment_reason.trim(),
          addendum_notes: addendum_notes.trim(),
          amended_by: userId,
          amended_at: amendedAt.toISOString(),
        })
      )
      .digest('hex');

    const insertRes = await query(
      `INSERT INTO clinical_examination_amendments (
         clinic_id, branch_id, examination_id, patient_id, visit_id,
         amendment_reason, addendum_notes, amended_by, amended_at,
         previous_signature_hash, new_signature_hash, is_released_to_patient
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false)
       RETURNING *`,
      [
        clinicId,
        branchId,
        examinationId,
        exam.patient_id,
        exam.visit_id,
        amendment_reason.trim(),
        addendum_notes.trim(),
        userId,
        amendedAt,
        prevHash,
        newHash,
      ]
    );

    const amendment = insertRes.rows[0];

    await recordAuditLog({
      userId,
      action: 'CLINICAL_EXAMINATION_AMENDED',
      entityType: 'clinical_examination_amendments',
      entityId: amendment.id,
      branchId,
      details: {
        examinationId,
        amendmentReason: amendment_reason.trim(),
        newSignatureHash: newHash,
      },
    });

    return {
      success: true,
      amendment,
      examination: await this.getExaminationById(clinicId, branchId, examinationId),
    };
  }

  /**
   * Release or revoke patient portal visibility
   */
  async setPatientRelease(clinicId, branchId, examinationId, isReleased, userId) {
    const examRes = await query(
      `SELECT * FROM clinical_examinations 
       WHERE id = $1 AND clinic_id = $2 AND branch_id = $3`,
      [examinationId, clinicId, branchId]
    );

    if (examRes.rows.length === 0) {
      const err = new Error('Clinical examination record not found.');
      err.statusCode = 404;
      throw err;
    }

    const exam = examRes.rows[0];

    if (Boolean(isReleased) && exam.status === 'draft') {
      const err = new Error('Cannot release an un-signed clinical draft to the patient portal.');
      err.statusCode = 400;
      throw err;
    }

    const releasedAt = isReleased ? new Date() : null;
    const releasedBy = isReleased ? userId : null;

    await query(
      `UPDATE clinical_examinations
       SET is_released_to_patient = $1,
           released_at = $2,
           released_by = $3,
           updated_at = now()
       WHERE id = $4`,
      [Boolean(isReleased), releasedAt, releasedBy, examinationId]
    );

    await recordAuditLog({
      userId,
      action: isReleased ? 'CLINICAL_EXAMINATION_RELEASED' : 'CLINICAL_EXAMINATION_RELEASE_REVOKED',
      entityType: 'clinical_examinations',
      entityId: examinationId,
      branchId,
      details: {
        isReleasedToPatient: Boolean(isReleased),
      },
    });

    return await this.getExaminationById(clinicId, branchId, examinationId);
  }

  /**
   * Safe patient-facing projection (Strictly excludes internal notes and unreleased drafts)
   */
  async getPatientPortalPreview(clinicId, branchId, visitId, patientId = null) {
    const examRes = await query(
      `SELECT ce.id, ce.clinic_id, ce.branch_id, ce.patient_id, ce.visit_id,
              ce.status, ce.is_released_to_patient, ce.released_at,
              ce.chief_complaint, ce.diagnosis, ce.diagnosis_icd10,
              ce.patient_facing_summary, ce.follow_up_instructions,
              ce.signed_at,
              p.first_name AS patient_first_name, p.last_name AS patient_last_name,
              p.patient_number,
              pv.visit_date, pv.token_display AS visit_token_display,
              d.first_name AS doctor_first_name, d.last_name AS doctor_last_name
       FROM clinical_examinations ce
       JOIN patients p ON ce.patient_id = p.id
       JOIN patient_visits pv ON ce.visit_id = pv.id
       JOIN users d ON ce.doctor_id = d.id
       WHERE ce.clinic_id = $1 AND ce.branch_id = $2 AND ce.visit_id = $3`,
      [clinicId, branchId, visitId]
    );

    if (examRes.rows.length === 0) {
      return {
        success: false,
        is_released: false,
        message: 'No clinical summary is available for this visit encounter.',
      };
    }

    const exam = examRes.rows[0];

    // If patientId is specified, verify ownership
    if (patientId && exam.patient_id !== patientId) {
      const err = new Error('Unauthorized record access.');
      err.statusCode = 403;
      throw err;
    }

    // Gate: unreleased or draft records are invisible to patient paths
    if (!exam.is_released_to_patient || exam.status === 'draft') {
      return {
        success: false,
        is_released: false,
        message: 'Clinical summary has not been authorized or released for patient viewing.',
      };
    }

    // Fetch released amendments only
    const amendmentsRes = await query(
      `SELECT cea.id, cea.addendum_notes, cea.amended_at,
              u.first_name AS doctor_first_name, u.last_name AS doctor_last_name
       FROM clinical_examination_amendments cea
       JOIN users u ON cea.amended_by = u.id
       WHERE cea.examination_id = $1 AND cea.is_released_to_patient = true
       ORDER BY cea.amended_at ASC`,
      [exam.id]
    );

    // Return strictly patient-safe projection without examination_notes
    return {
      success: true,
      is_released: true,
      visit: {
        visit_id: exam.visit_id,
        visit_date: exam.visit_date,
        token_display: exam.visit_token_display,
        doctor_name: `Dr. ${exam.doctor_first_name} ${exam.doctor_last_name}`,
        chief_complaint: exam.chief_complaint,
        diagnosis: exam.diagnosis,
        diagnosis_icd10: exam.diagnosis_icd10,
        patient_facing_summary: exam.patient_facing_summary,
        follow_up_instructions: exam.follow_up_instructions,
        released_at: exam.released_at,
        amendments: amendmentsRes.rows.map((a) => ({
          addendum: a.addendum_notes,
          date: a.amended_at,
          doctor_name: `Dr. ${a.doctor_first_name} ${a.doctor_last_name}`,
        })),
      },
    };
  }

  /**
   * Record pre-consultation vitals and triage assessment (Phase 1.5)
   * Executed by authorized dental assistants, nurses, or clinicians
   */
  async recordVisitVitals(clinicId, branchId, userId, payload) {
    const {
      visit_id,
      patient_id,
      appointment_id,
      blood_pressure,
      pulse_bpm,
      temperature_f,
      spo2_percent,
      respiratory_rate,
      weight_kg,
      height_cm,
      bmi: providedBmi,
      triage_priority = 'routine',
      triage_notes,
    } = payload;

    if (!visit_id) {
      const err = new Error('visit_id is required to record pre-consultation vitals.');
      err.statusCode = 400;
      throw err;
    }

    const validPriorities = ['routine', 'priority', 'urgent'];
    if (triage_priority && !validPriorities.includes(triage_priority)) {
      const err = new Error(`Invalid triage_priority. Must be one of: ${validPriorities.join(', ')}.`);
      err.statusCode = 400;
      throw err;
    }

    // 1. Verify visit belongs to clinic and branch
    const visitRes = await query(
      `SELECT pv.id, pv.clinic_id, pv.branch_id, pv.patient_id, pv.appointment_id, pv.status
       FROM patient_visits pv
       WHERE pv.id = $1 AND pv.clinic_id = $2 AND pv.branch_id = $3`,
      [visit_id, clinicId, branchId]
    );

    if (visitRes.rows.length === 0) {
      const err = new Error('Visit record not found or does not belong to the active branch.');
      err.statusCode = 404;
      throw err;
    }

    const visit = visitRes.rows[0];
    const finalPatientId = patient_id || visit.patient_id;
    if (patient_id && patient_id !== visit.patient_id) {
      const err = new Error('Supplied patient_id does not match the visit encounter patient.');
      err.statusCode = 400;
      throw err;
    }

    const finalAppointmentId = appointment_id || visit.appointment_id || null;

    // Calculate BMI if height and weight are provided
    let calculatedBmi = providedBmi ? Number(providedBmi) : null;
    if (!calculatedBmi && weight_kg && height_cm && Number(height_cm) > 0) {
      const hMeters = Number(height_cm) / 100;
      calculatedBmi = Math.round((Number(weight_kg) / (hMeters * hMeters)) * 10) / 10;
    }

    // 2. Insert record into patient_visit_vitals
    const insertRes = await query(
      `INSERT INTO patient_visit_vitals (
         clinic_id, branch_id, visit_id, patient_id, appointment_id,
         blood_pressure, pulse_bpm, temperature_f, spo2_percent, respiratory_rate,
         weight_kg, height_cm, bmi, triage_priority, triage_notes, recorded_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        clinicId,
        branchId,
        visit_id,
        finalPatientId,
        finalAppointmentId,
        blood_pressure || null,
        pulse_bpm ? parseInt(pulse_bpm, 10) : null,
        temperature_f ? parseFloat(temperature_f) : null,
        spo2_percent ? parseInt(spo2_percent, 10) : null,
        respiratory_rate ? parseInt(respiratory_rate, 10) : null,
        weight_kg ? parseFloat(weight_kg) : null,
        height_cm ? parseFloat(height_cm) : null,
        calculatedBmi,
        triage_priority,
        triage_notes || null,
        userId,
      ]
    );

    const vitalsRecord = insertRes.rows[0];

    // 3. If an active draft clinical examination already exists for this visit, synchronize its vital_signs JSONB
    const draftExamRes = await query(
      `SELECT id, vital_signs, status
       FROM clinical_examinations
       WHERE clinic_id = $1 AND branch_id = $2 AND visit_id = $3`,
      [clinicId, branchId, visit_id]
    );

    if (draftExamRes.rows.length > 0 && draftExamRes.rows[0].status === 'draft') {
      const currentDraft = draftExamRes.rows[0];
      const existingVitals = currentDraft.vital_signs || {};
      const updatedVitals = {
        ...existingVitals,
        blood_pressure: blood_pressure || existingVitals.blood_pressure,
        pulse_bpm: pulse_bpm ? parseInt(pulse_bpm, 10) : existingVitals.pulse_bpm,
        temperature_f: temperature_f ? parseFloat(temperature_f) : existingVitals.temperature_f,
        spo2_percent: spo2_percent ? parseInt(spo2_percent, 10) : existingVitals.spo2_percent,
        respiratory_rate: respiratory_rate ? parseInt(respiratory_rate, 10) : existingVitals.respiratory_rate,
        weight_kg: weight_kg ? parseFloat(weight_kg) : existingVitals.weight_kg,
        height_cm: height_cm ? parseFloat(height_cm) : existingVitals.height_cm,
        bmi: calculatedBmi || existingVitals.bmi,
        triage_priority: triage_priority || existingVitals.triage_priority,
        triage_notes: triage_notes || existingVitals.triage_notes,
      };

      await query(
        `UPDATE clinical_examinations
         SET vital_signs = $1, updated_at = now()
         WHERE id = $2`,
        [JSON.stringify(updatedVitals), currentDraft.id]
      );
    }

    // 4. Audit log
    await recordAuditLog({
      userId,
      action: 'PATIENT_VISIT_VITALS_RECORDED',
      entityType: 'patient_visit_vitals',
      entityId: vitalsRecord.id,
      branchId,
      details: {
        visitId: visit_id,
        patientId: finalPatientId,
        triagePriority: triage_priority,
        bloodPressure: blood_pressure,
        pulseBpm: pulse_bpm,
        bmi: calculatedBmi,
      },
    });

    return await this.getVisitVitalsById(clinicId, branchId, vitalsRecord.id);
  }

  /**
   * Get pre-consultation vitals record by vitals ID
   */
  async getVisitVitalsById(clinicId, branchId, vitalsId) {
    const res = await query(
      `SELECT pvv.*,
              u.first_name AS recorded_by_first_name, u.last_name AS recorded_by_last_name,
              r.name AS recorded_by_role,
              p.first_name AS patient_first_name, p.last_name AS patient_last_name,
              pv.token_display AS visit_token_display
       FROM patient_visit_vitals pvv
       JOIN users u ON pvv.recorded_by = u.id
       LEFT JOIN roles r ON u.role_id = r.id
       JOIN patients p ON pvv.patient_id = p.id
       JOIN patient_visits pv ON pvv.visit_id = pv.id
       WHERE pvv.id = $1 AND pvv.clinic_id = $2 AND pvv.branch_id = $3`,
      [vitalsId, clinicId, branchId]
    );

    if (res.rows.length === 0) {
      const err = new Error('Vitals record not found in this branch.');
      err.statusCode = 404;
      throw err;
    }

    return res.rows[0];
  }

  /**
   * Get all pre-consultation vitals recorded for a visit encounter
   */
  async getVisitVitals(clinicId, branchId, visitId) {
    const visitRes = await query(
      `SELECT id FROM patient_visits
       WHERE id = $1 AND clinic_id = $2 AND branch_id = $3`,
      [visitId, clinicId, branchId]
    );

    if (visitRes.rows.length === 0) {
      const err = new Error('Visit record not found or does not belong to the active branch.');
      err.statusCode = 404;
      throw err;
    }

    const res = await query(
      `SELECT pvv.*,
              u.first_name AS recorded_by_first_name, u.last_name AS recorded_by_last_name,
              r.name AS recorded_by_role
       FROM patient_visit_vitals pvv
       JOIN users u ON pvv.recorded_by = u.id
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE pvv.clinic_id = $1 AND pvv.branch_id = $2 AND pvv.visit_id = $3
       ORDER BY pvv.recorded_at DESC`,
      [clinicId, branchId, visitId]
    );

    return res.rows;
  }
}

module.exports = new ClinicalService();
