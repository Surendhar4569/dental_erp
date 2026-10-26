/**
 * Holiday Master Service
 * Manages clinic holidays, annual calendar closures, CSV import/export,
 * suggested holidays, and audit logging.
 */

const { pool, query } = require('../config/database');
const { recordAuditLog } = require('../utils/auditLogger');
const { validateHoliday } = require('../validations/holidayValidation');

/**
 * Catalogue of curated Indian National and Festival Holidays
 */
const SUGGESTED_HOLIDAYS_CATALOGUE = {
  2026: [
    { holiday_date: '2026-01-01', name: "New Year's Day", category: 'festival', is_closed: true, description: 'New Year celebration' },
    { holiday_date: '2026-01-26', name: 'Republic Day', category: 'national', is_closed: true, description: 'National Holiday' },
    { holiday_date: '2026-02-15', name: 'Maha Shivratri', category: 'festival', is_closed: true, description: 'Hindu Festival' },
    { holiday_date: '2026-03-03', name: 'Holi', category: 'festival', is_closed: true, description: 'Festival of Colors' },
    { holiday_date: '2026-03-20', name: 'Eid-ul-Fitr', category: 'festival', is_closed: true, description: 'Islamic Festival' },
    { holiday_date: '2026-04-01', name: 'Mahavir Jayanti', category: 'festival', is_closed: true, description: 'Jain Festival' },
    { holiday_date: '2026-04-03', name: 'Good Friday', category: 'festival', is_closed: true, description: 'Christian Observance' },
    { holiday_date: '2026-05-01', name: 'May Day / Labor Day', category: 'state', is_closed: true, description: 'International Workers Day' },
    { holiday_date: '2026-05-27', name: 'Bakrid / Eid al-Adha', category: 'festival', is_closed: true, description: 'Feast of the Sacrifice' },
    { holiday_date: '2026-08-15', name: 'Independence Day', category: 'national', is_closed: true, description: 'National Independence Day' },
    { holiday_date: '2026-09-04', name: 'Janmashtami', category: 'festival', is_closed: true, description: 'Birth of Lord Krishna' },
    { holiday_date: '2026-09-14', name: 'Ganesh Chaturthi', category: 'festival', is_closed: true, description: 'Lord Ganesha Festival' },
    { holiday_date: '2026-10-02', name: 'Mahatma Gandhi Jayanti', category: 'national', is_closed: true, description: 'National Holiday' },
    { holiday_date: '2026-10-20', name: 'Dussehra / Vijayadashami', category: 'festival', is_closed: true, description: 'Triumph of Good over Evil' },
    { holiday_date: '2026-11-08', name: 'Diwali / Deepavali', category: 'festival', is_closed: true, description: 'Festival of Lights' },
    { holiday_date: '2026-11-09', name: 'Govardhan Puja', category: 'festival', is_closed: false, description: 'Post-Diwali celebration' },
    { holiday_date: '2026-11-24', name: 'Guru Nanak Jayanti', category: 'festival', is_closed: true, description: 'Sikh Festival' },
    { holiday_date: '2026-12-25', name: 'Christmas Day', category: 'festival', is_closed: true, description: 'Christian Holiday' },
  ],
  2027: [
    { holiday_date: '2027-01-01', name: "New Year's Day", category: 'festival', is_closed: true, description: 'New Year celebration' },
    { holiday_date: '2027-01-26', name: 'Republic Day', category: 'national', is_closed: true, description: 'National Holiday' },
    { holiday_date: '2027-03-06', name: 'Maha Shivratri', category: 'festival', is_closed: true, description: 'Hindu Festival' },
    { holiday_date: '2027-03-10', name: 'Eid-ul-Fitr', category: 'festival', is_closed: true, description: 'Islamic Festival' },
    { holiday_date: '2027-03-22', name: 'Holi', category: 'festival', is_closed: true, description: 'Festival of Colors' },
    { holiday_date: '2027-03-26', name: 'Good Friday', category: 'festival', is_closed: true, description: 'Christian Observance' },
    { holiday_date: '2027-04-20', name: 'Mahavir Jayanti', category: 'festival', is_closed: true, description: 'Jain Festival' },
    { holiday_date: '2027-05-01', name: 'May Day / Labor Day', category: 'state', is_closed: true, description: 'International Workers Day' },
    { holiday_date: '2027-05-16', name: 'Bakrid / Eid al-Adha', category: 'festival', is_closed: true, description: 'Feast of the Sacrifice' },
    { holiday_date: '2027-08-15', name: 'Independence Day', category: 'national', is_closed: true, description: 'National Independence Day' },
    { holiday_date: '2027-08-25', name: 'Janmashtami', category: 'festival', is_closed: true, description: 'Birth of Lord Krishna' },
    { holiday_date: '2027-09-04', name: 'Ganesh Chaturthi', category: 'festival', is_closed: true, description: 'Lord Ganesha Festival' },
    { holiday_date: '2027-10-02', name: 'Mahatma Gandhi Jayanti', category: 'national', is_closed: true, description: 'National Holiday' },
    { holiday_date: '2027-10-09', name: 'Dussehra / Vijayadashami', category: 'festival', is_closed: true, description: 'Triumph of Good over Evil' },
    { holiday_date: '2027-10-28', name: 'Diwali / Deepavali', category: 'festival', is_closed: true, description: 'Festival of Lights' },
    { holiday_date: '2027-11-13', name: 'Guru Nanak Jayanti', category: 'festival', is_closed: true, description: 'Sikh Festival' },
    { holiday_date: '2027-12-25', name: 'Christmas Day', category: 'festival', is_closed: true, description: 'Christian Holiday' },
  ],
};

/**
 * Returns suggested holidays for a given calendar year
 * @param {number} year
 * @returns {Array}
 */
const getSuggestedHolidays = (year) => {
  const y = parseInt(year, 10);
  if (SUGGESTED_HOLIDAYS_CATALOGUE[y]) {
    return SUGGESTED_HOLIDAYS_CATALOGUE[y];
  }
  // Generic fallback for any other year with national fixed holidays
  return [
    { holiday_date: `${y}-01-01`, name: "New Year's Day", category: 'festival', is_closed: true, description: 'New Year celebration' },
    { holiday_date: `${y}-01-26`, name: 'Republic Day', category: 'national', is_closed: true, description: 'National Holiday' },
    { holiday_date: `${y}-05-01`, name: 'May Day / Labor Day', category: 'state', is_closed: true, description: 'International Workers Day' },
    { holiday_date: `${y}-08-15`, name: 'Independence Day', category: 'national', is_closed: true, description: 'National Independence Day' },
    { holiday_date: `${y}-10-02`, name: 'Mahatma Gandhi Jayanti', category: 'national', is_closed: true, description: 'National Holiday' },
    { holiday_date: `${y}-12-25`, name: 'Christmas Day', category: 'festival', is_closed: true, description: 'Christian Holiday' },
  ];
};

/**
 * Get holidays for a clinic with flexible filtering
 */
const getHolidays = async ({
  clinicId,
  branchId = null,
  doctorId = null,
  year = null,
  category = null,
  activeOnly = true,
}) => {
  let sql = `
    SELECT 
      ch.id,
      ch.clinic_id,
      ch.branch_id,
      b.branch_name,
      ch.doctor_id,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS doctor_name,
      ch.holiday_date,
      to_char(ch.holiday_date, 'YYYY-MM-DD') AS holiday_date_str,
      ch.holiday_year,
      ch.name,
      ch.category,
      ch.description,
      ch.is_closed,
      ch.is_active,
      ch.source,
      ch.created_at,
      ch.updated_at
    FROM clinic_holidays ch
    LEFT JOIN branches b ON ch.branch_id = b.id
    LEFT JOIN users u ON ch.doctor_id = u.id
    WHERE ch.clinic_id = $1
  `;

  const params = [clinicId];
  let paramIdx = 2;

  if (activeOnly) {
    sql += ` AND ch.is_active = true`;
  }

  if (year) {
    sql += ` AND ch.holiday_year = $${paramIdx++}`;
    params.push(parseInt(year, 10));
  }

  if (category) {
    sql += ` AND ch.category = $${paramIdx++}`;
    params.push(category);
  }

  if (branchId) {
    // When branchId is requested, return clinic-wide (branch_id IS NULL) OR specific branch
    sql += ` AND (ch.branch_id IS NULL OR ch.branch_id = $${paramIdx++})`;
    params.push(branchId);
  }

  if (doctorId) {
    // Return doctor-independent (doctor_id IS NULL) OR specific doctor
    sql += ` AND (ch.doctor_id IS NULL OR ch.doctor_id = $${paramIdx++})`;
    params.push(doctorId);
  }

  sql += ` ORDER BY ch.holiday_date ASC, ch.name ASC`;

  const result = await query(sql, params);
  return result.rows;
};

/**
 * Get holiday by ID
 */
const getHolidayById = async (clinicId, holidayId) => {
  const sql = `
    SELECT 
      ch.*,
      b.branch_name,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS doctor_name
    FROM clinic_holidays ch
    LEFT JOIN branches b ON ch.branch_id = b.id
    LEFT JOIN users u ON ch.doctor_id = u.id
    WHERE ch.id = $1 AND ch.clinic_id = $2
  `;

  const result = await query(sql, [holidayId, clinicId]);
  return result.rows[0] || null;
};

/**
 * Create a new holiday record
 */
const createHoliday = async (clinicId, holidayData, userId, ipAddress = '127.0.0.1') => {
  const {
    branch_id = null,
    doctor_id = null,
    holiday_date,
    name,
    category,
    description = null,
    is_closed = true,
    source = 'manual',
  } = holidayData;

  const holidayYear = new Date(holiday_date).getFullYear();

  // Check for duplicate active record in exact scope
  const duplicateCheckSql = `
    SELECT id FROM clinic_holidays
    WHERE clinic_id = $1
      AND COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($2, '00000000-0000-0000-0000-000000000000'::uuid)
      AND COALESCE(doctor_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($3, '00000000-0000-0000-0000-000000000000'::uuid)
      AND holiday_date = $4
      AND is_active = true
  `;
  const dupRes = await query(duplicateCheckSql, [clinicId, branch_id, doctor_id, holiday_date]);
  if (dupRes.rows.length > 0) {
    const err = new Error(`An active holiday already exists on ${holiday_date} for this branch/doctor scope.`);
    err.statusCode = 409;
    throw err;
  }

  const insertSql = `
    INSERT INTO clinic_holidays (
      clinic_id, branch_id, doctor_id, holiday_date, holiday_year,
      name, category, description, is_closed, is_active, source, created_by, updated_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11, $11)
    RETURNING *
  `;

  const result = await query(insertSql, [
    clinicId,
    branch_id,
    doctor_id,
    holiday_date,
    holidayYear,
    name.trim(),
    category,
    description ? description.trim() : null,
    is_closed !== false,
    source,
    userId,
  ]);

  const created = result.rows[0];

  await recordAuditLog({
    userId,
    action: 'HOLIDAY_CREATED',
    entityType: 'clinic_holidays',
    entityId: created.id,
    branchId: created.branch_id,
    ipAddress,
    details: {
      holiday_date: created.holiday_date,
      name: created.name,
      category: created.category,
      is_closed: created.is_closed,
      source: created.source,
    },
  });

  return created;
};

/**
 * Create batch holidays atomically
 */
const createBatchHolidays = async (clinicId, holidays, userId, ipAddress = '127.0.0.1') => {
  const client = await pool.connect();
  const createdList = [];
  const skippedList = [];

  try {
    await client.query('BEGIN');

    for (const h of holidays) {
      const holidayYear = new Date(h.holiday_date).getFullYear();
      const branchId = h.branch_id || null;
      const doctorId = h.doctor_id || null;

      // Duplicate check
      const dupRes = await client.query(`
        SELECT id, name FROM clinic_holidays
        WHERE clinic_id = $1
          AND COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($2, '00000000-0000-0000-0000-000000000000'::uuid)
          AND COALESCE(doctor_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($3, '00000000-0000-0000-0000-000000000000'::uuid)
          AND holiday_date = $4
          AND is_active = true
      `, [clinicId, branchId, doctorId, h.holiday_date]);

      if (dupRes.rows.length > 0) {
        skippedList.push({
          holiday_date: h.holiday_date,
          name: h.name,
          reason: `Already exists as "${dupRes.rows[0].name}"`,
        });
        continue;
      }

      const insertRes = await client.query(`
        INSERT INTO clinic_holidays (
          clinic_id, branch_id, doctor_id, holiday_date, holiday_year,
          name, category, description, is_closed, is_active, source, created_by, updated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11, $11)
        RETURNING *
      `, [
        clinicId,
        branchId,
        doctorId,
        h.holiday_date,
        holidayYear,
        h.name.trim(),
        h.category || 'festival',
        h.description ? h.description.trim() : null,
        h.is_closed !== false,
        h.source || 'batch',
        userId,
      ]);

      createdList.push(insertRes.rows[0]);
    }

    await client.query('COMMIT');

    await recordAuditLog({
      userId,
      action: 'HOLIDAYS_BATCH_CREATED',
      entityType: 'clinic_holidays',
      branchId: holidays[0]?.branch_id || null,
      ipAddress,
      details: {
        createdCount: createdList.length,
        skippedCount: skippedList.length,
      },
    });

    return {
      created: createdList,
      skipped: skippedList,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Update an existing holiday
 */
const updateHoliday = async (clinicId, holidayId, updateData, userId, ipAddress = '127.0.0.1') => {
  const existing = await getHolidayById(clinicId, holidayId);
  if (!existing) {
    const err = new Error('Holiday not found.');
    err.statusCode = 404;
    throw err;
  }

  const {
    name = existing.name,
    category = existing.category,
    description = existing.description,
    is_closed = existing.is_closed,
    is_active = existing.is_active,
  } = updateData;

  const sql = `
    UPDATE clinic_holidays
    SET name = $1,
        category = $2,
        description = $3,
        is_closed = $4,
        is_active = $5,
        updated_by = $6,
        updated_at = now()
    WHERE id = $7 AND clinic_id = $8
    RETURNING *
  `;

  const result = await query(sql, [
    name.trim(),
    category,
    description ? description.trim() : null,
    Boolean(is_closed),
    Boolean(is_active),
    userId,
    holidayId,
    clinicId,
  ]);

  const updated = result.rows[0];

  await recordAuditLog({
    userId,
    action: 'HOLIDAY_UPDATED',
    entityType: 'clinic_holidays',
    entityId: updated.id,
    branchId: updated.branch_id,
    ipAddress,
    details: {
      name: updated.name,
      category: updated.category,
      is_closed: updated.is_closed,
      is_active: updated.is_active,
    },
  });

  return updated;
};

/**
 * Deactivate a holiday (soft-delete)
 */
const deactivateHoliday = async (clinicId, holidayId, userId, ipAddress = '127.0.0.1') => {
  const existing = await getHolidayById(clinicId, holidayId);
  if (!existing) {
    const err = new Error('Holiday not found.');
    err.statusCode = 404;
    throw err;
  }

  const sql = `
    UPDATE clinic_holidays
    SET is_active = false,
        updated_by = $1,
        updated_at = now()
    WHERE id = $2 AND clinic_id = $3
    RETURNING *
  `;

  const result = await query(sql, [userId, holidayId, clinicId]);
  const deactivated = result.rows[0];

  await recordAuditLog({
    userId,
    action: 'HOLIDAY_DEACTIVATED',
    entityType: 'clinic_holidays',
    entityId: deactivated.id,
    branchId: deactivated.branch_id,
    ipAddress,
    details: {
      holiday_date: deactivated.holiday_date,
      name: deactivated.name,
    },
  });

  return deactivated;
};

/**
 * Export holidays as RFC 4180 CSV
 */
const exportHolidaysCsv = async (clinicId, { year = null, branchId = null }) => {
  const holidays = await getHolidays({ clinicId, year, branchId, activeOnly: true });

  const headers = ['date', 'name', 'category', 'is_closed', 'branch_id', 'branch_name', 'doctor_id', 'doctor_name', 'description'];

  const escapeCsv = (str) => {
    if (str === null || str === undefined) return '';
    const s = String(str);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = [headers.join(',')];

  for (const h of holidays) {
    rows.push([
      escapeCsv(h.holiday_date_str || h.holiday_date),
      escapeCsv(h.name),
      escapeCsv(h.category),
      escapeCsv(h.is_closed ? 'true' : 'false'),
      escapeCsv(h.branch_id || ''),
      escapeCsv(h.branch_name || ''),
      escapeCsv(h.doctor_id || ''),
      escapeCsv(h.doctor_name || ''),
      escapeCsv(h.description || ''),
    ].join(','));
  }

  return rows.join('\r\n');
};

/**
 * Parse RFC 4180 CSV text into rows of columns
 */
const parseCsv = (text) => {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let current = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(current.trim());
        current = '';
      } else if (char === '\r') {
        // Ignore CR
      } else if (char === '\n') {
        row.push(current.trim());
        if (row.length > 0 && row.some((c) => c !== '')) {
          lines.push(row);
        }
        row = [];
        current = '';
      } else {
        current += char;
      }
    }
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current.trim());
    if (row.some((c) => c !== '')) {
      lines.push(row);
    }
  }

  return lines;
};

/**
 * Import holidays from CSV text with row-by-row validation
 */
const importHolidaysCsv = async (clinicId, csvText, defaultBranchId = null, userId = null, ipAddress = '127.0.0.1') => {
  const parsedRows = parseCsv(csvText);

  if (parsedRows.length <= 1) {
    const err = new Error('CSV file is empty or contains only header row.');
    err.statusCode = 400;
    throw err;
  }

  // Header row normalization
  const header = parsedRows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  const dateIdx = header.indexOf('date');
  const nameIdx = header.indexOf('name');
  const catIdx = header.indexOf('category');
  const closedIdx = header.indexOf('isclosed');
  const branchIdx = header.indexOf('branchid');
  const descIdx = header.indexOf('description');

  if (dateIdx === -1 || nameIdx === -1) {
    const err = new Error('CSV must contain at least "date" and "name" columns.');
    err.statusCode = 400;
    throw err;
  }

  const validHolidays = [];
  const validationErrors = [];

  for (let r = 1; r < parsedRows.length; r++) {
    const row = parsedRows[r];
    const dateVal = row[dateIdx];
    const nameVal = row[nameIdx];
    const catVal = catIdx !== -1 && row[catIdx] ? row[catIdx].toLowerCase() : 'festival';
    const isClosedVal = closedIdx !== -1 ? row[closedIdx]?.toLowerCase() !== 'false' : true;
    const branchVal = branchIdx !== -1 && row[branchIdx] ? row[branchIdx] : defaultBranchId;
    const descVal = descIdx !== -1 ? row[descIdx] : null;

    const candidate = {
      holiday_date: dateVal,
      name: nameVal,
      category: ['national', 'state', 'festival', 'clinic_specific', 'optional', 'other'].includes(catVal) ? catVal : 'other',
      is_closed: isClosedVal,
      branch_id: branchVal || null,
      description: descVal,
      source: 'csv_import',
    };

    const valResult = validateHoliday(candidate);
    if (!valResult.isValid) {
      validationErrors.push({ row: r + 1, errors: valResult.errors });
    } else {
      validHolidays.push(candidate);
    }
  }

  if (validHolidays.length === 0) {
    const err = new Error(`CSV validation failed with ${validationErrors.length} error(s). No valid rows.`);
    err.statusCode = 400;
    err.validationErrors = validationErrors;
    throw err;
  }

  // Batch insert valid records
  const result = await createBatchHolidays(clinicId, validHolidays, userId, ipAddress);

  return {
    importedCount: result.created.length,
    skippedCount: result.skipped.length,
    validationErrors,
    created: result.created,
    skipped: result.skipped,
  };
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
  parseCsv,
};
