/**
 * Doctor Schedule & Availability Validation Module
 */

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Converts HH:MM or HH:MM:SS string to total minutes from midnight for easy comparison.
 */
const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  return parts[0] * 60 + parts[1];
};

/**
 * Validates weekly schedule configuration payload
 * @param {Array} schedules - Array of day schedule objects
 */
const validateWeeklySchedule = (schedules) => {
  const errors = [];

  if (!Array.isArray(schedules)) {
    return { isValid: false, errors: ['Schedules must be provided as an array of daily schedules.'] };
  }

  const seenDays = new Set();

  schedules.forEach((item, index) => {
    const prefix = `Schedule[${index}]`;

    if (item.day_of_week === undefined || item.day_of_week === null || !Number.isInteger(Number(item.day_of_week))) {
      errors.push(`${prefix}: day_of_week must be an integer between 0 (Sunday) and 6 (Saturday).`);
    } else {
      const day = Number(item.day_of_week);
      if (day < 0 || day > 6) {
        errors.push(`${prefix}: day_of_week must be between 0 and 6.`);
      }
      if (seenDays.has(day)) {
        errors.push(`${prefix}: Duplicate configuration for day_of_week ${day}. Each day must appear at most once.`);
      }
      seenDays.add(day);
    }

    if (item.slot_duration_minutes !== undefined) {
      const dur = Number(item.slot_duration_minutes);
      if (isNaN(dur) || ![15, 30, 45, 60].includes(dur)) {
        errors.push(`${prefix}: slot_duration_minutes must be one of: 15, 30, 45, 60.`);
      }
    }

    if (item.buffer_minutes !== undefined) {
      const buf = Number(item.buffer_minutes);
      if (isNaN(buf) || buf < 0 || buf > 120) {
        errors.push(`${prefix}: buffer_minutes must be between 0 and 120 minutes.`);
      }
    }

    if (item.effective_from && !DATE_REGEX.test(item.effective_from)) {
      errors.push(`${prefix}: effective_from must be in YYYY-MM-DD format.`);
    }
    if (item.effective_to && !DATE_REGEX.test(item.effective_to)) {
      errors.push(`${prefix}: effective_to must be in YYYY-MM-DD format.`);
    }
    if (item.effective_from && item.effective_to && item.effective_from > item.effective_to) {
      errors.push(`${prefix}: effective_from cannot be later than effective_to.`);
    }

    if (item.sessions) {
      if (!Array.isArray(item.sessions)) {
        errors.push(`${prefix}: sessions must be an array.`);
      } else {
        const sortedWorking = [];
        const sortedBreaks = [];

        item.sessions.forEach((sess, sIdx) => {
          const sPrefix = `${prefix}.session[${sIdx}]`;
          if (!sess.start_time || !TIME_REGEX.test(sess.start_time)) {
            errors.push(`${sPrefix}: valid start_time (HH:MM or HH:MM:SS) is required.`);
          }
          if (!sess.end_time || !TIME_REGEX.test(sess.end_time)) {
            errors.push(`${sPrefix}: valid end_time (HH:MM or HH:MM:SS) is required.`);
          }

          if (sess.start_time && sess.end_time && TIME_REGEX.test(sess.start_time) && TIME_REGEX.test(sess.end_time)) {
            const startMin = timeToMinutes(sess.start_time);
            const endMin = timeToMinutes(sess.end_time);

            if (startMin >= endMin) {
              errors.push(`${sPrefix}: start_time (${sess.start_time}) must be earlier than end_time (${sess.end_time}).`);
            } else if (sess.is_break) {
              sortedBreaks.push({ startMin, endMin, name: sess.session_name || sess.break_reason || `Break ${sIdx + 1}` });
            } else {
              sortedWorking.push({ startMin, endMin, name: sess.session_name || `Session ${sIdx + 1}` });
            }
          }
        });

        // Check for working session overlaps
        sortedWorking.sort((a, b) => a.startMin - b.startMin);
        for (let i = 0; i < sortedWorking.length - 1; i++) {
          if (sortedWorking[i].endMin > sortedWorking[i + 1].startMin) {
            errors.push(`${prefix}: Working sessions "${sortedWorking[i].name}" and "${sortedWorking[i + 1].name}" overlap.`);
          }
        }

        // Check for break overlaps
        sortedBreaks.sort((a, b) => a.startMin - b.startMin);
        for (let i = 0; i < sortedBreaks.length - 1; i++) {
          if (sortedBreaks[i].endMin > sortedBreaks[i + 1].startMin) {
            errors.push(`${prefix}: Break sessions "${sortedBreaks[i].name}" and "${sortedBreaks[i + 1].name}" overlap.`);
          }
        }
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validates doctor schedule exception payload
 * @param {Object} data
 */
const validateScheduleException = (data) => {
  const errors = [];

  if (!data.exception_date || !DATE_REGEX.test(data.exception_date)) {
    errors.push('exception_date is required in YYYY-MM-DD format.');
  }

  const validTypes = ['leave', 'holiday', 'blocked', 'custom_hours'];
  if (!data.exception_type || !validTypes.includes(data.exception_type)) {
    errors.push(`exception_type must be one of: ${validTypes.join(', ')}.`);
  }

  if (!data.reason || typeof data.reason !== 'string' || !data.reason.trim()) {
    errors.push('reason is required.');
  }

  if (data.exception_type === 'custom_hours') {
    if (!data.start_time || !TIME_REGEX.test(data.start_time)) {
      errors.push('start_time (HH:MM) is required for custom_hours.');
    }
    if (!data.end_time || !TIME_REGEX.test(data.end_time)) {
      errors.push('end_time (HH:MM) is required for custom_hours.');
    }
    if (data.start_time && data.end_time && TIME_REGEX.test(data.start_time) && TIME_REGEX.test(data.end_time)) {
      if (timeToMinutes(data.start_time) >= timeToMinutes(data.end_time)) {
        errors.push('start_time must be earlier than end_time.');
      }
    }
  } else {
    // If times are optionally provided for blocked/leave/holiday, validate order
    if (data.start_time && data.end_time) {
      if (!TIME_REGEX.test(data.start_time) || !TIME_REGEX.test(data.end_time)) {
        errors.push('start_time and end_time must be valid time formats (HH:MM).');
      } else if (timeToMinutes(data.start_time) >= timeToMinutes(data.end_time)) {
        errors.push('start_time must be earlier than end_time.');
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validates doctor fee configuration
 * @param {Object} fees
 */
const validateDoctorFee = (fees) => {
  const errors = [];

  if (fees.consultation_fee === undefined || fees.consultation_fee === null || fees.consultation_fee === '') {
    errors.push('consultation_fee is required.');
  } else {
    const num = Number(fees.consultation_fee);
    if (isNaN(num) || num < 0) {
      errors.push('consultation_fee must be a non-negative number.');
    }
  }

  const checkOptionalFee = (val, fieldName) => {
    if (val !== undefined && val !== null && val !== '') {
      const num = Number(val);
      if (isNaN(num) || num < 0) {
        errors.push(`${fieldName} must be a non-negative number.`);
      }
    }
  };

  checkOptionalFee(fees.followup_fee, 'followup_fee');
  checkOptionalFee(fees.emergency_fee, 'emergency_fee');

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validates a multi-date schedule configuration payload
 * @param {Object} payload
 * @returns {{ isValid: boolean, errors: string[] }}
 */
const validateMultiDateSchedulePayload = (payload) => {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    return { isValid: false, errors: ['Payload must be an object.'] };
  }

  // Dates validation
  if (!Array.isArray(payload.dates) || payload.dates.length === 0) {
    errors.push('dates must be a non-empty array of dates in YYYY-MM-DD format.');
  } else {
    const seen = new Set();
    payload.dates.forEach((dStr, idx) => {
      if (!DATE_REGEX.test(dStr)) {
        errors.push(`dates[${idx}] "${dStr}" must be in YYYY-MM-DD format.`);
      } else {
        const parsed = new Date(dStr);
        if (isNaN(parsed.getTime())) {
          errors.push(`dates[${idx}] "${dStr}" is an invalid calendar date.`);
        } else if (seen.has(dStr)) {
          errors.push(`Duplicate date detected: "${dStr}".`);
        }
        seen.add(dStr);
      }
    });
  }

  // Mode validation
  const validModes = ['uniform', 'weekly_template', 'custom'];
  const mode = payload.mode || 'uniform';
  if (!validModes.includes(mode)) {
    errors.push(`mode must be one of: ${validModes.join(', ')}.`);
  }

  // Validate sessions helper
  const validateSessionList = (sessions, prefix = 'sessions') => {
    if (!Array.isArray(sessions)) {
      errors.push(`${prefix} must be an array of sessions.`);
      return;
    }
    const sortedWorking = [];
    const sortedBreaks = [];

    sessions.forEach((sess, sIdx) => {
      const sPrefix = `${prefix}[${sIdx}]`;
      if (!sess.start_time || !TIME_REGEX.test(sess.start_time)) {
        errors.push(`${sPrefix}: valid start_time (HH:MM or HH:MM:SS) is required.`);
      }
      if (!sess.end_time || !TIME_REGEX.test(sess.end_time)) {
        errors.push(`${sPrefix}: valid end_time (HH:MM or HH:MM:SS) is required.`);
      }

      if (sess.start_time && sess.end_time && TIME_REGEX.test(sess.start_time) && TIME_REGEX.test(sess.end_time)) {
        const startMin = timeToMinutes(sess.start_time);
        const endMin = timeToMinutes(sess.end_time);

        if (startMin >= endMin) {
          errors.push(`${sPrefix}: start_time (${sess.start_time}) must be earlier than end_time (${sess.end_time}).`);
        } else if (sess.is_break) {
          sortedBreaks.push({ startMin, endMin, name: sess.session_name || sess.break_reason || `Break ${sIdx + 1}` });
        } else {
          sortedWorking.push({ startMin, endMin, name: sess.session_name || `Session ${sIdx + 1}` });
        }
      }
    });

    sortedWorking.sort((a, b) => a.startMin - b.startMin);
    for (let i = 0; i < sortedWorking.length - 1; i++) {
      if (sortedWorking[i].endMin > sortedWorking[i + 1].startMin) {
        errors.push(`${prefix}: Working sessions "${sortedWorking[i].name}" and "${sortedWorking[i + 1].name}" overlap.`);
      }
    }

    sortedBreaks.sort((a, b) => a.startMin - b.startMin);
    for (let i = 0; i < sortedBreaks.length - 1; i++) {
      if (sortedBreaks[i].endMin > sortedBreaks[i + 1].startMin) {
        errors.push(`${prefix}: Break sessions "${sortedBreaks[i].name}" and "${sortedBreaks[i + 1].name}" overlap.`);
      }
    }
  };

  if (mode === 'uniform') {
    if (payload.slot_duration_minutes !== undefined) {
      const dur = Number(payload.slot_duration_minutes);
      if (isNaN(dur) || ![15, 30, 45, 60].includes(dur)) {
        errors.push('slot_duration_minutes must be one of: 15, 30, 45, 60.');
      }
    }
    if (payload.buffer_minutes !== undefined) {
      const buf = Number(payload.buffer_minutes);
      if (isNaN(buf) || buf < 0 || buf > 120) {
        errors.push('buffer_minutes must be between 0 and 120.');
      }
    }
    if (payload.sessions) {
      validateSessionList(payload.sessions, 'sessions');
    }
  } else if (mode === 'custom') {
    if (!payload.date_configs || typeof payload.date_configs !== 'object') {
      errors.push('date_configs object mapping each date to its configuration is required for custom mode.');
    } else {
      (payload.dates || []).forEach((dateStr) => {
        const config = payload.date_configs[dateStr];
        if (!config) {
          errors.push(`Missing configuration for date ${dateStr} in date_configs.`);
        } else {
          if (config.slot_duration_minutes !== undefined) {
            const dur = Number(config.slot_duration_minutes);
            if (isNaN(dur) || ![15, 30, 45, 60].includes(dur)) {
              errors.push(`date_configs["${dateStr}"].slot_duration_minutes must be 15, 30, 45, or 60.`);
            }
          }
          if (config.sessions) {
            validateSessionList(config.sessions, `date_configs["${dateStr}"].sessions`);
          }
        }
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  TIME_REGEX,
  DATE_REGEX,
  UUID_REGEX,
  timeToMinutes,
  validateWeeklySchedule,
  validateScheduleException,
  validateDoctorFee,
  validateMultiDateSchedulePayload,
};

