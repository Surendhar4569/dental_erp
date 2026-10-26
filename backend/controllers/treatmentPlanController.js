/**
 * Treatment Planning & Consent Management Controller
 */

const treatmentPlanService = require('../services/treatmentPlanService');

/**
 * Helper to resolve and validate authorized branch id
 */
const getBranchId = (req, res) => {
  const branchId =
    req.headers['x-branch-id'] ||
    req.query.branchId ||
    req.body?.branchId ||
    req.user?.authorizedBranchId;

  if (!branchId) {
    res.status(400).json({
      success: false,
      message: 'Branch context is required.',
    });
    return null;
  }

  if (
    !req.user.isPlatformAdmin &&
    req.user.assignedBranchIds &&
    !req.user.assignedBranchIds.includes(branchId)
  ) {
    res.status(403).json({
      success: false,
      message: 'Forbidden. You are not authorized to access this branch.',
    });
    return null;
  }

  return branchId;
};

/**
 * 1. GET /api/clinical/treatment-plans/procedures
 * Retrieve standard dental procedure catalog
 */
const getProcedures = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { category, search } = req.query;
    const procedures = await treatmentPlanService.getProcedures(clinicId, { category, search });
    res.status(200).json({
      success: true,
      procedures,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 2. POST /api/clinical/treatment-plans
 * Create a new treatment plan with optional initial items
 */
const createPlan = async (req, res, next) => {
  try {
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const { clinicId, id: userId } = req.user;
    const {
      patient_id,
      patientId,
      visit_id,
      visitId,
      examination_id,
      examinationId,
      plan_title,
      planTitle,
      clinical_notes,
      clinicalNotes,
      treatment_summary,
      treatmentSummary,
      planned_start_date,
      plannedStartDate,
      review_date,
      reviewDate,
      items,
    } = req.body;

    const targetPatientId = patient_id || patientId;
    if (!targetPatientId) {
      return res.status(400).json({
        success: false,
        message: 'patient_id is required to create a treatment plan.',
      });
    }

    const plan = await treatmentPlanService.createTreatmentPlan({
      clinicId,
      branchId,
      patientId: targetPatientId,
      visitId: visit_id || visitId || null,
      examinationId: examination_id || examinationId || null,
      createdByDoctorId: userId,
      planTitle: plan_title || planTitle || 'Comprehensive Treatment Plan',
      clinicalNotes: clinical_notes || clinicalNotes || '',
      treatmentSummary: treatment_summary || treatmentSummary || '',
      plannedStartDate: planned_start_date || plannedStartDate || null,
      reviewDate: review_date || reviewDate || null,
      items: items || [],
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      message: `Treatment plan ${plan.plan_number} created successfully.`,
      plan,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 3. GET /api/clinical/patients/:patientId/treatment-plans
 * Retrieve all treatment plans for a patient
 */
const getPatientPlans = async (req, res, next) => {
  try {
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const { clinicId } = req.user;
    const { patientId } = req.params;

    const plans = await treatmentPlanService.getPatientTreatmentPlans(clinicId, branchId, patientId);
    res.status(200).json({
      success: true,
      plans,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 4. GET /api/clinical/treatment-plans/:id
 * Retrieve a single treatment plan by ID
 */
const getPlanById = async (req, res, next) => {
  try {
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const { clinicId } = req.user;
    const { id } = req.params;

    const plan = await treatmentPlanService.getTreatmentPlanById(clinicId, branchId, id);
    res.status(200).json({
      success: true,
      plan,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 5. PUT /api/clinical/treatment-plans/:id
 * Update treatment plan details
 */
const updatePlan = async (req, res, next) => {
  try {
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const { clinicId, id: userId, role: userRole } = req.user;
    const { id } = req.params;
    const {
      plan_title,
      planTitle,
      clinical_notes,
      clinicalNotes,
      treatment_summary,
      treatmentSummary,
      planned_start_date,
      plannedStartDate,
      review_date,
      reviewDate,
      change_reason,
      changeReason,
    } = req.body;

    const updated = await treatmentPlanService.updateTreatmentPlan({
      clinicId,
      branchId,
      planId: id,
      userId,
      userRole,
      planTitle: plan_title !== undefined ? plan_title : planTitle,
      clinicalNotes: clinical_notes !== undefined ? clinical_notes : clinicalNotes,
      treatmentSummary: treatment_summary !== undefined ? treatment_summary : treatmentSummary,
      plannedStartDate: planned_start_date !== undefined ? planned_start_date : plannedStartDate,
      reviewDate: review_date !== undefined ? review_date : reviewDate,
      changeReason: change_reason || changeReason || 'Plan updated',
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: 'Treatment plan updated successfully.',
      plan: updated,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 6. POST /api/clinical/treatment-plans/:id/items
 * Add an item to a treatment plan
 */
const addPlanItem = async (req, res, next) => {
  try {
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const { clinicId, id: userId, role: userRole } = req.user;
    const { id } = req.params;
    const { item, change_reason, changeReason } = req.body;

    const itemData = item || req.body;
    const newItem = await treatmentPlanService.addPlanItem({
      clinicId,
      branchId,
      planId: id,
      userId,
      userRole,
      itemData,
      changeReason: change_reason || changeReason || 'Added item',
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      message: 'Treatment item added successfully.',
      item: newItem,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 7. PUT /api/clinical/treatment-plans/:id/items/:itemId
 * Update a treatment plan item
 */
const updatePlanItem = async (req, res, next) => {
  try {
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const { clinicId, id: userId, role: userRole } = req.user;
    const { id, itemId } = req.params;
    const { updateData, change_reason, changeReason } = req.body;

    const data = updateData || req.body;
    const updated = await treatmentPlanService.updatePlanItem({
      clinicId,
      branchId,
      planId: id,
      itemId,
      userId,
      userRole,
      updateData: data,
      changeReason: change_reason || changeReason || 'Updated item',
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: 'Treatment item updated successfully.',
      item: updated,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 8. DELETE /api/clinical/treatment-plans/:id/items/:itemId
 * Delete a treatment plan item
 */
const deletePlanItem = async (req, res, next) => {
  try {
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const { clinicId, id: userId, role: userRole } = req.user;
    const { id, itemId } = req.params;
    const { change_reason, changeReason } = req.body;

    const result = await treatmentPlanService.deletePlanItem({
      clinicId,
      branchId,
      planId: id,
      itemId,
      userId,
      userRole,
      changeReason: change_reason || changeReason || 'Removed item',
      ipAddress: req.ip,
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * 9. POST /api/clinical/treatment-plans/:id/present
 * Mark treatment plan as presented to patient
 */
const presentPlan = async (req, res, next) => {
  try {
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const { clinicId, id: userId, role: userRole } = req.user;
    const { id } = req.params;
    const { notes } = req.body;

    const presented = await treatmentPlanService.presentTreatmentPlan({
      clinicId,
      branchId,
      planId: id,
      userId,
      userRole,
      notes: notes || '',
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: `Treatment plan ${presented.plan_number} marked as presented.`,
      plan: presented,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 10. POST /api/clinical/treatment-plans/:id/approve
 * Approve treatment plan
 */
const approvePlan = async (req, res, next) => {
  try {
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const { clinicId, id: userId, role: userRole } = req.user;
    const { id } = req.params;
    const { notes } = req.body;

    const approved = await treatmentPlanService.approveTreatmentPlan({
      clinicId,
      branchId,
      planId: id,
      userId,
      userRole,
      notes: notes || '',
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: `Treatment plan ${approved.plan_number} approved successfully.`,
      plan: approved,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 11. PATCH /api/clinical/treatment-plans/:id/status
 * Update general plan status
 */
const updatePlanStatus = async (req, res, next) => {
  try {
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const { clinicId, id: userId, role: userRole } = req.user;
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'status is required.',
      });
    }

    const updated = await treatmentPlanService.updatePlanStatus({
      clinicId,
      branchId,
      planId: id,
      userId,
      userRole,
      newStatus: status,
      reason: reason || '',
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: `Treatment plan status updated to '${status}'.`,
      plan: updated,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 12. POST /api/clinical/treatment-plans/propose-item
 * Direct proposal bridge from Odontogram
 */
const proposeFromOdontogram = async (req, res, next) => {
  try {
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const { clinicId, id: userId, role: userRole } = req.user;
    const {
      patient_id,
      patientId,
      visit_id,
      visitId,
      examination_id,
      examinationId,
      tooth_number,
      toothNumber,
      surface,
      finding_id,
      findingId,
      condition_code,
      conditionCode,
      procedure_id,
      procedureId,
      procedure_name,
      procedureName,
      category,
      priority,
      quantity,
      estimated_cost,
      estimatedCost,
      unit_cost,
      unitCost,
      session_order,
      sessionOrder,
      notes,
    } = req.body;

    const targetPatientId = patient_id || patientId;
    if (!targetPatientId) {
      return res.status(400).json({
        success: false,
        message: 'patient_id is required to propose a treatment item.',
      });
    }

    const resolvedCost = estimated_cost !== undefined ? estimated_cost : (estimatedCost !== undefined ? estimatedCost : (unit_cost !== undefined ? unit_cost : unitCost));

    const result = await treatmentPlanService.proposeFromOdontogram({
      clinicId,
      branchId,
      patientId: targetPatientId,
      visitId: visit_id || visitId || null,
      examinationId: examination_id || examinationId || null,
      toothNumber: tooth_number !== undefined ? tooth_number : toothNumber,
      surface: surface || null,
      findingId: finding_id || findingId || null,
      conditionCode: condition_code || conditionCode || null,
      procedureId: procedure_id || procedureId || null,
      procedureName: procedure_name || procedureName,
      category: category || 'general',
      priority: priority || 'medium',
      quantity: quantity ? Math.max(1, parseInt(quantity, 10)) : 1,
      estimatedCost: resolvedCost !== undefined ? resolvedCost : null,
      sessionOrder: session_order || sessionOrder || 1,
      notes: notes || '',
      userId,
      userRole,
      ipAddress: req.ip,
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * 13. POST /api/clinical/treatment-plans/:id/consent
 * Record patient or guardian consent for treatment plan
 */
const recordConsent = async (req, res, next) => {
  try {
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const { clinicId, id: userId, role: userRole } = req.user;
    const { id } = req.params;
    const {
      patient_id,
      patientId,
      visit_id,
      visitId,
      consent_status,
      consentStatus,
      procedure_summary,
      procedureSummary,
      material_risks_discussed,
      materialRisksDiscussed,
      alternatives_discussed,
      alternativesDiscussed,
      acknowledgement_method,
      acknowledgementMethod,
      patient_name_acknowledged,
      patientNameAcknowledged,
      is_guardian_consent,
      isGuardianConsent,
      guardian_name,
      guardianName,
      guardian_relationship,
      guardianRelationship,
      witness_name,
      witnessName,
      witness_role,
      witnessRole,
      decline_reason,
      declineReason,
      withdrawal_reason,
      withdrawalReason,
      agreed_item_ids,
      agreedItemIds,
    } = req.body;

    const consent = await treatmentPlanService.recordConsent({
      clinicId,
      branchId,
      planId: id,
      patientId: patient_id || patientId,
      visitId: visit_id || visitId || null,
      userId,
      userRole,
      consentStatus: consent_status || consentStatus || 'obtained',
      procedureSummary: procedure_summary || procedureSummary,
      materialRisksDiscussed: material_risks_discussed || materialRisksDiscussed,
      alternativesDiscussed: alternatives_discussed || alternativesDiscussed || '',
      acknowledgementMethod: acknowledgement_method || acknowledgementMethod || 'in_person_verbal_witnessed',
      patientNameAcknowledged: patient_name_acknowledged || patientNameAcknowledged,
      isGuardianConsent: is_guardian_consent !== undefined ? is_guardian_consent : isGuardianConsent,
      guardianName: guardian_name || guardianName || null,
      guardianRelationship: guardian_relationship || guardianRelationship || null,
      witnessName: witness_name || witnessName || null,
      witnessRole: witness_role || witnessRole || null,
      declineReason: decline_reason || declineReason || null,
      withdrawalReason: withdrawal_reason || withdrawalReason || null,
      agreedItemIds: agreed_item_ids || agreedItemIds || [],
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      message: `Consent record ${consent.consent_number} saved with status '${consent.consent_status}'.`,
      consent,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 14. GET /api/clinical/treatment-plans/:id/consents
 * Retrieve consents and audit trail for a plan
 */
const getPlanConsents = async (req, res, next) => {
  try {
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const { clinicId } = req.user;
    const { id } = req.params;

    const plan = await treatmentPlanService.getTreatmentPlanById(clinicId, branchId, id);
    res.status(200).json({
      success: true,
      consents: plan.consents,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 15. POST /api/clinical/treatment-consents/:consentId/amend
 * Amend or update an existing consent record
 */
const amendConsent = async (req, res, next) => {
  try {
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const { clinicId, id: userId, role: userRole } = req.user;
    const { consentId } = req.params;
    const {
      amendment_reason,
      amendmentReason,
      new_consent_status,
      newConsentStatus,
      withdrawal_reason,
      withdrawalReason,
      decline_reason,
      declineReason,
      notes,
    } = req.body;

    const reason = amendment_reason || amendmentReason;
    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'amendment_reason is required to amend a consent record.',
      });
    }

    const updated = await treatmentPlanService.amendConsent({
      clinicId,
      branchId,
      consentId,
      userId,
      userRole,
      amendmentReason: reason.trim(),
      newConsentStatus: new_consent_status || newConsentStatus || null,
      withdrawalReason: withdrawal_reason || withdrawalReason || null,
      declineReason: decline_reason || declineReason || null,
      notes: notes || '',
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: `Consent ${updated.consent_number} amended successfully.`,
      consent: updated,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getProcedures,
  createPlan,
  getPatientPlans,
  getPlanById,
  updatePlan,
  addPlanItem,
  updatePlanItem,
  deletePlanItem,
  presentPlan,
  approvePlan,
  updatePlanStatus,
  proposeFromOdontogram,
  recordConsent,
  getPlanConsents,
  amendConsent,
};
