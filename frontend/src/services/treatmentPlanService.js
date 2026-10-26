import api from './api';

export const treatmentPlanService = {
  // 1. Get dental procedures master catalog
  getProcedures: async (params = {}) => {
    const response = await api.get('/clinical/treatment-plans/procedures', { params });
    return response.data;
  },

  // 2. Get all treatment plans for a patient
  getPatientPlans: async (patientId) => {
    const response = await api.get(`/clinical/patients/${patientId}/treatment-plans`);
    return response.data;
  },

  // 3. Get single plan with items, versions, and consent records
  getPlanById: async (planId) => {
    const response = await api.get(`/clinical/treatment-plans/${planId}`);
    return response.data;
  },

  // 4. Create new treatment plan
  createPlan: async (planData) => {
    const response = await api.post('/clinical/treatment-plans', planData);
    return response.data;
  },

  // 5. Update treatment plan header / notes
  updatePlan: async (planId, updateData) => {
    const response = await api.put(`/clinical/treatment-plans/${planId}`, updateData);
    return response.data;
  },

  // 6. Add item to treatment plan
  addPlanItem: async (planId, itemData) => {
    const response = await api.post(`/clinical/treatment-plans/${planId}/items`, itemData);
    return response.data;
  },

  // 7. Update item in treatment plan
  updatePlanItem: async (planId, itemId, itemData) => {
    const response = await api.put(`/clinical/treatment-plans/${planId}/items/${itemId}`, itemData);
    return response.data;
  },

  // 8. Delete item from treatment plan
  deletePlanItem: async (planId, itemId) => {
    const response = await api.delete(`/clinical/treatment-plans/${planId}/items/${itemId}`);
    return response.data;
  },

  // 9. Present treatment plan to patient
  presentPlan: async (planId, presentationNotes = '') => {
    const response = await api.post(`/clinical/treatment-plans/${planId}/present`, { presentationNotes });
    return response.data;
  },

  // 10. Approve treatment plan
  approvePlan: async (planId, approvalNotes = '') => {
    const response = await api.post(`/clinical/treatment-plans/${planId}/approve`, { approvalNotes });
    return response.data;
  },

  // 11. Update plan lifecycle status
  updatePlanStatus: async (planId, status, notes = '') => {
    const response = await api.post(`/clinical/treatment-plans/${planId}/status`, { status, notes });
    return response.data;
  },

  // 12. Create proposal bridge from odontogram
  proposeFromOdontogram: async (proposalData) => {
    const response = await api.post('/clinical/treatment-plans/propose-item', proposalData);
    return response.data;
  },

  // 13. Record patient consent
  recordConsent: async (planId, consentData) => {
    const response = await api.post(`/clinical/treatment-plans/${planId}/consent`, consentData);
    return response.data;
  },

  // 14. Amend consent / record withdrawal
  amendConsent: async (consentId, amendmentData) => {
    const response = await api.post(`/clinical/treatment-consents/${consentId}/amend`, amendmentData);
    return response.data;
  },
};

export default treatmentPlanService;
