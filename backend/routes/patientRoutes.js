const express = require('express');
const router = express.Router();
const {
  registerPatient,
  listPatients,
  checkDuplicate,
  getPatientById,
  updatePatient,
  updateMedicalRecord,
  updatePatientStatus,
  createPatientVisit,
  getPatientVisits,
  getBranchDailyQueue,
  updateVisitStatus,
  getVisitById,
} = require('../controllers/patientController');
const {
  authenticateToken,
  authorizeRoles,
  requireActiveSubscription,
} = require('../middleware/auth');

// All patient management endpoints require authenticated session and active subscription
router.use(authenticateToken);
router.use(requireActiveSubscription);

// 1. Check duplicate patients before registration
router.get(
  '/check-duplicate',
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant'),
  checkDuplicate
);

// 2. Branch daily visit queue
router.get(
  '/branches/:branchId/visits/today',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'receptionist', 'assistant', 'billing'),
  getBranchDailyQueue
);

// 3. Visit detail retrieval
router.get(
  '/visits/:visitId',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'receptionist', 'assistant', 'billing'),
  getVisitById
);

// 4. Update visit status (e.g. queued -> in_progress -> completed / cancelled)
router.patch(
  '/visits/:visitId/status',
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant'),
  updateVisitStatus
);

// 5. List patients with pagination, search, and branch scoping
router.get(
  '/',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'receptionist', 'assistant', 'billing'),
  listPatients
);

// 6. Register a new patient with permanent numeric Patient ID
router.post(
  '/',
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant'),
  registerPatient
);

// 7. Retrieve patient full profile and medical alerts (by UUID or numeric Patient ID)
router.get(
  '/:id',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'receptionist', 'assistant', 'billing'),
  getPatientById
);

// 8. Update patient demographics
router.put(
  '/:id',
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist'),
  updatePatient
);

// 9. Update patient medical information (Clinical practitioners only)
router.put(
  '/:id/medical',
  authorizeRoles('admin', 'dentist', 'specialist'),
  updateMedicalRecord
);

// 10. Change record status (active/inactive/archived)
router.patch(
  '/:id/status',
  authorizeRoles('admin', 'dentist'),
  updatePatientStatus
);

// 11. Create a new visit for patient and allocate daily branch token
router.post(
  '/:id/visits',
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant'),
  createPatientVisit
);

// 12. List patient's cross-branch visit history
router.get(
  '/:id/visits',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'receptionist', 'assistant', 'billing'),
  getPatientVisits
);

// 13. Phase 5: Chronological Unified Medical Record Timeline
const patientTimelineController = require('../controllers/patientTimelineController');

router.get(
  '/:id/timeline',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'receptionist', 'assistant', 'billing'),
  patientTimelineController.getTimeline
);

// 14. Phase 5: Visit-Wise Unified Encounter Records
router.get(
  '/:id/visits/:visitId/records',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'receptionist', 'assistant', 'billing'),
  patientTimelineController.getVisitRecords
);

router.get(
  '/visits/:visitId/records',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'receptionist', 'assistant', 'billing'),
  patientTimelineController.getVisitRecords
);

module.exports = router;
