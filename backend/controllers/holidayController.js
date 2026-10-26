/**
 * Holiday Master Controller
 */

const holidayService = require('../services/holidayService');
const { validateHoliday, validateBatchHolidays } = require('../validations/holidayValidation');

/**
 * Get suggested Indian holidays for a given year
 * GET /api/holidays/suggestions?year=2026
 */
const getSuggestedHolidays = async (req, res, next) => {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const suggestions = holidayService.getSuggestedHolidays(year);
    res.json({
      success: true,
      year,
      suggestions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List holidays for the clinic
 * GET /api/holidays
 */
const getHolidays = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { branchId, doctorId, year, category, activeOnly } = req.query;

    const holidays = await holidayService.getHolidays({
      clinicId,
      branchId: branchId || null,
      doctorId: doctorId || null,
      year: year ? parseInt(year, 10) : null,
      category: category || null,
      activeOnly: activeOnly !== 'false',
    });

    res.json({
      success: true,
      count: holidays.length,
      holidays,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get holiday by ID
 * GET /api/holidays/:id
 */
const getHolidayById = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const holiday = await holidayService.getHolidayById(clinicId, req.params.id);

    if (!holiday) {
      return res.status(404).json({
        success: false,
        message: 'Holiday not found.',
      });
    }

    res.json({
      success: true,
      holiday,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new holiday
 * POST /api/holidays
 */
const createHoliday = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const validation = validateHoliday(req.body);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: validation.errors,
      });
    }

    const holiday = await holidayService.createHoliday(clinicId, req.body, userId, req.ip);
    res.status(201).json({
      success: true,
      message: 'Holiday created successfully.',
      holiday,
    });
  } catch (error) {
    if (error.statusCode === 409) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Create multiple holidays in batch
 * POST /api/holidays/batch
 */
const createBatchHolidays = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const { holidays } = req.body;

    const validation = validateBatchHolidays(holidays);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Batch validation failed.',
        errors: validation.errors,
      });
    }

    const result = await holidayService.createBatchHolidays(clinicId, holidays, userId, req.ip);
    res.status(201).json({
      success: true,
      message: `Batch complete: ${result.created.length} created, ${result.skipped.length} skipped.`,
      created: result.created,
      skipped: result.skipped,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing holiday
 * PUT /api/holidays/:id
 */
const updateHoliday = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const updated = await holidayService.updateHoliday(clinicId, req.params.id, req.body, userId, req.ip);

    res.json({
      success: true,
      message: 'Holiday updated successfully.',
      holiday: updated,
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Deactivate a holiday
 * DELETE /api/holidays/:id
 */
const deactivateHoliday = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const deactivated = await holidayService.deactivateHoliday(clinicId, req.params.id, userId, req.ip);

    res.json({
      success: true,
      message: 'Holiday deactivated successfully.',
      holiday: deactivated,
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Export holidays as CSV
 * GET /api/holidays/export/csv
 */
const exportHolidaysCsv = async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { year, branchId } = req.query;

    const csvContent = await holidayService.exportHolidaysCsv(clinicId, {
      year: year ? parseInt(year, 10) : null,
      branchId: branchId || null,
    });

    const filename = `clinic_holidays_${year || 'all'}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
};

/**
 * Import holidays from CSV text
 * POST /api/holidays/import/csv
 */
const importHolidaysCsv = async (req, res, next) => {
  try {
    const { clinicId, id: userId } = req.user;
    const { csvText, branchId } = req.body;

    if (!csvText || typeof csvText !== 'string' || !csvText.trim()) {
      return res.status(400).json({
        success: false,
        message: 'csvText is required in request body.',
      });
    }

    const result = await holidayService.importHolidaysCsv(clinicId, csvText, branchId || null, userId, req.ip);

    res.status(201).json({
      success: true,
      message: `CSV imported successfully: ${result.importedCount} added, ${result.skippedCount} skipped.`,
      result,
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        message: error.message,
        validationErrors: error.validationErrors || [],
      });
    }
    next(error);
  }
};

module.exports = {
  getSuggestedHolidays,
  getHolidays,
  getHolidayById,
  createHoliday,
  createBatchHolidays,
  updateHoliday,
  deactivateHoliday,
  exportHolidaysCsv,
  importHolidaysCsv,
};
