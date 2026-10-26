import api from './api';

export const prescriptionService = {
  // 1. Get all prescriptions for a patient (with optional filters)
  getPatientPrescriptions: async (patientId, params = {}) => {
    const response = await api.get(`/clinical/patients/${patientId}/prescriptions`, { params });
    return response.data;
  },

  // 2. Get prescriptions for an active visit encounter
  getVisitPrescriptions: async (visitId) => {
    const response = await api.get(`/clinical/visits/${visitId}/prescriptions`);
    return response.data;
  },

  // 3. Get single prescription details by ID
  getPrescriptionById: async (id) => {
    const response = await api.get(`/clinical/prescriptions/${id}`);
    return response.data;
  },

  // 4. Create new prescription draft
  createPrescription: async (data) => {
    const response = await api.post('/clinical/prescriptions', data);
    return response.data;
  },

  // 5. Update draft prescription header
  updatePrescriptionDraft: async (id, data) => {
    const response = await api.put(`/clinical/prescriptions/${id}`, data);
    return response.data;
  },

  // 6. Add medication item to draft prescription
  addPrescriptionItem: async (id, itemData) => {
    const response = await api.post(`/clinical/prescriptions/${id}/items`, itemData);
    return response.data;
  },

  // 7. Update medication item in draft prescription
  updatePrescriptionItem: async (id, itemId, itemData) => {
    const response = await api.put(`/clinical/prescriptions/${id}/items/${itemId}`, itemData);
    return response.data;
  },

  // 8. Delete medication item from draft prescription
  deletePrescriptionItem: async (id, itemId) => {
    const response = await api.delete(`/clinical/prescriptions/${id}/items/${itemId}`);
    return response.data;
  },

  // 9. Sign prescription (Doctor Digital Sign-Off)
  signPrescription: async (id, allergyAcknowledgement = null) => {
    const response = await api.post(`/clinical/prescriptions/${id}/sign`, {
      allergyAcknowledgement,
    });
    return response.data;
  },

  // 10. Cancel prescription with reason
  cancelPrescription: async (id, reason) => {
    const response = await api.post(`/clinical/prescriptions/${id}/cancel`, { reason });
    return response.data;
  },

  // 11. Amend / replace signed prescription
  amendPrescription: async (id, amendData) => {
    const response = await api.post(`/clinical/prescriptions/${id}/amend`, amendData);
    return response.data;
  },

  // 12. Get print-ready data for browser print / PDF export
  getPrintData: async (id) => {
    const response = await api.get(`/clinical/prescriptions/${id}/print`);
    return response.data;
  },
};

export default prescriptionService;
