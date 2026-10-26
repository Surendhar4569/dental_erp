/**
 * Validation utilities for VoiceGate SaaS Platform Administration
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_REGEX = /^[A-Za-z0-9_-]{2,30}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validateOnboardClinic = (data) => {
  const errors = {};

  // Clinic Organization Validation
  if (!data.clinic_name || !data.clinic_name.trim()) {
    errors.clinic_name = 'Clinic organization name is required.';
  } else if (data.clinic_name.trim().length < 2 || data.clinic_name.trim().length > 200) {
    errors.clinic_name = 'Clinic name must be between 2 and 200 characters.';
  }

  if (!data.clinic_code || !data.clinic_code.trim()) {
    errors.clinic_code = 'Clinic organization code is required.';
  } else if (!CODE_REGEX.test(data.clinic_code.trim())) {
    errors.clinic_code = 'Clinic code must be 2-30 characters (letters, numbers, hyphens, underscores).';
  }

  if (data.email && !EMAIL_REGEX.test(data.email.trim())) {
    errors.email = 'Clinic contact email must be a valid email format.';
  }

  // Initial Administrator Validation
  const admin = data.admin_user || {};
  if (!admin.first_name || !admin.first_name.trim()) {
    errors.admin_first_name = 'Administrator first name is required.';
  }

  if (!admin.email || !admin.email.trim()) {
    errors.admin_email = 'Administrator email is required.';
  } else if (!EMAIL_REGEX.test(admin.email.trim())) {
    errors.admin_email = 'Administrator email must be a valid email format.';
  }

  if (!admin.password || admin.password.length < 8) {
    errors.admin_password = 'Administrator password must be at least 8 characters long.';
  }

  // Primary Branch Validation
  const branch = data.primary_branch || {};
  if (!branch.branch_name || !branch.branch_name.trim()) {
    errors.branch_name = 'Initial primary branch name is required.';
  }

  if (!branch.branch_code || !branch.branch_code.trim()) {
    errors.branch_code = 'Initial primary branch code is required.';
  } else if (!CODE_REGEX.test(branch.branch_code.trim())) {
    errors.branch_code = 'Branch code must be 2-30 characters (letters, numbers, hyphens, underscores).';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

const validateUpdateClinic = (data) => {
  const errors = {};

  if (data.name !== undefined && (!data.name.trim() || data.name.trim().length < 2)) {
    errors.name = 'Clinic name must be at least 2 characters.';
  }

  if (data.email && !EMAIL_REGEX.test(data.email.trim())) {
    errors.email = 'Valid email format required.';
  }

  if (data.max_branches_override !== undefined && data.max_branches_override !== null) {
    const override = parseInt(data.max_branches_override, 10);
    if (isNaN(override) || override < 1) {
      errors.max_branches_override = 'Branch override must be a positive number greater than or equal to 1.';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

const validatePlan = (data) => {
  const errors = {};

  if (!data.plan_code || !data.plan_code.trim()) {
    errors.plan_code = 'Plan code is required.';
  }

  if (!data.plan_name || !data.plan_name.trim()) {
    errors.plan_name = 'Plan display name is required.';
  }

  const maxBranches = parseInt(data.max_branches, 10);
  if (isNaN(maxBranches) || maxBranches < 1) {
    errors.max_branches = 'Maximum branches must be a positive integer >= 1.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

module.exports = {
  EMAIL_REGEX,
  CODE_REGEX,
  UUID_REGEX,
  validateOnboardClinic,
  validateUpdateClinic,
  validatePlan,
};
