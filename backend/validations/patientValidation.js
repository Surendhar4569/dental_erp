/**
 * Validation helpers for Patient Management operations
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{5,20}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const ALLOWED_GENDERS = ['male', 'female', 'other', 'unspecified'];
const ALLOWED_STATUSES = ['active', 'inactive', 'archived'];

/**
 * Validates registration payload for a new patient
 */
const validateRegisterPatient = (data) => {
  const errors = [];

  const firstName = data.first_name || data.firstName;
  if (!firstName || typeof firstName !== 'string' || firstName.trim().length === 0) {
    errors.push('Patient first name is required.');
  } else if (firstName.trim().length > 100) {
    errors.push('First name cannot exceed 100 characters.');
  }

  const lastName = data.last_name !== undefined ? data.last_name : data.lastName;
  if (lastName && (typeof lastName !== 'string' || lastName.trim().length > 100)) {
    errors.push('Last name cannot exceed 100 characters.');
  }

  const phone = data.phone;
  if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
    errors.push('Mobile phone number is required.');
  } else if (!PHONE_REGEX.test(phone.trim())) {
    errors.push('Please provide a valid phone number (digits, optional +, space, or hyphen).');
  } else if (phone.trim().length > 30) {
    errors.push('Phone number cannot exceed 30 characters.');
  }

  const email = data.email;
  if (email && email.trim().length > 0) {
    if (!EMAIL_REGEX.test(email.trim()) || email.trim().length > 254) {
      errors.push('Please provide a valid email address.');
    }
  }

  const dob = data.date_of_birth || data.dateOfBirth;
  if (dob) {
    if (!DATE_REGEX.test(dob)) {
      errors.push('Date of birth must be in YYYY-MM-DD format.');
    } else {
      const parsedDate = new Date(dob);
      if (isNaN(parsedDate.getTime())) {
        errors.push('Invalid date of birth.');
      } else if (parsedDate > new Date()) {
        errors.push('Date of birth cannot be in the future.');
      }
    }
  }

  const gender = data.gender;
  if (gender && !ALLOWED_GENDERS.includes(gender.toLowerCase())) {
    errors.push(`Gender must be one of: ${ALLOWED_GENDERS.join(', ')}.`);
  }

  const branchId = data.branch_id || data.branchId;
  if (branchId && !UUID_REGEX.test(branchId)) {
    errors.push('Registration branch ID must be a valid UUID.');
  }

  // Address fields validation
  if (data.city && data.city.trim().length > 100) {
    errors.push('City cannot exceed 100 characters.');
  }
  if (data.state && data.state.trim().length > 100) {
    errors.push('State cannot exceed 100 characters.');
  }
  if (data.postal_code && data.postal_code.trim().length > 20) {
    errors.push('Postal code cannot exceed 20 characters.');
  }

  // Emergency contact validation
  if (data.emergency_contact_phone && !PHONE_REGEX.test(data.emergency_contact_phone.trim())) {
    errors.push('Emergency contact phone is not a valid format.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validates demographic update payload for an existing patient
 */
const validateUpdatePatient = (data) => {
  const errors = [];

  const firstName = data.first_name !== undefined ? data.first_name : data.firstName;
  if (firstName !== undefined) {
    if (typeof firstName !== 'string' || firstName.trim().length === 0) {
      errors.push('First name cannot be empty.');
    } else if (firstName.trim().length > 100) {
      errors.push('First name cannot exceed 100 characters.');
    }
  }

  const lastName = data.last_name !== undefined ? data.last_name : data.lastName;
  if (lastName !== undefined && lastName !== null) {
    if (typeof lastName !== 'string' || lastName.trim().length > 100) {
      errors.push('Last name cannot exceed 100 characters.');
    }
  }

  const phone = data.phone;
  if (phone !== undefined) {
    if (typeof phone !== 'string' || phone.trim().length === 0) {
      errors.push('Phone number cannot be empty.');
    } else if (!PHONE_REGEX.test(phone.trim())) {
      errors.push('Please provide a valid phone number.');
    } else if (phone.trim().length > 30) {
      errors.push('Phone number cannot exceed 30 characters.');
    }
  }

  const email = data.email;
  if (email !== undefined && email !== null && email.trim().length > 0) {
    if (!EMAIL_REGEX.test(email.trim()) || email.trim().length > 254) {
      errors.push('Please provide a valid email address.');
    }
  }

  const dob = data.date_of_birth !== undefined ? data.date_of_birth : data.dateOfBirth;
  if (dob !== undefined && dob !== null && dob !== '') {
    if (!DATE_REGEX.test(dob)) {
      errors.push('Date of birth must be in YYYY-MM-DD format.');
    } else {
      const parsedDate = new Date(dob);
      if (isNaN(parsedDate.getTime())) {
        errors.push('Invalid date of birth.');
      } else if (parsedDate > new Date()) {
        errors.push('Date of birth cannot be in the future.');
      }
    }
  }

  const gender = data.gender;
  if (gender !== undefined && !ALLOWED_GENDERS.includes(gender.toLowerCase())) {
    errors.push(`Gender must be one of: ${ALLOWED_GENDERS.join(', ')}.`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validates medical profile update payload
 */
const validateMedicalRecord = (data) => {
  const errors = [];

  if (data.medical_alert_details && data.medical_alert_details.trim().length > 255) {
    errors.push('Medical alert details cannot exceed 255 characters.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validates patient status change
 */
const validateStatusChange = (status) => {
  const errors = [];
  if (!status || !ALLOWED_STATUSES.includes(status.toLowerCase())) {
    errors.push(`Status must be one of: ${ALLOWED_STATUSES.join(', ')}.`);
  }
  return {
    isValid: errors.length === 0,
    errors,
  };
};

const ALLOWED_VISIT_STATUSES = ['queued', 'in_progress', 'completed', 'cancelled'];
const ALLOWED_VISIT_TYPES = ['consultation', 'treatment', 'emergency', 'follow_up', 'checkup'];

/**
 * Validates visit creation payload
 */
const validateCreateVisit = (data) => {
  const errors = [];
  const branchId = data.branch_id || data.branchId;
  if (branchId && !UUID_REGEX.test(branchId)) {
    errors.push('Branch ID must be a valid UUID.');
  }

  const visitType = data.visit_type || data.visitType;
  if (visitType && !ALLOWED_VISIT_TYPES.includes(visitType.toLowerCase())) {
    errors.push(`Visit type must be one of: ${ALLOWED_VISIT_TYPES.join(', ')}.`);
  }

  const status = data.status;
  if (status && !ALLOWED_VISIT_STATUSES.includes(status.toLowerCase())) {
    errors.push(`Status must be one of: ${ALLOWED_VISIT_STATUSES.join(', ')}.`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validates visit status update
 */
const validateVisitStatus = (status) => {
  const errors = [];
  if (!status || !ALLOWED_VISIT_STATUSES.includes(status.toLowerCase())) {
    errors.push(`Status must be one of: ${ALLOWED_VISIT_STATUSES.join(', ')}.`);
  }
  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  UUID_REGEX,
  validateRegisterPatient,
  validateUpdatePatient,
  validateMedicalRecord,
  validateStatusChange,
  validateCreateVisit,
  validateVisitStatus,
  ALLOWED_GENDERS,
  ALLOWED_STATUSES,
  ALLOWED_VISIT_STATUSES,
  ALLOWED_VISIT_TYPES,
};
