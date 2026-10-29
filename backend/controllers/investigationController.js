const investigationService = require('../services/investigationService');
const paymentService = require('../services/paymentService');
const { recordAuditLog } = require('../utils/auditLogger');

/**
 * Investigation Controller
 * Manages catalogue, doctor investigation orders, operational workflow,
 * results management, reports, and Central Billing integration.
 */

// ==========================================
// MODULE A: CATALOGUE
// ==========================================

const createInvestigation = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const inv = await investigationService.createInvestigation(clinicId, req.body, userId);

    await recordAuditLog({
      userId,
      clinicId,
      branchId: req.branch?.id || null,
      action: 'INVESTIGATION_CATALOGUE_CREATED',
      entityType: 'investigation_catalogue',
      entityId: inv.id,
      details: { code: inv.code, name: inv.name, price: inv.price, category: inv.category },
    });

    res.status(201).json({
      success: true,
      message: `Investigation '${inv.name}' (${inv.code}) created successfully.`,
      investigation: inv,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const updateInvestigation = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const { id } = req.params;
    const inv = await investigationService.updateInvestigation(clinicId, id, req.body, userId);

    await recordAuditLog({
      userId,
      clinicId,
      branchId: req.branch?.id || null,
      action: 'INVESTIGATION_CATALOGUE_UPDATED',
      entityType: 'investigation_catalogue',
      entityId: inv.id,
      details: { code: inv.code, name: inv.name, price: inv.price },
    });

    res.status(200).json({
      success: true,
      message: `Investigation '${inv.name}' updated successfully.`,
      investigation: inv,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const toggleInvestigationStatus = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const { id } = req.params;
    const { is_active } = req.body;
    const inv = await investigationService.toggleInvestigationActive(clinicId, id, is_active, userId);

    res.status(200).json({
      success: true,
      message: `Investigation '${inv.name}' status set to ${inv.is_active ? 'active' : 'inactive'}.`,
      investigation: inv,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const getInvestigationCatalogue = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const items = await investigationService.getInvestigationCatalogue(clinicId, req.query);
    res.status(200).json({
      success: true,
      count: items.length,
      investigations: items,
    });
  } catch (error) {
    next(error);
  }
};

const getInvestigationById = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { id } = req.params;
    const inv = await investigationService.getInvestigationById(clinicId, id);
    res.status(200).json({
      success: true,
      investigation: inv,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

// ==========================================
// MODULE B: DOCTOR INVESTIGATION ORDERS
// ==========================================

const createOrder = async (req, res, next) => {
  try {
    const { clinicId, id: userId, role } = req.user;
    const branchId = req.headers['x-branch-id'] || req.branch?.id || req.body.branch_id;

    if (!branchId) {
      return res.status(400).json({ success: false, message: 'Branch ID is required.' });
    }

    const userBranchIds = req.user.branches ? req.user.branches.map((b) => b.id) : [];

    const order = await investigationService.createOrder(
      clinicId,
      branchId,
      req.body,
      userId,
      userBranchIds
    );

    await recordAuditLog({
      userId,
      clinicId,
      branchId,
      action: 'INVESTIGATION_ORDER_CREATED',
      entityType: 'investigation_orders',
      entityId: order.id,
      details: {
        orderNumber: order.order_number,
        patientId: order.patient_id,
        visitId: order.visit_id,
        itemCount: order.items?.length,
        totalAmount: order.total_amount,
      },
    });

    res.status(201).json({
      success: true,
      message: `Investigation order ${order.order_number} created successfully.`,
      order,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const getOrderById = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { id } = req.params;
    const userBranchIds = req.user.branches ? req.user.branches.map((b) => b.id) : [];

    const order = await investigationService.getOrderById(clinicId, id, userBranchIds);
    res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};


const getOrders = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { visit_id, patient_id } = req.query;
    const userBranchIds = req.user.branches ? req.user.branches.map((b) => b.id) : [];

    if (visit_id) {
      const orders = await investigationService.getVisitInvestigationOrders(clinicId, visit_id, userBranchIds);
      return res.status(200).json({
        success: true,
        count: orders.length,
        orders,
      });
    }

    if (patient_id) {
      const orders = await investigationService.getPatientInvestigationOrders(clinicId, patient_id, userBranchIds);
      return res.status(200).json({
        success: true,
        count: orders.length,
        orders,
      });
    }

    const result = await investigationService.getInvestigationWorklist(clinicId, userBranchIds, req.query);
    res.status(200).json({
      success: true,
      count: result.orders ? result.orders.length : 0,
      orders: result.orders || [],
      pagination: result.pagination,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const getVisitOrders = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { visitId } = req.params;
    const userBranchIds = req.user.branches ? req.user.branches.map((b) => b.id) : [];

    const orders = await investigationService.getVisitInvestigationOrders(clinicId, visitId, userBranchIds);
    res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const getPatientOrders = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { patientId } = req.params;
    const userBranchIds = req.user.branches ? req.user.branches.map((b) => b.id) : [];

    const orders = await investigationService.getPatientInvestigationOrders(clinicId, patientId, userBranchIds);
    res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

// ==========================================
// MODULE G: WORKLIST
// ==========================================

const getWorklist = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const userBranchIds = req.user.branches ? req.user.branches.map((b) => b.id) : [];
    const result = await investigationService.getInvestigationWorklist(clinicId, userBranchIds, req.query);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// MODULE D: WORKFLOW STATUS
// ==========================================

const updateOrderStatus = async (req, res, next) => {
  try {
    const { clinicId, id: userId, role } = req.user;
    const { id } = req.params;
    const { status, notes } = req.body;
    const userBranchIds = req.user.branches ? req.user.branches.map((b) => b.id) : [];

    const updated = await investigationService.updateOrderStatus(
      clinicId,
      userBranchIds,
      id,
      status,
      notes,
      userId,
      role
    );

    await recordAuditLog({
      userId,
      clinicId,
      branchId: updated.branch_id,
      action: 'INVESTIGATION_STATUS_UPDATED',
      entityType: 'investigation_orders',
      entityId: id,
      details: { newStatus: status, notes },
    });

    res.status(200).json({
      success: true,
      message: `Investigation order status updated to '${status}'.`,
      order: updated,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

// ==========================================
// MODULE E: RESULTS MANAGEMENT
// ==========================================

const enterResult = async (req, res, next) => {
  try {
    const { clinicId, id: userId, role } = req.user;
    const { orderId, itemId } = req.params;
    const userBranchIds = req.user.branches ? req.user.branches.map((b) => b.id) : [];

    const result = await investigationService.enterResult(
      clinicId,
      userBranchIds,
      orderId,
      itemId,
      req.body,
      userId,
      role
    );

    await recordAuditLog({
      userId,
      clinicId,
      branchId: req.branch?.id || null,
      action: 'INVESTIGATION_RESULT_ENTERED',
      entityType: 'investigation_results',
      entityId: result.id,
      details: { orderId, itemId, abnormalFlag: result.abnormal_flag },
    });

    res.status(200).json({
      success: true,
      message: 'Investigation result saved.',
      result,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const authorizeResult = async (req, res, next) => {
  try {
    const { clinicId, id: userId, role } = req.user;
    const { resultId } = req.params;
    const userBranchIds = req.user.branches ? req.user.branches.map((b) => b.id) : [];

    const result = await investigationService.authorizeResult(
      clinicId,
      userBranchIds,
      resultId,
      userId,
      role
    );

    await recordAuditLog({
      userId,
      clinicId,
      branchId: req.branch?.id || null,
      action: 'INVESTIGATION_RESULT_AUTHORIZED',
      entityType: 'investigation_results',
      entityId: resultId,
      details: { authorizedBy: userId },
    });

    res.status(200).json({
      success: true,
      message: 'Investigation result formally reviewed and authorized.',
      result,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const amendResult = async (req, res, next) => {
  try {
    const { clinicId, id: userId, role } = req.user;
    const { resultId } = req.params;
    const { reason, ...newData } = req.body;
    const userBranchIds = req.user.branches ? req.user.branches.map((b) => b.id) : [];

    const result = await investigationService.amendResult(
      clinicId,
      userBranchIds,
      resultId,
      reason,
      newData,
      userId,
      role
    );

    await recordAuditLog({
      userId,
      clinicId,
      branchId: req.branch?.id || null,
      action: 'INVESTIGATION_RESULT_AMENDED',
      entityType: 'investigation_results',
      entityId: resultId,
      details: { reason },
    });

    res.status(200).json({
      success: true,
      message: 'Investigation result amended with legal audit history.',
      result,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

// ==========================================
// MODULE F: REPORTS AND ATTACHMENTS
// ==========================================

const getPrintableReport = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { id } = req.params;
    const userBranchIds = req.user.branches ? req.user.branches.map((b) => b.id) : [];

    const report = await investigationService.getPrintableReport(clinicId, id, userBranchIds);
    res.status(200).json({
      success: true,
      report,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const uploadAttachment = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const { id: orderId } = req.params;
    const userBranchIds = req.user.branches ? req.user.branches.map((b) => b.id) : [];

    const attachment = await investigationService.addAttachment(
      clinicId,
      userBranchIds,
      orderId,
      req.body,
      userId
    );

    res.status(201).json({
      success: true,
      message: 'Document attachment uploaded successfully.',
      attachment,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const getAttachments = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { id: orderId } = req.params;
    const userBranchIds = req.user.branches ? req.user.branches.map((b) => b.id) : [];

    const attachments = await investigationService.getAttachments(clinicId, userBranchIds, orderId);
    res.status(200).json({
      success: true,
      count: attachments.length,
      attachments,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

// ==========================================
// CENTRAL BILLING INTEGRATION
// ==========================================


const deleteAttachment = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { id: orderId, attachmentId } = req.params;
    const userBranchIds = req.user.branches ? req.user.branches.map((b) => b.id) : [];

    const result = await investigationService.deleteAttachment(
      clinicId,
      userBranchIds,
      orderId,
      attachmentId
    );

    res.status(200).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const getVisitBilling = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { visitId } = req.params;
    const branchId = req.headers['x-branch-id'] || req.branch?.id;

    const billing = await paymentService.getVisitBillingSummary(clinicId, branchId, visitId);
    res.status(200).json({
      success: true,
      billing,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const collectCentralBillingPayment = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = req.headers['x-branch-id'] || req.branch?.id || req.body.branch_id;

    if (!branchId) {
      return res.status(400).json({ success: false, message: 'Branch ID is required.' });
    }

    const receipt = await paymentService.recordCentralBillingPayment(clinicId, branchId, req.body, userId);

    await recordAuditLog({
      userId,
      clinicId,
      branchId,
      action: 'PAYMENT_COLLECTED',
      entityType: 'appointment_payments',
      entityId: receipt.id,
      details: {
        receiptNumber: receipt.receipt_number,
        amountPaid: receipt.amount_paid,
        remainingBalance: receipt.remaining_balance,
        paymentMethod: receipt.payment_method,
      },
    });

    res.status(201).json({
      success: true,
      message: `Payment of ₹${receipt.amount_paid} collected. Receipt #${receipt.receipt_number} issued.`,
      receipt,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

module.exports = {
  // Catalogue
  createInvestigation,
  updateInvestigation,
  toggleInvestigationStatus,
  getInvestigationCatalogue,
  getInvestigationById,
  // Orders
  createOrder,
  getOrders,
  getOrderById,
  getVisitOrders,
  getPatientOrders,
  getWorklist,
  updateOrderStatus,
  // Results
  enterResult,
  authorizeResult,
  amendResult,
  // Reports & Attachments
  getPrintableReport,
  uploadAttachment,
  getAttachments,
  deleteAttachment,
  // Central Billing
  getVisitBilling,
  collectCentralBillingPayment,
};

