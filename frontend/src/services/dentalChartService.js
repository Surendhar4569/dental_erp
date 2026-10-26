import api from './api';

export const dentalChartService = {
  // 1. Get active dental conditions master list
  getConditions: async () => {
    const response = await api.get('/clinical/dental-chart/conditions');
    return response.data;
  },

  // 2. Get patient living dental chart (with optional visitId)
  getPatientChart: async (patientId, visitId = null) => {
    const response = await api.get(`/clinical/patients/${patientId}/dental-chart`, {
      params: visitId ? { visitId } : {},
    });
    return response.data;
  },

  // 3. Get chronological history for an individual tooth
  getToothHistory: async (patientId, toothNumber) => {
    const response = await api.get(`/clinical/patients/${patientId}/teeth/${toothNumber}/history`);
    return response.data;
  },

  // 4. Record a tooth- or surface-level finding for an active visit
  recordFinding: async (payload) => {
    const response = await api.post('/clinical/dental-chart/findings', payload);
    return response.data;
  },

  // 5. Delete/cancel a finding from an active draft visit
  deleteFinding: async (findingId) => {
    const response = await api.delete(`/clinical/dental-chart/findings/${findingId}`);
    return response.data;
  },

  // 6. Append legal amendment to a signed/locked chart finding
  amendFinding: async (findingId, amendmentData) => {
    const response = await api.post(`/clinical/dental-chart/findings/${findingId}/amend`, amendmentData);
    return response.data;
  },
};

export default dentalChartService;
