/**
 * Prescription & Medication Management Controller
 * Handles HTTP requests, authentication context, parameter normalization, and response serialization.
 */

const prescriptionService = require('../services/prescriptionService');

/**
 * Helper to resolve and validate authorized branch id
 */
const getBranchId = (req, res) => {
  const branchId =
    req.headers['x-branch-id'] ||
    req.query.branchId ||
    req.body?.branchId ||
    req.body?.branch_id ||
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
 * 1. POST /api/clinical/prescriptions
 * Create a new prescription draft with optional initial medication items
 */
const createPrescription = async (req, res, next) => {
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
      treatment_plan_id,
      treatmentPlanId,
      treatment_plan_item_id,
      treatmentPlanItemId,
      diagnosis,
      general_instructions,
      generalInstructions,
      dietary_advice,
      dietaryAdvice,
      items,
    } = req.body;

    const targetPatientId = patient_id || patientId;
    if (!targetPatientId) {
      return res.status(400).json({
        success: false,
        message: 'patient_id is required to create a prescription.',
      });
    }

    const prescription = await prescriptionService.createPrescriptionDraft({
      clinicId,
      branchId,
      patientId: targetPatientId,
      visitId: visit_id || visitId || null,
      examinationId: examination_id || examinationId || null,
      treatmentPlanId: treatment_plan_id || treatmentPlanId || null,
      treatmentPlanItemId: treatment_plan_item_id || treatmentPlanItemId || null,
      prescribingDoctorId: userId,
      diagnosis: diagnosis || '',
      generalInstructions: general_instructions || generalInstructions || '',
      dietaryAdvice: dietary_advice || dietaryAdvice || '',
      items: items || [],
      userId,
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      message: `Prescription ${prescription.prescription_number} draft created successfully.`,
      prescription,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 2. GET /api/clinical/patients/:patientId/prescriptions
 * Retrieve all prescriptions for a patient
 */
const getPatientPrescriptions = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { patientId } = req.params;
    const { status, visitId } = req.query;

    const prescriptions = await prescriptionService.getPatientPrescriptions(clinicId, patientId, {
      status,
      visitId,
    });

    res.status(200).json({
      success: true,
      prescriptions,
      total: prescriptions.length,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 3. GET /api/clinical/visits/:visitId/prescriptions
 * Retrieve prescriptions linked to an active visit encounter
 */
const getVisitPrescriptions = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { visitId } = req.params;

    const prescriptions = await prescriptionService.getVisitPrescriptions(clinicId, visitId);

    res.status(200).json({
      success: true,
      prescriptions,
      total: prescriptions.length,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 4. GET /api/clinical/prescriptions/:id
 * Retrieve single prescription by ID with full medication items, patient context, and history
 */
const getPrescriptionById = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { id } = req.params;

    const prescription = await prescriptionService.getPrescriptionById(clinicId, id);

    res.status(200).json({
      success: true,
      prescription,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 5. PUT /api/clinical/prescriptions/:id
 * Update draft prescription header details
 */
const updatePrescriptionDraft = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const { id } = req.params;
    const {
      diagnosis,
      general_instructions,
      generalInstructions,
      dietary_advice,
      dietaryAdvice,
      treatment_plan_id,
      treatmentPlanId,
      treatment_plan_item_id,
      treatmentPlanItemId,
    } = req.body;

    const updated = await prescriptionService.updatePrescriptionDraft(
      clinicId,
      id,
      {
        diagnosis,
        generalInstructions: general_instructions !== undefined ? general_instructions : generalInstructions,
        dietaryAdvice: dietary_advice !== undefined ? dietary_advice : dietaryAdvice,
        treatmentPlanId: treatment_plan_id !== undefined ? treatment_plan_id : treatmentPlanId,
        treatmentPlanItemId: treatment_plan_item_id !== undefined ? treatment_plan_item_id : treatmentPlanItemId,
      },
      userId,
      req.ip
    );

    res.status(200).json({
      success: true,
      message: `Prescription ${updated.prescription_number} draft updated.`,
      prescription: updated,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 6. POST /api/clinical/prescriptions/:id/items
 * Add a medication item to a draft prescription
 */
const addPrescriptionItem = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const { id } = req.params;
    const {
      medicine_name,
      medicineName,
      generic_name,
      genericName,
      brand_name,
      brandName,
      dosage,
      dosage_form,
      dosageForm,
      route,
      frequency,
      duration,
      quantity,
      quantity_unit,
      quantityUnit,
      instructions,
      is_prn,
      isPrn,
      prn_indication,
      prnIndication,
      start_date,
      startDate,
      end_date,
      endDate,
      refills_allowed,
      refillsAllowed,
      additional_notes,
      additionalNotes,
      item_order,
      itemOrder,
    } = req.body;

    const item = await prescriptionService.addPrescriptionItem(
      clinicId,
      id,
      {
        medicineName: medicine_name || medicineName,
        genericName: generic_name || genericName,
        brandName: brand_name || brandName,
        dosage,
        dosageForm: dosage_form || dosageForm,
        route,
        frequency,
        duration,
        quantity,
        quantityUnit: quantity_unit || quantityUnit,
        instructions,
        isPrn: is_prn !== undefined ? is_prn : isPrn,
        prnIndication: prn_indication || prnIndication,
        startDate: start_date || startDate,
        endDate: end_date || endDate,
        refillsAllowed: refills_allowed !== undefined ? refills_allowed : refillsAllowed,
        additionalNotes: additional_notes || additionalNotes,
        itemOrder: item_order || itemOrder,
      },
      userId
    );

    res.status(201).json({
      success: true,
      message: `Medication item "${item.medicine_name}" added to prescription.`,
      item,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 7. PUT /api/clinical/prescriptions/:id/items/:itemId
 * Update a medication item in a draft prescription
 */
const updatePrescriptionItem = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const { id, itemId } = req.params;
    const {
      medicine_name,
      medicineName,
      generic_name,
      genericName,
      brand_name,
      brandName,
      dosage,
      dosage_form,
      dosageForm,
      route,
      frequency,
      duration,
      quantity,
      quantity_unit,
      quantityUnit,
      instructions,
      is_prn,
      isPrn,
      prn_indication,
      prnIndication,
      start_date,
      startDate,
      end_date,
      endDate,
      refills_allowed,
      refillsAllowed,
      additional_notes,
      additionalNotes,
      item_order,
      itemOrder,
    } = req.body;

    const item = await prescriptionService.updatePrescriptionItem(
      clinicId,
      id,
      itemId,
      {
        medicineName: medicine_name !== undefined ? medicine_name : medicineName,
        genericName: generic_name !== undefined ? generic_name : genericName,
        brandName: brand_name !== undefined ? brand_name : brandName,
        dosage,
        dosageForm: dosage_form !== undefined ? dosage_form : dosageForm,
        route,
        frequency,
        duration,
        quantity,
        quantityUnit: quantity_unit !== undefined ? quantity_unit : quantityUnit,
        instructions,
        isPrn: is_prn !== undefined ? is_prn : isPrn,
        prnIndication: prn_indication !== undefined ? prn_indication : prnIndication,
        startDate: start_date !== undefined ? start_date : startDate,
        endDate: end_date !== undefined ? end_date : endDate,
        refillsAllowed: refills_allowed !== undefined ? refills_allowed : refillsAllowed,
        additionalNotes: additional_notes !== undefined ? additional_notes : additionalNotes,
        itemOrder: item_order !== undefined ? item_order : itemOrder,
      },
      userId
    );

    res.status(200).json({
      success: true,
      message: `Medication item updated.`,
      item,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 8. DELETE /api/clinical/prescriptions/:id/items/:itemId
 * Remove a medication item from a draft prescription
 */
const deletePrescriptionItem = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const { id, itemId } = req.params;

    const result = await prescriptionService.deletePrescriptionItem(clinicId, id, itemId, userId);

    res.status(200).json({
      success: true,
      message: 'Medication item removed from prescription.',
      deletedItem: result.item,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 9. POST /api/clinical/prescriptions/:id/sign
 * Doctor digital sign-off on prescription
 */
const signPrescription = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const { id } = req.params;
    const { allergy_acknowledgement, allergyAcknowledgement } = req.body;

    const ack = allergy_acknowledgement || allergyAcknowledgement || null;

    const prescription = await prescriptionService.signPrescription(
      clinicId,
      id,
      userId,
      ack,
      req.ip
    );

    res.status(200).json({
      success: true,
      message: `Prescription ${prescription.prescription_number} signed successfully.`,
      prescription,
    });
  } catch (err) {
    if (err.code === 'ALLERGY_CONFLICT_DETECTED') {
      return res.status(400).json({
        success: false,
        code: 'ALLERGY_CONFLICT_DETECTED',
        message: err.message,
        conflicts: err.conflicts,
        requiresAcknowledgement: true,
      });
    }
    next(err);
  }
};

/**
 * 10. POST /api/clinical/prescriptions/:id/cancel
 * Cancel a prescription with a required reason
 */
const cancelPrescription = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A non-empty cancellation reason is required.',
      });
    }

    const prescription = await prescriptionService.cancelPrescription(
      clinicId,
      id,
      userId,
      reason,
      req.ip
    );

    res.status(200).json({
      success: true,
      message: `Prescription ${prescription.prescription_number} has been cancelled.`,
      prescription,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 11. POST /api/clinical/prescriptions/:id/amend
 * Amend or replace a signed prescription with audit snapshot preservation
 */
const amendPrescription = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const { id } = req.params;
    const { reason, newItems, newDiagnosis, newInstructions } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'An amendment reason is required.',
      });
    }

    const result = await prescriptionService.amendPrescription(
      clinicId,
      id,
      userId,
      {
        reason,
        newItems,
        newDiagnosis,
        newInstructions,
      },
      req.ip
    );

    res.status(200).json({
      success: true,
      message: `Prescription amended. Replacement draft ${result.replacementPrescription.prescription_number} created.`,
      ...result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 12. GET /api/clinical/prescriptions/:id/print
 * Retrieve structured print data for browser print / PDF export
 */
const getPrintData = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { id } = req.params;

    const printData = await prescriptionService.getPrintData(clinicId, id);

    res.status(200).json({
      success: true,
      printData,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createPrescription,
  getPatientPrescriptions,
  getVisitPrescriptions,
  getPrescriptionById,
  updatePrescriptionDraft,
  addPrescriptionItem,
  updatePrescriptionItem,
  deletePrescriptionItem,
  signPrescription,
  cancelPrescription,
  amendPrescription,
  getPrintData,
};
