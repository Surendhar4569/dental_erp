import api from './api';

export const scheduleService = {
  // List doctors assigned to a branch
  getBranchDoctors: async (branchId) => {
    const response = await api.get(`/schedules/branches/${branchId}/doctors`);
    return response.data;
  },

  // List doctors assigned to a branch with fee matrix
  getBranchDoctorFees: async (branchId, params = {}) => {
    const response = await api.get(`/schedules/branches/${branchId}/doctor-fees`, { params });
    return response.data;
  },

  // Get weekly schedule and sessions for a doctor
  getDoctorWeeklySchedule: async (branchId, doctorId) => {
    const response = await api.get(`/schedules/branches/${branchId}/doctors/${doctorId}`);
    return response.data;
  },

  // Save weekly schedule and sessions for a doctor
  saveDoctorWeeklySchedule: async (branchId, doctorId, schedules) => {
    const response = await api.put(`/schedules/branches/${branchId}/doctors/${doctorId}`, { schedules });
    return response.data;
  },

  // List exceptions (leaves, holidays, blocks) for a doctor
  getDoctorExceptions: async (branchId, doctorId, params = {}) => {
    const response = await api.get(`/schedules/branches/${branchId}/doctors/${doctorId}/exceptions`, { params });
    return response.data;
  },

  // Create an exception (leave, holiday, block, or custom hours)
  createDoctorException: async (branchId, doctorId, data) => {
    const response = await api.post(`/schedules/branches/${branchId}/doctors/${doctorId}/exceptions`, data);
    return response.data;
  },

  // Delete an exception
  deleteDoctorException: async (branchId, exceptionId) => {
    const response = await api.delete(`/schedules/branches/${branchId}/exceptions/${exceptionId}`);
    return response.data;
  },

  // Get consultation fee matrix for a doctor
  getDoctorFee: async (branchId, doctorId) => {
    const response = await api.get(`/schedules/branches/${branchId}/doctors/${doctorId}/fees`);
    return response.data;
  },

  // Save consultation fee configuration (Admin)
  saveDoctorFee: async (branchId, doctorId, feeData) => {
    const response = await api.put(`/schedules/branches/${branchId}/doctors/${doctorId}/fees`, feeData);
    return response.data;
  },

  // Calculate dynamic slot availability for a date
  getDoctorAvailableSlots: async (branchId, doctorId, date, duration = null, excludeAppointmentId = null) => {
    const params = { date };
    if (duration) params.duration = duration;
    if (excludeAppointmentId) params.excludeAppointmentId = excludeAppointmentId;
    const response = await api.get(`/schedules/branches/${branchId}/doctors/${doctorId}/slots`, { params });
    return response.data;
  },

  // Calculate doctor availability across a date range (for Calendar views)
  getDoctorAvailabilityRange: async (branchId, doctorId, startDate, endDate) => {
    const response = await api.get(
      `/schedules/branches/${branchId}/doctors/${doctorId}/availability-range`,
      { params: { startDate, endDate } }
    );
    return response.data;
  },

  // Get calendar events (working shifts, breaks, exceptions, appointments)
  getDoctorCalendarEvents: async (branchId, doctorId, startDate, endDate) => {
    const response = await api.get(
      `/schedules/branches/${branchId}/doctors/${doctorId}/calendar-events`,
      { params: { startDate, endDate } }
    );
    return response.data;
  },

  // Pre-flight check for schedule or exception conflicts
  checkScheduleConflicts: async (branchId, doctorId, payload) => {
    const response = await api.post(
      `/schedules/branches/${branchId}/doctors/${doctorId}/check-conflicts`,
      payload
    );
    return response.data;
  },

  // Get branch dental chairs
  getBranchChairs: async (branchId) => {
    const response = await api.get(`/schedules/branches/${branchId}/chairs`);
    return response.data;
  },

  // Save multi-date doctor schedule
  saveDoctorMultiDateSchedule: async (branchId, doctorId, payload) => {
    const response = await api.post(`/schedules/branches/${branchId}/doctors/${doctorId}/multi-date`, payload);
    return response.data;
  },

  // Get doctor date-specific schedules
  getDoctorDateSchedules: async (branchId, doctorId, params = {}) => {
    const response = await api.get(`/schedules/branches/${branchId}/doctors/${doctorId}/date-schedules`, { params });
    return response.data;
  },

  // Delete doctor date-specific schedule
  deleteDoctorDateSchedule: async (branchId, doctorId, scheduleDate) => {
    const response = await api.delete(`/schedules/branches/${branchId}/doctors/${doctorId}/date-schedules/${scheduleDate}`);
    return response.data;
  },

  // Get annual 12-month calendar overview
  getAnnualOverview: async (branchId, params = {}) => {
    const response = await api.get(`/schedules/branches/${branchId}/annual-overview`, { params });
    return response.data;
  },
};

