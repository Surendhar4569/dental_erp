/**
 * Appointment Validation Module
 */

const { TIME_REGEX, DATE_REGEX, UUID_REGEX, timeToMinutes } = require('./scheduleValidation');

const VALID_APPOINTMENT_TYPES = ['consultation', 'followup', 'procedure', 'emergency', 'walk_in'];
const VALID_BOOKING_SOURCES = ['reception', 'walk_in', 'online_website', 'online_portal', 'phone'];
const VALID_APPOINTMENT_STATUSES = [
  'scheduled',
  'confirmed',
  'checked_in',
  'in_consultation',
  'completed',
  'cancelled',
  'no_show',
];

/**
 * Validates create appointment request
 */
const validateCreateAppointment = (data) => {
  const errors = [];

  if (!data.doctor_id || !UUID_REGEX.test(data.doctor_id)) {
    errors.push('doctor_id must be a valid UUID.');
  }

  // Patient can be an existing UUID, or new patient details for quick-booking
  if (!data.patient_id && !data.new_patient) {
    errors.push('Either patient_id (UUID) or new_patient object is required.');
  }

  if (data.patient_id && !UUID_REGEX.test(data.patient_id)) {
    errors.push('patient_id must be a valid UUID.');
  }

  if (data.new_patient) {
    if (!data.new_patient.first_name || !data.new_patient.first_name.trim()) {
      errors.push('new_patient.first_name is required.');
    }
    if (!data.new_patient.last_name || !data.new_patient.last_name.trim()) {
      errors.push('new_patient.last_name is required.');
    }
    if (!data.new_patient.phone || !data.new_patient.phone.trim()) {
      errors.push('new_patient.phone is required.');
    }
  }

  if (!data.appointment_date || !DATE_REGEX.test(data.appointment_date)) {
    errors.push('appointment_date is required in YYYY-MM-DD format.');
  }

  if (!data.start_time || !TIME_REGEX.test(data.start_time)) {
    errors.push('start_time is required in HH:MM format.');
  }

  if (!data.end_time || !TIME_REGEX.test(data.end_time)) {
    errors.push('end_time is required in HH:MM format.');
  }

  if (data.start_time && data.end_time && TIME_REGEX.test(data.start_time) && TIME_REGEX.test(data.end_time)) {
    if (timeToMinutes(data.start_time) >= timeToMinutes(data.end_time)) {
      errors.push('start_time must be strictly earlier than end_time.');
    }
  }

  if (data.appointment_type && !VALID_APPOINTMENT_TYPES.includes(data.appointment_type)) {
    errors.push(`appointment_type must be one of: ${VALID_APPOINTMENT_TYPES.join(', ')}.`);
  }

  if (data.booking_source && !VALID_BOOKING_SOURCES.includes(data.booking_source)) {
    errors.push(`booking_source must be one of: ${VALID_BOOKING_SOURCES.join(', ')}.`);
  }

  if (data.booking_channel && !VALID_BOOKING_SOURCES.includes(data.booking_channel)) {
    errors.push(`booking_channel must be one of: ${VALID_BOOKING_SOURCES.join(', ')}.`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validates reschedule request
 */
const validateRescheduleAppointment = (data) => {
  const errors = [];

  if (!data.appointment_date || !DATE_REGEX.test(data.appointment_date)) {
    errors.push('appointment_date is required in YYYY-MM-DD format.');
  }

  if (!data.start_time || !TIME_REGEX.test(data.start_time)) {
    errors.push('start_time is required in HH:MM format.');
  }

  if (!data.end_time || !TIME_REGEX.test(data.end_time)) {
    errors.push('end_time is required in HH:MM format.');
  }

  if (data.start_time && data.end_time && TIME_REGEX.test(data.start_time) && TIME_REGEX.test(data.end_time)) {
    if (timeToMinutes(data.start_time) >= timeToMinutes(data.end_time)) {
      errors.push('start_time must be strictly earlier than end_time.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validates cancellation request
 */
const validateCancelAppointment = (data) => {
  const errors = [];

  if (!data.cancellation_reason || !data.cancellation_reason.trim()) {
    errors.push('cancellation_reason is required to cancel an appointment.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validates status transition
 */
const isValidStatusTransition = (currentStatus, newStatus) => {
  if (currentStatus === newStatus) return true;

  const validTransitions = {
    scheduled: ['confirmed', 'checked_in', 'cancelled', 'no_show'],
    confirmed: ['checked_in', 'cancelled', 'no_show'],
    checked_in: ['in_consultation', 'cancelled'],
    in_consultation: ['completed', 'cancelled'],
    completed: [], // Terminal
    cancelled: [], // Terminal
    no_show: ['scheduled'], // Re-open
  };

  const allowed = validTransitions[currentStatus] || [];
  return allowed.includes(newStatus);
};

module.exports = {
  VALID_APPOINTMENT_TYPES,
  VALID_BOOKING_SOURCES,
  VALID_APPOINTMENT_STATUSES,
  validateCreateAppointment,
  validateRescheduleAppointment,
  validateCancelAppointment,
  isValidStatusTransition,
};
