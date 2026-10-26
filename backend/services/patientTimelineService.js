const { pool, query } = require('../config/database');

/**
 * Service for Phase 5: Patient History Timeline & Visit-Wise Unified Records
 */
class PatientTimelineService {
  /**
   * Aggregates a comprehensive, chronological medical timeline for a patient.
   *
   * @param {string} patientId - UUID or patient number of patient
   * @param {string} clinicId - Authenticated user clinic UUID
   * @param {Object} options - Pagination and filter criteria
   * @param {Array<string>} userBranchIds - User's assigned branch UUIDs
   */
  async getPatientTimeline(patientId, clinicId, options = {}, userBranchIds = []) {
    const {
      page = 1,
      limit = 20,
      category = 'all',
      startDate,
      endDate,
      visitId,
      branchId,
      search,
    } = options;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    // 1. Resolve patient and verify clinic ownership
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patientId);
    const patientRes = await query(
      isUuid
        ? `SELECT p.id, p.clinic_id, p.branch_id, p.patient_number, p.first_name, p.last_name, p.phone, p.gender, p.date_of_birth,
                  b.branch_name, b.branch_code
           FROM patients p
           JOIN branches b ON p.branch_id = b.id
           WHERE p.id = $1 AND p.clinic_id = $2`
        : `SELECT p.id, p.clinic_id, p.branch_id, p.patient_number, p.first_name, p.last_name, p.phone, p.gender, p.date_of_birth,
                  b.branch_name, b.branch_code
           FROM patients p
           JOIN branches b ON p.branch_id = b.id
           WHERE p.patient_number = $1 AND p.clinic_id = $2`,
      isUuid ? [patientId, clinicId] : [patientId, clinicId]
    );

    if (patientRes.rows.length === 0) {
      const err = new Error('Patient record not found in this clinic organization.');
      err.statusCode = 404;
      throw err;
    }

    const patient = patientRes.rows[0];
    const resolvedPatientId = patient.id;

    // 2. Build subqueries for each timeline event type
    // We construct union queries that return standardized columns:
    // id, event_type, category, event_timestamp, visit_id, visit_token, branch_id, branch_name,
    // doctor_id, doctor_name, status, title, summary, metadata

    const subqueries = [];

    // Category filter matching helpers
    const includeCategory = (cat) => category === 'all' || category === cat;

    // A. Patient Visits (category: 'visits')
    if (includeCategory('visits')) {
      subqueries.push(`
        SELECT 
          pv.id::text AS id,
          'visit' AS event_type,
          'visits' AS category,
          pv.created_at AS event_timestamp,
          pv.id AS visit_id,
          pv.token_display AS visit_token,
          pv.visit_date AS visit_date,
          pv.branch_id,
          b.branch_name,
          pv.doctor_id,
          TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS doctor_name,
          pv.status,
          CONCAT('Clinical Encounter (#', pv.token_display, ')') AS title,
          CONCAT('Visit type: ', pv.visit_type, '. Reason: ', COALESCE(pv.reason_for_visit, 'Routine consultation'), CASE WHEN pv.notes IS NOT NULL AND pv.notes != '' THEN CONCAT(' — ', pv.notes) ELSE '' END) AS summary,
          json_build_object(
            'tokenDisplay', pv.token_display,
            'visitType', pv.visit_type,
            'reasonForVisit', pv.reason_for_visit,
            'notes', pv.notes
          ) AS metadata
        FROM patient_visits pv
        JOIN branches b ON pv.branch_id = b.id
        LEFT JOIN users u ON pv.doctor_id = u.id
        WHERE pv.patient_id = '${resolvedPatientId}' AND pv.clinic_id = '${clinicId}'
      `);
    }

    // B. Appointments (category: 'appointments')
    if (includeCategory('appointments')) {
      subqueries.push(`
        SELECT 
          a.id::text AS id,
          'appointment' AS event_type,
          'appointments' AS category,
          a.created_at AS event_timestamp,
          a.visit_id AS visit_id,
          pv.token_display AS visit_token,
          a.appointment_date AS visit_date,
          a.branch_id,
          b.branch_name,
          a.doctor_id,
          TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS doctor_name,
          a.status,
          CONCAT('Appointment #', a.appointment_number, ' (', a.appointment_type, ')') AS title,
          CONCAT('Booked for ', a.appointment_date, ' at ', a.start_time, ' - ', a.end_time, '. Fee: $', a.consultation_fee, CASE WHEN a.chief_complaint IS NOT NULL THEN CONCAT(' — ', a.chief_complaint) ELSE '' END) AS summary,
          json_build_object(
            'appointmentNumber', a.appointment_number,
            'appointmentType', a.appointment_type,
            'appointmentDate', a.appointment_date,
            'startTime', a.start_time,
            'endTime', a.end_time,
            'consultationFee', a.consultation_fee,
            'paymentStatus', a.payment_status,
            'cancellationReason', a.cancellation_reason
          ) AS metadata
        FROM appointments a
        JOIN branches b ON a.branch_id = b.id
        LEFT JOIN users u ON a.doctor_id = u.id
        LEFT JOIN patient_visits pv ON a.visit_id = pv.id
        WHERE a.patient_id = '${resolvedPatientId}' AND a.clinic_id = '${clinicId}'
      `);
    }

    // C. Vitals & Triage (category: 'vitals')
    if (includeCategory('vitals')) {
      subqueries.push(`
        SELECT 
          pvv.id::text AS id,
          'vitals' AS event_type,
          'vitals' AS category,
          COALESCE(pvv.recorded_at, pvv.created_at) AS event_timestamp,
          pvv.visit_id AS visit_id,
          pv.token_display AS visit_token,
          pv.visit_date AS visit_date,
          pvv.branch_id,
          b.branch_name,
          pvv.recorded_by AS doctor_id,
          TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS doctor_name,
          COALESCE(pvv.triage_priority, 'routine') AS status,
          CONCAT('Pre-Consultation Vitals & Triage (', UPPER(COALESCE(pvv.triage_priority, 'routine')), ')') AS title,
          CONCAT(
            'BP: ', COALESCE(pvv.blood_pressure, 'N/A'),
            ', Pulse: ', COALESCE(pvv.pulse_bpm::text, 'N/A'), ' bpm',
            ', Temp: ', COALESCE(pvv.temperature_f::text, 'N/A'), '°F',
            ', SpO2: ', COALESCE(pvv.spo2_percent::text, 'N/A'), '%',
            CASE WHEN pvv.triage_notes IS NOT NULL THEN CONCAT(' — Triage: ', pvv.triage_notes) ELSE '' END
          ) AS summary,
          json_build_object(
            'bloodPressure', pvv.blood_pressure,
            'pulseBpm', pvv.pulse_bpm,
            'temperatureF', pvv.temperature_f,
            'spo2Percent', pvv.spo2_percent,
            'respiratoryRate', pvv.respiratory_rate,
            'weightKg', pvv.weight_kg,
            'heightCm', pvv.height_cm,
            'bmi', pvv.bmi,
            'triagePriority', pvv.triage_priority,
            'triageNotes', pvv.triage_notes
          ) AS metadata
        FROM patient_visit_vitals pvv
        JOIN branches b ON pvv.branch_id = b.id
        LEFT JOIN users u ON pvv.recorded_by = u.id
        LEFT JOIN patient_visits pv ON pvv.visit_id = pv.id
        WHERE pvv.patient_id = '${resolvedPatientId}' AND pvv.clinic_id = '${clinicId}'
      `);
    }

    // D. Clinical Examinations (category: 'clinical')
    if (includeCategory('clinical')) {
      subqueries.push(`
        SELECT 
          ce.id::text AS id,
          'clinical_exam' AS event_type,
          'clinical' AS category,
          COALESCE(ce.signed_at, ce.created_at) AS event_timestamp,
          ce.visit_id AS visit_id,
          pv.token_display AS visit_token,
          pv.visit_date AS visit_date,
          ce.branch_id,
          b.branch_name,
          ce.doctor_id,
          TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS doctor_name,
          ce.status,
          CONCAT('Clinical Examination (', UPPER(ce.status), ')') AS title,
          CONCAT(
            'Diagnosis: ', COALESCE(ce.diagnosis, 'Evaluation recorded'),
            CASE WHEN ce.chief_complaint IS NOT NULL THEN CONCAT('. Complaint: ', ce.chief_complaint) ELSE '' END,
            CASE WHEN ce.is_released_to_patient THEN ' [Patient Portal Released]' ELSE ' [Clinical Internal]' END
          ) AS summary,
          json_build_object(
            'diagnosis', ce.diagnosis,
            'diagnosisIcd10', ce.diagnosis_icd10,
            'chiefComplaint', ce.chief_complaint,
            'examinationNotes', ce.examination_notes,
            'patientFacingSummary', ce.patient_facing_summary,
            'isReleasedToPatient', ce.is_released_to_patient,
            'signedAt', ce.signed_at,
            'signedBy', ce.signed_by
          ) AS metadata
        FROM clinical_examinations ce
        JOIN branches b ON ce.branch_id = b.id
        LEFT JOIN users u ON ce.doctor_id = u.id
        LEFT JOIN patient_visits pv ON ce.visit_id = pv.id
        WHERE ce.patient_id = '${resolvedPatientId}' AND ce.clinic_id = '${clinicId}'
      `);

      // Clinical Amendments
      subqueries.push(`
        SELECT 
          cea.id::text AS id,
          'exam_amendment' AS event_type,
          'clinical' AS category,
          cea.amended_at AS event_timestamp,
          cea.visit_id AS visit_id,
          pv.token_display AS visit_token,
          pv.visit_date AS visit_date,
          cea.branch_id,
          b.branch_name,
          cea.amended_by AS doctor_id,
          TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS doctor_name,
          'amended' AS status,
          'Clinical Examination Addendum' AS title,
          CONCAT('Amendment reason: ', cea.amendment_reason, CASE WHEN cea.addendum_notes IS NOT NULL THEN CONCAT(' — ', cea.addendum_notes) ELSE '' END) AS summary,
          json_build_object(
            'examinationId', cea.examination_id,
            'amendmentReason', cea.amendment_reason,
            'addendumNotes', cea.addendum_notes,
            'amendedAt', cea.amended_at
          ) AS metadata
        FROM clinical_examination_amendments cea
        JOIN branches b ON cea.branch_id = b.id
        LEFT JOIN users u ON cea.amended_by = u.id
        LEFT JOIN patient_visits pv ON cea.visit_id = pv.id
        WHERE cea.patient_id = '${resolvedPatientId}' AND cea.clinic_id = '${clinicId}'
      `);

      // Dental Findings
      subqueries.push(`
        SELECT 
          pdf.id::text AS id,
          'dental_finding' AS event_type,
          'clinical' AS category,
          pdf.created_at AS event_timestamp,
          pdf.visit_id AS visit_id,
          pv.token_display AS visit_token,
          pv.visit_date AS visit_date,
          pdf.branch_id,
          b.branch_name,
          pdf.created_by AS doctor_id,
          TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS doctor_name,
          pdf.status,
          CONCAT('Dental Chart Finding: Tooth #', pdf.tooth_number, ' (', COALESCE(pdf.surface, 'Whole Tooth'), ')') AS title,
          CONCAT(pdf.condition_name, ' (', pdf.condition_code, ') — Severity: ', COALESCE(pdf.severity, 'moderate'), CASE WHEN pdf.notes IS NOT NULL THEN CONCAT('. ', pdf.notes) ELSE '' END) AS summary,
          json_build_object(
            'toothNumber', pdf.tooth_number,
            'surface', pdf.surface,
            'conditionCode', pdf.condition_code,
            'conditionName', pdf.condition_name,
            'findingType', pdf.finding_type,
            'severity', pdf.severity,
            'isExistingCondition', pdf.is_existing_condition
          ) AS metadata
        FROM patient_dental_findings pdf
        JOIN branches b ON pdf.branch_id = b.id
        LEFT JOIN users u ON pdf.created_by = u.id
        LEFT JOIN patient_visits pv ON pdf.visit_id = pv.id
        WHERE pdf.patient_id = '${resolvedPatientId}' AND pdf.clinic_id = '${clinicId}'
      `);
    }

    // E. Treatment Plans (category: 'treatment_plans')
    if (includeCategory('treatment_plans')) {
      subqueries.push(`
        SELECT 
          tp.id::text AS id,
          'treatment_plan' AS event_type,
          'treatment_plans' AS category,
          tp.created_at AS event_timestamp,
          tp.originating_visit_id AS visit_id,
          pv.token_display AS visit_token,
          pv.visit_date AS visit_date,
          tp.branch_id,
          b.branch_name,
          tp.created_by_doctor_id AS doctor_id,
          TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS doctor_name,
          tp.status,
          CONCAT('Treatment Plan #', tp.plan_number, ': ', tp.plan_title, ' (v', tp.version, ')') AS title,
          CONCAT('Status: ', UPPER(tp.status), ', Est. Cost: $', tp.total_estimated_cost, CASE WHEN tp.treatment_summary IS NOT NULL THEN CONCAT(' — ', tp.treatment_summary) ELSE '' END) AS summary,
          json_build_object(
            'planNumber', tp.plan_number,
            'planTitle', tp.plan_title,
            'version', tp.version,
            'totalEstimatedCost', tp.total_estimated_cost,
            'status', tp.status,
            'treatmentSummary', tp.treatment_summary,
            'presentedAt', tp.presented_at,
            'approvedAt', tp.approved_at
          ) AS metadata
        FROM treatment_plans tp
        JOIN branches b ON tp.branch_id = b.id
        LEFT JOIN users u ON tp.created_by_doctor_id = u.id
        LEFT JOIN patient_visits pv ON tp.originating_visit_id = pv.id
        WHERE tp.patient_id = '${resolvedPatientId}' AND tp.clinic_id = '${clinicId}'
      `);
    }

    // F. Treatment Consents (category: 'consent')
    if (includeCategory('consent')) {
      subqueries.push(`
        SELECT 
          tc.id::text AS id,
          'consent' AS event_type,
          'consent' AS category,
          COALESCE(tc.withdrawn_at, tc.declined_at, tc.obtained_at, tc.created_at) AS event_timestamp,
          tc.visit_id AS visit_id,
          pv.token_display AS visit_token,
          pv.visit_date AS visit_date,
          tc.branch_id,
          b.branch_name,
          tc.recorded_by AS doctor_id,
          TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS doctor_name,
          tc.consent_status AS status,
          CONCAT('Informed Consent (', tc.consent_number, ')') AS title,
          CONCAT(
            'Status: ', UPPER(tc.consent_status), 
            ' — Acknowledged by ', tc.patient_name_acknowledged, ' via ', tc.acknowledgement_method,
            CASE WHEN tc.withdrawal_reason IS NOT NULL THEN CONCAT(' [Withdrawal Reason: ', tc.withdrawal_reason, ']') ELSE '' END
          ) AS summary,
          json_build_object(
            'consentNumber', tc.consent_number,
            'consentStatus', tc.consent_status,
            'acknowledgementMethod', tc.acknowledgement_method,
            'patientNameAcknowledged', tc.patient_name_acknowledged,
            'isGuardianConsent', tc.is_guardian_consent,
            'guardianName', tc.guardian_name,
            'procedureSummary', tc.procedure_summary,
            'withdrawalReason', tc.withdrawal_reason,
            'declineReason', tc.decline_reason
          ) AS metadata
        FROM treatment_consents tc
        JOIN branches b ON tc.branch_id = b.id
        LEFT JOIN users u ON tc.recorded_by = u.id
        LEFT JOIN patient_visits pv ON tc.visit_id = pv.id
        WHERE tc.patient_id = '${resolvedPatientId}' AND tc.clinic_id = '${clinicId}'
      `);
    }

    // G. Prescriptions (category: 'prescriptions')
    if (includeCategory('prescriptions')) {
      subqueries.push(`
        SELECT 
          p.id::text AS id,
          'prescription' AS event_type,
          'prescriptions' AS category,
          p.created_at AS event_timestamp,
          p.visit_id AS visit_id,
          pv.token_display AS visit_token,
          p.prescription_date AS visit_date,
          p.branch_id,
          b.branch_name,
          p.prescribing_doctor_id AS doctor_id,
          TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS doctor_name,
          p.status,
          CONCAT('Prescription #', p.prescription_number, ' (v', p.version, ' - ', UPPER(p.status), ')') AS title,
          CONCAT(
            'Diagnosis: ', COALESCE(p.diagnosis, 'Dental therapy prescribed'),
            CASE WHEN p.cancellation_reason IS NOT NULL THEN CONCAT(' — Cancelled: ', p.cancellation_reason) ELSE '' END,
            CASE WHEN p.amendment_reason IS NOT NULL THEN CONCAT(' — Amended: ', p.amendment_reason) ELSE '' END,
            CASE WHEN p.general_instructions IS NOT NULL THEN CONCAT('. Directions: ', p.general_instructions) ELSE '' END
          ) AS summary,
          json_build_object(
            'prescriptionNumber', p.prescription_number,
            'prescriptionDate', p.prescription_date,
            'version', p.version,
            'status', p.status,
            'diagnosis', p.diagnosis,
            'generalInstructions', p.general_instructions,
            'dietaryAdvice', p.dietary_advice,
            'signedAt', p.signed_at,
            'cancellationReason', p.cancellation_reason,
            'amendmentReason', p.amendment_reason
          ) AS metadata
        FROM prescriptions p
        JOIN branches b ON p.branch_id = b.id
        LEFT JOIN users u ON p.prescribing_doctor_id = u.id
        LEFT JOIN patient_visits pv ON p.visit_id = pv.id
        WHERE p.patient_id = '${resolvedPatientId}' AND p.clinic_id = '${clinicId}'
      `);
    }

    // H. Payments & Billing (category: 'billing')
    if (includeCategory('billing')) {
      subqueries.push(`
        SELECT 
          ap.id::text AS id,
          'payment' AS event_type,
          'billing' AS category,
          ap.created_at AS event_timestamp,
          pv.id AS visit_id,
          pv.token_display AS visit_token,
          COALESCE(pv.visit_date, a.appointment_date) AS visit_date,
          ap.branch_id,
          b.branch_name,
          ap.received_by AS doctor_id,
          TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS doctor_name,
          ap.payment_status AS status,
          CONCAT('Payment Receipt #', ap.receipt_number) AS title,
          CONCAT(
            'Paid: $', ap.amount_paid, ' via ', ap.payment_method,
            ' (Gross: $', ap.gross_amount, ', Balance: $', ap.remaining_balance, ')',
            CASE WHEN ap.discount_amount > 0 THEN CONCAT(' — Discount: $', ap.discount_amount) ELSE '' END
          ) AS summary,
          json_build_object(
            'receiptNumber', ap.receipt_number,
            'amountPaid', ap.amount_paid,
            'grossAmount', ap.gross_amount,
            'discountAmount', ap.discount_amount,
            'remainingBalance', ap.remaining_balance,
            'paymentMethod', ap.payment_method,
            'paymentStatus', ap.payment_status,
            'paymentReference', ap.payment_reference
          ) AS metadata
        FROM appointment_payments ap
        JOIN branches b ON ap.branch_id = b.id
        LEFT JOIN users u ON ap.received_by = u.id
        LEFT JOIN appointments a ON ap.appointment_id = a.id
        LEFT JOIN patient_visits pv ON a.visit_id = pv.id
        WHERE ap.patient_id = '${resolvedPatientId}' AND ap.clinic_id = '${clinicId}'
      `);
    }

    if (subqueries.length === 0) {
      return {
        patient,
        events: [],
        pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 0 },
      };
    }

    const unifiedSql = `(\n${subqueries.map((q) => `(${q})`).join('\nUNION ALL\n')}\n)`;

    // Filter wrapper
    const filterClauses = [];
    const queryParams = [];

    // Branch authorization scoping
    if (userBranchIds && userBranchIds.length > 0) {
      filterClauses.push(`branch_id = ANY($${queryParams.length + 1})`);
      queryParams.push(userBranchIds);
    }

    // Specific branch filter
    if (branchId) {
      filterClauses.push(`branch_id = $${queryParams.length + 1}`);
      queryParams.push(branchId);
    }

    // Specific visit filter
    if (visitId) {
      filterClauses.push(`visit_id = $${queryParams.length + 1}`);
      queryParams.push(visitId);
    }

    // Date range filter
    if (startDate) {
      filterClauses.push(`event_timestamp >= $${queryParams.length + 1}::timestamp`);
      queryParams.push(`${startDate} 00:00:00`);
    }
    if (endDate) {
      filterClauses.push(`event_timestamp <= $${queryParams.length + 1}::timestamp`);
      queryParams.push(`${endDate} 23:59:59`);
    }

    // Free-text search filter
    if (search && search.trim()) {
      filterClauses.push(`(
        title ILIKE $${queryParams.length + 1} OR 
        summary ILIKE $${queryParams.length + 1} OR 
        COALESCE(doctor_name, '') ILIKE $${queryParams.length + 1} OR 
        COALESCE(visit_token, '') ILIKE $${queryParams.length + 1}
      )`);
      queryParams.push(`%${search.trim()}%`);
    }

    const whereClause = filterClauses.length > 0 ? `WHERE ${filterClauses.join(' AND ')}` : '';

    // Count query
    const countSql = `
      SELECT COUNT(*)::integer AS total 
      FROM ${unifiedSql} timeline_events
      ${whereClause};
    `;

    const countRes = await query(countSql, queryParams);
    const total = countRes.rows[0]?.total || 0;
    const totalPages = Math.ceil(total / limitNum) || (total > 0 ? 1 : 0);

    // Paged timeline query
    const dataSql = `
      SELECT * 
      FROM ${unifiedSql} timeline_events
      ${whereClause}
      ORDER BY event_timestamp DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2};
    `;

    queryParams.push(limitNum, offset);
    const dataRes = await query(dataSql, queryParams);

    return {
      patient,
      events: dataRes.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    };
  }

  /**
   * Retrieves complete, unified encounter breakdown for a specific patient visit.
   *
   * @param {string} visitId - UUID of the visit encounter
   * @param {string} clinicId - Authenticated clinic UUID
   * @param {Array<string>} userBranchIds - User's branch permissions
   */
  async getVisitEncounterRecords(visitId, clinicId, userBranchIds = []) {
    if (!visitId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(visitId)) {
      const err = new Error('Invalid visit ID format.');
      err.statusCode = 400;
      throw err;
    }

    // 1. Fetch authoritative visit encounter
    const visitRes = await query(
      `SELECT pv.*,
              b.branch_name, b.branch_code,
              p.id AS patient_id, p.patient_number, p.first_name, p.last_name, p.phone, p.gender, p.date_of_birth,
              TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS doctor_name,
              u.email AS doctor_email,
              a.appointment_number, a.appointment_type, a.start_time, a.end_time, a.consultation_fee
       FROM patient_visits pv
       JOIN patients p ON pv.patient_id = p.id
       JOIN branches b ON pv.branch_id = b.id
       LEFT JOIN users u ON pv.doctor_id = u.id
       LEFT JOIN appointments a ON pv.appointment_id = a.id
       WHERE pv.id = $1 AND pv.clinic_id = $2`,
      [visitId, clinicId]
    );

    if (visitRes.rows.length === 0) {
      const err = new Error('Visit record not found in this clinic organization.');
      err.statusCode = 404;
      throw err;
    }

    const visit = visitRes.rows[0];

    // Branch authorization check
    if (userBranchIds && userBranchIds.length > 0 && !userBranchIds.includes(visit.branch_id)) {
      const err = new Error('Forbidden. You do not have permission to view records for this branch.');
      err.statusCode = 403;
      throw err;
    }

    const patientId = visit.patient_id;

    // 2. Fetch parallel encounter sections
    const [
      vitalsRes,
      examRes,
      findingsRes,
      plansRes,
      completedItemsRes,
      consentsRes,
      prescriptionsRes,
      paymentsRes,
      medicalRecordRes,
    ] = await Promise.all([
      // Vitals & Triage
      query(
        `SELECT pvv.*,
                TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS recorded_by_name
         FROM patient_visit_vitals pvv
         LEFT JOIN users u ON pvv.recorded_by = u.id
         WHERE pvv.visit_id = $1 AND pvv.clinic_id = $2
         ORDER BY pvv.recorded_at DESC LIMIT 1`,
        [visitId, clinicId]
      ),

      // Clinical Examination & Amendments
      query(
        `SELECT ce.*,
                TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS doctor_name,
                TRIM(CONCAT(u2.first_name, ' ', COALESCE(u2.last_name, ''))) AS signed_by_name,
                (SELECT json_agg(cea.* ORDER BY cea.amended_at DESC) 
                 FROM clinical_examination_amendments cea 
                 WHERE cea.examination_id = ce.id) AS amendments
         FROM clinical_examinations ce
         LEFT JOIN users u ON ce.doctor_id = u.id
         LEFT JOIN users u2 ON ce.signed_by = u2.id
         WHERE ce.visit_id = $1 AND ce.clinic_id = $2
         LIMIT 1`,
        [visitId, clinicId]
      ),

      // Dental Findings recorded in this encounter
      query(
        `SELECT pdf.*,
                TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS recorded_by_name
         FROM patient_dental_findings pdf
         LEFT JOIN users u ON pdf.created_by = u.id
         WHERE pdf.visit_id = $1 AND pdf.clinic_id = $2
         ORDER BY pdf.tooth_number ASC, pdf.created_at ASC`,
        [visitId, clinicId]
      ),

      // Treatment plans originating from this encounter
      query(
        `SELECT tp.*,
                TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS doctor_name,
                (SELECT json_agg(tpi.* ORDER BY tpi.session_order ASC, tpi.sequence_order ASC)
                 FROM treatment_plan_items tpi
                 WHERE tpi.treatment_plan_id = tp.id) AS items
         FROM treatment_plans tp
         LEFT JOIN users u ON tp.created_by_doctor_id = u.id
         WHERE tp.originating_visit_id = $1 AND tp.clinic_id = $2
         ORDER BY tp.created_at DESC`,
        [visitId, clinicId]
      ),

      // Treatment plan items completed during this encounter
      query(
        `SELECT tpi.*,
                tp.plan_number, tp.plan_title,
                TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS completed_by_name
         FROM treatment_plan_items tpi
         JOIN treatment_plans tp ON tpi.treatment_plan_id = tp.id
         LEFT JOIN users u ON tpi.completed_by = u.id
         WHERE tpi.completion_visit_id = $1 AND tpi.clinic_id = $2
         ORDER BY tpi.completed_at DESC`,
        [visitId, clinicId]
      ),

      // Informed Consents linked to this encounter
      query(
        `SELECT tc.*,
                TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS recorded_by_name,
                tp.plan_number, tp.plan_title
         FROM treatment_consents tc
         LEFT JOIN users u ON tc.recorded_by = u.id
         LEFT JOIN treatment_plans tp ON tc.treatment_plan_id = tp.id
         WHERE tc.visit_id = $1 AND tc.clinic_id = $2
         ORDER BY tc.created_at DESC`,
        [visitId, clinicId]
      ),

      // Prescriptions issued during this encounter with items
      query(
        `SELECT p.*,
                TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS doctor_name,
                (SELECT json_agg(pi.* ORDER BY pi.item_order ASC)
                 FROM prescription_items pi
                 WHERE pi.prescription_id = p.id) AS items
         FROM prescriptions p
         LEFT JOIN users u ON p.prescribing_doctor_id = u.id
         WHERE p.visit_id = $1 AND p.clinic_id = $2
         ORDER BY p.created_at DESC`,
        [visitId, clinicId]
      ),

      // Billing & Payments linked to this encounter or appointment
      query(
        `SELECT ap.*,
                TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS received_by_name
         FROM appointment_payments ap
         LEFT JOIN users u ON ap.received_by = u.id
         LEFT JOIN appointments a ON ap.appointment_id = a.id
         WHERE ap.clinic_id = $2 AND (a.visit_id = $1 OR ap.appointment_id = (SELECT appointment_id FROM patient_visits WHERE id = $1))
         ORDER BY ap.created_at DESC`,
        [visitId, clinicId]
      ),

      // Patient-level medical context (allergies, medical alerts)
      query(
        `SELECT pmr.*
         FROM patient_medical_records pmr
         WHERE pmr.patient_id = $1 AND pmr.clinic_id = $2
         LIMIT 1`,
        [patientId, clinicId]
      ),
    ]);

    return {
      visit: {
        id: visit.id,
        token_display: visit.token_display,
        tokenDisplay: visit.token_display,
        token_number: visit.token_number,
        tokenNumber: visit.token_number,
        visit_date: visit.visit_date,
        visitDate: visit.visit_date,
        visit_type: visit.visit_type,
        visitType: visit.visit_type,
        status: visit.status,
        reason_for_visit: visit.reason_for_visit,
        reasonForVisit: visit.reason_for_visit,
        notes: visit.notes,
        branch_id: visit.branch_id,
        branchId: visit.branch_id,
        branch_name: visit.branch_name,
        branchName: visit.branch_name,
        branch_code: visit.branch_code,
        branchCode: visit.branch_code,
        doctor_id: visit.doctor_id,
        doctorId: visit.doctor_id,
        doctor_name: visit.doctor_name,
        doctorName: visit.doctor_name,
        doctor_email: visit.doctor_email,
        doctorEmail: visit.doctor_email,
        appointment_id: visit.appointment_id,
        appointmentId: visit.appointment_id,
        appointment_number: visit.appointment_number,
        appointmentNumber: visit.appointment_number,
        appointment_type: visit.appointment_type,
        appointmentType: visit.appointment_type,
        created_at: visit.created_at,
        createdAt: visit.created_at,
      },
      patient: {
        id: visit.patient_id,
        patientNumber: visit.patient_number,
        firstName: visit.first_name,
        lastName: visit.last_name,
        phone: visit.phone,
        gender: visit.gender,
        dateOfBirth: visit.date_of_birth,
      },
      // Patient-level safety context (clearly flagged as patientLevel: true)
      patientSafetyContext: {
        isPatientLevel: true,
        allergies: medicalRecordRes.rows[0]?.allergies || null,
        hasMedicalAlerts: Boolean(medicalRecordRes.rows[0]?.has_medical_alerts),
        medicalAlertDetails: medicalRecordRes.rows[0]?.medical_alert_details || null,
        medicalConditions: medicalRecordRes.rows[0]?.medical_conditions || null,
        currentMedications: medicalRecordRes.rows[0]?.current_medications || null,
      },
      // Visit-specific sections
      vitals: vitalsRes.rows[0] || null,
      clinicalExamination: examRes.rows[0] || null,
      dentalFindings: findingsRes.rows || [],
      treatmentPlans: plansRes.rows || [],
      completedTreatmentItems: completedItemsRes.rows || [],
      treatmentConsents: consentsRes.rows || [],
      prescriptions: prescriptionsRes.rows || [],
      billing: paymentsRes.rows || [],
    };
  }
}

module.exports = new PatientTimelineService();
