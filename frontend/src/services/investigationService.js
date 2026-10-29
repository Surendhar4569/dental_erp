import api from './api';

const investigationService = {
  // ==========================================
  // MODULE A: INVESTIGATION CATALOGUE
  // ==========================================
  getCatalogue: async (params = {}) => {
    const response = await api.get('/investigations/catalogue', { params });
    return response.data;
  },

  createCatalogueItem: async (data) => {
    const response = await api.post('/investigations/catalogue', data);
    return response.data;
  },

  updateCatalogueItem: async (id, data) => {
    const response = await api.put(`/investigations/catalogue/${id}`, data);
    return response.data;
  },

  toggleCatalogueStatus: async (id, isActive) => {
    const response = await api.patch(`/investigations/catalogue/${id}/status`, { is_active: isActive });
    return response.data;
  },

  // ==========================================
  // MODULE B: ORDERS
  // ==========================================
  createOrder: async (data) => {
    const response = await api.post('/investigations/orders', data);
    return response.data;
  },

  getOrders: async (params = {}) => {
    if (params.visit_id) {
      const response = await api.get(`/investigations/orders/visit/${params.visit_id}`);
      return response.data;
    }
    if (params.patient_id) {
      const response = await api.get(`/investigations/orders/patient/${params.patient_id}`);
      return response.data;
    }
    const response = await api.get('/investigations/orders', { params });
    return response.data;
  },

  getOrdersByVisit: async (visitId) => {
    const response = await api.get(`/investigations/orders/visit/${visitId}`);
    return response.data;
  },

  getOrdersByPatient: async (patientId) => {
    const response = await api.get(`/investigations/orders/patient/${patientId}`);
    return response.data;
  },

  getOrderById: async (id) => {
    const response = await api.get(`/investigations/orders/${id}`);
    return response.data;
  },

  updateOrderStatus: async (orderId, data) => {
    const response = await api.patch(`/investigations/orders/${orderId}/status`, data);
    return response.data;
  },

  updateOrderItemStatus: async (orderId, itemId, data) => {
    const response = await api.patch(`/investigations/orders/${orderId}/items/${itemId}/status`, data);
    return response.data;
  },

  // ==========================================
  // MODULE G: WORKLIST
  // ==========================================
  getWorklist: async (params = {}) => {
    const response = await api.get('/investigations/worklist', { params });
    return response.data;
  },

  // ==========================================
  // MODULE E: RESULTS MANAGEMENT
  // ==========================================
  enterItemResult: async (orderId, itemId, data) => {
    const response = await api.post(`/investigations/orders/${orderId}/items/${itemId}/results`, data);
    return response.data;
  },

  authorizeResult: async (resultId) => {
    const response = await api.post(`/investigations/results/${resultId}/authorize`);
    return response.data;
  },

  amendResult: async (resultId, data) => {
    const response = await api.post(`/investigations/results/${resultId}/amend`, data);
    return response.data;
  },

  getResult: async (resultId) => {
    const response = await api.get(`/investigations/results/${resultId}`);
    return response.data;
  },

  // ==========================================
  // MODULE F: REPORTS & ATTACHMENTS
  // ==========================================
  getPrintableReport: async (orderId) => {
    const response = await api.get(`/investigations/orders/${orderId}/report`);
    return response.data;
  },

  getAttachments: async (orderId) => {
    const response = await api.get(`/investigations/orders/${orderId}/attachments`);
    return response.data;
  },

  uploadAttachment: async (orderId, data) => {
    const response = await api.post(`/investigations/orders/${orderId}/attachments`, data);
    return response.data;
  },

  deleteAttachment: async (orderId, attachmentId) => {
    const response = await api.delete(`/investigations/orders/${orderId}/attachments/${attachmentId}`);
    return response.data;
  },

  // ==========================================
  // MODULE C: CENTRAL BILLING INTEGRATION
  // ==========================================
  getVisitBillingSummary: async (visitId) => {
    const response = await api.get(`/investigations/billing/visit/${visitId}`);
    return response.data;
  },

  collectBillingPayment: async (data) => {
    const response = await api.post('/investigations/billing/pay', data);
    return response.data;
  },

  getBillingReceipt: async (paymentId, isReprint = false) => {
    const response = await api.get(`/investigations/billing/receipts/${paymentId}`, {
      params: { isReprint },
    });
    return response.data;
  },
};

export default investigationService;

