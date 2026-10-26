const { query, pool } = require('../config/database');
const { recordAuditLog } = require('../utils/auditLogger');
const {
  isValidToothNumber,
  isPermanentTooth,
  isPrimaryTooth,
  getToothName,
  normalizeAndValidateSurface,
} = require('../utils/dentalNotation');

/**
 * Interactive Dental Charting Service
 * Coordinates tooth findings, surfaces, condition catalog, living dental baselines,
 * legal signed-chart amendments, and strict multi-branch tenant isolation.
 */
class DentalChartService {
  /**
   * 1. Retrieve all active dental conditions from master catalog
   */
  async getConditions(clinicId) {
    const res = await query(
      `SELECT id, clinic_id, code, display_name, category, description,
              applies_to_surfaces, applies_to_entire_tooth, dentition_type,
              color_hex, badge_symbol, severity_level, display_order, is_active
       FROM dental_conditions
       WHERE (clinic_id IS NULL OR clinic_id = $1) AND is_active = true
       ORDER BY display_order ASC, display_name ASC`,
      [clinicId]
    );
    return res.rows;
  }

  /**
   * 2. Retrieve patient dental chart (baseline + visit findings if visitId provided)
   */
  async getPatientChart(clinicId, branchId, patientId, visitId = null) {
    // Validate patient exists and belongs to clinic
    const patientRes = await query(
      `SELECT id, clinic_id, branch_id, patient_number, first_name, last_name, date_of_birth, gender
       FROM patients
       WHERE id = $1 AND clinic_id = $2`,
      [patientId, clinicId]
    );

    if (patientRes.rows.length === 0) {
      const err = new Error('Patient record not found in this clinic.');
      err.statusCode = 404;
      throw err;
    }
    const patient = patientRes.rows[0];

    // If visitId is provided, validate visit
    let visit = null;
    let examination = null;
    let visitFindings = [];

    if (visitId) {
      const visitRes = await query(
        `SELECT pv.id, pv.clinic_id, pv.branch_id, pv.patient_id, pv.visit_date, 
                pv.token_number, pv.token_display, pv.status, pv.visit_type
         FROM patient_visits pv
         WHERE pv.id = $1 AND pv.clinic_id = $2 AND pv.branch_id = $3`,
        [visitId, clinicId, branchId]
      );

      if (visitRes.rows.length === 0) {
        const err = new Error('Visit encounter not found or does not belong to the active branch.');
        err.statusCode = 404;
        throw err;
      }

      visit = visitRes.rows[0];
      if (visit.patient_id !== patientId) {
        const err = new Error('Visit encounter does not belong to the specified patient.');
        err.statusCode = 400;
        throw err;
      }

      // Check linked clinical examination for this visit
      const examRes = await query(
        `SELECT id, status, is_released_to_patient, signed_at, signed_by, locked_at, locked_by
         FROM clinical_examinations
         WHERE clinic_id = $1 AND visit_id = $2`,
        [clinicId, visitId]
      );
      if (examRes.rows.length > 0) {
        examination = examRes.rows[0];
      }

      // Query findings recorded during this visit
      const findingsRes = await query(
        `SELECT df.id, df.tooth_number, df.surface, df.condition_id, df.condition_code,
                df.condition_name, df.finding_type, df.severity, df.is_existing_condition,
                df.notes, df.status, df.created_at, df.updated_at,
                u.first_name AS recorded_by_first_name, u.last_name AS recorded_by_last_name,
                dc.category, dc.color_hex, dc.badge_symbol
         FROM patient_dental_findings df
         JOIN users u ON df.created_by = u.id
         JOIN dental_conditions dc ON df.condition_id = dc.id
         WHERE df.clinic_id = $1 AND df.visit_id = $2 AND df.status <> 'cancelled'
         ORDER BY df.tooth_number ASC, df.created_at ASC`,
        [clinicId, visitId]
      );
      visitFindings = findingsRes.rows;
    }

    // Query active patient living baseline across all teeth
    const baselineRes = await query(
      `SELECT pb.id, pb.tooth_number, pb.surface, pb.condition_id, pb.condition_code,
              pb.status, pb.notes, pb.last_visit_id, pb.updated_at,
              dc.display_name AS condition_name, dc.category, dc.color_hex, dc.badge_symbol,
              pv.token_display AS last_visit_token, pv.visit_date AS last_visit_date
       FROM patient_dental_baselines pb
       JOIN dental_conditions dc ON pb.condition_id = dc.id
       LEFT JOIN patient_visits pv ON pb.last_visit_id = pv.id
       WHERE pb.clinic_id = $1 AND pb.patient_id = $2 AND pb.status = 'active'
       ORDER BY pb.tooth_number ASC, pb.surface ASC`,
      [clinicId, patientId]
    );
    const baseline = baselineRes.rows;

    // Calculate dental summary statistics
    const stats = {
      missing: 0,
      caries: 0,
      restorations: 0,
      rootCanals: 0,
      implants: 0,
      crowns: 0,
      totalChartedTeeth: new Set(baseline.map((b) => b.tooth_number)).size,
    };

    baseline.forEach((b) => {
      if (b.condition_code === 'missing') stats.missing++;
      else if (b.condition_code === 'caries') stats.caries++;
      else if (['restoration', 'composite', 'amalgam'].includes(b.condition_code)) stats.restorations++;
      else if (b.condition_code === 'root_canal') stats.rootCanals++;
      else if (b.condition_code === 'implant') stats.implants++;
      else if (b.condition_code === 'crown') stats.crowns++;
    });

    return {
      patient,
      visit,
      examination: examination ? {
        id: examination.id,
        status: examination.status,
        isSigned: examination.status === 'signed',
        isLocked: examination.status === 'locked',
        isReadOnly: examination.status === 'signed' || examination.status === 'locked',
        isReleasedToPatient: Boolean(examination.is_released_to_patient),
      } : null,
      baseline,
      visitFindings,
      stats,
    };
  }

  /**
   * 3. Retrieve complete historical timeline of findings for an individual tooth
   */
  async getToothHistory(clinicId, branchId, patientId, toothNumber) {
    const num = parseInt(toothNumber, 10);
    if (!isValidToothNumber(num)) {
      const err = new Error(`Invalid FDI tooth number: ${toothNumber}`);
      err.statusCode = 400;
      throw err;
    }

    const res = await query(
      `SELECT df.id, df.visit_id, df.tooth_number, df.surface, df.condition_id,
              df.condition_code, df.condition_name, df.finding_type, df.severity,
              df.is_existing_condition, df.notes, df.status, df.created_at,
              pv.visit_date, pv.token_display AS visit_token, pv.status AS visit_status,
              u.first_name AS recorded_by_first_name, u.last_name AS recorded_by_last_name,
              dc.category, dc.color_hex, dc.badge_symbol
       FROM patient_dental_findings df
       JOIN patient_visits pv ON df.visit_id = pv.id
       JOIN users u ON df.created_by = u.id
       JOIN dental_conditions dc ON df.condition_id = dc.id
       WHERE df.clinic_id = $1 AND df.patient_id = $2 AND df.tooth_number = $3
       ORDER BY df.created_at DESC`,
      [clinicId, patientId, num]
    );

    return {
      toothNumber: num,
      toothName: getToothName(num),
      isPermanent: isPermanentTooth(num),
      isPrimary: isPrimaryTooth(num),
      findingsCount: res.rows.length,
      history: res.rows,
    };
  }

  /**
   * 4. Record a tooth or surface clinical finding for a patient visit encounter
   */
  async recordFinding(clinicId, branchId, userId, payload) {
    const {
      visit_id,
      patient_id,
      tooth_number,
      surface,
      condition_id,
      condition_code,
      finding_type = 'observed_finding',
      severity = 'routine',
      is_existing_condition = false,
      notes,
    } = payload;

    if (!visit_id) {
      const err = new Error('visit_id is required to anchor finding to a clinical encounter.');
      err.statusCode = 400;
      throw err;
    }
    if (!patient_id) {
      const err = new Error('patient_id is required.');
      err.statusCode = 400;
      throw err;
    }
    if (!tooth_number) {
      const err = new Error('tooth_number is required.');
      err.statusCode = 400;
      throw err;
    }

    const toothNum = parseInt(tooth_number, 10);
    if (!isValidToothNumber(toothNum)) {
      const err = new Error(`Invalid FDI tooth number: ${tooth_number}. Must be valid permanent (11-48) or primary (51-85) tooth.`);
      err.statusCode = 400;
      throw err;
    }

    // 1. Validate surface against tooth anatomy (Occlusal vs Incisal)
    let validatedSurface = null;
    try {
      validatedSurface = normalizeAndValidateSurface(toothNum, surface);
    } catch (surfErr) {
      const err = new Error(surfErr.message);
      err.statusCode = 400;
      throw err;
    }

    // 2. Validate patient visit encounter
    const visitRes = await query(
      `SELECT pv.id, pv.clinic_id, pv.branch_id, pv.patient_id, pv.visit_date
       FROM patient_visits pv
       WHERE pv.id = $1 AND pv.clinic_id = $2 AND pv.branch_id = $3`,
      [visit_id, clinicId, branchId]
    );

    if (visitRes.rows.length === 0) {
      const err = new Error('Visit encounter not found or does not belong to the active branch.');
      err.statusCode = 404;
      throw err;
    }
    const visit = visitRes.rows[0];

    if (visit.patient_id !== patient_id) {
      const err = new Error('Supplied patient_id does not match the visit encounter patient.');
      err.statusCode = 400;
      throw err;
    }

    // 3. Check clinical examination status (signed or locked records cannot accept ordinary new findings)
    const examRes = await query(
      `SELECT id, status FROM clinical_examinations WHERE clinic_id = $1 AND visit_id = $2`,
      [clinicId, visit_id]
    );

    let examinationId = null;
    if (examRes.rows.length > 0) {
      const exam = examRes.rows[0];
      examinationId = exam.id;
      if (exam.status === 'signed' || exam.status === 'locked') {
        const err = new Error(
          'Cannot add ordinary findings to a signed or locked clinical examination. Please use the legal amendment procedure.'
        );
        err.statusCode = 403;
        throw err;
      }
    }

    // 4. Resolve and validate condition from master
    let condition;
    if (condition_id) {
      const condRes = await query(
        `SELECT id, code, display_name, applies_to_surfaces, applies_to_entire_tooth, dentition_type, is_active
         FROM dental_conditions
         WHERE id = $1 AND (clinic_id IS NULL OR clinic_id = $2)`,
        [condition_id, clinicId]
      );
      if (condRes.rows.length === 0) {
        const err = new Error('Dental condition reference not found.');
        err.statusCode = 404;
        throw err;
      }
      condition = condRes.rows[0];
    } else if (condition_code) {
      const condRes = await query(
        `SELECT id, code, display_name, applies_to_surfaces, applies_to_entire_tooth, dentition_type, is_active
         FROM dental_conditions
         WHERE code = $1 AND (clinic_id IS NULL OR clinic_id = $2)`,
        [condition_code, clinicId]
      );
      if (condRes.rows.length === 0) {
        const err = new Error(`Dental condition code '${condition_code}' not found.`);
        err.statusCode = 404;
        throw err;
      }
      condition = condRes.rows[0];
    } else {
      const err = new Error('Either condition_id or condition_code is required.');
      err.statusCode = 400;
      throw err;
    }

    if (!condition.is_active) {
      const err = new Error(`Dental condition '${condition.display_name}' is inactive and cannot be recorded.`);
      err.statusCode = 400;
      throw err;
    }

    // Validate dentition type applicability (permanent vs primary)
    if (condition.dentition_type === 'permanent' && isPrimaryTooth(toothNum)) {
      const err = new Error(`Condition '${condition.display_name}' applies only to permanent dentition, not primary tooth #${toothNum}.`);
      err.statusCode = 400;
      throw err;
    }
    if (condition.dentition_type === 'primary' && isPermanentTooth(toothNum)) {
      const err = new Error(`Condition '${condition.display_name}' applies only to primary dentition, not permanent tooth #${toothNum}.`);
      err.statusCode = 400;
      throw err;
    }

    // 5. Transactional insert of finding and update of living baseline
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert into patient_dental_findings
      const insertFindingRes = await client.query(
        `INSERT INTO patient_dental_findings (
           clinic_id, branch_id, patient_id, visit_id, examination_id,
           tooth_number, surface, condition_id, condition_code, condition_name,
           finding_type, severity, is_existing_condition, notes, status,
           created_by, updated_by
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9, $10,
           $11, $12, $13, $14, 'active',
           $15, $15
         ) RETURNING *`,
        [
          clinicId,
          branchId,
          patient_id,
          visit_id,
          examinationId,
          toothNum,
          validatedSurface,
          condition.id,
          condition.code,
          condition.display_name,
          finding_type,
          severity,
          Boolean(is_existing_condition),
          notes?.trim() || null,
          userId,
        ]
      );
      const finding = insertFindingRes.rows[0];

      // Update patient_dental_baselines:
      // If condition is 'healthy', we mark other active conditions on this tooth/surface as resolved/treated
      if (condition.code === 'healthy') {
        await client.query(
          `UPDATE patient_dental_baselines
           SET status = 'resolved', updated_at = now(), updated_by = $1
           WHERE patient_id = $2 AND tooth_number = $3 AND surface = $4`,
          [userId, patient_id, toothNum, validatedSurface || '']
        );
      }

      // Upsert into living baseline
      await client.query(
        `INSERT INTO patient_dental_baselines (
           clinic_id, patient_id, tooth_number, surface,
           condition_id, condition_code, last_visit_id, last_finding_id,
           status, notes, updated_by
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7, $8,
           'active', $9, $10
         )
         ON CONFLICT (patient_id, tooth_number, surface, condition_id)
         DO UPDATE SET
           status = 'active',
           last_visit_id = EXCLUDED.last_visit_id,
           last_finding_id = EXCLUDED.last_finding_id,
           notes = EXCLUDED.notes,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()`,
        [
          clinicId,
          patient_id,
          toothNum,
          validatedSurface || '',
          condition.id,
          condition.code,
          visit_id,
          finding.id,
          notes?.trim() || null,
          userId,
        ]
      );

      await client.query('COMMIT');

      // 6. Audit Logging
      await recordAuditLog({
        userId,
        action: 'DENTAL_CHART_FINDING_RECORDED',
        entityType: 'patient_dental_findings',
        entityId: finding.id,
        branchId,
        details: {
          patientId: patient_id,
          visitId: visit_id,
          toothNumber: toothNum,
          surface: validatedSurface,
          conditionCode: condition.code,
          conditionName: condition.display_name,
          isExisting: is_existing_condition,
        },
      });

      return finding;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * 5. Remove or cancel a finding recorded in an active draft visit
   */
  async deleteFinding(clinicId, branchId, userId, findingId) {
    const findingRes = await query(
      `SELECT df.*, ce.status AS exam_status
       FROM patient_dental_findings df
       LEFT JOIN clinical_examinations ce ON (df.examination_id = ce.id OR (df.visit_id = ce.visit_id AND df.clinic_id = ce.clinic_id))
       WHERE df.id = $1 AND df.clinic_id = $2 AND df.branch_id = $3`,
      [findingId, clinicId, branchId]
    );

    if (findingRes.rows.length === 0) {
      const err = new Error('Dental finding not found in this branch.');
      err.statusCode = 404;
      throw err;
    }
    const finding = findingRes.rows[0];

    if (finding.exam_status === 'signed' || finding.exam_status === 'locked') {
      const err = new Error(
        'Cannot delete findings from a signed or locked visit encounter. An official amendment must be submitted instead.'
      );
      err.statusCode = 403;
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete finding record
      await client.query(
        `DELETE FROM patient_dental_findings WHERE id = $1`,
        [findingId]
      );

      // Reconcile living baseline: remove from baseline if this was the last finding
      await client.query(
        `DELETE FROM patient_dental_baselines
         WHERE last_finding_id = $1`,
        [findingId]
      );

      await client.query('COMMIT');

      await recordAuditLog({
        userId,
        action: 'DENTAL_CHART_FINDING_DELETED',
        entityType: 'patient_dental_findings',
        entityId: findingId,
        branchId,
        details: {
          patientId: finding.patient_id,
          visitId: finding.visit_id,
          toothNumber: finding.tooth_number,
          surface: finding.surface,
          conditionCode: finding.condition_code,
        },
      });

      return { success: true, message: 'Dental finding removed.' };
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.message && e.message.includes('signed or locked')) {
        e.statusCode = 403;
      }
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * 6. Submit a legal amendment for a signed/locked dental chart finding
   */
  async amendFinding(clinicId, branchId, userId, findingId, amendmentData) {
    const { amendment_reason, new_notes, action = 'modified' } = amendmentData;

    if (!amendment_reason || !amendment_reason.trim()) {
      const err = new Error('amendment_reason is required to legally amend a clinical record.');
      err.statusCode = 400;
      throw err;
    }

    const findingRes = await query(
      `SELECT * FROM patient_dental_findings WHERE id = $1 AND clinic_id = $2`,
      [findingId, clinicId]
    );

    if (findingRes.rows.length === 0) {
      const err = new Error('Dental finding not found.');
      err.statusCode = 404;
      throw err;
    }
    const finding = findingRes.rows[0];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Record in patient_dental_chart_amendments
      await client.query(
        `INSERT INTO patient_dental_chart_amendments (
           clinic_id, branch_id, patient_id, visit_id, examination_id,
           finding_id, amendment_reason, action, previous_state, new_state, amended_by
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9, $10, $11
         )`,
        [
          clinicId,
          branchId,
          finding.patient_id,
          finding.visit_id,
          finding.examination_id,
          finding.id,
          amendment_reason.trim(),
          action,
          JSON.stringify(finding),
          JSON.stringify({ ...finding, notes: new_notes || finding.notes, status: 'amended' }),
          userId,
        ]
      );

      // Update finding status to amended and append note
      const updateRes = await client.query(
        `UPDATE patient_dental_findings
         SET status = 'amended',
             notes = COALESCE(notes, '') || E'\\n[Amendment: ' || $1 || E'] ' || $2,
             updated_by = $3,
             updated_at = now()
         WHERE id = $4
         RETURNING *`,
        [amendment_reason.trim(), new_notes?.trim() || '', userId, findingId]
      );

      await client.query('COMMIT');

      await recordAuditLog({
        userId,
        action: 'DENTAL_CHART_FINDING_AMENDED',
        entityType: 'patient_dental_findings',
        entityId: findingId,
        branchId,
        details: {
          amendmentReason: amendment_reason,
          action,
        },
      });

      return updateRes.rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

module.exports = new DentalChartService();
