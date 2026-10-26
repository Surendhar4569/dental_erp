const express = require('express');
const router = express.Router();
const {
  getPlatformOverview,
  listClinics,
  getClinicById,
  onboardClinic,
  updateClinic,
  updateClinicStatus,
  listPlans,
  createPlan,
  updatePlan,
  assignPlanToClinic,
} = require('../controllers/platformController');
const {
  authenticateToken,
  authorizePlatformAdmin,
} = require('../middleware/auth');

// All platform routes require JWT authentication AND Platform Super Admin privileges
router.use(authenticateToken);
router.use(authorizePlatformAdmin);

// Platform Overview & KPIs
router.get('/overview', getPlatformOverview);

// Clinic Organization Management
router.get('/clinics', listClinics);
router.post('/clinics/onboard', onboardClinic);
router.get('/clinics/:id', getClinicById);
router.put('/clinics/:id', updateClinic);
router.patch('/clinics/:id/status', updateClinicStatus);
router.post('/clinics/:id/plan', assignPlanToClinic);

// Subscription Plans Management
router.get('/plans', listPlans);
router.post('/plans', createPlan);
router.put('/plans/:id', updatePlan);

module.exports = router;
