import api from './api';

export const patientService = {
  // List patients with pagination, search, and branch filtering
  getPatients: async (params = {}) => {
    const response = await api.get('/patients', { params });
    return response.data;
  },

  // Check duplicate patients before registration
  checkDuplicate: async (phone, email) => {
    const response = await api.get('/patients/check-duplicate', {
      params: { phone, email },
    });
    return response.data;
  },

  // Get single patient profile with medical records (by UUID or numeric Patient ID)
  getPatientById: async (id) => {
    const response = await api.get(`/patients/${id}`);
    return response.data;
  },

  // Register a new patient with permanent numeric Patient ID
  registerPatient: async (patientData) => {
    const response = await api.post('/patients', patientData);
    return response.data;
  },

  // Update existing patient demographics
  updatePatient: async (id, patientData) => {
    const response = await api.put(`/patients/${id}`, patientData);
    return response.data;
  },

  // Update patient medical record (clinical roles only)
  updateMedicalRecord: async (id, medicalData) => {
    const response = await api.put(`/patients/${id}/medical`, medicalData);
    return response.data;
  },

  // Change patient status (active / inactive / archived)
  updatePatientStatus: async (id, status, reason = '') => {
    const response = await api.patch(`/patients/${id}/status`, { status, reason });
    return response.data;
  },

  // Create a new visit and generate its daily branch-specific token
  createVisit: async (patientId, visitData) => {
    const response = await api.post(`/patients/${patientId}/visits`, visitData);
    return response.data;
  },

  // List a patient's cross-branch visit history
  getPatientVisits: async (patientId) => {
    const response = await api.get(`/patients/${patientId}/visits`);
    return response.data;
  },

  // Retrieve the branch's daily visit queue for today
  getBranchDailyQueue: async (branchId, params = {}) => {
    const response = await api.get(`/branches/${branchId}/visits/today`, { params });
    return response.data;
  },

  // Update visit status (queued / in_progress / completed / cancelled)
  updateVisitStatus: async (visitId, status, notes = '') => {
    const response = await api.patch(`/visits/${visitId}/status`, { status, notes });
    return response.data;
  },

  // Retrieve a visit and its patient information
  getVisitById: async (visitId) => {
    const response = await api.get(`/visits/${visitId}`);
    return response.data;
  },

  // Phase 5: Visit-Wise Patient History & Medical Record Timeline
  getPatientTimeline: async (patientId, params = {}) => {
    const response = await api.get(`/patients/${patientId}/timeline`, { params });
    return response.data;
  },

  // Phase 5: Unified Encounter Records for a Visit
  getVisitEncounterRecords: async (patientId, visitId) => {
    const url = patientId
      ? `/patients/${patientId}/visits/${visitId}/records`
      : `/patients/visits/${visitId}/records`;
    const response = await api.get(url);
    return response.data;
  },
};

