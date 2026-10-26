const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/clinicalController');
const {
  getConditions,
  getPatientChart,
  getToothHistory,
  recordFinding,
  deleteFinding,
  amendFinding,
} = require('../controllers/dentalChartController');
const {
  authenticateToken,
  authorizeRoles,
  requireActiveSubscription,
} = require('../middleware/auth');

// All clinical routes require active authenticated session and subscription
router.use(authenticateToken);
router.use(requireActiveSubscription);

// 0. Pre-consultation vitals & triage assessment (Phase 1.5)
router.post(
  '/vitals',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant', 'nurse', 'receptionist'),
  recordVitals
);

router.get(
  '/visits/:visitId/vitals',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant', 'nurse', 'receptionist', 'billing'),
  getVisitVitals
);

// 1. Create or retrieve draft for a visit encounter
router.post(
  '/draft',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant'),
  createOrGetDraft
);

// 2. Retrieve examination by ID
router.get(
  '/examinations/:id',
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant', 'billing'),
  getExamination
);

// 3. Retrieve examination by visit ID
router.get(
  '/visits/:visitId/examination',
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant', 'billing'),
  getExaminationByVisit
);

// 4. Update clinical draft
router.put(
  '/examinations/:id',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant'),
  updateDraft
);

// 5. Doctor digital sign-off
router.post(
  '/examinations/:id/sign',
  authorizeRoles('admin', 'dentist', 'specialist'),
  signExamination
);

// 6. Explicit note lock
router.post(
  '/examinations/:id/lock',
  authorizeRoles('admin', 'dentist', 'specialist'),
  lockExamination
);

// 7. Append-only amendment
router.post(
  '/examinations/:id/amendments',
  authorizeRoles('admin', 'dentist', 'specialist'),
  addAmendment
);

// 8. Patient portal release visibility toggle
router.patch(
  '/examinations/:id/release',
  authorizeRoles('admin', 'dentist', 'specialist'),
  setPatientRelease
);

// 9. Patient portal preview (Strictly strips internal notes, hides unreleased drafts)
router.get(
  '/visits/:visitId/patient-portal-preview',
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant', 'billing'),
  getPatientPortalPreview
);

// ============================================================================
// 10. Interactive Dental Charting / Odontogram Endpoints (Phase 2)
// ============================================================================

// 10.1 Get active dental conditions master list
router.get(
  '/dental-chart/conditions',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant', 'nurse', 'receptionist', 'billing'),
  getConditions
);

// 10.2 Get patient living dental chart (with optional visitId)
router.get(
  '/patients/:patientId/dental-chart',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant', 'nurse', 'receptionist', 'billing'),
  getPatientChart
);

// 10.3 Get chronological history for an individual tooth
router.get(
  '/patients/:patientId/teeth/:toothNumber/history',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant', 'nurse', 'receptionist', 'billing'),
  getToothHistory
);

// 10.4 Record a tooth- or surface-level finding for an active visit
router.post(
  '/dental-chart/findings',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant'),
  recordFinding
);

// 10.5 Delete/cancel a finding from an active draft visit
router.delete(
  '/dental-chart/findings/:id',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant'),
  deleteFinding
);

// 10.6 Append legal amendment to a signed/locked chart finding
router.post(
  '/dental-chart/findings/:id/amend',
  authorizeRoles('admin', 'dentist', 'specialist'),
  amendFinding
);

// ============================================================================
// 11. Treatment Planning & Consent Management Endpoints (Phase 3)
// ============================================================================

const {
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
} = require('../controllers/treatmentPlanController');

// 11.1 Master dental procedures catalog
router.get(
  '/treatment-plans/procedures',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant', 'nurse', 'receptionist', 'billing'),
  getProcedures
);

// 11.2 Create a new treatment plan
router.post(
  '/treatment-plans',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant'),
  createPlan
);

// 11.3 Retrieve all treatment plans for a patient
router.get(
  '/patients/:patientId/treatment-plans',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant', 'nurse', 'receptionist', 'billing'),
  getPatientPlans
);

// 11.4 Retrieve single treatment plan by ID
router.get(
  '/treatment-plans/:id',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant', 'nurse', 'receptionist', 'billing'),
  getPlanById
);

// 11.5 Update treatment plan header details
router.put(
  '/treatment-plans/:id',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant'),
  updatePlan
);

// 11.6 Update treatment plan status
router.patch(
  '/treatment-plans/:id/status',
  authorizeRoles('admin', 'dentist', 'specialist'),
  updatePlanStatus
);

// 11.7 Mark treatment plan as presented
router.post(
  '/treatment-plans/:id/present',
  authorizeRoles('admin', 'dentist', 'specialist'),
  presentPlan
);

// 11.8 Approve treatment plan
router.post(
  '/treatment-plans/:id/approve',
  authorizeRoles('admin', 'dentist', 'specialist'),
  approvePlan
);

// 11.9 Add item to treatment plan
router.post(
  '/treatment-plans/:id/items',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant'),
  addPlanItem
);

// 11.10 Update treatment plan item (status, notes, sequence)
router.put(
  '/treatment-plans/:id/items/:itemId',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant'),
  updatePlanItem
);

// 11.11 Remove treatment plan item
router.delete(
  '/treatment-plans/:id/items/:itemId',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant'),
  deletePlanItem
);

// 11.12 Bridge: Direct proposal from Odontogram finding/tooth
router.post(
  '/treatment-plans/propose-item',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant'),
  proposeFromOdontogram
);

// 11.13 Record patient or guardian consent
router.post(
  '/treatment-plans/:id/consent',
  authorizeRoles('admin', 'dentist', 'specialist'),
  recordConsent
);

// 11.14 Retrieve plan consents
router.get(
  '/treatment-plans/:id/consents',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant', 'nurse', 'receptionist', 'billing'),
  getPlanConsents
);

// 11.15 Amend consent record
router.post(
  '/treatment-consents/:consentId/amend',
  authorizeRoles('admin', 'dentist', 'specialist'),
  amendConsent
);

// ============================================================================
// 12. Prescription & Medication Management Endpoints (Phase 4)
// ============================================================================

const {
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
} = require('../controllers/prescriptionController');

// 12.1 Create a new prescription draft
router.post(
  '/prescriptions',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant'),
  createPrescription
);

// 12.2 Retrieve all prescriptions for a patient
router.get(
  '/patients/:patientId/prescriptions',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant', 'nurse', 'receptionist', 'billing'),
  getPatientPrescriptions
);

// 12.3 Retrieve prescriptions for a visit encounter
router.get(
  '/visits/:visitId/prescriptions',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant', 'nurse', 'receptionist', 'billing'),
  getVisitPrescriptions
);

// 12.4 Retrieve single prescription by ID
router.get(
  '/prescriptions/:id',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant', 'nurse', 'receptionist', 'billing'),
  getPrescriptionById
);

// 12.5 Update draft prescription header
router.put(
  '/prescriptions/:id',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant'),
  updatePrescriptionDraft
);

// 12.6 Add medication item to draft prescription
router.post(
  '/prescriptions/:id/items',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant'),
  addPrescriptionItem
);

// 12.7 Update medication item in draft prescription
router.put(
  '/prescriptions/:id/items/:itemId',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant'),
  updatePrescriptionItem
);

// 12.8 Remove medication item from draft prescription
router.delete(
  '/prescriptions/:id/items/:itemId',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant'),
  deletePrescriptionItem
);

// 12.9 Doctor digital sign-off on prescription
router.post(
  '/prescriptions/:id/sign',
  authorizeRoles('admin', 'dentist', 'specialist'),
  signPrescription
);

// 12.10 Cancel prescription with required reason
router.post(
  '/prescriptions/:id/cancel',
  authorizeRoles('admin', 'dentist', 'specialist'),
  cancelPrescription
);

// 12.11 Amend / replace signed prescription
router.post(
  '/prescriptions/:id/amend',
  authorizeRoles('admin', 'dentist', 'specialist'),
  amendPrescription
);

// 12.12 Retrieve print-ready prescription data
router.get(
  '/prescriptions/:id/print',
  authorizeRoles('admin', 'dentist', 'specialist', 'assistant', 'nurse', 'receptionist', 'billing'),
  getPrintData
);

module.exports = router;

