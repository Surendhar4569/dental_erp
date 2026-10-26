/**
 * Doctor Schedule & Availability Controller
 */

const scheduleService = require('../services/scheduleService');
const availabilityService = require('../services/availabilityService');
const {
  validateWeeklySchedule,
  validateScheduleException,
  validateDoctorFee,
  validateMultiDateSchedulePayload,
  DATE_REGEX,
} = require('../validations/scheduleValidation');
const { recordAuditLog } = require('../utils/auditLogger');

/**
 * List doctors assigned to a branch
 * GET /api/schedules/branches/:branchId/doctors
 */
const getBranchDoctors = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = req.branch.id;

    const doctors = await scheduleService.getBranchDoctors(clinicId, branchId);
    res.json({
      success: true,
      doctors,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get doctor weekly schedule
 * GET /api/schedules/branches/:branchId/doctors/:doctorId
 */
const getDoctorWeeklySchedule = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = req.branch.id;
    const { doctorId } = req.params;

    const schedules = await scheduleService.getDoctorWeeklySchedule(clinicId, branchId, doctorId);
    res.json({
      success: true,
      schedules,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Save doctor weekly schedule
 * PUT /api/schedules/branches/:branchId/doctors/:doctorId
 */
const saveDoctorWeeklySchedule = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = req.branch.id;
    const { doctorId } = req.params;
    const { schedules } = req.body;

    const validation = validateWeeklySchedule(schedules);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid schedule payload.',
        errors: validation.errors,
      });
    }

    const result = await scheduleService.saveDoctorWeeklySchedule(
      clinicId,
      branchId,
      doctorId,
      schedules,
      userId
    );

    await recordAuditLog({
      userId,
      clinicId,
      branchId,
      action: 'DOCTOR_SCHEDULE_UPDATED',
      entityType: 'doctor_schedules',
      entityId: doctorId,
      details: {
        doctorId,
        daysUpdated: schedules.map((s) => s.day_of_week),
        warningsCount: result.warnings.length,
      },
    });

    res.json({
      success: true,
      message: 'Weekly schedule updated successfully.',
      schedules: result.schedules,
      warnings: result.warnings,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List doctor schedule exceptions
 * GET /api/schedules/branches/:branchId/doctors/:doctorId/exceptions
 */
const getDoctorExceptions = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = req.branch.id;
    const { doctorId } = req.params;
    const { startDate, endDate } = req.query;

    const exceptions = await scheduleService.getDoctorExceptions(
      clinicId,
      branchId,
      doctorId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      exceptions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create doctor schedule exception
 * POST /api/schedules/branches/:branchId/doctors/:doctorId/exceptions
 */
const createDoctorException = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = req.branch.id;
    const { doctorId } = req.params;

    const validation = validateScheduleException(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: validation.errors,
      });
    }

    const result = await scheduleService.createDoctorException(
      clinicId,
      branchId,
      doctorId,
      req.body,
      userId
    );

    await recordAuditLog({
      userId,
      clinicId,
      branchId,
      action: 'DOCTOR_EXCEPTION_CREATED',
      entityType: 'doctor_schedule_exceptions',
      entityId: result.exception.id,
      details: {
        doctorId,
        exceptionType: req.body.exception_type,
        exceptionDate: req.body.exception_date,
        conflictsCount: result.conflicts.length,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Schedule exception created successfully.',
      exception: result.exception,
      conflicts: result.conflicts,
    });
  } catch (error) {
    if (error.statusCode === 409) {
      return res.status(409).json({
        success: false,
        message: error.message,
        conflicts: error.conflicts || [],
      });
    }
    next(error);
  }
};

/**
 * Delete doctor schedule exception
 * DELETE /api/schedules/branches/:branchId/exceptions/:exceptionId
 */
const deleteDoctorException = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = req.branch.id;
    const { exceptionId } = req.params;

    const deleted = await scheduleService.deleteDoctorException(clinicId, branchId, exceptionId);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Schedule exception not found or already deleted.',
      });
    }

    await recordAuditLog({
      userId,
      clinicId,
      branchId,
      action: 'DOCTOR_EXCEPTION_DELETED',
      entityType: 'doctor_schedule_exceptions',
      entityId: exceptionId,
    });

    res.json({
      success: true,
      message: 'Schedule exception deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get doctor consultation fee
 * GET /api/schedules/branches/:branchId/doctors/:doctorId/fees
 */
const getDoctorFee = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = req.branch.id;
    const { doctorId } = req.params;

    const fees = await scheduleService.getDoctorFee(clinicId, branchId, doctorId);
    res.json({
      success: true,
      fees,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List all doctors assigned to branch with their fees matrix
 * GET /api/schedules/branches/:branchId/doctor-fees
 */
const getBranchDoctorFees = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = req.branch.id;
    const options = {
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
    };

    const result = await scheduleService.getBranchDoctorsWithFees(clinicId, branchId, options);
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Save doctor consultation fee
 * PUT /api/schedules/branches/:branchId/doctors/:doctorId/fees
 */
const saveDoctorFee = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = req.branch.id;
    const { doctorId } = req.params;

    const validation = validateDoctorFee(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid fee configuration.',
        errors: validation.errors,
      });
    }

    const feeRecord = await scheduleService.saveDoctorFee(clinicId, branchId, doctorId, req.body);

    await recordAuditLog({
      userId,
      clinicId,
      branchId,
      action: 'DOCTOR_FEE_UPDATED',
      entityType: 'doctor_branch_fees',
      entityId: feeRecord.id,
      details: {
        doctorId,
        consultationFee: req.body.consultation_fee,
        followupFee: req.body.followup_fee,
        emergencyFee: req.body.emergency_fee,
        scope: req.body.scope || 'branch',
        reason: req.body.reason || 'Fee schedule adjustment',
      },
    });

    res.json({
      success: true,
      message: 'Doctor fee configuration saved successfully.',
      fee: feeRecord,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get available slots for doctor on a specific date
 * GET /api/schedules/branches/:branchId/doctors/:doctorId/slots?date=YYYY-MM-DD&duration=30
 */
const getDoctorAvailableSlots = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = req.branch.id;
    const { doctorId } = req.params;
    const { date, duration, excludeAppointmentId } = req.query;

    if (!date || !DATE_REGEX.test(date)) {
      return res.status(400).json({
        success: false,
        message: 'Valid date query parameter in YYYY-MM-DD format is required.',
      });
    }

    const customDuration = duration ? parseInt(duration, 10) : null;
    const availability = await availabilityService.getDoctorAvailableSlots(
      clinicId,
      branchId,
      doctorId,
      date,
      customDuration,
      excludeAppointmentId
    );

    res.json({
      success: true,
      availability,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Pre-flight conflict check for proposed schedule changes or exceptions
 * POST /api/schedules/branches/:branchId/doctors/:doctorId/check-conflicts
 */
const checkScheduleConflicts = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = req.branch.id;
    const { doctorId } = req.params;

    const result = await scheduleService.checkScheduleConflicts(
      clinicId,
      branchId,
      doctorId,
      req.body
    );

    res.json({
      success: true,
      conflictCount: result.conflictCount,
      conflictingAppointments: result.conflictingAppointments,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve doctor calendar events (shifts, breaks, exceptions, appointments)
 * GET /api/schedules/branches/:branchId/doctors/:doctorId/calendar-events
 */
const getDoctorCalendarEvents = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = req.branch.id;
    const { doctorId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate query parameters are required in YYYY-MM-DD format.',
      });
    }

    const events = await scheduleService.getDoctorCalendarEvents(
      clinicId,
      branchId,
      doctorId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      ...events,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Calculate doctor slot availability across a date range
 * GET /api/schedules/branches/:branchId/doctors/:doctorId/availability-range
 */
const getDoctorAvailabilityRange = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = req.branch.id;
    const { doctorId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate query parameters are required in YYYY-MM-DD format.',
      });
    }

    const range = await availabilityService.getDoctorAvailabilityRange(
      clinicId,
      branchId,
      doctorId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      ...range,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get branch dental chairs
 * GET /api/schedules/branches/:branchId/chairs
 */
const getBranchChairs = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = req.branch.id;
    const chairs = await scheduleService.getBranchChairs(clinicId, branchId);
    res.json({
      success: true,
      chairs,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Save multi-date doctor schedule
 * POST /api/schedules/branches/:branchId/doctors/:doctorId/multi-date
 */
const saveDoctorMultiDateSchedule = async (req, res, next) => {
  try {
    const { clinicId, id: userId, role } = req.user;
    const branchId = req.branch.id;
    const { doctorId } = req.params;

    if (role === 'dentist' || role === 'specialist') {
      if (userId !== doctorId) {
        return res.status(403).json({
          success: false,
          message: 'Dentists and specialists can only configure their own schedule.',
        });
      }
    }

    const validation = validateMultiDateSchedulePayload(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid multi-date schedule payload.',
        errors: validation.errors,
      });
    }

    const result = await scheduleService.saveDoctorMultiDateSchedule(
      clinicId,
      branchId,
      doctorId,
      req.body,
      userId,
      req.ip
    );

    res.status(200).json({
      success: true,
      message: `Successfully scheduled ${result.count} date(s).`,
      schedules: result.schedules,
    });
  } catch (error) {
    if (error.statusCode === 409) {
      return res.status(409).json({
        success: false,
        message: error.message,
        conflictCount: error.conflictCount || (error.conflictingAppointments ? error.conflictingAppointments.length : 0),
        conflictingAppointments: error.conflictingAppointments || [],
      });
    }
    if (error.statusCode === 422) {
      return res.status(422).json({
        success: false,
        message: error.message,
        holidayDate: error.holidayDate,
        holidayName: error.holidayName,
      });
    }
    next(error);
  }
};

/**
 * Get doctor date-specific schedules
 * GET /api/schedules/branches/:branchId/doctors/:doctorId/date-schedules
 */
const getDoctorDateSchedules = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = req.branch.id;
    const { doctorId } = req.params;
    const { startDate, endDate } = req.query;

    const schedules = await scheduleService.getDoctorDateSchedules(
      clinicId,
      branchId,
      doctorId,
      startDate || '2000-01-01',
      endDate || '2099-12-31'
    );

    res.json({
      success: true,
      count: schedules.length,
      schedules,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete doctor date-specific schedule
 * DELETE /api/schedules/branches/:branchId/doctors/:doctorId/date-schedules/:scheduleDate
 */
const deleteDoctorDateSchedule = async (req, res, next) => {
  try {
    const { clinicId, id: userId, role } = req.user;
    const branchId = req.branch.id;
    const { doctorId, scheduleDate } = req.params;

    if (role === 'dentist' || role === 'specialist') {
      if (userId !== doctorId) {
        return res.status(403).json({
          success: false,
          message: 'Dentists and specialists can only manage their own schedule.',
        });
      }
    }

    const result = await scheduleService.deleteDoctorDateSchedule(
      clinicId,
      branchId,
      doctorId,
      scheduleDate,
      userId,
      req.ip
    );

    res.json({
      success: true,
      message: 'Date-specific schedule removed successfully.',
      result,
    });
  } catch (error) {
    if (error.statusCode === 409) {
      return res.status(409).json({
        success: false,
        message: error.message,
        conflictingAppointments: error.conflictingAppointments || [],
      });
    }
    next(error);
  }
};

/**
 * Get annual calendar 12-month overview
 * GET /api/schedules/branches/:branchId/annual-overview
 */
const getAnnualOverview = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = req.branch.id;
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const doctorId = req.query.doctorId || null;

    const overview = await scheduleService.getAnnualOverview(
      clinicId,
      branchId,
      year,
      doctorId
    );

    res.json({
      success: true,
      overview,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBranchDoctors,
  getBranchDoctorFees,
  getDoctorWeeklySchedule,
  saveDoctorWeeklySchedule,
  getDoctorExceptions,
  createDoctorException,
  deleteDoctorException,
  getDoctorFee,
  saveDoctorFee,
  getDoctorAvailableSlots,
  checkScheduleConflicts,
  getDoctorCalendarEvents,
  getDoctorAvailabilityRange,
  getBranchChairs,
  saveDoctorMultiDateSchedule,
  getDoctorDateSchedules,
  deleteDoctorDateSchedule,
  getAnnualOverview,
};

