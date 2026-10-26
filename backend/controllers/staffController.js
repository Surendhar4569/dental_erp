/**
 * Staff Management Controller
 */

const staffService = require('../services/staffService');
const { validateCreateStaff, validateUpdateStaff } = require('../validations/staffValidation');
const { recordAuditLog } = require('../utils/auditLogger');

/**
 * List staff members with pagination, search, and category filters
 * GET /api/staff
 */
const getStaffList = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = req.branch?.id || req.query.branchId;

    const options = {
      page: req.query.page,
      limit: req.query.limit,
      category: req.query.category,
      status: req.query.status,
      search: req.query.search,
    };

    const result = await staffService.getStaffList(clinicId, branchId, options);
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get staff details by ID
 * GET /api/staff/:id
 */
const getStaffById = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { id } = req.params;

    const staff = await staffService.getStaffById(clinicId, id);
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found.',
      });
    }

    res.json({
      success: true,
      staff,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new staff member
 * POST /api/staff
 */
const createStaff = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = req.branch?.id || req.body.branch_id;

    const validation = validateCreateStaff(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Staff validation failed.',
        errors: validation.errors,
      });
    }

    const staff = await staffService.createStaff(
      clinicId,
      branchId,
      req.body,
      userId,
      req.user.assignedBranchIds
    );

    await recordAuditLog({
      userId,
      clinicId,
      branchId,
      action: 'STAFF_CREATED',
      entityType: 'staff',
      entityId: staff.id,
      details: {
        staffNumber: staff.staff_number,
        staffCategory: staff.staff_category,
        fullName: `${staff.first_name} ${staff.last_name || ''}`.trim(),
        hasLogin: !!staff.user_id,
      },
    });

    res.status(201).json({
      success: true,
      message: `Staff member ${staff.first_name} (${staff.staff_number}) created successfully.`,
      staff,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update staff details
 * PUT /api/staff/:id
 */
const updateStaff = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = req.branch?.id;
    const { id } = req.params;

    const validation = validateUpdateStaff(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Staff validation failed.',
        errors: validation.errors,
      });
    }

    const staff = await staffService.updateStaff(
      clinicId,
      id,
      req.body,
      userId,
      req.user.assignedBranchIds
    );

    await recordAuditLog({
      userId,
      clinicId,
      branchId,
      action: 'STAFF_UPDATED',
      entityType: 'staff',
      entityId: id,
      details: {
        staffNumber: staff.staff_number,
        updatedFields: Object.keys(req.body),
      },
    });

    res.json({
      success: true,
      message: 'Staff details updated successfully.',
      staff,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Deactivate staff member
 * PATCH /api/staff/:id/deactivate
 */
const deactivateStaff = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = req.branch?.id;
    const { id } = req.params;

    const result = await staffService.deactivateStaff(clinicId, id, userId);

    if (result.hasConflict) {
      return res.status(409).json({
        success: false,
        hasConflict: true,
        futureAppointmentsCount: result.futureAppointmentsCount,
        message: result.message,
      });
    }

    await recordAuditLog({
      userId,
      clinicId,
      branchId,
      action: 'STAFF_DEACTIVATED',
      entityType: 'staff',
      entityId: id,
      details: {
        staffId: id,
      },
    });

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get active doctors/dentists assigned to branch
 * GET /api/staff/doctors/eligible
 */
const getEligibleDoctors = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = req.branch?.id;

    const doctors = await staffService.getEligibleDoctors(clinicId, branchId);
    res.json({
      success: true,
      doctors,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Assign existing staff member to an additional branch
 * POST /api/staff/branches/:branchId/assign
 */
const assignExistingStaff = async (req, res, next) => {
  try {
    const { clinicId, id: userId, assignedBranchIds } = req.user;
    const branchId = req.branch.id;
    const staffId = req.body.staffId || req.body.staff_id;

    if (!staffId) {
      return res.status(400).json({
        success: false,
        message: 'staffId is required.',
      });
    }

    const result = await staffService.assignExistingStaffToBranch(
      clinicId,
      branchId,
      staffId,
      userId,
      assignedBranchIds
    );

    await recordAuditLog({
      userId,
      clinicId,
      branchId,
      action: 'STAFF_BRANCH_ASSIGNED',
      entityType: 'staff_branches',
      entityId: staffId,
      details: {
        staffId,
        branchId,
      },
    });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove staff assignment from a branch
 * DELETE /api/staff/branches/:branchId/staff/:staffId
 */
const removeStaffBranch = async (req, res, next) => {
  try {
    const { clinicId, id: userId, assignedBranchIds } = req.user;
    const branchId = req.branch.id;
    const { staffId } = req.params;

    const result = await staffService.removeStaffFromBranch(
      clinicId,
      branchId,
      staffId,
      userId,
      assignedBranchIds
    );

    await recordAuditLog({
      userId,
      clinicId,
      branchId,
      action: 'STAFF_BRANCH_REMOVED',
      entityType: 'staff_branches',
      entityId: staffId,
      details: {
        staffId,
        branchId,
      },
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get active clinic staff members not yet assigned to this branch
 * GET /api/staff/branches/:branchId/unassigned
 */
const getUnassignedStaff = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = req.branch.id;

    const staff = await staffService.getUnassignedStaffForBranch(clinicId, branchId);
    res.json({
      success: true,
      staff,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStaffList,
  getStaffById,
  createStaff,
  updateStaff,
  deactivateStaff,
  getEligibleDoctors,
  assignExistingStaff,
  removeStaffBranch,
  getUnassignedStaff,
};
