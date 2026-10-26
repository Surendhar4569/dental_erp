import api from './api';

export const appointmentService = {
  // List appointments with filtering and pagination
  getAppointments: async (params = {}) => {
    const response = await api.get('/appointments', { params });
    return response.data;
  },

  // Get appointment full details
  getAppointmentById: async (id) => {
    const response = await api.get(`/appointments/${id}`);
    return response.data;
  },

  // Book a new appointment
  createAppointment: async (appointmentData) => {
    const response = await api.post('/appointments', appointmentData);
    return response.data;
  },

  // Reschedule an appointment
  rescheduleAppointment: async (id, rescheduleData) => {
    const response = await api.patch(`/appointments/${id}/reschedule`, rescheduleData);
    return response.data;
  },

  // Cancel an appointment
  cancelAppointment: async (id, cancellationReason) => {
    const response = await api.patch(`/appointments/${id}/cancel`, {
      cancellation_reason: cancellationReason,
    });
    return response.data;
  },

  // Update appointment status (confirmed, in_consultation, completed, no_show)
  updateAppointmentStatus: async (id, status, notes = '') => {
    const response = await api.patch(`/appointments/${id}/status`, { status, notes });
    return response.data;
  },

  // Check in appointment and generate daily token
  checkInAppointment: async (id) => {
    const response = await api.post(`/appointments/${id}/check-in`);
    return response.data;
  },

  // Create immediate walk-in appointment and allocate queue token
  createWalkInAppointment: async (walkInData) => {
    const response = await api.post('/appointments/walk-in', walkInData);
    return response.data;
  },

  // Get real-time reception desk metrics for today
  getReceptionMetrics: async () => {
    const response = await api.get('/appointments/reception/metrics');
    return response.data;
  },

  // Record consultation payment and generate receipt
  recordPayment: async (appointmentId, paymentData) => {
    const response = await api.post(`/appointments/${appointmentId}/payments`, paymentData);
    return response.data;
  },

  // Retrieve payment receipt (optionally tracking reprint)
  getReceipt: async (paymentId, isReprint = false) => {
    const response = await api.get(`/appointments/payments/${paymentId}/receipt`, {
      params: { reprint: isReprint },
    });
    return response.data;
  },

  // Get all payments for an appointment
  getAppointmentPayments: async (appointmentId) => {
    const response = await api.get(`/appointments/${appointmentId}/payments`);
    return response.data;
  },
};
