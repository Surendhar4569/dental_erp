const express = require('express');
const router = express.Router();
const {
  createInvestigation,
  updateInvestigation,
  toggleInvestigationStatus,
  getInvestigationCatalogue,
  getInvestigationById,
  createOrder,
  getOrders,
  getOrderById,
  getVisitOrders,
  getPatientOrders,
  getWorklist,
  updateOrderStatus,
  enterResult,
  authorizeResult,
  amendResult,
  getPrintableReport,
  uploadAttachment,
  getAttachments,
  deleteAttachment,
  getVisitBilling,
  collectCentralBillingPayment,
} = require('../controllers/investigationController');
const {
  authenticateToken,
  authorizeRoles,
  authorizeBranchAccess,
  requireActiveSubscription,
} = require('../middleware/auth');

// All investigation endpoints require authenticated session and active subscription
router.use(authenticateToken);
router.use(requireActiveSubscription);

// ==========================================
// 1. INVESTIGATION CATALOGUE
// ==========================================

router.get(
  '/catalogue',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'assistant', 'billing', 'receptionist'),
  getInvestigationCatalogue
);

router.post(
  '/catalogue',
  authorizeRoles('admin', 'superadmin'),
  createInvestigation
);

router.get(
  '/catalogue/:id',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'assistant', 'billing', 'receptionist'),
  getInvestigationById
);

router.put(
  '/catalogue/:id',
  authorizeRoles('admin', 'superadmin'),
  updateInvestigation
);

router.patch(
  '/catalogue/:id/status',
  authorizeRoles('admin', 'superadmin'),
  toggleInvestigationStatus
);

// ==========================================
// 2. LABORATORY / DIAGNOSTICS WORKLIST
// ==========================================

router.get(
  '/worklist',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'assistant', 'billing', 'receptionist'),
  getWorklist
);

// ==========================================
// 3. DOCTOR INVESTIGATION ORDERS
// ==========================================

router.post(
  '/orders',
  authorizeBranchAccess,
  authorizeRoles('admin', 'dentist', 'specialist'),
  createOrder
);

router.get(
  '/orders',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'assistant', 'billing', 'receptionist'),
  getOrders
);

router.get(
  '/orders/:id',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'assistant', 'billing', 'receptionist'),
  getOrderById
);

router.get(
  '/orders/visit/:visitId',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'assistant', 'billing', 'receptionist'),
  getVisitOrders
);

router.get(
  '/orders/patient/:patientId',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'assistant', 'billing', 'receptionist'),
  getPatientOrders
);

router.patch(
  '/orders/:id/status',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'assistant'),
  updateOrderStatus
);

// ==========================================
// 4. RESULTS MANAGEMENT
// ==========================================

router.post(
  '/orders/:orderId/items/:itemId/results',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'assistant'),
  enterResult
);

router.post(
  '/results/:resultId/authorize',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist'),
  authorizeResult
);

router.post(
  '/results/:resultId/amend',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist'),
  amendResult
);

// ==========================================
// 5. REPORTS & ATTACHMENTS
// ==========================================

router.get(
  '/orders/:id/report',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'assistant', 'billing', 'receptionist'),
  getPrintableReport
);

router.post(
  '/orders/:id/attachments',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'assistant'),
  uploadAttachment
);

router.delete(
  '/orders/:id/attachments/:attachmentId',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'assistant'),
  deleteAttachment
);

router.get(
  '/orders/:id/attachments',
  authorizeRoles('admin', 'dentist', 'specialist', 'radiologist', 'assistant', 'billing', 'receptionist'),
  getAttachments
);

// ==========================================
// 6. CENTRAL BILLING INTEGRATION
// ==========================================

router.get(
  '/billing/visit/:visitId',
  authorizeRoles('admin', 'billing', 'receptionist', 'dentist', 'specialist'),
  getVisitBilling
);

router.post(
  '/billing/pay',
  authorizeBranchAccess,
  authorizeRoles('admin', 'billing', 'receptionist'),
  collectCentralBillingPayment
);

module.exports = router;

