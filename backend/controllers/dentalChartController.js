/**
 * Interactive Dental Charting Controller
 */

const dentalChartService = require('../services/dentalChartService');

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
 * 1. GET /api/clinical/dental-chart/conditions
 * Retrieve condition master list
 */
const getConditions = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const conditions = await dentalChartService.getConditions(clinicId);
    res.status(200).json({
      success: true,
      conditions,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 2. GET /api/clinical/patients/:patientId/dental-chart
 * Retrieve patient's living dental chart and active visit findings
 */
const getPatientChart = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const { patientId } = req.params;
    const { visitId } = req.query;

    const chart = await dentalChartService.getPatientChart(
      clinicId,
      branchId,
      patientId,
      visitId || null
    );

    res.status(200).json({
      success: true,
      chart,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 3. GET /api/clinical/patients/:patientId/teeth/:toothNumber/history
 * Retrieve chronological timeline of an individual tooth
 */
const getToothHistory = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const { patientId, toothNumber } = req.params;

    const toothData = await dentalChartService.getToothHistory(
      clinicId,
      branchId,
      patientId,
      toothNumber
    );

    res.status(200).json({
      success: true,
      tooth: toothData,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 4. POST /api/clinical/dental-chart/findings
 * Record a tooth-level or surface-level finding for an active visit
 */
const recordFinding = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const finding = await dentalChartService.recordFinding(
      clinicId,
      branchId,
      userId,
      req.body
    );

    res.status(201).json({
      success: true,
      message: 'Dental finding recorded successfully.',
      finding,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 5. DELETE /api/clinical/dental-chart/findings/:id
 * Remove a finding from an active draft visit
 */
const deleteFinding = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const { id: findingId } = req.params;
    const result = await dentalChartService.deleteFinding(
      clinicId,
      branchId,
      userId,
      findingId
    );

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * 6. POST /api/clinical/dental-chart/findings/:id/amend
 * Append a legal amendment to a signed chart finding
 */
const amendFinding = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = getBranchId(req, res);
    if (!branchId) return;

    const { id: findingId } = req.params;
    const amendedFinding = await dentalChartService.amendFinding(
      clinicId,
      branchId,
      userId,
      findingId,
      req.body
    );

    res.status(200).json({
      success: true,
      message: 'Dental finding amendment recorded.',
      finding: amendedFinding,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getConditions,
  getPatientChart,
  getToothHistory,
  recordFinding,
  deleteFinding,
  amendFinding,
};
