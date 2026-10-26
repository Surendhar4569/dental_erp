/**
 * Holiday Master Validation Module
 */

const { DATE_REGEX, UUID_REGEX } = require('./scheduleValidation');

const VALID_CATEGORIES = ['national', 'state', 'festival', 'clinic_specific', 'optional', 'other'];

/**
 * Validates a single holiday record
 * @param {Object} data
 * @returns {{ isValid: boolean, errors: string[] }}
 */
const validateHoliday = (data) => {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['Holiday payload must be an object.'] };
  }

  // Name validation
  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
    errors.push('Holiday name is required and cannot be empty.');
  } else if (data.name.trim().length > 150) {
    errors.push('Holiday name cannot exceed 150 characters.');
  }

  // Date validation
  if (!data.holiday_date || !DATE_REGEX.test(data.holiday_date)) {
    errors.push('holiday_date is required in YYYY-MM-DD format.');
  } else {
    const d = new Date(data.holiday_date);
    if (isNaN(d.getTime())) {
      errors.push('holiday_date must be a valid calendar date.');
    }
  }

  // Category validation
  if (!data.category || !VALID_CATEGORIES.includes(data.category)) {
    errors.push(`category must be one of: ${VALID_CATEGORIES.join(', ')}.`);
  }

  // is_closed validation
  if (data.is_closed !== undefined && typeof data.is_closed !== 'boolean') {
    errors.push('is_closed must be a boolean (true or false).');
  }

  // branch_id validation (optional UUID)
  if (data.branch_id && !UUID_REGEX.test(data.branch_id)) {
    errors.push('branch_id must be a valid UUID or omitted.');
  }

  // doctor_id validation (optional UUID)
  if (data.doctor_id && !UUID_REGEX.test(data.doctor_id)) {
    errors.push('doctor_id must be a valid UUID or omitted.');
  }

  // description validation
  if (data.description && typeof data.description !== 'string') {
    errors.push('description must be a string.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validates a batch array of holidays
 * @param {Array} holidays
 * @returns {{ isValid: boolean, errors: string[] }}
 */
const validateBatchHolidays = (holidays) => {
  const errors = [];

  if (!Array.isArray(holidays) || holidays.length === 0) {
    return { isValid: false, errors: ['Batch holidays must be a non-empty array.'] };
  }

  const seenScopes = new Set();

  holidays.forEach((item, index) => {
    const single = validateHoliday(item);
    if (!single.isValid) {
      single.errors.forEach((err) => errors.push(`Item [${index}]: ${err}`));
    } else {
      const scopeKey = `${item.holiday_date}_${item.branch_id || 'null'}_${item.doctor_id || 'null'}`;
      if (seenScopes.has(scopeKey)) {
        errors.push(`Item [${index}]: Duplicate holiday entry for date ${item.holiday_date} with the same branch/doctor scope.`);
      }
      seenScopes.add(scopeKey);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  VALID_CATEGORIES,
  validateHoliday,
  validateBatchHolidays,
};
