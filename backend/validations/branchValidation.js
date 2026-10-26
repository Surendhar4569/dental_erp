/**
 * Validation helpers for Branch Management operations
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BRANCH_CODE_REGEX = /^[A-Za-z0-9_-]{2,50}$/;

const validateCreateBranch = (data) => {
  const errors = [];

  if (!data.branch_name || typeof data.branch_name !== 'string' || data.branch_name.trim().length < 2) {
    errors.push('Branch name is required and must be at least 2 characters long.');
  } else if (data.branch_name.trim().length > 200) {
    errors.push('Branch name cannot exceed 200 characters.');
  }

  if (!data.branch_code || typeof data.branch_code !== 'string' || !BRANCH_CODE_REGEX.test(data.branch_code.trim())) {
    errors.push('Branch code is required (2-50 characters, letters, numbers, hyphens, and underscores only).');
  }

  if (data.email && (!EMAIL_REGEX.test(data.email.trim()) || data.email.trim().length > 254)) {
    errors.push('Please provide a valid branch email address.');
  }

  if (data.phone && data.phone.trim().length > 30) {
    errors.push('Phone number cannot exceed 30 characters.');
  }

  if (data.city && data.city.trim().length > 100) {
    errors.push('City cannot exceed 100 characters.');
  }

  if (data.state && data.state.trim().length > 100) {
    errors.push('State cannot exceed 100 characters.');
  }

  if (data.postal_code && data.postal_code.trim().length > 20) {
    errors.push('Postal code cannot exceed 20 characters.');
  }

  if (data.country && data.country.trim().length > 100) {
    errors.push('Country cannot exceed 100 characters.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

const validateUpdateBranch = (data) => {
  const errors = [];

  if (data.branch_name !== undefined) {
    if (typeof data.branch_name !== 'string' || data.branch_name.trim().length < 2) {
      errors.push('Branch name must be at least 2 characters long.');
    } else if (data.branch_name.trim().length > 200) {
      errors.push('Branch name cannot exceed 200 characters.');
    }
  }

  if (data.branch_code !== undefined) {
    if (typeof data.branch_code !== 'string' || !BRANCH_CODE_REGEX.test(data.branch_code.trim())) {
      errors.push('Branch code must be 2-50 characters (letters, numbers, hyphens, and underscores only).');
    }
  }

  if (data.email && (!EMAIL_REGEX.test(data.email.trim()) || data.email.trim().length > 254)) {
    errors.push('Please provide a valid branch email address.');
  }

  if (data.phone && data.phone.trim().length > 30) {
    errors.push('Phone number cannot exceed 30 characters.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

const validateAssignUser = (data) => {
  const errors = [];

  if (!data.userId || !UUID_REGEX.test(data.userId)) {
    errors.push('A valid user ID (UUID) is required for assignment.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateCreateBranch,
  validateUpdateBranch,
  validateAssignUser,
  UUID_REGEX,
};
