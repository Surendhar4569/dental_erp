/**
 * Appointment & Billing Controller
 */

const appointmentService = require('../services/appointmentService');
const paymentService = require('../services/paymentService');
const {
  validateCreateAppointment,
  validateRescheduleAppointment,
  validateCancelAppointment,
} = require('../validations/appointmentValidation');
const { recordAuditLog } = require('../utils/auditLogger');

/**
 * Create a new appointment
 * POST /api/appointments
 */
const createAppointment = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = req.branch.id;

    const validation = validateCreateAppointment(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: validation.errors,
      });
    }

    const appt = await appointmentService.createAppointment(
      clinicId,
      branchId,
      req.body,
      userId
    );

    await recordAuditLog({
      userId,
      clinicId,
      branchId,
      action: 'APPOINTMENT_CREATED',
      entityType: 'appointments',
      entityId: appt.id,
      details: {
        appointmentNumber: appt.appointment_number,
        patientId: appt.patient_id,
        doctorId: appt.doctor_id,
        appointmentDate: appt.appointment_date,
        startTime: appt.start_time,
        fee: appt.consultation_fee,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully.',
      appointment: appt,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * List appointments with filters and pagination
 * GET /api/appointments
 */
const getAppointmentsList = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = req.branch.id;

    const result = await appointmentService.getAppointmentsList(
      clinicId,
      branchId,
      req.query
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get appointment by ID
 * GET /api/appointments/:id
 */
const getAppointmentById = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = req.branch.id;
    const { id } = req.params;

    const appt = await appointmentService.getAppointmentById(clinicId, branchId, id);
    if (!appt) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found.',
      });
    }

    res.json({
      success: true,
      appointment: appt,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reschedule appointment
 * PATCH /api/appointments/:id/reschedule
 */
const rescheduleAppointment = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = req.branch.id;
    const { id } = req.params;

    const validation = validateRescheduleAppointment(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: validation.errors,
      });
    }

    const appt = await appointmentService.rescheduleAppointment(
      clinicId,
      branchId,
      id,
      req.body,
      userId
    );

    await recordAuditLog({
      userId,
      clinicId,
      branchId,
      action: 'APPOINTMENT_RESCHEDULED',
      entityType: 'appointments',
      entityId: id,
      details: {
        appointmentNumber: appt.appointment_number,
        newDate: req.body.appointment_date,
        newStartTime: req.body.start_time,
        reason: req.body.reason,
      },
    });

    res.json({
      success: true,
      message: 'Appointment rescheduled successfully.',
      appointment: appt,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Cancel appointment
 * PATCH /api/appointments/:id/cancel
 */
const cancelAppointment = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = req.branch.id;
    const { id } = req.params;

    const validation = validateCancelAppointment(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: validation.errors,
      });
    }

    const appt = await appointmentService.cancelAppointment(
      clinicId,
      branchId,
      id,
      req.body.cancellation_reason,
      userId
    );

    await recordAuditLog({
      userId,
      clinicId,
      branchId,
      action: 'APPOINTMENT_CANCELLED',
      entityType: 'appointments',
      entityId: id,
      details: {
        appointmentNumber: appt.appointment_number,
        reason: req.body.cancellation_reason,
      },
    });

    res.json({
      success: true,
      message: 'Appointment cancelled successfully.',
      appointment: appt,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Update appointment status (e.g. confirmed, in_consultation, completed, no_show)
 * PATCH /api/appointments/:id/status
 */
const updateAppointmentStatus = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = req.branch.id;
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'status field is required.',
      });
    }

    const appt = await appointmentService.updateAppointmentStatus(
      clinicId,
      branchId,
      id,
      status,
      notes,
      userId
    );

    await recordAuditLog({
      userId,
      clinicId,
      branchId,
      action: 'APPOINTMENT_STATUS_UPDATED',
      entityType: 'appointments',
      entityId: id,
      details: {
        appointmentNumber: appt.appointment_number,
        newStatus: status,
        notes,
      },
    });

    res.json({
      success: true,
      message: `Appointment status updated to ${status}.`,
      appointment: appt,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Check in appointment & allocate daily queue token
 * POST /api/appointments/:id/check-in
 */
const checkInAppointment = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = req.branch.id;
    const { id } = req.params;

    const result = await appointmentService.checkInAppointment(
      clinicId,
      branchId,
      id,
      userId
    );

    await recordAuditLog({
      userId,
      clinicId,
      branchId,
      action: 'APPOINTMENT_CHECKED_IN',
      entityType: 'appointments',
      entityId: id,
      details: {
        appointmentNumber: result.appointment.appointment_number,
        visitToken: result.visit.token_display,
        visitId: result.visit.id,
      },
    });

    res.json({
      success: true,
      message: `Patient checked in. Daily token #${result.visit.token_display} issued.`,
      appointment: result.appointment,
      visit: result.visit,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Quick walk-in appointment registration & queue token issuance
 * POST /api/appointments/walk-in
 */
const createWalkInAppointment = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = req.branch.id;

    if (!req.body.doctor_id) {
      return res.status(400).json({
        success: false,
        message: 'doctor_id is required for walk-in appointment.',
      });
    }

    const result = await appointmentService.createWalkInAppointment(
      clinicId,
      branchId,
      req.body,
      userId
    );

    await recordAuditLog({
      userId,
      clinicId,
      branchId,
      action: 'WALK_IN_APPOINTMENT_CREATED',
      entityType: 'appointments',
      entityId: result.appointment.id,
      details: {
        appointmentNumber: result.appointment.appointment_number,
        visitToken: result.visit.token_display,
        patientId: result.appointment.patient_id,
        doctorId: req.body.doctor_id,
      },
    });

    res.status(201).json({
      success: true,
      message: `Walk-in registered. Token #${result.visit.token_display} issued.`,
      appointment: result.appointment,
      visit: result.visit,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Reception Desk Real-time Metrics
 * GET /api/appointments/reception/metrics
 */
const getReceptionMetrics = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = req.branch.id;

    const metrics = await appointmentService.getReceptionMetrics(clinicId, branchId);
    res.json({
      success: true,
      metrics,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Record consultation fee payment & generate receipt
 * POST /api/appointments/:id/payments
 */
const recordPayment = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = req.branch.id;
    const { id } = req.params;

    const receipt = await paymentService.recordPayment(
      clinicId,
      branchId,
      id,
      req.body,
      userId
    );

    await recordAuditLog({
      userId,
      clinicId,
      branchId,
      action: 'PAYMENT_COLLECTED',
      entityType: 'appointment_payments',
      entityId: receipt.id,
      details: {
        receiptNumber: receipt.receipt_number,
        appointmentId: id,
        amountPaid: receipt.amount_paid,
        remainingBalance: receipt.remaining_balance,
        paymentMethod: receipt.payment_method,
      },
    });

    res.status(201).json({
      success: true,
      message: `Payment of ₹${receipt.amount_paid} recorded. Receipt #${receipt.receipt_number} generated.`,
      receipt,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Get payment receipt details (with optional reprint tracking)
 * GET /api/appointments/payments/:paymentId/receipt
 */
const getReceipt = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const branchId = req.branch.id;
    const { paymentId } = req.params;
    const isReprint = req.query.reprint === 'true';

    const receipt = await paymentService.getReceiptById(
      clinicId,
      branchId,
      paymentId,
      isReprint
    );

    if (!receipt) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found.',
      });
    }

    if (isReprint) {
      await recordAuditLog({
        userId,
        clinicId,
        branchId,
        action: 'RECEIPT_REPRINTED',
        entityType: 'appointment_payments',
        entityId: paymentId,
        details: {
          receiptNumber: receipt.receipt_number,
          newReprintCount: receipt.reprint_count,
        },
      });
    }

    res.json({
      success: true,
      receipt,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get payment history for an appointment
 * GET /api/appointments/:id/payments
 */
const getAppointmentPayments = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branchId = req.branch.id;
    const { id } = req.params;

    const payments = await paymentService.getAppointmentPayments(clinicId, branchId, id);
    res.json({
      success: true,
      payments,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve booking confirmation by secure reference
 * GET /api/appointments/reference/:bookingReference
 */
const getBookingConfirmation = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { bookingReference } = req.params;

    if (!bookingReference || !bookingReference.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Booking reference is required.',
      });
    }

    const confirmation = await appointmentService.getBookingConfirmationByReference(
      clinicId,
      bookingReference.trim().toUpperCase()
    );

    if (!confirmation) {
      return res.status(404).json({
        success: false,
        message: 'Booking confirmation not found.',
      });
    }

    // Strict branch isolation check: user must be authorized for this branch
    if (!req.user.assignedBranchIds || !req.user.assignedBranchIds.includes(confirmation.branch_id)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You are not authorized to access bookings for this branch location.',
      });
    }

    res.json({
      success: true,
      confirmation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List active bookable branches for the clinic organization
 * GET /api/appointments/bookable-branches
 */
const getBookableBranches = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const branches = await appointmentService.getBookableBranches(clinicId);
    res.json({
      success: true,
      branches,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List eligible doctors actively assigned to a branch with public-safe attributes
 * GET /api/appointments/branches/:branchId/bookable-doctors
 */
const getBookableDoctors = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { branchId } = req.params;
    const doctors = await appointmentService.getBookableDoctors(clinicId, branchId);
    res.json({
      success: true,
      doctors,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createAppointment,
  getAppointmentsList,
  getAppointmentById,
  rescheduleAppointment,
  cancelAppointment,
  updateAppointmentStatus,
  checkInAppointment,
  createWalkInAppointment,
  getReceptionMetrics,
  recordPayment,
  getReceipt,
  getAppointmentPayments,
  getBookingConfirmation,
  getBookableBranches,
  getBookableDoctors,
};
