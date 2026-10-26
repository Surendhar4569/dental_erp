const express = require('express');
const router = express.Router();
const {
  listBranches,
  getBranchById,
  createBranch,
  updateBranch,
  updateBranchStatus,
  getBranchUsers,
  assignUserToBranch,
  removeUserFromBranch,
  getBranchStats,
} = require('../controllers/branchController');
const { getBranchDailyQueue } = require('../controllers/patientController');
const {
  authenticateToken,
  authorizeRoles,
  authorizeBranchAccess,
  requireActiveSubscription,
} = require('../middleware/auth');

// All branch routes require authenticated JWT session and non-suspended subscription
router.use(authenticateToken);
router.use(requireActiveSubscription);

// 1. List branches available to authenticated user
router.get('/', listBranches);

// 2. Create a new branch (Admin only)
router.post('/', authorizeRoles('admin'), createBranch);

// 3. Get branch details (Authorized branch access required)
router.get('/:id', authorizeBranchAccess, getBranchById);

// 4. Update branch details (Admin only on authorized branch)
router.put('/:id', authorizeRoles('admin'), authorizeBranchAccess, updateBranch);

// 5. Activate / Deactivate branch (Admin only on authorized branch)
router.patch('/:id/status', authorizeRoles('admin'), authorizeBranchAccess, updateBranchStatus);

// 6. List users assigned to branch (Authorized branch access required)
router.get('/:id/users', authorizeBranchAccess, getBranchUsers);

// 7. Assign user to branch (Admin only on authorized branch)
router.post('/:id/users', authorizeRoles('admin'), authorizeBranchAccess, assignUserToBranch);

// 8. Remove user assignment from branch (Admin only on authorized branch)
router.delete('/:id/users/:userId', authorizeRoles('admin'), authorizeBranchAccess, removeUserFromBranch);

// 9. Branch statistics (Authorized branch access required)
router.get('/:id/stats', authorizeBranchAccess, getBranchStats);

// 10. Branch daily visit queue (Authorized branch access required)
router.get('/:id/visits/today', authorizeBranchAccess, (req, res, next) => {
  req.params.branchId = req.params.id;
  getBranchDailyQueue(req, res, next);
});

module.exports = router;
