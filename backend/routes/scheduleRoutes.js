const express = require('express');
const router = express.Router();
const {
  getBranchDoctors,
  getBranchDoctorFees,
  getDoctorWeeklySchedule,
  saveDoctorWeeklySchedule,
  getDoctorExceptions,
  createDoctorException,
  deleteDoctorException,
  getDoctorFee,
  saveDoctorFee,
  getDoctorAvailableSlots,
  checkScheduleConflicts,
  getDoctorCalendarEvents,
  getDoctorAvailabilityRange,
  getBranchChairs,
  saveDoctorMultiDateSchedule,
  getDoctorDateSchedules,
  deleteDoctorDateSchedule,
  getAnnualOverview,
} = require('../controllers/scheduleController');
const {
  authenticateToken,
  authorizeRoles,
  authorizeBranchAccess,
  requireActiveSubscription,
} = require('../middleware/auth');

// All schedule routes require authentication and active subscription
router.use(authenticateToken);
router.use(requireActiveSubscription);

// 1. List doctors assigned to a branch
router.get(
  '/branches/:branchId/doctors',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant', 'billing'),
  getBranchDoctors
);

// 1b. List doctors assigned to branch with fee matrix
router.get(
  '/branches/:branchId/doctor-fees',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant', 'billing'),
  getBranchDoctorFees
);

// 2. Get available slots for a doctor on a specific date (Slot engine)
router.get(
  '/branches/:branchId/doctors/:doctorId/slots',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant', 'billing'),
  getDoctorAvailableSlots
);

// 2b. Get doctor slot availability across a date range (for Calendar views)
router.get(
  '/branches/:branchId/doctors/:doctorId/availability-range',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant', 'billing'),
  getDoctorAvailabilityRange
);

// 2c. Get calendar events (working shifts, breaks, exceptions, appointments)
router.get(
  '/branches/:branchId/doctors/:doctorId/calendar-events',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant', 'billing'),
  getDoctorCalendarEvents
);

// 3. Get doctor's weekly schedule & sessions
router.get(
  '/branches/:branchId/doctors/:doctorId',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant', 'billing'),
  getDoctorWeeklySchedule
);

// 4. Save/update doctor weekly schedule & sessions (Admin, Dentist, Specialist only)
router.put(
  '/branches/:branchId/doctors/:doctorId',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist'),
  saveDoctorWeeklySchedule
);

// 4b. Pre-flight check for schedule conflicts
router.post(
  '/branches/:branchId/doctors/:doctorId/check-conflicts',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist'),
  checkScheduleConflicts
);

// 5. Get doctor schedule exceptions (leaves, holidays, blocked times)
router.get(
  '/branches/:branchId/doctors/:doctorId/exceptions',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant', 'billing'),
  getDoctorExceptions
);

// 6. Create doctor schedule exception (Admin, Dentist, Specialist only)
router.post(
  '/branches/:branchId/doctors/:doctorId/exceptions',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist'),
  createDoctorException
);

// 7. Delete doctor schedule exception (Admin, Dentist, Specialist only)
router.delete(
  '/branches/:branchId/exceptions/:exceptionId',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist'),
  deleteDoctorException
);

// 8. Get branch dental chairs
router.get(
  '/branches/:branchId/chairs',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant', 'billing'),
  getBranchChairs
);

// 9. Get doctor consultation fee configuration
router.get(
  '/branches/:branchId/doctors/:doctorId/fees',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant', 'billing'),
  getDoctorFee
);

// 10. Save doctor consultation fee configuration (Admin only)
router.put(
  '/branches/:branchId/doctors/:doctorId/fees',
  authorizeBranchAccess,
  authorizeRoles('admin'),
  saveDoctorFee
);

// 11. Annual Calendar Overview (12-month aggregated view)
router.get(
  '/branches/:branchId/annual-overview',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant', 'billing'),
  getAnnualOverview
);

// 12. Get doctor date-specific schedules
router.get(
  '/branches/:branchId/doctors/:doctorId/date-schedules',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant', 'billing'),
  getDoctorDateSchedules
);

// 13. Save multi-date doctor schedule (Admin, Dentist, Specialist)
router.post(
  '/branches/:branchId/doctors/:doctorId/multi-date',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist'),
  saveDoctorMultiDateSchedule
);

// 14. Delete doctor date-specific schedule (Admin, Dentist, Specialist)
router.delete(
  '/branches/:branchId/doctors/:doctorId/date-schedules/:scheduleDate',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist'),
  deleteDoctorDateSchedule
);

module.exports = router;

