/**
 * Staff Validation Schemas & Helpers
 */

const VALID_STAFF_CATEGORIES = [
  'dentist',
  'specialist',
  'receptionist',
  'assistant',
  'hygienist',
  'nurse',
  'technician',
  'manager',
  'billing',
  'pharmacist',
  'support',
  'other',
];

const VALID_EMPLOYMENT_STATUSES = ['active', 'probation', 'on_leave', 'terminated'];

const VALID_LOGIN_ROLES = [
  'admin',
  'dentist',
  'specialist',
  'receptionist',
  'assistant',
  'billing',
  'radiologist',
  'inventory',
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9\s\-()]{7,20}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates staff creation payload
 */
const validateCreateStaff = (data) => {
  const errors = [];

  if (!data.first_name || typeof data.first_name !== 'string' || !data.first_name.trim()) {
    errors.push('first_name is required.');
  }

  if (!data.phone || typeof data.phone !== 'string' || !PHONE_REGEX.test(data.phone.trim())) {
    errors.push('Valid phone number (7-20 digits) is required.');
  }

  if (!data.staff_category || !VALID_STAFF_CATEGORIES.includes(data.staff_category)) {
    errors.push(`staff_category must be one of: ${VALID_STAFF_CATEGORIES.join(', ')}.`);
  }

  if (data.email && !EMAIL_REGEX.test(data.email.trim())) {
    errors.push('email must be a valid email address.');
  }

  if (data.employment_status && !VALID_EMPLOYMENT_STATUSES.includes(data.employment_status)) {
    errors.push(`employment_status must be one of: ${VALID_EMPLOYMENT_STATUSES.join(', ')}.`);
  }

  if (data.date_of_birth && !DATE_REGEX.test(data.date_of_birth)) {
    errors.push('date_of_birth must be in YYYY-MM-DD format.');
  }

  if (data.joining_date && !DATE_REGEX.test(data.joining_date)) {
    errors.push('joining_date must be in YYYY-MM-DD format.');
  }

  if (data.branch_id && !UUID_REGEX.test(data.branch_id)) {
    errors.push('branch_id must be a valid UUID.');
  }

  // Login account creation validation
  if (data.create_login) {
    const loginEmail = data.login_email || data.email;
    if (!loginEmail || !EMAIL_REGEX.test(loginEmail.trim())) {
      errors.push('Valid login email is required when create_login is enabled.');
    }
    if (!data.password || typeof data.password !== 'string' || data.password.length < 6) {
      errors.push('password must be at least 6 characters long when create_login is enabled.');
    }
    if (!data.role || !VALID_LOGIN_ROLES.includes(data.role)) {
      errors.push(`role must be one of: ${VALID_LOGIN_ROLES.join(', ')}.`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validates staff update payload
 */
const validateUpdateStaff = (data) => {
  const errors = [];

  if (data.first_name !== undefined && (!data.first_name || typeof data.first_name !== 'string' || !data.first_name.trim())) {
    errors.push('first_name cannot be empty.');
  }

  if (data.phone !== undefined && (!data.phone || typeof data.phone !== 'string' || !PHONE_REGEX.test(data.phone.trim()))) {
    errors.push('Valid phone number is required.');
  }

  if (data.staff_category !== undefined && !VALID_STAFF_CATEGORIES.includes(data.staff_category)) {
    errors.push(`staff_category must be one of: ${VALID_STAFF_CATEGORIES.join(', ')}.`);
  }

  if (data.email && !EMAIL_REGEX.test(data.email.trim())) {
    errors.push('email must be a valid email address.');
  }

  if (data.employment_status !== undefined && !VALID_EMPLOYMENT_STATUSES.includes(data.employment_status)) {
    errors.push(`employment_status must be one of: ${VALID_EMPLOYMENT_STATUSES.join(', ')}.`);
  }

  if (data.date_of_birth && !DATE_REGEX.test(data.date_of_birth)) {
    errors.push('date_of_birth must be in YYYY-MM-DD format.');
  }

  if (data.joining_date && !DATE_REGEX.test(data.joining_date)) {
    errors.push('joining_date must be in YYYY-MM-DD format.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  VALID_STAFF_CATEGORIES,
  VALID_EMPLOYMENT_STATUSES,
  VALID_LOGIN_ROLES,
  validateCreateStaff,
  validateUpdateStaff,
};
