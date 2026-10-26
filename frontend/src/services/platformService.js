import api from './api';

export const platformService = {
  // Platform Overview & KPIs
  getOverview: async () => {
    const res = await api.get('/platform/overview');
    return res.data;
  },

  // Clinic Organization Management
  getClinics: async (params = {}) => {
    const res = await api.get('/platform/clinics', { params });
    return res.data;
  },

  getClinicById: async (id) => {
    const res = await api.get(`/platform/clinics/${id}`);
    return res.data;
  },

  onboardClinic: async (clinicData) => {
    const res = await api.post('/platform/clinics/onboard', clinicData);
    return res.data;
  },

  updateClinic: async (id, data) => {
    const res = await api.put(`/platform/clinics/${id}`, data);
    return res.data;
  },

  updateClinicStatus: async (id, statusData) => {
    const res = await api.patch(`/platform/clinics/${id}/status`, statusData);
    return res.data;
  },

  assignPlan: async (clinicId, planData) => {
    const res = await api.post(`/platform/clinics/${clinicId}/plan`, planData);
    return res.data;
  },

  // Subscription Plans
  getPlans: async () => {
    const res = await api.get('/platform/plans');
    return res.data;
  },

  createPlan: async (planData) => {
    const res = await api.post('/platform/plans', planData);
    return res.data;
  },

  updatePlan: async (id, planData) => {
    const res = await api.put(`/platform/plans/${id}`, planData);
    return res.data;
  },
};

export default platformService;
