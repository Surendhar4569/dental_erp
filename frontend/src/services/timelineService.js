import api from './api';

export const timelineService = {
  // Get patient chronological medical timeline with filtering & pagination
  getPatientTimeline: async (patientId, params = {}) => {
    const response = await api.get(`/patients/${patientId}/timeline`, { params });
    return response.data;
  },

  // Get full unified encounter records for a specific visit
  getVisitEncounterRecords: async (patientId, visitId) => {
    const url = patientId
      ? `/patients/${patientId}/visits/${visitId}/records`
      : `/patients/visits/${visitId}/records`;
    const response = await api.get(url);
    return response.data;
  },
};

export default timelineService;
