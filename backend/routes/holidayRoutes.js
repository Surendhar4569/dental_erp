/**
 * Holiday Master Routes
 */

const express = require('express');
const router = express.Router();
const holidayController = require('../controllers/holidayController');
const {
  authenticateToken,
  authorizeRoles,
  requireActiveSubscription,
} = require('../middleware/auth');

// All holiday routes require authentication and active clinic subscription
router.use(authenticateToken);
router.use(requireActiveSubscription);

// 1. Get suggested Indian holidays for a given year
router.get(
  '/suggestions',
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant', 'billing'),
  holidayController.getSuggestedHolidays
);

// 2. Export holidays as CSV
router.get(
  '/export/csv',
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant', 'billing'),
  holidayController.exportHolidaysCsv
);

// 3. Import holidays from CSV text
router.post(
  '/import/csv',
  authorizeRoles('admin'),
  holidayController.importHolidaysCsv
);

// 4. Create batch holidays
router.post(
  '/batch',
  authorizeRoles('admin'),
  holidayController.createBatchHolidays
);

// 5. List holidays with filtering
router.get(
  '/',
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant', 'billing'),
  holidayController.getHolidays
);

// 6. Get single holiday by ID
router.get(
  '/:id',
  authorizeRoles('admin', 'dentist', 'specialist', 'receptionist', 'assistant', 'billing'),
  holidayController.getHolidayById
);

// 7. Create a single holiday
router.post(
  '/',
  authorizeRoles('admin'),
  holidayController.createHoliday
);

// 8. Update a holiday
router.put(
  '/:id',
  authorizeRoles('admin'),
  holidayController.updateHoliday
);

// 9. Deactivate a holiday
router.delete(
  '/:id',
  authorizeRoles('admin'),
  holidayController.deactivateHoliday
);

module.exports = router;
