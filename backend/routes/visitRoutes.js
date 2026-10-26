const express = require('express');
const router = express.Router();
const {
  getVisitById,
  updateVisitStatus,
} = require('../controllers/patientController');
const {
  authenticateToken,
  authorizeRoles,
  requireActiveSubscription,
} = require('../middleware/auth');

router.use(authenticateToken);
router.use(requireActiveSubscription);

// 1. Get visit details by ID
router.get(
  '/:visitId',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'receptionist', 'assistant', 'billing'),
  getVisitById
);

// 2. Update visit status (queued / in_progress / completed / cancelled)
router.patch(
  '/:visitId/status',
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant'),
  updateVisitStatus
);

module.exports = router;
