import api from './api';

export const clinicalService = {
  // Record pre-consultation vitals & triage assessment (Phase 1.5)
  recordVisitVitals: async (vitalsData) => {
    const response = await api.post('/clinical/vitals', vitalsData);
    return response.data;
  },

  // Get pre-consultation vitals recorded for a visit encounter
  getVisitVitals: async (visitId) => {
    const response = await api.get(`/clinical/visits/${visitId}/vitals`);
    return response.data;
  },

  // Create or retrieve examination draft for a patient visit encounter
  createOrGetDraft: async (draftData) => {
    const response = await api.post('/clinical/draft', draftData);
    return response.data;
  },

  // Get single examination by its UUID
  getExaminationById: async (id) => {
    const response = await api.get(`/clinical/examinations/${id}`);
    return response.data;
  },

  // Get examination by visit encounter UUID
  getExaminationByVisitId: async (visitId) => {
    const response = await api.get(`/clinical/visits/${visitId}/examination`);
    return response.data;
  },

  // Save/update draft examination content (doctor/clinical role)
  updateDraft: async (id, draftData) => {
    const response = await api.put(`/clinical/examinations/${id}`, draftData);
    return response.data;
  },

  // Secure doctor digital sign-off and seal
  signExamination: async (id) => {
    const response = await api.post(`/clinical/examinations/${id}/sign`);
    return response.data;
  },

  // Explicit administrative/doctor lock
  lockExamination: async (id) => {
    const response = await api.post(`/clinical/examinations/${id}/lock`);
    return response.data;
  },

  // Append immutable legal amendment to signed/locked examination
  addAmendment: async (id, amendmentData) => {
    const response = await api.post(`/clinical/examinations/${id}/amendments`, amendmentData);
    return response.data;
  },

  // Toggle patient portal release visibility (authorized staff only)
  setPatientRelease: async (id, isReleasedToPatient) => {
    const response = await api.patch(`/clinical/examinations/${id}/release`, {
      is_released_to_patient: isReleasedToPatient,
    });
    return response.data;
  },

  // Safe patient portal preview for visit
  getPatientPortalPreview: async (visitId, patientId) => {
    const response = await api.get(`/clinical/visits/${visitId}/patient-portal-preview`, {
      params: patientId ? { patientId } : {},
    });
    return response.data;
  },
};

export default clinicalService;
