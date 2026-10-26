const express = require('express');
const router = express.Router();
const {
  createAppointment,
  getAppointmentsList,
  getAppointmentById,
  rescheduleAppointment,
  cancelAppointment,
  updateAppointmentStatus,
  checkInAppointment,
  createWalkInAppointment,
  getReceptionMetrics,
  recordPayment,
  getReceipt,
  getAppointmentPayments,
  getBookingConfirmation,
  getBookableBranches,
  getBookableDoctors,
} = require('../controllers/appointmentController');
const {
  authenticateToken,
  authorizeRoles,
  authorizeBranchAccess,
  requireActiveSubscription,
} = require('../middleware/auth');

// All appointment routes require authenticated session & active subscription
router.use(authenticateToken);
router.use(requireActiveSubscription);

// 0a. List active bookable branches for the clinic organization
router.get(
  '/bookable-branches',
  getBookableBranches
);

// 0b. Get booking confirmation by secure unguessable booking reference
router.get(
  '/reference/:bookingReference',
  getBookingConfirmation
);

// 0c. List eligible bookable doctors assigned to a branch
router.get(
  '/branches/:branchId/bookable-doctors',
  authorizeBranchAccess,
  getBookableDoctors
);

// 1. Reception Desk Real-time Metrics
router.get(
  '/reception/metrics',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'receptionist', 'assistant', 'billing'),
  getReceptionMetrics
);

// 2. Receipt retrieval (with optional reprint tracking)
router.get(
  '/payments/:paymentId/receipt',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'receptionist', 'assistant', 'billing'),
  getReceipt
);

// 3. Quick walk-in appointment registration & queue token issuance
router.post(
  '/walk-in',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant'),
  createWalkInAppointment
);

// 4. List appointments with filtering and pagination
router.get(
  '/',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'receptionist', 'assistant', 'billing'),
  getAppointmentsList
);

// 5. Book a new appointment
router.post(
  '/',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant'),
  createAppointment
);

// 6. Get appointment full details
router.get(
  '/:id',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'receptionist', 'assistant', 'billing'),
  getAppointmentById
);

// 7. Reschedule appointment
router.patch(
  '/:id/reschedule',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant'),
  rescheduleAppointment
);

// 8. Cancel appointment
router.patch(
  '/:id/cancel',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant'),
  cancelAppointment
);

// 9. Update appointment status (confirmed, in_consultation, completed, no_show)
router.patch(
  '/:id/status',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant'),
  updateAppointmentStatus
);

// 10. Check-in appointment and allocate daily visit token
router.post(
  '/:id/check-in',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant'),
  checkInAppointment
);

// 11. Record consultation fee payment & issue receipt
router.post(
  '/:id/payments',
  authorizeBranchAccess,
  authorizeRoles('admin', 'receptionist', 'billing'),
  recordPayment
);

// 12. List payments for an appointment
router.get(
  '/:id/payments',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'receptionist', 'assistant', 'billing'),
  getAppointmentPayments
);

module.exports = router;
