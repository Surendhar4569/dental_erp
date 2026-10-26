/**
 * Staff Management Routes
 */

const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController');
const { authenticateToken, authorizeRoles, authorizeBranchAccess } = require('../middleware/auth');

router.use(authenticateToken);
router.use(authorizeBranchAccess);

// List staff with filters
router.get('/', staffController.getStaffList);

// Get eligible doctors for appointments/schedules
router.get('/doctors/eligible', staffController.getEligibleDoctors);

// Get active clinic staff members not yet assigned to this branch
router.get('/branches/:branchId/unassigned', authorizeRoles('admin', 'manager', 'receptionist'), staffController.getUnassignedStaff);

// Assign existing staff member to an additional branch
router.post('/branches/:branchId/assign', authorizeRoles('admin', 'manager'), staffController.assignExistingStaff);

// Remove staff member from a branch
router.delete('/branches/:branchId/staff/:staffId', authorizeRoles('admin', 'manager'), staffController.removeStaffBranch);

// Get single staff by ID
router.get('/:id', staffController.getStaffById);

// Create staff member (Admin and Manager permitted for authorized branches)
router.post('/', authorizeRoles('admin', 'manager'), staffController.createStaff);

// Update staff member (Admin and Manager permitted for authorized branches)
router.put('/:id', authorizeRoles('admin', 'manager'), staffController.updateStaff);

// Deactivate staff member (Admin and Manager permitted)
router.patch('/:id/deactivate', authorizeRoles('admin', 'manager'), staffController.deactivateStaff);

module.exports = router;
