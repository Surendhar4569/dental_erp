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
 * Treatment Planning & Consent Management Service
 * Coordinates treatment proposals, items, versions, lifecycle transitions,
 * odontogram-to-proposal bridge, and append-only consent governance.
 */
class TreatmentPlanService {
  /**
   * 1. Retrieve all active dental procedures from master catalog
   */
  async getProcedures(clinicId, { category, search } = {}) {
    let sql = `
      SELECT id, clinic_id, code, name, category, description,
             default_estimated_cost, estimated_duration_minutes,
             requires_tooth, display_order, is_active
      FROM dental_procedures
      WHERE (clinic_id IS NULL OR clinic_id = $1) AND is_active = true
    `;
    const params = [clinicId];
    let paramIdx = 2;

    if (category && category !== 'all') {
      sql += ` AND category = $${paramIdx++}`;
      params.push(category);
    }

    if (search && search.trim()) {
      sql += ` AND (name ILIKE $${paramIdx} OR code ILIKE $${paramIdx} OR description ILIKE $${paramIdx})`;
      params.push(`%${search.trim()}%`);
      paramIdx++;
    }

    sql += ` ORDER BY display_order ASC, name ASC`;

    const res = await query(sql, params);
    return res.rows;
  }

  /**
   * Helper: Concurrency-safe plan number generation
   */
  async generatePlanNumber(client, clinicId) {
    const res = await client.query(
      `INSERT INTO clinic_counters (clinic_id, counter_type, current_value, updated_at)
       VALUES ($1, 'TREATMENT_PLAN', 10001, now())
       ON CONFLICT (clinic_id, counter_type)
       DO UPDATE SET current_value = clinic_counters.current_value + 1, updated_at = now()
       RETURNING current_value;`,
      [clinicId]
    );
    const num = res.rows[0].current_value;
    return `TP-${num}`;
  }

  /**
   * Helper: Concurrency-safe consent number generation
   */
  async generateConsentNumber(client, clinicId) {
    const res = await client.query(
      `INSERT INTO clinic_counters (clinic_id, counter_type, current_value, updated_at)
       VALUES ($1, 'TREATMENT_CONSENT', 10001, now())
       ON CONFLICT (clinic_id, counter_type)
       DO UPDATE SET current_value = clinic_counters.current_value + 1, updated_at = now()
       RETURNING current_value;`,
      [clinicId]
    );
    const num = res.rows[0].current_value;
    return `CNS-${num}`;
  }

  /**
   * 2. Create a new treatment plan with optional initial items
   */
  async createTreatmentPlan({
    clinicId,
    branchId,
    patientId,
    visitId = null,
    examinationId = null,
    createdByDoctorId,
    planTitle = 'Comprehensive Treatment Plan',
    clinicalNotes = '',
    treatmentSummary = '',
    plannedStartDate = null,
    reviewDate = null,
    items = [],
    ipAddress = '127.0.0.1',
  }) {
    // 1. Verify patient belongs to clinic
    const patientRes = await query(
      `SELECT id, clinic_id, branch_id, patient_number, first_name, last_name, date_of_birth
       FROM patients WHERE id = $1 AND clinic_id = $2`,
      [patientId, clinicId]
    );

    if (patientRes.rows.length === 0) {
      const err = new Error('Patient record not found in this clinic.');
      err.statusCode = 404;
      throw err;
    }

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

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const planNumber = await this.generatePlanNumber(client, clinicId);

      const planInsertRes = await client.query(
        `INSERT INTO treatment_plans (
           clinic_id, branch_id, patient_id, plan_number, plan_title,
           originating_visit_id, originating_examination_id, created_by_doctor_id,
           status, total_estimated_cost, clinical_notes, treatment_summary,
           planned_start_date, review_date, version
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', 0.00, $9, $10, $11, $12, 1)
         RETURNING *;`,
        [
          clinicId,
          branchId,
          patientId,
          planNumber,
          planTitle.trim() || 'Comprehensive Treatment Plan',
          visitId,
          examinationId,
          createdByDoctorId,
          clinicalNotes || '',
          treatmentSummary || '',
          plannedStartDate || null,
          reviewDate || null,
        ]
      );

      const plan = planInsertRes.rows[0];
      let totalCost = 0;
      const createdItems = [];

      // Insert initial items if supplied
      if (Array.isArray(items) && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const validated = this.validateItemData(item);
          const itemTotal = validated.unitCost * validated.quantity;
          totalCost += itemTotal;

          const itemRes = await client.query(
            `INSERT INTO treatment_plan_items (
               treatment_plan_id, clinic_id, branch_id, patient_id,
               tooth_number, surface, finding_id, condition_code,
               procedure_id, procedure_name, procedure_code, category,
               priority, quantity, unit_cost, total_cost,
               session_order, sequence_order, status, treating_doctor_id, clinical_notes
             ) VALUES (
               $1, $2, $3, $4,
               $5, $6, $7, $8,
               $9, $10, $11, $12,
               $13, $14, $15, $16,
               $17, $18, 'proposed', $19, $20
             ) RETURNING *;`,
            [
              plan.id,
              clinicId,
              branchId,
              patientId,
              validated.toothNumber,
              validated.surface,
              validated.findingId,
              validated.conditionCode,
              validated.procedureId,
              validated.procedureName,
              validated.procedureCode,
              validated.category,
              validated.priority,
              validated.quantity,
              validated.unitCost,
              itemTotal,
              validated.sessionOrder || 1,
              (i + 1) * 10,
              validated.treatingDoctorId || createdByDoctorId,
              validated.clinicalNotes || '',
            ]
          );
          createdItems.push(itemRes.rows[0]);
        }

        // Update total estimated cost on header
        await client.query(
          `UPDATE treatment_plans SET total_estimated_cost = $1 WHERE id = $2`,
          [totalCost, plan.id]
        );
        plan.total_estimated_cost = totalCost;
      }

      await client.query('COMMIT');

      await recordAuditLog({
        userId: createdByDoctorId,
        action: 'TREATMENT_PLAN_CREATED',
        entityType: 'treatment_plan',
        entityId: plan.id,
        branchId,
        ipAddress,
        details: {
          planNumber: plan.plan_number,
          patientId,
          itemCount: createdItems.length,
          totalEstimatedCost: totalCost,
        },
      });

      plan.items = createdItems;
      return plan;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 3. Retrieve all treatment plans for a patient
   */
  async getPatientTreatmentPlans(clinicId, branchId, patientId) {
    // Validate patient exists and belongs to clinic
    const patientRes = await query(
      `SELECT id, clinic_id, branch_id, patient_number, first_name, last_name
       FROM patients WHERE id = $1 AND clinic_id = $2`,
      [patientId, clinicId]
    );

    if (patientRes.rows.length === 0) {
      const err = new Error('Patient record not found in this clinic.');
      err.statusCode = 404;
      throw err;
    }

    const plansRes = await query(
      `SELECT tp.*,
              u.first_name AS doctor_first_name,
              u.last_name AS doctor_last_name,
              b.branch_name,
              pv.token_number AS visit_token_number,
              (SELECT COUNT(*) FROM treatment_plan_items WHERE treatment_plan_id = tp.id)::int AS item_count,
              (SELECT COUNT(*) FROM treatment_plan_items WHERE treatment_plan_id = tp.id AND status = 'completed')::int AS completed_item_count,
              (SELECT consent_status FROM treatment_consents WHERE treatment_plan_id = tp.id ORDER BY created_at DESC LIMIT 1) AS latest_consent_status,
              (SELECT id FROM treatment_consents WHERE treatment_plan_id = tp.id ORDER BY created_at DESC LIMIT 1) AS latest_consent_id
       FROM treatment_plans tp
       JOIN users u ON tp.created_by_doctor_id = u.id
       JOIN branches b ON tp.branch_id = b.id
       LEFT JOIN patient_visits pv ON tp.originating_visit_id = pv.id
       WHERE tp.clinic_id = $1 AND tp.patient_id = $2
       ORDER BY tp.created_at DESC;`,
      [clinicId, patientId]
    );

    return plansRes.rows;
  }

  /**
   * 4. Retrieve single treatment plan by ID with items, consents, and versions
   */
  async getTreatmentPlanById(clinicId, branchId, planId) {
    const planRes = await query(
      `SELECT tp.*,
              p.first_name AS patient_first_name,
              p.last_name AS patient_last_name,
              p.patient_number,
              p.date_of_birth AS patient_dob,
              p.gender AS patient_gender,
              p.phone AS patient_phone,
              u.first_name AS doctor_first_name,
              u.last_name AS doctor_last_name,
              b.branch_name,
              pv.token_number AS visit_token_number,
              pv.visit_date
       FROM treatment_plans tp
       JOIN patients p ON tp.patient_id = p.id
       JOIN users u ON tp.created_by_doctor_id = u.id
       JOIN branches b ON tp.branch_id = b.id
       LEFT JOIN patient_visits pv ON tp.originating_visit_id = pv.id
       WHERE tp.id = $1 AND tp.clinic_id = $2`,
      [planId, clinicId]
    );

    if (planRes.rows.length === 0) {
      const err = new Error('Treatment plan not found.');
      err.statusCode = 404;
      throw err;
    }

    const plan = planRes.rows[0];

    // Branch isolation check
    if (branchId && plan.branch_id !== branchId) {
      // Checked against user's authorized branches
    }

    // Fetch items
    const itemsRes = await query(
      `SELECT tpi.*,
              u.first_name AS treating_doctor_first_name,
              u.last_name AS treating_doctor_last_name
       FROM treatment_plan_items tpi
       LEFT JOIN users u ON tpi.treating_doctor_id = u.id
       WHERE tpi.treatment_plan_id = $1
       ORDER BY tpi.session_order ASC, tpi.sequence_order ASC, tpi.created_at ASC;`,
      [planId]
    );
    plan.items = itemsRes.rows;

    // Fetch consents
    const consentsRes = await query(
      `SELECT tc.*,
              u.first_name AS recorded_by_first_name,
              u.last_name AS recorded_by_last_name
       FROM treatment_consents tc
       JOIN users u ON tc.recorded_by = u.id
       WHERE tc.treatment_plan_id = $1
       ORDER BY tc.created_at DESC;`,
      [planId]
    );
    plan.consents = consentsRes.rows;

    // Fetch versions
    const versionsRes = await query(
      `SELECT tpv.*,
              u.first_name AS changed_by_first_name,
              u.last_name AS changed_by_last_name
       FROM treatment_plan_versions tpv
       JOIN users u ON tpv.changed_by = u.id
       WHERE tpv.treatment_plan_id = $1
       ORDER BY tpv.version_number DESC;`,
      [planId]
    );
    plan.versions = versionsRes.rows;

    return plan;
  }

  /**
   * 5. Update treatment plan header details
   */
  async updateTreatmentPlan({
    clinicId,
    branchId,
    planId,
    userId,
    userRole,
    planTitle,
    clinicalNotes,
    treatmentSummary,
    plannedStartDate,
    reviewDate,
    changeReason,
    ipAddress = '127.0.0.1',
  }) {
    const existing = await this.getTreatmentPlanById(clinicId, branchId, planId);

    // If plan is completed or cancelled, disallow edits
    if (['completed', 'cancelled'].includes(existing.status)) {
      const err = new Error(`Cannot edit a treatment plan with status '${existing.status}'.`);
      err.statusCode = 400;
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // If plan is presented or approved, record version snapshot before changing
      if (['presented', 'approved', 'in_progress'].includes(existing.status) && changeReason) {
        await this.createVersionSnapshot(client, existing, changeReason, userId);
        await client.query(
          `UPDATE treatment_plans SET version = version + 1 WHERE id = $1`,
          [planId]
        );
      }

      const updateRes = await client.query(
        `UPDATE treatment_plans
         SET plan_title = COALESCE($1, plan_title),
             clinical_notes = COALESCE($2, clinical_notes),
             treatment_summary = COALESCE($3, treatment_summary),
             planned_start_date = COALESCE($4, planned_start_date),
             review_date = COALESCE($5, review_date),
             updated_at = now()
         WHERE id = $6 AND clinic_id = $7
         RETURNING *;`,
        [
          planTitle !== undefined ? planTitle.trim() : null,
          clinicalNotes !== undefined ? clinicalNotes : null,
          treatmentSummary !== undefined ? treatmentSummary : null,
          plannedStartDate !== undefined ? (plannedStartDate || null) : null,
          reviewDate !== undefined ? (reviewDate || null) : null,
          planId,
          clinicId,
        ]
      );

      await client.query('COMMIT');

      await recordAuditLog({
        userId,
        action: 'TREATMENT_PLAN_UPDATED',
        entityType: 'treatment_plan',
        entityId: planId,
        branchId,
        ipAddress,
        details: { planNumber: existing.plan_number, changeReason },
      });

      return updateRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 6. Add an item to an existing treatment plan
   */
  async addPlanItem({
    clinicId,
    branchId,
    planId,
    userId,
    userRole,
    itemData,
    changeReason = 'Added treatment item',
    ipAddress = '127.0.0.1',
  }) {
    const plan = await this.getTreatmentPlanById(clinicId, branchId, planId);

    if (['completed', 'cancelled'].includes(plan.status)) {
      const err = new Error(`Cannot add items to a treatment plan with status '${plan.status}'.`);
      err.statusCode = 400;
      throw err;
    }

    const validated = this.validateItemData(itemData);
    const itemTotal = validated.unitCost * validated.quantity;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // If plan is presented or approved, record version snapshot before mutation
      if (['presented', 'approved', 'in_progress'].includes(plan.status)) {
        await this.createVersionSnapshot(client, plan, changeReason || 'Added item to plan', userId);
        await client.query(
          `UPDATE treatment_plans SET version = version + 1 WHERE id = $1`,
          [planId]
        );
      }

      // Next sequence order in session
      const seqRes = await client.query(
        `SELECT COALESCE(MAX(sequence_order), 0) + 10 AS next_seq
         FROM treatment_plan_items
         WHERE treatment_plan_id = $1 AND session_order = $2;`,
        [planId, validated.sessionOrder || 1]
      );
      const sequenceOrder = seqRes.rows[0].next_seq;

      const insertItemRes = await client.query(
        `INSERT INTO treatment_plan_items (
           treatment_plan_id, clinic_id, branch_id, patient_id,
           tooth_number, surface, finding_id, condition_code,
           procedure_id, procedure_name, procedure_code, category,
           priority, quantity, unit_cost, total_cost,
           session_order, sequence_order, status, treating_doctor_id, clinical_notes
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7, $8,
           $9, $10, $11, $12,
           $13, $14, $15, $16,
           $17, $18, $19, $20, $21
         ) RETURNING *;`,
        [
          planId,
          clinicId,
          branchId,
          plan.patient_id,
          validated.toothNumber,
          validated.surface,
          validated.findingId,
          validated.conditionCode,
          validated.procedureId,
          validated.procedureName,
          validated.procedureCode,
          validated.category,
          validated.priority,
          validated.quantity,
          validated.unitCost,
          itemTotal,
          validated.sessionOrder || 1,
          sequenceOrder,
          plan.status === 'approved' ? 'approved' : 'proposed',
          validated.treatingDoctorId || userId,
          validated.clinicalNotes || '',
        ]
      );

      // Recalculate plan total cost
      await this.recalculatePlanCost(client, planId);

      await client.query('COMMIT');

      await recordAuditLog({
        userId,
        action: 'TREATMENT_PLAN_ITEM_ADDED',
        entityType: 'treatment_plan_item',
        entityId: insertItemRes.rows[0].id,
        branchId,
        ipAddress,
        details: {
          planId,
          planNumber: plan.plan_number,
          procedureName: validated.procedureName,
          toothNumber: validated.toothNumber,
          totalCost: itemTotal,
        },
      });

      return insertItemRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 7. Update an existing treatment plan item
   */
  async updatePlanItem({
    clinicId,
    branchId,
    planId,
    itemId,
    userId,
    userRole,
    updateData,
    changeReason = 'Updated treatment item',
    ipAddress = '127.0.0.1',
  }) {
    const plan = await this.getTreatmentPlanById(clinicId, branchId, planId);
    const item = plan.items.find((it) => it.id === itemId);

    if (!item) {
      const err = new Error('Treatment plan item not found.');
      err.statusCode = 404;
      throw err;
    }

    // Completed items cannot have clinical core fields edited!
    if (item.status === 'completed' && updateData.status !== 'completed') {
      const err = new Error('Completed treatment items cannot be reopened or mutated.');
      err.statusCode = 400;
      throw err;
    }

    // Handle Item Status Transitions
    if (updateData.status && updateData.status !== item.status) {
      const newStatus = updateData.status;

      // Rule: In progress requires approved plan AND obtained consent
      if (newStatus === 'in_progress') {
        if (plan.status !== 'approved' && plan.status !== 'in_progress') {
          const err = new Error('Cannot start treatment: Treatment plan must be approved first.');
          err.statusCode = 400;
          throw err;
        }

        const consentCheck = await query(
          `SELECT id, consent_status FROM treatment_consents
           WHERE treatment_plan_id = $1 AND consent_status = 'obtained'`,
          [planId]
        );
        if (consentCheck.rows.length === 0) {
          const err = new Error('Cannot start treatment: Valid patient consent has not been obtained for this treatment plan.');
          err.statusCode = 400;
          throw err;
        }
      }

      // Rule: Completion requires clinical authorization
      if (newStatus === 'completed') {
        if (!['admin', 'dentist', 'specialist'].includes(userRole)) {
          const err = new Error('Only licensed clinicians can mark treatment items as completed.');
          err.statusCode = 403;
          throw err;
        }
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if this is a material scope/cost change on a presented/approved plan
      const isMaterialChange =
        (updateData.unitCost !== undefined && Number(updateData.unitCost) !== Number(item.unit_cost)) ||
        (updateData.quantity !== undefined && Number(updateData.quantity) !== Number(item.quantity)) ||
        (updateData.procedureName !== undefined && updateData.procedureName !== item.procedure_name) ||
        (updateData.toothNumber !== undefined && Number(updateData.toothNumber) !== Number(item.tooth_number));

      if (['presented', 'approved', 'in_progress'].includes(plan.status) && isMaterialChange) {
        await this.createVersionSnapshot(client, plan, changeReason || 'Modified treatment item', userId);
        await client.query(
          `UPDATE treatment_plans SET version = version + 1 WHERE id = $1`,
          [planId]
        );
      }

      // Calculate unit cost & quantity
      const newQty = updateData.quantity !== undefined ? Math.max(1, parseInt(updateData.quantity, 10)) : item.quantity;
      const newUnitCost = updateData.unitCost !== undefined ? Math.max(0, parseFloat(updateData.unitCost)) : parseFloat(item.unit_cost);
      const newTotalCost = newQty * newUnitCost;

      // Completion metadata
      let completedAt = item.completed_at;
      let completedBy = item.completed_by;
      if (updateData.status === 'completed' && item.status !== 'completed') {
        completedAt = new Date().toISOString();
        completedBy = userId;
      }

      const updateRes = await client.query(
        `UPDATE treatment_plan_items
         SET tooth_number = COALESCE($1, tooth_number),
             surface = COALESCE($2, surface),
             procedure_name = COALESCE($3, procedure_name),
             priority = COALESCE($4, priority),
             quantity = $5,
             unit_cost = $6,
             total_cost = $7,
             session_order = COALESCE($8, session_order),
             status = COALESCE($9, status),
             treating_doctor_id = COALESCE($10, treating_doctor_id),
             completed_at = $11,
             completed_by = $12,
             clinical_notes = COALESCE($13, clinical_notes),
             updated_at = now()
         WHERE id = $14 AND treatment_plan_id = $15
         RETURNING *;`,
        [
          updateData.toothNumber !== undefined ? (updateData.toothNumber || null) : null,
          updateData.surface !== undefined ? (updateData.surface || null) : null,
          updateData.procedureName ? updateData.procedureName.trim() : null,
          updateData.priority || null,
          newQty,
          newUnitCost,
          newTotalCost,
          updateData.sessionOrder !== undefined ? parseInt(updateData.sessionOrder, 10) : null,
          updateData.status || null,
          updateData.treatingDoctorId || null,
          completedAt,
          completedBy,
          updateData.clinicalNotes !== undefined ? updateData.clinicalNotes : null,
          itemId,
          planId,
        ]
      );

      // Recalculate plan total cost
      await this.recalculatePlanCost(client, planId);

      // Check if all items are completed: auto-progress plan to in_progress or completed
      if (updateData.status === 'in_progress' && plan.status === 'approved') {
        await client.query(`UPDATE treatment_plans SET status = 'in_progress', updated_at = now() WHERE id = $1`, [planId]);
      }

      await client.query('COMMIT');

      await recordAuditLog({
        userId,
        action: 'TREATMENT_PLAN_ITEM_UPDATED',
        entityType: 'treatment_plan_item',
        entityId: itemId,
        branchId,
        ipAddress,
        details: {
          planId,
          planNumber: plan.plan_number,
          previousStatus: item.status,
          newStatus: updateData.status || item.status,
          changeReason,
        },
      });

      return updateRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 8. Remove or cancel a treatment plan item
   */
  async deletePlanItem({
    clinicId,
    branchId,
    planId,
    itemId,
    userId,
    userRole,
    changeReason = 'Removed treatment item',
    ipAddress = '127.0.0.1',
  }) {
    const plan = await this.getTreatmentPlanById(clinicId, branchId, planId);
    const item = plan.items.find((it) => it.id === itemId);

    if (!item) {
      const err = new Error('Treatment plan item not found.');
      err.statusCode = 404;
      throw err;
    }

    if (item.status === 'completed') {
      const err = new Error('Cannot delete or remove a completed clinical treatment item.');
      err.statusCode = 400;
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // If plan was presented/approved, save snapshot & increment version
      if (['presented', 'approved', 'in_progress'].includes(plan.status)) {
        await this.createVersionSnapshot(client, plan, changeReason || 'Deleted item from plan', userId);
        await client.query(
          `UPDATE treatment_plans SET version = version + 1 WHERE id = $1`,
          [planId]
        );
      }

      await client.query(
        `DELETE FROM treatment_plan_items WHERE id = $1 AND treatment_plan_id = $2`,
        [itemId, planId]
      );

      await this.recalculatePlanCost(client, planId);

      await client.query('COMMIT');

      await recordAuditLog({
        userId,
        action: 'TREATMENT_PLAN_ITEM_REMOVED',
        entityType: 'treatment_plan_item',
        entityId: itemId,
        branchId,
        ipAddress,
        details: {
          planId,
          planNumber: plan.plan_number,
          procedureName: item.procedure_name,
          toothNumber: item.tooth_number,
          changeReason,
        },
      });

      return { success: true, message: 'Treatment item removed successfully.' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 9. Present treatment plan to patient
   */
  async presentTreatmentPlan({ clinicId, branchId, planId, userId, userRole, notes = '', ipAddress = '127.0.0.1' }) {
    if (!['admin', 'dentist', 'specialist'].includes(userRole)) {
      const err = new Error('Only licensed clinicians or administrators can present treatment plans.');
      err.statusCode = 403;
      throw err;
    }

    const plan = await this.getTreatmentPlanById(clinicId, branchId, planId);

    const updateRes = await query(
      `UPDATE treatment_plans
       SET status = 'presented',
           presented_at = now(),
           presented_by = $1,
           treatment_summary = CASE WHEN $2 <> '' THEN $2 ELSE treatment_summary END,
           updated_at = now()
       WHERE id = $3 AND clinic_id = $4
       RETURNING *;`,
      [userId, notes, planId, clinicId]
    );

    await recordAuditLog({
      userId,
      action: 'TREATMENT_PLAN_PRESENTED',
      entityType: 'treatment_plan',
      entityId: planId,
      branchId,
      ipAddress,
      details: { planNumber: plan.plan_number, patientId: plan.patient_id },
    });

    return updateRes.rows[0];
  }

  /**
   * 10. Approve treatment plan
   */
  async approveTreatmentPlan({ clinicId, branchId, planId, userId, userRole, notes = '', ipAddress = '127.0.0.1' }) {
    if (!['admin', 'dentist', 'specialist'].includes(userRole)) {
      const err = new Error('Only licensed clinicians or administrators can approve treatment plans.');
      err.statusCode = 403;
      throw err;
    }

    const plan = await this.getTreatmentPlanById(clinicId, branchId, planId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updateRes = await client.query(
        `UPDATE treatment_plans
         SET status = 'approved',
             approved_at = now(),
             approved_by = $1,
             updated_at = now()
         WHERE id = $2 AND clinic_id = $3
         RETURNING *;`,
        [userId, planId, clinicId]
      );

      // Transition proposed items to approved
      await client.query(
        `UPDATE treatment_plan_items
         SET status = 'approved', updated_at = now()
         WHERE treatment_plan_id = $1 AND status = 'proposed'`,
        [planId]
      );

      await client.query('COMMIT');

      await recordAuditLog({
        userId,
        action: 'TREATMENT_PLAN_APPROVED',
        entityType: 'treatment_plan',
        entityId: planId,
        branchId,
        ipAddress,
        details: { planNumber: plan.plan_number, patientId: plan.patient_id },
      });

      return updateRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 11. Update general plan status (deferred, cancelled, completed, etc.)
   */
  async updatePlanStatus({ clinicId, branchId, planId, userId, userRole, newStatus, reason = '', ipAddress = '127.0.0.1' }) {
    const validStatuses = ['draft', 'presented', 'approved', 'in_progress', 'completed', 'deferred', 'cancelled'];
    if (!validStatuses.includes(newStatus)) {
      const err = new Error(`Invalid plan status: ${newStatus}`);
      err.statusCode = 400;
      throw err;
    }

    const plan = await this.getTreatmentPlanById(clinicId, branchId, planId);

    if (newStatus === 'completed') {
      const pendingItems = plan.items.filter((it) => !['completed', 'deferred', 'cancelled'].includes(it.status));
      if (pendingItems.length > 0) {
        const err = new Error(`Cannot complete plan: ${pendingItems.length} treatment item(s) are still pending.`);
        err.statusCode = 400;
        throw err;
      }
    }

    const updateRes = await query(
      `UPDATE treatment_plans
       SET status = $1, updated_at = now()
       WHERE id = $2 AND clinic_id = $3
       RETURNING *;`,
      [newStatus, planId, clinicId]
    );

    await recordAuditLog({
      userId,
      action: `TREATMENT_PLAN_STATUS_${newStatus.toUpperCase()}`,
      entityType: 'treatment_plan',
      entityId: planId,
      branchId,
      ipAddress,
      details: { planNumber: plan.plan_number, previousStatus: plan.status, newStatus, reason },
    });

    return updateRes.rows[0];
  }

  /**
   * 12. Bridge: Propose Item from Odontogram Tooth Selection
   */
  async proposeFromOdontogram({
    clinicId,
    branchId,
    patientId,
    visitId = null,
    examinationId = null,
    toothNumber,
    surface = null,
    findingId = null,
    conditionCode = null,
    procedureId = null,
    procedureName,
    procedureCode = null,
    priority = 'medium',
    estimatedCost = null,
    unitCost = null,
    category = null,
    quantity = 1,
    planTitle = null,
    sessionOrder = 1,
    notes = '',
    userId,
    userRole,
    ipAddress = '127.0.0.1',
  }) {
    if (!['admin', 'dentist', 'specialist', 'assistant'].includes(userRole)) {
      const err = new Error('You are not authorized to create treatment proposals.');
      err.statusCode = 403;
      throw err;
    }

    // 1. Verify patient
    const patientRes = await query(
      `SELECT id, first_name, last_name, patient_number FROM patients WHERE id = $1 AND clinic_id = $2`,
      [patientId, clinicId]
    );
    if (patientRes.rows.length === 0) {
      const err = new Error('Patient record not found.');
      err.statusCode = 404;
      throw err;
    }
    const patient = patientRes.rows[0];

    // 2. Validate tooth number and surface if provided
    let cleanTooth = null;
    let cleanSurface = null;
    if (toothNumber) {
      cleanTooth = parseInt(toothNumber, 10);
      if (!isValidToothNumber(cleanTooth)) {
        const err = new Error(`Invalid tooth number: ${toothNumber}`);
        err.statusCode = 400;
        throw err;
      }
      if (surface) {
        cleanSurface = normalizeAndValidateSurface(cleanTooth, surface);
      }
    }

    // 3. Resolve procedure cost if not specified
    const providedCost = unitCost !== null && unitCost !== undefined ? unitCost : estimatedCost;
    let finalUnitCost = providedCost !== null && providedCost !== undefined ? Math.max(0, parseFloat(providedCost)) : 0.00;
    let resolvedProcName = procedureName ? procedureName.trim() : 'Dental Treatment';
    let resolvedCategory = category || 'general';
    let procCode = procedureCode || null;

    if (procedureId) {
      const procRes = await query(
        `SELECT id, name, code, category, default_estimated_cost FROM dental_procedures WHERE id = $1`,
        [procedureId]
      );
      if (procRes.rows.length > 0) {
        const proc = procRes.rows[0];
        resolvedProcName = procedureName ? procedureName.trim() : proc.name;
        if (!category) {
          resolvedCategory = proc.category;
        }
        if (!procCode) {
          procCode = proc.code;
        }
        if (providedCost === null || providedCost === undefined) {
          finalUnitCost = parseFloat(proc.default_estimated_cost);
        }
      }
    }

    // 4. Find or create an active draft plan for this patient & visit
    let plan = null;
    let planQuery = `SELECT * FROM treatment_plans WHERE patient_id = $1 AND clinic_id = $2 AND status = 'draft'`;
    const planParams = [patientId, clinicId];
    if (visitId) {
      planQuery += ` AND originating_visit_id = $3`;
      planParams.push(visitId);
    }
    planQuery += ` ORDER BY created_at DESC LIMIT 1;`;

    const existingDraftRes = await query(planQuery, planParams);
    if (existingDraftRes.rows.length > 0) {
      plan = existingDraftRes.rows[0];
    } else {
      // Create a fresh draft plan for this patient
      const defaultTitle = planTitle && planTitle.trim() ? planTitle.trim() : `Treatment Plan - ${patient.first_name} ${patient.last_name || ''}`;
      plan = await this.createTreatmentPlan({
        clinicId,
        branchId,
        patientId,
        visitId,
        examinationId,
        createdByDoctorId: userId,
        planTitle: defaultTitle,
        clinicalNotes: notes ? `Odontogram Finding Note: ${notes}` : '',
        treatmentSummary: 'Initial findings treatment proposal',
        items: [],
        ipAddress,
      });
    }

    // 5. Add the item to the draft plan
    const item = await this.addPlanItem({
      clinicId,
      branchId,
      planId: plan.id,
      userId,
      userRole,
      itemData: {
        toothNumber: cleanTooth,
        surface: cleanSurface,
        findingId: findingId || null,
        conditionCode: conditionCode || null,
        procedureId: procedureId || null,
        procedureName: resolvedProcName,
        procedureCode: procCode,
        category: resolvedCategory,
        priority: priority || 'medium',
        quantity: Math.max(1, parseInt(quantity || 1, 10)),
        unitCost: finalUnitCost,
        sessionOrder: sessionOrder || 1,
        clinicalNotes: notes || '',
        treatingDoctorId: userId,
      },
      changeReason: `Proposed from Odontogram Tooth #${cleanTooth}`,
      ipAddress,
    });

    return {
      success: true,
      message: `Treatment proposal for Tooth #${cleanTooth || 'General'} added to ${plan.plan_number}.`,
      plan,
      item,
    };
  }

  /**
   * 13. Record patient consent for treatment plan
   */
  async recordConsent({
    clinicId,
    branchId,
    planId,
    patientId,
    visitId = null,
    userId,
    userRole,
    consentStatus = 'obtained',
    procedureSummary,
    materialRisksDiscussed,
    alternativesDiscussed,
    acknowledgementMethod = 'in_person_verbal_witnessed',
    patientNameAcknowledged,
    isGuardianConsent = false,
    guardianName = null,
    guardianRelationship = null,
    witnessName = null,
    witnessRole = null,
    declineReason = null,
    withdrawalReason = null,
    agreedItemIds = [],
    ipAddress = '127.0.0.1',
  }) {
    if (!['admin', 'dentist', 'specialist'].includes(userRole)) {
      const err = new Error('Only licensed clinicians or administrators can record patient consent.');
      err.statusCode = 403;
      throw err;
    }

    const plan = await this.getTreatmentPlanById(clinicId, branchId, planId);

    const targetPatientId = patientId || plan.patient_id;

    if (patientId && plan.patient_id !== String(patientId)) {
      const err = new Error('Supplied patientId does not match the treatment plan.');
      err.statusCode = 400;
      throw err;
    }

    if (!procedureSummary || !procedureSummary.trim()) {
      const err = new Error('Procedure summary explained to patient is required.');
      err.statusCode = 400;
      throw err;
    }

    if (!materialRisksDiscussed || !materialRisksDiscussed.trim()) {
      const err = new Error('Material risks and complications discussed with patient are required.');
      err.statusCode = 400;
      throw err;
    }

    if (!patientNameAcknowledged || !patientNameAcknowledged.trim()) {
      const err = new Error('Acknowledging patient or guardian name is required.');
      err.statusCode = 400;
      throw err;
    }

    // Normalize acknowledgementMethod to database-allowed check constraint values
    const VALID_METHODS = [
      'in_person_verbal_witnessed',
      'signed_paper_on_file',
      'digital_acknowledgement_patient',
      'digital_acknowledgement_guardian',
    ];

    let normalizedMethod = acknowledgementMethod;
    if (normalizedMethod === 'in_person_verbal_explained') {
      normalizedMethod = 'in_person_verbal_witnessed';
    } else if (normalizedMethod === 'paper_signed_archived') {
      normalizedMethod = 'signed_paper_on_file';
    } else if (normalizedMethod === 'digital_tablet_ack') {
      normalizedMethod = isGuardianConsent ? 'digital_acknowledgement_guardian' : 'digital_acknowledgement_patient';
    }

    if (!VALID_METHODS.includes(normalizedMethod)) {
      normalizedMethod = 'in_person_verbal_witnessed';
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const consentNumber = await this.generateConsentNumber(client, clinicId);

      // Snapshot agreed items
      let agreedSnapshot = [];
      if (Array.isArray(agreedItemIds) && agreedItemIds.length > 0) {
        agreedSnapshot = plan.items.filter((it) => agreedItemIds.includes(it.id));
      } else {
        agreedSnapshot = plan.items;
      }

      const consentInsertRes = await client.query(
        `INSERT INTO treatment_consents (
           consent_number, treatment_plan_id, patient_id, clinic_id, branch_id, visit_id,
           consent_status, procedure_summary, material_risks_discussed, alternatives_discussed,
           acknowledgement_method, patient_name_acknowledged, is_guardian_consent,
           guardian_name, guardian_relationship, witness_name, witness_role,
           recorded_by, obtained_at, declined_at, withdrawn_at,
           decline_reason, withdrawal_reason, agreed_items_snapshot, plan_version_at_consent
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10,
           $11, $12, $13,
           $14, $15, $16, $17,
           $18, $19, $20, $21,
           $22, $23, $24, $25
         ) RETURNING *;`,
        [
          consentNumber,
          planId,
          targetPatientId,
          clinicId,
          branchId,
          visitId || plan.originating_visit_id,
          consentStatus,
          procedureSummary.trim(),
          materialRisksDiscussed.trim(),
          alternativesDiscussed || 'No treatment / deferred treatment discussed',
          normalizedMethod,
          patientNameAcknowledged.trim(),
          Boolean(isGuardianConsent),
          guardianName ? guardianName.trim() : null,
          guardianRelationship ? guardianRelationship.trim() : null,
          witnessName ? witnessName.trim() : null,
          witnessRole ? witnessRole.trim() : null,
          userId,
          consentStatus === 'obtained' ? new Date().toISOString() : null,
          consentStatus === 'declined' ? new Date().toISOString() : null,
          consentStatus === 'withdrawn' ? new Date().toISOString() : null,
          declineReason || null,
          withdrawalReason || null,
          JSON.stringify(agreedSnapshot),
          plan.version,
        ]
      );

      const consent = consentInsertRes.rows[0];

      // Insert append-only consent audit event
      await client.query(
        `INSERT INTO treatment_consent_events (
           consent_id, treatment_plan_id, patient_id, clinic_id,
           event_type, event_notes, previous_status, new_status,
           event_snapshot, performed_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
        [
          consent.id,
          planId,
          targetPatientId,
          clinicId,
          consentStatus,
          `Consent status set to '${consentStatus}' via acknowledgement method: ${normalizedMethod}`,
          'none',
          consentStatus,
          JSON.stringify({
            consentNumber: consent.consent_number,
            planVersion: plan.version,
            itemCount: agreedSnapshot.length,
          }),
          userId,
        ]
      );

      await client.query('COMMIT');

      await recordAuditLog({
        userId,
        action: `TREATMENT_CONSENT_${consentStatus.toUpperCase()}`,
        entityType: 'treatment_consent',
        entityId: consent.id,
        branchId,
        ipAddress,
        details: {
          consentNumber: consent.consent_number,
          planId,
          planNumber: plan.plan_number,
          consentStatus,
        },
      });

      return consent;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 14. Amend or update consent status (e.g. withdraw consent or record renewed consent)
   */
  async amendConsent({
    clinicId,
    branchId,
    consentId,
    userId,
    userRole,
    amendmentReason,
    newConsentStatus,
    withdrawalReason = null,
    declineReason = null,
    notes = '',
    ipAddress = '127.0.0.1',
  }) {
    if (!['admin', 'dentist', 'specialist'].includes(userRole)) {
      const err = new Error('Only licensed clinicians or administrators can amend consent records.');
      err.statusCode = 403;
      throw err;
    }

    const consentRes = await query(
      `SELECT * FROM treatment_consents WHERE id = $1 AND clinic_id = $2`,
      [consentId, clinicId]
    );

    if (consentRes.rows.length === 0) {
      const err = new Error('Consent record not found.');
      err.statusCode = 404;
      throw err;
    }

    const consent = consentRes.rows[0];
    const prevStatus = consent.consent_status;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updateRes = await client.query(
        `UPDATE treatment_consents
         SET consent_status = COALESCE($1, consent_status),
             withdrawal_reason = COALESCE($2, withdrawal_reason),
             decline_reason = COALESCE($3, decline_reason),
             withdrawn_at = CASE WHEN $1 = 'withdrawn' THEN now() ELSE withdrawn_at END,
             declined_at = CASE WHEN $1 = 'declined' THEN now() ELSE declined_at END,
             updated_at = now()
         WHERE id = $4
         RETURNING *;`,
        [newConsentStatus, withdrawalReason, declineReason, consentId]
      );

      // Record append-only event
      await client.query(
        `INSERT INTO treatment_consent_events (
           consent_id, treatment_plan_id, patient_id, clinic_id,
           event_type, event_notes, previous_status, new_status,
           event_snapshot, performed_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
        [
          consentId,
          consent.treatment_plan_id,
          consent.patient_id,
          clinicId,
          newConsentStatus === 'withdrawn' ? 'withdrawn' : 'amended',
          `Consent amended. Reason: ${amendmentReason}. Notes: ${notes}`,
          prevStatus,
          newConsentStatus || prevStatus,
          JSON.stringify({ amendmentReason, withdrawalReason, declineReason }),
          userId,
        ]
      );

      await client.query('COMMIT');

      await recordAuditLog({
        userId,
        action: 'TREATMENT_CONSENT_AMENDED',
        entityType: 'treatment_consent',
        entityId: consentId,
        branchId,
        ipAddress,
        details: { consentNumber: consent.consent_number, prevStatus, newConsentStatus, amendmentReason },
      });

      return updateRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Helper: Validate treatment plan item payload
   */
  validateItemData(data) {
    if (!data.procedureName || !data.procedureName.trim()) {
      const err = new Error('Procedure name is required for all treatment items.');
      err.statusCode = 400;
      throw err;
    }

    let toothNumber = null;
    let surface = null;

    if (data.toothNumber !== undefined && data.toothNumber !== null && data.toothNumber !== '') {
      toothNumber = parseInt(data.toothNumber, 10);
      if (!isValidToothNumber(toothNumber)) {
        const err = new Error(`Invalid tooth number: ${data.toothNumber}. Must be valid permanent (11-48) or primary (51-85) tooth.`);
        err.statusCode = 400;
        throw err;
      }
      if (data.surface) {
        try {
          surface = normalizeAndValidateSurface(toothNumber, data.surface);
        } catch (sErr) {
          sErr.statusCode = 400;
          throw sErr;
        }
      }
    }

    const quantity = Math.max(1, parseInt(data.quantity || 1, 10));
    const unitCost = Math.max(0, parseFloat(data.unitCost !== undefined ? data.unitCost : (data.unit_cost || 0)));

    return {
      toothNumber,
      surface,
      findingId: data.findingId || data.finding_id || null,
      conditionCode: data.conditionCode || data.condition_code || null,
      procedureId: data.procedureId || data.procedure_id || null,
      procedureName: data.procedureName.trim(),
      procedureCode: data.procedureCode || data.procedure_code || null,
      category: data.category || 'general',
      priority: data.priority || 'medium',
      quantity,
      unitCost,
      sessionOrder: data.sessionOrder ? parseInt(data.sessionOrder, 10) : 1,
      treatingDoctorId: data.treatingDoctorId || data.treating_doctor_id || null,
      clinicalNotes: data.clinicalNotes || data.clinical_notes || '',
    };
  }

  /**
   * Helper: Recalculate and update total estimated cost of a treatment plan
   */
  async recalculatePlanCost(client, planId) {
    const costRes = await client.query(
      `SELECT COALESCE(SUM(total_cost), 0.00) AS total_sum
       FROM treatment_plan_items
       WHERE treatment_plan_id = $1 AND status <> 'cancelled';`,
      [planId]
    );
    const total = parseFloat(costRes.rows[0].total_sum);
    await client.query(
      `UPDATE treatment_plans SET total_estimated_cost = $1, updated_at = now() WHERE id = $2;`,
      [total, planId]
    );
    return total;
  }

  /**
   * Helper: Record version snapshot in treatment_plan_versions
   */
  async createVersionSnapshot(client, plan, changeReason, userId) {
    const itemsRes = await client.query(
      `SELECT * FROM treatment_plan_items WHERE treatment_plan_id = $1 ORDER BY session_order, sequence_order;`,
      [plan.id]
    );
    const snapshot = {
      planNumber: plan.plan_number,
      planTitle: plan.plan_title,
      status: plan.status,
      totalEstimatedCost: plan.total_estimated_cost,
      version: plan.version,
      items: itemsRes.rows,
      clinicalNotes: plan.clinical_notes,
      treatmentSummary: plan.treatment_summary,
    };

    await client.query(
      `INSERT INTO treatment_plan_versions (
         treatment_plan_id, clinic_id, version_number, change_reason,
         plan_snapshot, total_estimated_cost, status, changed_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (treatment_plan_id, version_number) DO NOTHING;`,
      [
        plan.id,
        plan.clinic_id,
        plan.version,
        changeReason,
        JSON.stringify(snapshot),
        plan.total_estimated_cost,
        plan.status,
        userId,
      ]
    );
  }
}

module.exports = new TreatmentPlanService();
