/**
 * Dynamic Slot Availability Calculation Engine
 *
 * Rules:
 * - Deterministic, timezone-aware time slot calculation
 * - Evaluates weekly recurring sessions, buffer times, and slot durations
 * - Checks whole-day and partial-day exceptions (leaves, holidays, blocked intervals, custom hours)
 * - Identifies existing booked/active appointments
 * - Enforces past-time slot invalidation for the current date
 * - Designed for reuse by internal scheduling, reception desk, and external self-booking
 */

const { query } = require('../config/database');
const { getClinicLocalDate } = require('../utils/visitTokenGenerator');

/**
 * Converts HH:MM or HH:MM:SS string to total minutes from midnight
 */
const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  return parts[0] * 60 + parts[1];
};

/**
 * Converts minutes from midnight to HH:MM format
 */
const minutesToTime = (totalMinutes) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/**
 * Calculate available slots for a doctor at a branch on a given date
 * @param {string} clinicId - Clinic UUID
 * @param {string} branchId - Branch UUID
 * @param {string} doctorId - Doctor UUID
 * @param {string} dateStr - Date string 'YYYY-MM-DD'
 * @param {number} [customDuration] - Optional override duration in minutes
 * @param {string} [excludeAppointmentId] - Optional appointment ID to ignore (for rescheduling)
 */
const getDoctorAvailableSlots = async (
  clinicId,
  branchId,
  doctorId,
  dateInput,
  customDuration = null,
  excludeAppointmentId = null
) => {
  const dateStr =
    dateInput instanceof Date
      ? `${dateInput.getFullYear()}-${String(dateInput.getMonth() + 1).padStart(2, '0')}-${String(dateInput.getDate()).padStart(2, '0')}`
      : String(dateInput || '').slice(0, 10);

  // 1. Fetch branch timezone
  const branchRes = await query(`SELECT timezone FROM branches WHERE id = $1 AND clinic_id = $2`, [
    branchId,
    clinicId,
  ]);
  const timezone = branchRes.rows.length > 0 ? branchRes.rows[0].timezone : 'Asia/Kolkata';

  // Current local date & local time in branch timezone
  const todayLocalDate = getClinicLocalDate(timezone);
  let nowLocalMinutes = 0;
  if (dateStr === todayLocalDate) {
    try {
      const nowFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      });
      const [h, m] = nowFormatter.format(new Date()).split(':').map(Number);
      nowLocalMinutes = h * 60 + m;
    } catch {
      const d = new Date();
      nowLocalMinutes = d.getHours() * 60 + d.getMinutes();
    }
  }

  // 2. Determine Day of Week (0=Sunday ... 6=Saturday)
  const [year, month, day] = dateStr.split('-').map(Number);
  const targetDate = new Date(year, month - 1, day);
  const dayOfWeek = targetDate.getDay();

  // 2b. Verify Doctor-to-Branch Assignment
  const docAssignCheck = await query(
    `SELECT u.id
     FROM users u
     LEFT JOIN staff s ON s.user_id = u.id
     WHERE u.id = $1 AND u.clinic_id = $2
       AND (
         EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id = u.id AND ub.branch_id = $3)
         OR EXISTS (SELECT 1 FROM staff_branches sb WHERE s.id IS NOT NULL AND sb.staff_id = s.id AND sb.branch_id = $3)
       )`,
    [doctorId, clinicId, branchId]
  );
  if (docAssignCheck.rows.length === 0) {
    return {
      date: dateStr,
      dayOfWeek,
      doctorId,
      branchId,
      isAvailable: false,
      reason: 'Doctor is not assigned to this branch location.',
      slots: [],
    };
  }

  // 3. Check for Active Clinic/Branch Holidays on this date
  const holidayRes = await query(
    `SELECT id, name, category, is_closed, description
     FROM clinic_holidays
     WHERE clinic_id = $1
       AND (branch_id IS NULL OR branch_id = $2)
       AND (doctor_id IS NULL OR doctor_id = $3)
       AND holiday_date = $4
       AND is_active = true
     ORDER BY branch_id DESC NULLS LAST, doctor_id DESC NULLS LAST
     LIMIT 1`,
    [clinicId, branchId, doctorId, dateStr]
  );
  const activeHoliday = holidayRes.rows[0] || null;

  // 4. Check for Date-Specific Doctor Schedule (Multi-Date / Overrides)
  const dateSchedRes = await query(
    `SELECT id, slot_duration_minutes, buffer_minutes, is_active, is_working_override, override_reason
     FROM doctor_date_schedules
     WHERE clinic_id = $1 AND branch_id = $2 AND doctor_id = $3 AND schedule_date = $4 AND is_active = true`,
    [clinicId, branchId, doctorId, dateStr]
  );
  const dateSchedule = dateSchedRes.rows[0] || null;

  // Precedence Rule 1: Active Closed Holiday
  // If holiday is closed, it completely closes the day UNLESS doctor has an active special working override
  if (activeHoliday && activeHoliday.is_closed) {
    const hasWorkingOverride = dateSchedule && dateSchedule.is_working_override;
    if (!hasWorkingOverride) {
      return {
        date: dateStr,
        dayOfWeek,
        doctorId,
        branchId,
        isAvailable: false,
        isHoliday: true,
        holiday: {
          name: activeHoliday.name,
          category: activeHoliday.category,
          description: activeHoliday.description,
        },
        reason: `${activeHoliday.name} (${activeHoliday.category === 'national' ? 'National Holiday' : 'Clinic Holiday'})`,
        slots: [],
      };
    }
  }

  // 5. Check for Doctor Schedule Exceptions on this date (Leaves, Blocks)
  const excRes = await query(
    `SELECT exception_type, start_time, end_time, reason
     FROM doctor_schedule_exceptions
     WHERE clinic_id = $1 AND branch_id = $2 AND doctor_id = $3 AND exception_date = $4`,
    [clinicId, branchId, doctorId, dateStr]
  );

  const exceptions = excRes.rows;

  // Check whole-day exceptions (leave, holiday, blocked without start/end times)
  const fullDayException = exceptions.find(
    (e) => (e.exception_type === 'leave' || e.exception_type === 'holiday' || e.exception_type === 'blocked') &&
           (!e.start_time || !e.end_time)
  );

  if (fullDayException) {
    return {
      date: dateStr,
      dayOfWeek,
      doctorId,
      branchId,
      isAvailable: false,
      isLeave: true,
      reason: fullDayException.reason || `Doctor is on ${fullDayException.exception_type} for this entire date.`,
      slots: [],
    };
  }

  // Check if custom_hours exception is present
  const customHoursException = exceptions.find((e) => e.exception_type === 'custom_hours');

  let slotDuration = customDuration || 30;
  let bufferMinutes = 0;
  let workingSessions = [];
  let breakSessions = [];
  let isOverride = false;
  let overrideReason = null;

  if (customHoursException) {
    slotDuration = customDuration || 30;
    bufferMinutes = 0;
    workingSessions.push({
      session_name: 'Custom Hours',
      start_time: customHoursException.start_time,
      end_time: customHoursException.end_time,
    });
  } else if (dateSchedule) {
    // Precedence Rule 4: Date-Specific Schedule
    isOverride = Boolean(dateSchedule.is_working_override);
    overrideReason = dateSchedule.override_reason || null;
    slotDuration = customDuration || dateSchedule.slot_duration_minutes || 30;
    bufferMinutes = dateSchedule.buffer_minutes || 0;

    const sessRes = await query(
      `SELECT session_name, start_time, end_time, is_break, break_reason
       FROM doctor_date_schedule_sessions
       WHERE date_schedule_id = $1
       ORDER BY session_order ASC, start_time ASC`,
      [dateSchedule.id]
    );

    workingSessions = sessRes.rows.filter((s) => !s.is_break);
    breakSessions = sessRes.rows.filter((s) => s.is_break);

    if (workingSessions.length === 0) {
      return {
        date: dateStr,
        dayOfWeek,
        doctorId,
        branchId,
        isAvailable: false,
        reason: 'No working sessions configured for this date schedule.',
        slots: [],
      };
    }
  } else {
    // Precedence Rule 5: Fall back to Recurring Weekly Schedule
    const schedRes = await query(
      `SELECT id, slot_duration_minutes, buffer_minutes, is_active
       FROM doctor_schedules
       WHERE clinic_id = $1 AND branch_id = $2 AND doctor_id = $3 AND day_of_week = $4`,
      [clinicId, branchId, doctorId, dayOfWeek]
    );

    if (schedRes.rows.length === 0 || !schedRes.rows[0].is_active) {
      return {
        date: dateStr,
        dayOfWeek,
        doctorId,
        branchId,
        isAvailable: false,
        reason: 'Doctor is not scheduled to work on this day.',
        slots: [],
      };
    }

    const schedule = schedRes.rows[0];
    slotDuration = customDuration || schedule.slot_duration_minutes || 30;
    bufferMinutes = schedule.buffer_minutes || 0;

    const sessRes = await query(
      `SELECT session_name, start_time, end_time, is_break, break_reason
       FROM doctor_schedule_sessions
       WHERE schedule_id = $1
       ORDER BY session_order ASC, start_time ASC`,
      [schedule.id]
    );

    workingSessions = sessRes.rows.filter((s) => !s.is_break);
    breakSessions = sessRes.rows.filter((s) => s.is_break);

    if (workingSessions.length === 0) {
      return {
        date: dateStr,
        dayOfWeek,
        doctorId,
        branchId,
        isAvailable: false,
        reason: 'No working sessions configured for this day.',
        slots: [],
      };
    }
  }

  // Map scheduled breaks
  const scheduledBreaks = breakSessions.map((b) => ({
    startMin: timeToMinutes(b.start_time),
    endMin: timeToMinutes(b.end_time),
    reason: b.break_reason || b.session_name || 'Scheduled Break',
  }));


  // 5. Fetch partial-day blocks & active appointments
  const partialBlocks = exceptions
    .filter((e) => e.start_time && e.end_time && e.exception_type !== 'custom_hours')
    .map((e) => ({
      startMin: timeToMinutes(e.start_time),
      endMin: timeToMinutes(e.end_time),
      reason: e.reason || e.exception_type,
    }));

  // Query appointments across ALL branches for this doctor within this clinic
  let apptQuery = `
    SELECT a.id, a.appointment_number, a.start_time, a.end_time, a.branch_id, b.branch_name
    FROM appointments a
    JOIN branches b ON a.branch_id = b.id
    WHERE a.clinic_id = $1
      AND a.doctor_id = $2
      AND a.appointment_date = $3
      AND a.status NOT IN ('cancelled')
  `;
  const apptParams = [clinicId, doctorId, dateStr];

  if (excludeAppointmentId) {
    apptParams.push(excludeAppointmentId);
    apptQuery += ` AND a.id != $4`;
  }

  const apptRes = await query(apptQuery, apptParams);
  const bookedIntervals = apptRes.rows.map((a) => ({
    id: a.id,
    appointmentNumber: a.appointment_number,
    branchId: a.branch_id,
    branchName: a.branch_name,
    isOtherBranch: a.branch_id !== branchId,
    startMin: timeToMinutes(a.start_time),
    endMin: timeToMinutes(a.end_time),
  }));

  // 6. Generate Discrete Time Slots
  const generatedSlots = [];
  const step = slotDuration + bufferMinutes;
  const allBreaks = scheduledBreaks || [];

  for (const session of workingSessions) {
    const sessionStartMin = timeToMinutes(session.start_time);
    const sessionEndMin = timeToMinutes(session.end_time);

    let currStartMin = sessionStartMin;
    while (currStartMin + slotDuration <= sessionEndMin) {
      const currEndMin = currStartMin + slotDuration;
      const startTimeStr = minutesToTime(currStartMin);
      const endTimeStr = minutesToTime(currEndMin);

      let isAvailable = true;
      let status = 'available';
      let reason = null;

      // Check if slot has already passed today
      if (dateStr < todayLocalDate) {
        isAvailable = false;
        status = 'past';
        reason = 'Past date';
      } else if (dateStr === todayLocalDate && currStartMin <= nowLocalMinutes) {
        isAvailable = false;
        status = 'past';
        reason = 'Slot time has already passed today';
      }

      // Check partial blocks / leaves
      if (isAvailable) {
        const blockMatch = partialBlocks.find(
          (b) => currStartMin < b.endMin && currEndMin > b.startMin
        );
        if (blockMatch) {
          isAvailable = false;
          status = 'blocked';
          reason = `Doctor unavailable: ${blockMatch.reason}`;
        }
      }

      // Check scheduled breaks
      if (isAvailable) {
        const breakMatch = allBreaks.find(
          (b) => currStartMin < b.endMin && currEndMin > b.startMin
        );
        if (breakMatch) {
          isAvailable = false;
          status = 'break';
          reason = `Break: ${breakMatch.reason}`;
        }
      }

      // Check booked appointments (including cross-branch bookings)
      if (isAvailable) {
        const bookMatch = bookedIntervals.find(
          (b) => currStartMin < b.endMin && currEndMin > b.startMin
        );
        if (bookMatch) {
          isAvailable = false;
          status = 'booked';
          reason = bookMatch.isOtherBranch
            ? `Booked at ${bookMatch.branchName}`
            : `Booked (${bookMatch.appointmentNumber})`;
        }
      }

      generatedSlots.push({
        sessionName: session.session_name,
        startTime: startTimeStr,
        endTime: endTimeStr,
        isAvailable,
        status, // 'available', 'booked', 'break', 'blocked', 'past'
        reason,
      });

      currStartMin += step;
    }
  }

  // Generate explicit break slots for scheduled break sessions
  for (const bSession of breakSessions) {
    const bStartMin = timeToMinutes(bSession.start_time);
    const bEndMin = timeToMinutes(bSession.end_time);
    let currStartMin = bStartMin;
    while (currStartMin + slotDuration <= bEndMin) {
      const currEndMin = currStartMin + slotDuration;
      generatedSlots.push({
        sessionName: bSession.session_name || 'Break',
        startTime: minutesToTime(currStartMin),
        endTime: minutesToTime(currEndMin),
        isAvailable: false,
        status: 'break',
        reason: `Break: ${bSession.break_reason || bSession.session_name || 'Scheduled Break'}`,
      });
      currStartMin += step;
    }
  }

  // Sort all slots chronologically by startTime
  generatedSlots.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const availableCount = generatedSlots.filter((s) => s.isAvailable).length;

  return {
    date: dateStr,
    dayOfWeek,
    doctorId,
    branchId,
    slotDurationMinutes: slotDuration,
    bufferMinutes,
    totalSlots: generatedSlots.length,
    availableSlotsCount: availableCount,
    isAvailable: availableCount > 0,
    isHoliday: Boolean(activeHoliday),
    holiday: activeHoliday ? { name: activeHoliday.name, category: activeHoliday.category } : null,
    isOverride,
    overrideReason,
    slots: generatedSlots,
  };
};

/**
 * Calculate slot availability across a date range (for Calendar Day/Week/Month views)
 */
const getDoctorAvailabilityRange = async (clinicId, branchId, doctorId, startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dayDiff = Math.round((end - start) / (1000 * 60 * 60 * 24));

  if (dayDiff < 0 || dayDiff > 35) {
    const err = new Error('Date range must be between 1 and 35 days.');
    err.statusCode = 400;
    throw err;
  }

  const days = [];
  const current = new Date(start);

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    const dayAvail = await getDoctorAvailableSlots(clinicId, branchId, doctorId, dateStr);
    days.push({
      date: dateStr,
      dayOfWeek: dayAvail.dayOfWeek,
      isAvailable: dayAvail.isAvailable,
      isHoliday: dayAvail.isHoliday || false,
      holiday: dayAvail.holiday || null,
      isOverride: dayAvail.isOverride || false,
      isLeave: dayAvail.isLeave || false,
      reason: dayAvail.reason || null,
      totalSlots: dayAvail.totalSlots || 0,
      availableSlotsCount: dayAvail.availableSlotsCount || 0,
      bookedSlotsCount: (dayAvail.slots || []).filter((s) => s.status === 'booked').length,
      breakSlotsCount: (dayAvail.slots || []).filter((s) => s.status === 'break').length,
      slots: dayAvail.slots || [],
    });
    current.setDate(current.getDate() + 1);
  }

  return {
    startDate,
    endDate,
    doctorId,
    branchId,
    days,
  };
};

module.exports = {
  getDoctorAvailableSlots,
  getDoctorAvailabilityRange,
  timeToMinutes,
  minutesToTime,
};
