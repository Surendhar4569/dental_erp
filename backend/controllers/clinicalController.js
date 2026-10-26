/**
 * Clinical Examination & Case Notes Controller
 */

const clinicalService = require('../services/clinicalService');

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
 * Create or retrieve clinical examination draft for a visit
 * POST /api/clinical/draft
 */
const createOrGetDraft = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const examination = await clinicalService.createOrGetDraft(
      clinicId,
      branchId,
      userId,
      req.body
    );

    res.status(201).json({
      success: true,
      message: 'Clinical examination draft ready.',
      examination,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Retrieve examination by examination ID
 * GET /api/clinical/examinations/:id
 */
const getExamination = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = getBranchId(req, res);
    if (!branchId) return;
    const { id } = req.params;

    const examination = await clinicalService.getExaminationById(
      clinicId,
      branchId,
      id
    );

    res.status(200).json({
      success: true,
      examination,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Retrieve examination by visit encounter ID
 * GET /api/clinical/visits/:visitId/examination
 */
const getExaminationByVisit = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = getBranchId(req, res);
    if (!branchId) return;
    const { visitId } = req.params;

    const examination = await clinicalService.getExaminationByVisitId(
      clinicId,
      branchId,
      visitId
    );

    res.status(200).json({
      success: true,
      examination,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Update clinical examination draft
 * PUT /api/clinical/examinations/:id
 */
const updateDraft = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = getBranchId(req, res);
    if (!branchId) return;
    const { id } = req.params;

    const examination = await clinicalService.updateDraft(
      clinicId,
      branchId,
      id,
      req.body,
      userId
    );

    res.status(200).json({
      success: true,
      message: 'Clinical examination draft saved successfully.',
      examination,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Sign clinical examination note
 * POST /api/clinical/examinations/:id/sign
 */
const signExamination = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = getBranchId(req, res);
    if (!branchId) return;
    const { id } = req.params;

    const examination = await clinicalService.signExamination(
      clinicId,
      branchId,
      id,
      userId
    );

    res.status(200).json({
      success: true,
      message: 'Clinical examination note signed and sealed successfully.',
      examination,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Explicitly lock clinical examination note
 * POST /api/clinical/examinations/:id/lock
 */
const lockExamination = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = getBranchId(req, res);
    if (!branchId) return;
    const { id } = req.params;

    const examination = await clinicalService.lockExamination(
      clinicId,
      branchId,
      id,
      userId
    );

    res.status(200).json({
      success: true,
      message: 'Clinical examination locked.',
      examination,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Add append-only amendment addendum to signed/locked examination
 * POST /api/clinical/examinations/:id/amendments
 */
const addAmendment = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = getBranchId(req, res);
    if (!branchId) return;
    const { id } = req.params;

    const result = await clinicalService.addAmendment(
      clinicId,
      branchId,
      id,
      req.body,
      userId
    );

    res.status(201).json({
      success: true,
      message: 'Clinical amendment addendum recorded.',
      amendment: result.amendment,
      examination: result.examination,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Update patient portal release visibility
 * PATCH /api/clinical/examinations/:id/release
 */
const setPatientRelease = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = getBranchId(req, res);
    if (!branchId) return;
    const { id } = req.params;
    const { is_released_to_patient } = req.body;

    const examination = await clinicalService.setPatientRelease(
      clinicId,
      branchId,
      id,
      is_released_to_patient,
      userId
    );

    res.status(200).json({
      success: true,
      message: is_released_to_patient
        ? 'Clinical summary released for patient viewing.'
        : 'Patient portal release revoked.',
      examination,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Safe patient-portal preview of released examination
 * GET /api/clinical/visits/:visitId/patient-portal-preview
 */
const getPatientPortalPreview = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = getBranchId(req, res);
    if (!branchId) return;
    const { visitId } = req.params;
    const { patientId } = req.query;

    const preview = await clinicalService.getPatientPortalPreview(
      clinicId,
      branchId,
      visitId,
      patientId || null
    );

    res.status(200).json(preview);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Record pre-consultation vitals and triage assessment (Phase 1.5)
 * POST /api/clinical/vitals
 */
const recordVitals = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const vitals = await clinicalService.recordVisitVitals(
      clinicId,
      branchId,
      userId,
      req.body
    );

    res.status(201).json({
      success: true,
      message: 'Pre-consultation vitals and triage assessment recorded successfully.',
      vitals,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Get pre-consultation vitals recorded for a visit encounter
 * GET /api/clinical/visits/:visitId/vitals
 */
const getVisitVitals = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = getBranchId(req, res);
    if (!branchId) return;
    const { visitId } = req.params;

    const vitals = await clinicalService.getVisitVitals(
      clinicId,
      branchId,
      visitId
    );

    res.status(200).json({
      success: true,
      vitals,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

module.exports = {
  createOrGetDraft,
  getExamination,
  getExaminationByVisit,
  updateDraft,
  signExamination,
  lockExamination,
  addAmendment,
  setPatientRelease,
  getPatientPortalPreview,
  recordVitals,
  getVisitVitals,
};
