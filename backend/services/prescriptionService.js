const { pool, query } = require('../config/database');
const { recordAuditLog } = require('../utils/auditLogger');

/**
 * Common Dental Allergy Keywords Mapping
 * Provides structured conflict detection against recorded patient allergies.
 */
const ALLERGY_MAP = [
  { group: 'penicillin', keywords: ['penicillin', 'amoxicillin', 'ampicillin', 'augmentin', 'clavam', 'amox'] },
  { group: 'cephalosporin', keywords: ['cephalosporin', 'cephalexin', 'cefixime', 'cefuroxime', 'ceftriaxone', 'cefpodoxime'] },
  { group: 'sulfa', keywords: ['sulfa', 'sulfonamide', 'bactrim', 'septra', 'cotrimoxazole'] },
  { group: 'nsaid', keywords: ['nsaid', 'ibuprofen', 'aspirin', 'diclofenac', 'ketorolac', 'naproxen', 'aceclofenac', 'mefenamic'] },
  { group: 'opioid', keywords: ['codeine', 'tramadol', 'morphine', 'oxycodone', 'hydrocodone'] },
  { group: 'macrolide', keywords: ['erythromycin', 'azithromycin', 'clarithromycin'] },
  { group: 'clindamycin', keywords: ['clindamycin', 'dalacin'] },
  { group: 'metronidazole', keywords: ['metronidazole', 'flagyl'] },
  { group: 'paracetamol', keywords: ['paracetamol', 'acetaminophen', 'crocin', 'calpol', 'dolo'] },
  { group: 'local_anesthetic', keywords: ['lidocaine', 'lignocaine', 'articaine', 'mepivacaine', 'bupivacaine'] },
];

class PrescriptionService {
  /**
   * Helper: Concurrency-safe atomic prescription number generation
   * Generates RX-10001, RX-10002... strictly unique per clinic scope.
   */
  async generatePrescriptionNumber(client, clinicId) {
    const res = await client.query(
      `INSERT INTO clinic_counters (clinic_id, counter_type, current_value, updated_at)
       VALUES ($1, 'PRESCRIPTION', 10001, now())
       ON CONFLICT (clinic_id, counter_type)
       DO UPDATE SET current_value = clinic_counters.current_value + 1, updated_at = now()
       RETURNING current_value;`,
      [clinicId]
    );
    const num = res.rows[0].current_value;
    return `RX-${num}`;
  }

  /**
   * Helper: Detect potential allergy conflicts between recorded patient allergies
   * and medication items.
   */
  detectAllergyConflicts(allergiesText, items = []) {
    if (!allergiesText || typeof allergiesText !== 'string' || !allergiesText.trim()) {
      return [];
    }

    const patientAllergyStr = allergiesText.toLowerCase();
    const conflicts = [];

    for (const item of items) {
      const medName = (item.medicine_name || item.medicineName || '').toLowerCase();
      const genericName = (item.generic_name || item.genericName || '').toLowerCase();
      const brandName = (item.brand_name || item.brandName || '').toLowerCase();
      const fullMedStr = `${medName} ${genericName} ${brandName}`;

      for (const group of ALLERGY_MAP) {
        // Check if patient has this allergy
        const patientHasAllergy = group.keywords.some((kw) => patientAllergyStr.includes(kw));
        if (patientHasAllergy) {
          // Check if prescribed medication matches this allergy group
          const medMatchesGroup = group.keywords.some((kw) => fullMedStr.includes(kw));
          if (medMatchesGroup) {
            conflicts.push({
              allergyGroup: group.group,
              patientAllergyRecord: allergiesText.trim(),
              medicineName: item.medicine_name || item.medicineName,
              dosage: item.dosage,
            });
            break;
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * 1. Create a new prescription draft with optional initial medication items
   */
  async createPrescriptionDraft({
    clinicId,
    branchId,
    patientId,
    visitId = null,
    examinationId = null,
    treatmentPlanId = null,
    treatmentPlanItemId = null,
    prescribingDoctorId,
    diagnosis = '',
    generalInstructions = '',
    dietaryAdvice = '',
    items = [],
    userId,
    ipAddress = '127.0.0.1',
  }) {
    // 1. Verify patient belongs to clinic
    const patientRes = await query(
      `SELECT p.id, p.clinic_id, p.branch_id, p.patient_number, p.first_name, p.last_name, p.date_of_birth, p.gender,
              pmr.allergies, pmr.medical_conditions, pmr.current_medications, pmr.has_medical_alerts, pmr.medical_alert_details
       FROM patients p
       LEFT JOIN patient_medical_records pmr ON pmr.patient_id = p.id
       WHERE p.id = $1 AND p.clinic_id = $2`,
      [patientId, clinicId]
    );

    if (patientRes.rows.length === 0) {
      const err = new Error('Patient record not found in this clinic.');
      err.statusCode = 404;
      throw err;
    }
    const patient = patientRes.rows[0];

    // 2. If visitId supplied, verify visit belongs to patient & clinic
    if (visitId) {
      const visitRes = await query(
        `SELECT id, patient_id, clinic_id, branch_id FROM patient_visits
         WHERE id = $1 AND patient_id = $2 AND clinic_id = $3`,
        [visitId, patientId, clinicId]
      );
      if (visitRes.rows.length === 0) {
        const err = new Error('Supplied visit_id does not belong to this patient or clinic.');
        err.statusCode = 400;
        throw err;
      }
    }

    // 3. If treatmentPlanId supplied, verify it belongs to patient & clinic
    if (treatmentPlanId) {
      const planRes = await query(
        `SELECT id, patient_id, clinic_id FROM treatment_plans
         WHERE id = $1 AND patient_id = $2 AND clinic_id = $3`,
        [treatmentPlanId, patientId, clinicId]
      );
      if (planRes.rows.length === 0) {
        const err = new Error('Supplied treatment_plan_id does not belong to this patient or clinic.');
        err.statusCode = 400;
        throw err;
      }
    }

    // 4. Validate items if provided
    if (items && Array.isArray(items)) {
      for (const item of items) {
        if (!item.medicineName || !item.medicineName.trim()) {
          const err = new Error('Each medication entry must specify a medicine name.');
          err.statusCode = 400;
          throw err;
        }
        if (!item.dosage || !item.dosage.trim()) {
          const err = new Error(`Dosage is required for medicine: "${item.medicineName}".`);
          err.statusCode = 400;
          throw err;
        }
        if (!item.frequency || !item.frequency.trim()) {
          const err = new Error(`Frequency is required for medicine: "${item.medicineName}".`);
          err.statusCode = 400;
          throw err;
        }
        if (!item.duration || !item.duration.trim()) {
          const err = new Error(`Duration is required for medicine: "${item.medicineName}".`);
          err.statusCode = 400;
          throw err;
        }
        if (item.quantity != null && (parseInt(item.quantity, 10) < 1 || isNaN(parseInt(item.quantity, 10)))) {
          const err = new Error(`Quantity must be a positive integer for medicine: "${item.medicineName}".`);
          err.statusCode = 400;
          throw err;
        }
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const prescriptionNumber = await this.generatePrescriptionNumber(client, clinicId);

      const presInsertRes = await client.query(
        `INSERT INTO prescriptions (
           clinic_id, branch_id, patient_id, visit_id, examination_id,
           treatment_plan_id, treatment_plan_item_id, prescription_number,
           prescription_date, prescribing_doctor_id, status, diagnosis,
           general_instructions, dietary_advice, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE, $9, 'draft', $10, $11, $12, $13, $13)
         RETURNING *;`,
        [
          clinicId,
          branchId,
          patientId,
          visitId,
          examinationId,
          treatmentPlanId,
          treatmentPlanItemId,
          prescriptionNumber,
          prescribingDoctorId,
          diagnosis ? diagnosis.trim() : null,
          generalInstructions ? generalInstructions.trim() : null,
          dietaryAdvice ? dietaryAdvice.trim() : null,
          userId || prescribingDoctorId,
        ]
      );

      const prescription = presInsertRes.rows[0];
      const insertedItems = [];

      if (items && Array.isArray(items) && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const itemRes = await client.query(
            `INSERT INTO prescription_items (
               prescription_id, clinic_id, patient_id, medicine_name,
               generic_name, brand_name, dosage, dosage_form, route,
               frequency, duration, quantity, quantity_unit, instructions,
               is_prn, prn_indication, start_date, end_date, refills_allowed,
               additional_notes, item_order
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
             RETURNING *;`,
            [
              prescription.id,
              clinicId,
              patientId,
              item.medicineName.trim(),
              item.genericName ? item.genericName.trim() : null,
              item.brandName ? item.brandName.trim() : null,
              item.dosage.trim(),
              item.dosageForm || 'tablet',
              item.route || 'oral',
              item.frequency.trim(),
              item.duration.trim(),
              parseInt(item.quantity, 10) || 1,
              item.quantityUnit || 'tablets',
              item.instructions ? item.instructions.trim() : null,
              Boolean(item.isPrn),
              item.prnIndication ? item.prnIndication.trim() : null,
              item.startDate || null,
              item.endDate || null,
              parseInt(item.refillsAllowed, 10) || 0,
              item.additionalNotes ? item.additionalNotes.trim() : null,
              item.itemOrder || i + 1,
            ]
          );
          insertedItems.push(itemRes.rows[0]);
        }
      }

      await client.query('COMMIT');

      // Check for any allergy warnings for doctor context
      const allergyConflicts = this.detectAllergyConflicts(patient.allergies, insertedItems);

      // Audit log
      await recordAuditLog({
        userId: userId || prescribingDoctorId,
        action: 'PRESCRIPTION_DRAFT_CREATED',
        entityType: 'prescription',
        entityId: prescription.id,
        branchId,
        ipAddress,
        details: {
          prescriptionNumber: prescription.prescription_number,
          patientId,
          visitId,
          itemCount: insertedItems.length,
          allergyConflictsCount: allergyConflicts.length,
        },
      });

      return {
        ...prescription,
        items: insertedItems,
        patientContext: {
          patientNumber: patient.patient_number,
          name: `${patient.first_name} ${patient.last_name || ''}`.trim(),
          allergies: patient.allergies,
          medicalConditions: patient.medical_conditions,
          currentMedications: patient.current_medications,
          hasMedicalAlerts: patient.has_medical_alerts,
          medicalAlertDetails: patient.medical_alert_details,
        },
        allergyConflicts,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 2. List all prescriptions for a patient (with filtering and pagination)
   */
  async getPatientPrescriptions(clinicId, patientId, { status = null, visitId = null } = {}) {
    const patientCheck = await query(
      `SELECT id, first_name, last_name, patient_number FROM patients WHERE id = $1 AND clinic_id = $2`,
      [patientId, clinicId]
    );

    if (patientCheck.rows.length === 0) {
      const err = new Error('Patient not found in this clinic.');
      err.statusCode = 404;
      throw err;
    }

    let sql = `
      SELECT p.*,
             u.first_name AS doctor_first_name, u.last_name AS doctor_last_name,
             pv.token_display AS visit_token, pv.visit_date,
             tp.plan_number AS treatment_plan_number,
             (SELECT COUNT(*) FROM prescription_items pi WHERE pi.prescription_id = p.id)::int AS items_count,
             (SELECT string_agg(pi.medicine_name, ', ' ORDER BY pi.item_order) FROM prescription_items pi WHERE pi.prescription_id = p.id) AS medications_summary
      FROM prescriptions p
      JOIN users u ON u.id = p.prescribing_doctor_id
      LEFT JOIN patient_visits pv ON pv.id = p.visit_id
      LEFT JOIN treatment_plans tp ON tp.id = p.treatment_plan_id
      WHERE p.clinic_id = $1 AND p.patient_id = $2
    `;

    const params = [clinicId, patientId];
    let idx = 3;

    if (status) {
      sql += ` AND p.status = $${idx}`;
      params.push(status);
      idx++;
    }

    if (visitId) {
      sql += ` AND p.visit_id = $${idx}`;
      params.push(visitId);
      idx++;
    }

    sql += ` ORDER BY p.created_at DESC;`;

    const res = await query(sql, params);
    return res.rows;
  }

  /**
   * 3. List all prescriptions for an active visit encounter
   */
  async getVisitPrescriptions(clinicId, visitId) {
    const res = await query(
      `SELECT p.*,
              u.first_name AS doctor_first_name, u.last_name AS doctor_last_name,
              su.first_name AS signed_doctor_first_name, su.last_name AS signed_doctor_last_name,
              pv.token_display AS visit_token,
              (SELECT COUNT(*) FROM prescription_items pi WHERE pi.prescription_id = p.id)::int AS items_count,
              (SELECT string_agg(pi.medicine_name, ', ' ORDER BY pi.item_order) FROM prescription_items pi WHERE pi.prescription_id = p.id) AS medications_summary
       FROM prescriptions p
       JOIN users u ON u.id = p.prescribing_doctor_id
       LEFT JOIN users su ON su.id = p.signed_by
       LEFT JOIN patient_visits pv ON pv.id = p.visit_id
       WHERE p.clinic_id = $1 AND p.visit_id = $2
       ORDER BY p.created_at DESC;`,
      [clinicId, visitId]
    );
    return res.rows;
  }

  /**
   * 4. Retrieve single prescription with full items, patient medical context, and amendment history
   */
  async getPrescriptionById(clinicId, prescriptionId) {
    const res = await query(
      `SELECT p.*,
              u.first_name AS doctor_first_name, u.last_name AS doctor_last_name, u.email AS doctor_email,
              su.first_name AS signed_doctor_first_name, su.last_name AS signed_doctor_last_name,
              cu.first_name AS cancelled_doctor_first_name, cu.last_name AS cancelled_doctor_last_name,
              pt.first_name AS patient_first_name, pt.last_name AS patient_last_name,
              pt.patient_number, pt.date_of_birth, pt.gender, pt.phone AS patient_phone,
              pmr.allergies AS patient_allergies, pmr.medical_conditions AS patient_medical_conditions,
              pmr.current_medications AS patient_current_medications, pmr.has_medical_alerts, pmr.medical_alert_details,
              pv.token_display AS visit_token, pv.visit_date,
              tp.plan_number AS treatment_plan_number,
              b.branch_name, b.branch_code, b.address_line1 AS branch_address, b.phone AS branch_phone,
              c.name AS clinic_name
       FROM prescriptions p
       JOIN users u ON u.id = p.prescribing_doctor_id
       LEFT JOIN users su ON su.id = p.signed_by
       LEFT JOIN users cu ON cu.id = p.cancelled_by
       JOIN patients pt ON pt.id = p.patient_id
       LEFT JOIN patient_medical_records pmr ON pmr.patient_id = pt.id
       LEFT JOIN patient_visits pv ON pv.id = p.visit_id
       LEFT JOIN treatment_plans tp ON tp.id = p.treatment_plan_id
       JOIN branches b ON b.id = p.branch_id
       JOIN clinics c ON c.id = p.clinic_id
       WHERE p.id = $1 AND p.clinic_id = $2;`,
      [prescriptionId, clinicId]
    );

    if (res.rows.length === 0) {
      const err = new Error('Prescription record not found.');
      err.statusCode = 404;
      throw err;
    }

    const prescription = res.rows[0];

    // Fetch items
    const itemsRes = await query(
      `SELECT * FROM prescription_items
       WHERE prescription_id = $1
       ORDER BY item_order ASC, created_at ASC;`,
      [prescriptionId]
    );

    // Fetch amendment history if any
    const amendmentsRes = await query(
      `SELECT pa.*, u.first_name AS amended_by_first_name, u.last_name AS amended_by_last_name
       FROM prescription_amendments pa
       JOIN users u ON u.id = pa.amended_by
       WHERE pa.prescription_id = $1
       ORDER BY pa.amended_at DESC;`,
      [prescriptionId]
    );

    // Detect allergy conflicts for doctor view
    const allergyConflicts = this.detectAllergyConflicts(prescription.patient_allergies, itemsRes.rows);

    return {
      ...prescription,
      items: itemsRes.rows,
      amendments: amendmentsRes.rows,
      allergyConflicts,
    };
  }

  /**
   * 5. Update draft prescription header details
   */
  async updatePrescriptionDraft(clinicId, prescriptionId, updateData, userId, ipAddress = '127.0.0.1') {
    const existingRes = await query(
      `SELECT * FROM prescriptions WHERE id = $1 AND clinic_id = $2;`,
      [prescriptionId, clinicId]
    );

    if (existingRes.rows.length === 0) {
      const err = new Error('Prescription not found.');
      err.statusCode = 404;
      throw err;
    }

    const prescription = existingRes.rows[0];

    // Legal / Clinical integrity: signed, cancelled, or amended prescriptions cannot be directly edited
    if (prescription.status !== 'draft') {
      const err = new Error(
        `Cannot edit prescription ${prescription.prescription_number}: only 'draft' prescriptions can be modified. This prescription is currently '${prescription.status}'.`
      );
      err.statusCode = 400;
      throw err;
    }

    const { diagnosis, generalInstructions, dietaryAdvice, treatmentPlanId, treatmentPlanItemId } = updateData;

    const res = await query(
      `UPDATE prescriptions
       SET diagnosis = COALESCE($1, diagnosis),
           general_instructions = COALESCE($2, general_instructions),
           dietary_advice = COALESCE($3, dietary_advice),
           treatment_plan_id = COALESCE($4, treatment_plan_id),
           treatment_plan_item_id = COALESCE($5, treatment_plan_item_id),
           updated_by = $6,
           updated_at = now()
       WHERE id = $7 AND clinic_id = $8
       RETURNING *;`,
      [
        diagnosis !== undefined ? (diagnosis ? diagnosis.trim() : null) : null,
        generalInstructions !== undefined ? (generalInstructions ? generalInstructions.trim() : null) : null,
        dietaryAdvice !== undefined ? (dietaryAdvice ? dietaryAdvice.trim() : null) : null,
        treatmentPlanId !== undefined ? treatmentPlanId : null,
        treatmentPlanItemId !== undefined ? treatmentPlanItemId : null,
        userId,
        prescriptionId,
        clinicId,
      ]
    );

    await recordAuditLog({
      userId,
      action: 'PRESCRIPTION_DRAFT_UPDATED',
      entityType: 'prescription',
      entityId: prescriptionId,
      branchId: prescription.branch_id,
      ipAddress,
      details: { prescriptionNumber: prescription.prescription_number },
    });

    return res.rows[0];
  }

  /**
   * 6. Add medication item to a draft prescription
   */
  async addPrescriptionItem(clinicId, prescriptionId, itemData, userId) {
    const presRes = await query(
      `SELECT * FROM prescriptions WHERE id = $1 AND clinic_id = $2;`,
      [prescriptionId, clinicId]
    );

    if (presRes.rows.length === 0) {
      const err = new Error('Prescription not found.');
      err.statusCode = 404;
      throw err;
    }

    const prescription = presRes.rows[0];
    if (prescription.status !== 'draft') {
      const err = new Error(`Cannot add items: prescription is '${prescription.status}'. Only drafts can be modified.`);
      err.statusCode = 400;
      throw err;
    }

    if (!itemData.medicineName || !itemData.medicineName.trim()) {
      const err = new Error('Medicine name is required.');
      err.statusCode = 400;
      throw err;
    }
    if (!itemData.dosage || !itemData.dosage.trim()) {
      const err = new Error('Dosage is required.');
      err.statusCode = 400;
      throw err;
    }
    if (!itemData.frequency || !itemData.frequency.trim()) {
      const err = new Error('Frequency is required.');
      err.statusCode = 400;
      throw err;
    }
    if (!itemData.duration || !itemData.duration.trim()) {
      const err = new Error('Duration is required.');
      err.statusCode = 400;
      throw err;
    }
    if (itemData.quantity != null && (parseInt(itemData.quantity, 10) < 1 || isNaN(parseInt(itemData.quantity, 10)))) {
      const err = new Error('Quantity must be a positive integer.');
      err.statusCode = 400;
      throw err;
    }

    // Get max item_order
    const orderRes = await query(
      `SELECT COALESCE(MAX(item_order), 0) + 1 AS next_order
       FROM prescription_items WHERE prescription_id = $1;`,
      [prescriptionId]
    );
    const itemOrder = itemData.itemOrder || orderRes.rows[0].next_order;

    const res = await query(
      `INSERT INTO prescription_items (
         prescription_id, clinic_id, patient_id, medicine_name,
         generic_name, brand_name, dosage, dosage_form, route,
         frequency, duration, quantity, quantity_unit, instructions,
         is_prn, prn_indication, start_date, end_date, refills_allowed,
         additional_notes, item_order
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
       RETURNING *;`,
      [
        prescriptionId,
        clinicId,
        prescription.patient_id,
        itemData.medicineName.trim(),
        itemData.genericName ? itemData.genericName.trim() : null,
        itemData.brandName ? itemData.brandName.trim() : null,
        itemData.dosage.trim(),
        itemData.dosageForm || 'tablet',
        itemData.route || 'oral',
        itemData.frequency.trim(),
        itemData.duration.trim(),
        parseInt(itemData.quantity, 10) || 1,
        itemData.quantityUnit || 'tablets',
        itemData.instructions ? itemData.instructions.trim() : null,
        Boolean(itemData.isPrn),
        itemData.prnIndication ? itemData.prnIndication.trim() : null,
        itemData.startDate || null,
        itemData.endDate || null,
        parseInt(itemData.refillsAllowed, 10) || 0,
        itemData.additionalNotes ? itemData.additionalNotes.trim() : null,
        itemOrder,
      ]
    );

    // Update prescription timestamp
    await query(`UPDATE prescriptions SET updated_at = now(), updated_by = $1 WHERE id = $2;`, [userId, prescriptionId]);

    return res.rows[0];
  }

  /**
   * 7. Update medication item in a draft prescription
   */
  async updatePrescriptionItem(clinicId, prescriptionId, itemId, itemData, userId) {
    const presRes = await query(
      `SELECT * FROM prescriptions WHERE id = $1 AND clinic_id = $2;`,
      [prescriptionId, clinicId]
    );

    if (presRes.rows.length === 0) {
      const err = new Error('Prescription not found.');
      err.statusCode = 404;
      throw err;
    }

    const prescription = presRes.rows[0];
    if (prescription.status !== 'draft') {
      const err = new Error(`Cannot update items: prescription is '${prescription.status}'. Only drafts can be modified.`);
      err.statusCode = 400;
      throw err;
    }

    const existingItemRes = await query(
      `SELECT * FROM prescription_items WHERE id = $1 AND prescription_id = $2;`,
      [itemId, prescriptionId]
    );

    if (existingItemRes.rows.length === 0) {
      const err = new Error('Prescription medication item not found.');
      err.statusCode = 404;
      throw err;
    }

    if (itemData.quantity != null && (parseInt(itemData.quantity, 10) < 1 || isNaN(parseInt(itemData.quantity, 10)))) {
      const err = new Error('Quantity must be a positive integer.');
      err.statusCode = 400;
      throw err;
    }

    const res = await query(
      `UPDATE prescription_items
       SET medicine_name = COALESCE($1, medicine_name),
           generic_name = COALESCE($2, generic_name),
           brand_name = COALESCE($3, brand_name),
           dosage = COALESCE($4, dosage),
           dosage_form = COALESCE($5, dosage_form),
           route = COALESCE($6, route),
           frequency = COALESCE($7, frequency),
           duration = COALESCE($8, duration),
           quantity = COALESCE($9, quantity),
           quantity_unit = COALESCE($10, quantity_unit),
           instructions = COALESCE($11, instructions),
           is_prn = COALESCE($12, is_prn),
           prn_indication = COALESCE($13, prn_indication),
           start_date = COALESCE($14, start_date),
           end_date = COALESCE($15, end_date),
           refills_allowed = COALESCE($16, refills_allowed),
           additional_notes = COALESCE($17, additional_notes),
           item_order = COALESCE($18, item_order),
           updated_at = now()
       WHERE id = $19 AND prescription_id = $20
       RETURNING *;`,
      [
        itemData.medicineName !== undefined ? itemData.medicineName.trim() : null,
        itemData.genericName !== undefined ? (itemData.genericName ? itemData.genericName.trim() : null) : null,
        itemData.brandName !== undefined ? (itemData.brandName ? itemData.brandName.trim() : null) : null,
        itemData.dosage !== undefined ? itemData.dosage.trim() : null,
        itemData.dosageForm !== undefined ? itemData.dosageForm : null,
        itemData.route !== undefined ? itemData.route : null,
        itemData.frequency !== undefined ? itemData.frequency.trim() : null,
        itemData.duration !== undefined ? itemData.duration.trim() : null,
        itemData.quantity !== undefined ? parseInt(itemData.quantity, 10) : null,
        itemData.quantityUnit !== undefined ? itemData.quantityUnit : null,
        itemData.instructions !== undefined ? (itemData.instructions ? itemData.instructions.trim() : null) : null,
        itemData.isPrn !== undefined ? Boolean(itemData.isPrn) : null,
        itemData.prnIndication !== undefined ? (itemData.prnIndication ? itemData.prnIndication.trim() : null) : null,
        itemData.startDate !== undefined ? itemData.startDate : null,
        itemData.endDate !== undefined ? itemData.endDate : null,
        itemData.refillsAllowed !== undefined ? parseInt(itemData.refillsAllowed, 10) : null,
        itemData.additionalNotes !== undefined ? (itemData.additionalNotes ? itemData.additionalNotes.trim() : null) : null,
        itemData.itemOrder !== undefined ? parseInt(itemData.itemOrder, 10) : null,
        itemId,
        prescriptionId,
      ]
    );

    // Update prescription timestamp
    await query(`UPDATE prescriptions SET updated_at = now(), updated_by = $1 WHERE id = $2;`, [userId, prescriptionId]);

    return res.rows[0];
  }

  /**
   * 8. Delete medication item from draft prescription
   */
  async deletePrescriptionItem(clinicId, prescriptionId, itemId, userId) {
    const presRes = await query(
      `SELECT * FROM prescriptions WHERE id = $1 AND clinic_id = $2;`,
      [prescriptionId, clinicId]
    );

    if (presRes.rows.length === 0) {
      const err = new Error('Prescription not found.');
      err.statusCode = 404;
      throw err;
    }

    const prescription = presRes.rows[0];
    if (prescription.status !== 'draft') {
      const err = new Error(`Cannot delete items: prescription is '${prescription.status}'. Only drafts can be modified.`);
      err.statusCode = 400;
      throw err;
    }

    const delRes = await query(
      `DELETE FROM prescription_items WHERE id = $1 AND prescription_id = $2 RETURNING *;`,
      [itemId, prescriptionId]
    );

    if (delRes.rows.length === 0) {
      const err = new Error('Prescription medication item not found.');
      err.statusCode = 404;
      throw err;
    }

    // Update prescription timestamp
    await query(`UPDATE prescriptions SET updated_at = now(), updated_by = $1 WHERE id = $2;`, [userId, prescriptionId]);

    return { deleted: true, item: delRes.rows[0] };
  }

  /**
   * 9. Sign a prescription (Authorized Doctor / Dentist Digital Sign-Off)
   * Enforces:
   * - Must be in draft status.
   * - Must contain at least 1 medication item.
   * - Patient allergy conflict detection: if a conflict is found, explicit clinician acknowledgement is required.
   * - Records signed_at, signed_by doctor and transitions status to 'signed'.
   */
  async signPrescription(clinicId, prescriptionId, doctorId, allergyAcknowledgement = null, ipAddress = '127.0.0.1') {
    const presRes = await query(
      `SELECT p.*,
              pt.first_name, pt.last_name, pt.patient_number,
              pmr.allergies AS patient_allergies, pmr.has_medical_alerts
       FROM prescriptions p
       JOIN patients pt ON pt.id = p.patient_id
       LEFT JOIN patient_medical_records pmr ON pmr.patient_id = pt.id
       WHERE p.id = $1 AND p.clinic_id = $2;`,
      [prescriptionId, clinicId]
    );

    if (presRes.rows.length === 0) {
      const err = new Error('Prescription not found.');
      err.statusCode = 404;
      throw err;
    }

    const prescription = presRes.rows[0];

    if (prescription.status !== 'draft') {
      const err = new Error(
        `Cannot sign prescription ${prescription.prescription_number}: status is '${prescription.status}'. Only 'draft' prescriptions can be signed.`
      );
      err.statusCode = 400;
      throw err;
    }

    // Verify doctor exists and has clinical role
    const docRes = await query(
      `SELECT u.id, u.first_name, u.last_name, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1 AND u.clinic_id = $2;`,
      [doctorId, clinicId]
    );

    if (docRes.rows.length === 0) {
      const err = new Error('Prescribing clinician not found in this clinic.');
      err.statusCode = 404;
      throw err;
    }

    const doctor = docRes.rows[0];
    const allowedRoles = ['admin', 'dentist', 'specialist'];
    if (!allowedRoles.includes(doctor.role)) {
      const err = new Error(`User with role '${doctor.role}' is not authorized to legally sign prescriptions.`);
      err.statusCode = 403;
      throw err;
    }

    // Verify at least 1 item exists
    const itemsRes = await query(
      `SELECT * FROM prescription_items WHERE prescription_id = $1;`,
      [prescriptionId]
    );

    if (itemsRes.rows.length === 0) {
      const err = new Error('Cannot sign an empty prescription. Add at least one medication item before signing.');
      err.statusCode = 400;
      throw err;
    }

    // Clinical Safety Check: Scan for potential allergy conflict
    const conflicts = this.detectAllergyConflicts(prescription.patient_allergies, itemsRes.rows);
    if (conflicts.length > 0) {
      // Require explicit acknowledgement
      if (!allergyAcknowledgement || !allergyAcknowledgement.acknowledged) {
        const err = new Error(
          `Potential allergy conflict detected for patient ${prescription.first_name} ${prescription.last_name || ''}: ` +
          `Patient allergy record indicates: "${conflicts[0].patientAllergyRecord}". ` +
          `Medication prescribed: "${conflicts[0].medicineName}". ` +
          `Explicit clinician clinical override acknowledgement is required to sign this prescription.`
        );
        err.statusCode = 400;
        err.code = 'ALLERGY_CONFLICT_DETECTED';
        err.conflicts = conflicts;
        throw err;
      }
    }

    // Update status to 'signed'
    const signRes = await query(
      `UPDATE prescriptions
       SET status = 'signed',
           signed_at = now(),
           signed_by = $1,
           allergy_acknowledgement = $2,
           updated_by = $1,
           updated_at = now()
       WHERE id = $3 AND clinic_id = $4
       RETURNING *;`,
      [
        doctorId,
        allergyAcknowledgement ? JSON.stringify(allergyAcknowledgement) : null,
        prescriptionId,
        clinicId,
      ]
    );

    await recordAuditLog({
      userId: doctorId,
      action: 'PRESCRIPTION_SIGNED',
      entityType: 'prescription',
      entityId: prescriptionId,
      branchId: prescription.branch_id,
      ipAddress,
      details: {
        prescriptionNumber: prescription.prescription_number,
        patientId: prescription.patient_id,
        itemsCount: itemsRes.rows.length,
        allergyOverride: Boolean(allergyAcknowledgement?.acknowledged),
      },
    });

    return {
      ...signRes.rows[0],
      items: itemsRes.rows,
      doctor: {
        id: doctor.id,
        name: `Dr. ${doctor.first_name} ${doctor.last_name || ''}`.trim(),
        role: doctor.role,
      },
    };
  }

  /**
   * 10. Cancel prescription with mandatory reason
   */
  async cancelPrescription(clinicId, prescriptionId, userId, reason, ipAddress = '127.0.0.1') {
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      const err = new Error('Cancellation reason is required to cancel a prescription.');
      err.statusCode = 400;
      throw err;
    }

    const presRes = await query(
      `SELECT * FROM prescriptions WHERE id = $1 AND clinic_id = $2;`,
      [prescriptionId, clinicId]
    );

    if (presRes.rows.length === 0) {
      const err = new Error('Prescription not found.');
      err.statusCode = 404;
      throw err;
    }

    const prescription = presRes.rows[0];

    if (prescription.status === 'cancelled') {
      const err = new Error(`Prescription ${prescription.prescription_number} is already cancelled.`);
      err.statusCode = 400;
      throw err;
    }

    const cancelRes = await query(
      `UPDATE prescriptions
       SET status = 'cancelled',
           cancellation_reason = $1,
           cancelled_at = now(),
           cancelled_by = $2,
           updated_by = $2,
           updated_at = now()
       WHERE id = $3 AND clinic_id = $4
       RETURNING *;`,
      [reason.trim(), userId, prescriptionId, clinicId]
    );

    await recordAuditLog({
      userId,
      action: 'PRESCRIPTION_CANCELLED',
      entityType: 'prescription',
      entityId: prescriptionId,
      branchId: prescription.branch_id,
      ipAddress,
      details: {
        prescriptionNumber: prescription.prescription_number,
        previousStatus: prescription.status,
        reason: reason.trim(),
      },
    });

    return cancelRes.rows[0];
  }

  /**
   * 11. Amend / Replace a signed prescription
   * Controlled workflow:
   * 1. Preserves original signed prescription by creating immutable snapshot in prescription_amendments.
   * 2. Marks original prescription as 'amended' (is_amended = true).
   * 3. Creates a new replacement prescription draft (version = v + 1, linked via amended_from_id).
   * 4. Copies medication items to the replacement draft so clinician can adjust and re-sign.
   */
  async amendPrescription(clinicId, prescriptionId, userId, { reason, newItems = null, newDiagnosis = null, newInstructions = null }, ipAddress = '127.0.0.1') {
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      const err = new Error('Amendment reason is required to amend a signed prescription.');
      err.statusCode = 400;
      throw err;
    }

    const existingRes = await query(
      `SELECT * FROM prescriptions WHERE id = $1 AND clinic_id = $2;`,
      [prescriptionId, clinicId]
    );

    if (existingRes.rows.length === 0) {
      const err = new Error('Prescription not found.');
      err.statusCode = 404;
      throw err;
    }

    const original = existingRes.rows[0];

    if (original.status !== 'signed') {
      const err = new Error(
        `Cannot amend prescription ${original.prescription_number}: only 'signed' prescriptions can be amended. Current status is '${original.status}'.`
      );
      err.statusCode = 400;
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Fetch original items for snapshot
      const itemsRes = await client.query(
        `SELECT * FROM prescription_items WHERE prescription_id = $1 ORDER BY item_order ASC;`,
        [prescriptionId]
      );

      const snapshot = {
        prescription: original,
        items: itemsRes.rows,
        snapshotTimestamp: new Date().toISOString(),
      };

      // 1. Insert snapshot into prescription_amendments
      await client.query(
        `INSERT INTO prescription_amendments (
           prescription_id, clinic_id, amendment_reason, previous_status,
           snapshot_data, amended_by, amended_at
         ) VALUES ($1, $2, $3, $4, $5, $6, now());`,
        [prescriptionId, clinicId, reason.trim(), original.status, JSON.stringify(snapshot), userId]
      );

      // 2. Mark original prescription as 'amended'
      await client.query(
        `UPDATE prescriptions
         SET status = 'amended',
             is_amended = true,
             amendment_reason = $1,
             updated_by = $2,
             updated_at = now()
         WHERE id = $3 AND clinic_id = $4;`,
        [reason.trim(), userId, prescriptionId, clinicId]
      );

      // 3. Generate new prescription number for the replacement
      const newPrescriptionNumber = await this.generatePrescriptionNumber(client, clinicId);

      // 4. Create new replacement draft prescription
      const newPresInsert = await client.query(
        `INSERT INTO prescriptions (
           clinic_id, branch_id, patient_id, visit_id, examination_id,
           treatment_plan_id, treatment_plan_item_id, prescription_number,
           prescription_date, prescribing_doctor_id, status, diagnosis,
           general_instructions, dietary_advice, amended_from_id, amendment_reason,
           version, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE, $9, 'draft', $10, $11, $12, $13, $14, $15, $16, $16)
         RETURNING *;`,
        [
          clinicId,
          original.branch_id,
          original.patient_id,
          original.visit_id,
          original.examination_id,
          original.treatment_plan_id,
          original.treatment_plan_item_id,
          newPrescriptionNumber,
          original.prescribing_doctor_id,
          newDiagnosis !== null ? newDiagnosis : original.diagnosis,
          newInstructions !== null ? newInstructions : original.general_instructions,
          original.dietary_advice,
          original.id,
          reason.trim(),
          (original.version || 1) + 1,
          userId,
        ]
      );

      const replacement = newPresInsert.rows[0];
      const replacementItems = [];

      // Determine items: either newItems or copy existing items
      const itemsToInsert = newItems && Array.isArray(newItems) ? newItems : itemsRes.rows;

      for (let i = 0; i < itemsToInsert.length; i++) {
        const it = itemsToInsert[i];
        const itemRes = await client.query(
          `INSERT INTO prescription_items (
             prescription_id, clinic_id, patient_id, medicine_name,
             generic_name, brand_name, dosage, dosage_form, route,
             frequency, duration, quantity, quantity_unit, instructions,
             is_prn, prn_indication, start_date, end_date, refills_allowed,
             additional_notes, item_order
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
           RETURNING *;`,
          [
            replacement.id,
            clinicId,
            original.patient_id,
            it.medicine_name || it.medicineName,
            it.generic_name || it.genericName || null,
            it.brand_name || it.brandName || null,
            it.dosage,
            it.dosage_form || it.dosageForm || 'tablet',
            it.route || 'oral',
            it.frequency,
            it.duration,
            parseInt(it.quantity, 10) || 1,
            it.quantity_unit || it.quantityUnit || 'tablets',
            it.instructions || null,
            Boolean(it.is_prn || it.isPrn),
            it.prn_indication || it.prnIndication || null,
            it.start_date || it.startDate || null,
            it.end_date || it.endDate || null,
            parseInt(it.refills_allowed || it.refillsAllowed, 10) || 0,
            it.additional_notes || it.additionalNotes || null,
            i + 1,
          ]
        );
        replacementItems.push(itemRes.rows[0]);
      }

      await client.query('COMMIT');

      await recordAuditLog({
        userId,
        action: 'PRESCRIPTION_AMENDED',
        entityType: 'prescription',
        entityId: original.id,
        branchId: original.branch_id,
        ipAddress,
        details: {
          originalPrescriptionNumber: original.prescription_number,
          replacementPrescriptionNumber: replacement.prescription_number,
          reason: reason.trim(),
          newVersion: replacement.version,
        },
      });

      return {
        originalPrescriptionId: original.id,
        replacementPrescription: {
          ...replacement,
          items: replacementItems,
        },
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 12. Retrieve print-ready prescription data
   * Strips internal audit noise and delivers structured print view model
   */
  async getPrintData(clinicId, prescriptionId) {
    const data = await this.getPrescriptionById(clinicId, prescriptionId);
    return {
      clinic: {
        name: data.clinic_name,
        branchName: data.branch_name,
        branchCode: data.branch_code,
        address: data.branch_address,
        phone: data.branch_phone,
      },
      doctor: {
        name: `Dr. ${data.doctor_first_name} ${data.doctor_last_name || ''}`.trim(),
        email: data.doctor_email,
        signedDoctorName: data.signed_doctor_first_name
          ? `Dr. ${data.signed_doctor_first_name} ${data.signed_doctor_last_name || ''}`.trim()
          : null,
      },
      patient: {
        patientNumber: data.patient_number,
        name: `${data.patient_first_name} ${data.patient_last_name || ''}`.trim(),
        dateOfBirth: data.date_of_birth,
        gender: data.gender,
        phone: data.patient_phone,
        allergies: data.patient_allergies || 'No known drug allergies reported',
      },
      prescription: {
        id: data.id,
        prescriptionNumber: data.prescription_number,
        prescriptionDate: data.prescription_date,
        status: data.status,
        diagnosis: data.diagnosis,
        generalInstructions: data.general_instructions,
        dietaryAdvice: data.dietary_advice,
        signedAt: data.signed_at,
        isSigned: data.status === 'signed',
        version: data.version,
        visitToken: data.visit_token,
      },
      items: data.items.map((it) => ({
        id: it.id,
        medicineName: it.medicine_name,
        genericName: it.generic_name,
        brandName: it.brand_name,
        dosage: it.dosage,
        dosageForm: it.dosage_form,
        route: it.route,
        frequency: it.frequency,
        duration: it.duration,
        quantity: it.quantity,
        quantityUnit: it.quantity_unit,
        instructions: it.instructions,
        isPrn: it.is_prn,
        prnIndication: it.prn_indication,
        startDate: it.start_date,
        endDate: it.end_date,
        refillsAllowed: it.refills_allowed,
      })),
    };
  }
}

module.exports = new PrescriptionService();
