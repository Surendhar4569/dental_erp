const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { query, pool, initializeDatabase } = require('../config/database');

describe('Annual Calendar, Holiday Master & Multi-Date Doctor Scheduling Test Suite', () => {
  let server;
  let baseUrl;

  let clinicId;
  let branchAId;
  let branchBId;
  let clinic2Id;
  let branchCId;

  let adminToken;
  let receptionistToken;
  let dentistAToken;
  let clinic2AdminToken;

  let adminId;
  let receptionistId;
  let dentistAId;
  let patientId;

  const request = async ({ method, path, headers = {}, body = null }) => {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const reqOptions = {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      };

      const req = http.request(reqOptions, (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(rawData);
          } catch {
            parsed = rawData;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
          });
        });
      });

      req.on('error', reject);
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  };

  before(async () => {
    await initializeDatabase();

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // 1. Create Clinic 1
    const clinicCode = `STG5-${Date.now().toString().slice(-5)}`;
    const clinicRes = await query(
      `INSERT INTO clinics (code, name, is_active, subscription_status)
       VALUES ($1, 'Annual Calendar Clinic', true, 'active')
       RETURNING id`,
      [clinicCode]
    );
    clinicId = clinicRes.rows[0].id;

    // Branches for Clinic 1
    const bARes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BA-STG5', 'Annual Calendar Branch Alpha', 'Asia/Kolkata', true, true)
       RETURNING id`,
      [clinicId]
    );
    branchAId = bARes.rows[0].id;

    const bBRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BB-STG5', 'Annual Calendar Branch Beta', 'Asia/Kolkata', true, false)
       RETURNING id`,
      [clinicId]
    );
    branchBId = bBRes.rows[0].id;

    // Clinic 2 (for cross-tenant checks)
    const c2Res = await query(
      `INSERT INTO clinics (code, name, is_active, subscription_status)
       VALUES ($1, 'Clinic Tenant 2', true, 'active')
       RETURNING id`,
      [`T2-${Date.now().toString().slice(-5)}`]
    );
    clinic2Id = c2Res.rows[0].id;

    const bCRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BC-STG5', 'Tenant 2 Branch', 'Asia/Kolkata', true, true)
       RETURNING id`,
      [clinic2Id]
    );
    branchCId = bCRes.rows[0].id;

    // Roles
    const rolesRes = await query(`SELECT id, name FROM roles`);
    const roleMap = {};
    for (const r of rolesRes.rows) {
      roleMap[r.name] = r.id;
    }

    const pwdHash = await bcrypt.hash('Test@123456', 4);

    // Admin
    const adminEmail = `admin_stg5_${Date.now()}@test.com`;
    const adminRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Annual', 'Admin', true) RETURNING id`,
      [clinicId, roleMap['admin'], adminEmail, pwdHash]
    );
    adminId = adminRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [adminId, branchAId]);
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, false)`, [adminId, branchBId]);

    // Receptionist
    const recEmail = `rec_stg5_${Date.now()}@test.com`;
    const recRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Reception', 'Desk', true) RETURNING id`,
      [clinicId, roleMap['receptionist'], recEmail, pwdHash]
    );
    receptionistId = recRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [receptionistId, branchAId]);

    // Dentist A
    const docAEmail = `dentist_stg5_${Date.now()}@test.com`;
    const docARes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, specialization, license_number, is_active)
       VALUES ($1, $2, $3, $4, 'Dr. Samantha', 'Ray', 'Orthodontist', 'LIC-S5-01', true) RETURNING id`,
      [clinicId, roleMap['dentist'], docAEmail, pwdHash]
    );
    dentistAId = docARes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [dentistAId, branchAId]);
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, false)`, [dentistAId, branchBId]);

    const staffARes = await query(
      `INSERT INTO staff (clinic_id, primary_branch_id, staff_number, first_name, last_name, phone, email, staff_category, user_id, is_active)
       VALUES ($1, $2, 'STF-S501', 'Dr. Samantha', 'Ray', '9800000055', $3, 'dentist', $4, true) RETURNING id`,
      [clinicId, branchAId, docAEmail, dentistAId]
    );
    await query(`INSERT INTO staff_branches (staff_id, branch_id, is_default) VALUES ($1, $2, true)`, [staffARes.rows[0].id, branchAId]);
    await query(`INSERT INTO staff_branches (staff_id, branch_id, is_default) VALUES ($1, $2, false)`, [staffARes.rows[0].id, branchBId]);

    // Set recurring weekly schedule for Dentist A (Mondays: 09:00 - 13:00)
    const schedRes = await query(
      `INSERT INTO doctor_schedules (clinic_id, branch_id, doctor_id, day_of_week, slot_duration_minutes, buffer_minutes, is_active)
       VALUES ($1, $2, $3, 1, 30, 0, true) RETURNING id`,
      [clinicId, branchAId, dentistAId]
    );
    await query(
      `INSERT INTO doctor_schedule_sessions (schedule_id, session_name, start_time, end_time, session_order, is_break)
       VALUES ($1, 'Morning Shift', '09:00', '13:00', 1, false)`,
      [schedRes.rows[0].id]
    );

    // Patient
    const pRes = await query(
      `INSERT INTO patients (clinic_id, branch_id, patient_number, first_name, last_name, phone, gender, date_of_birth, status)
       VALUES ($1, $2, '850001', 'John', 'Doe', '9898989898', 'male', '1990-01-01', 'active') RETURNING id`,
      [clinicId, branchAId]
    );
    patientId = pRes.rows[0].id;


    // Clinic 2 Admin
    const c2AdminEmail = `admin_c2_${Date.now()}@test.com`;
    const c2AdminRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Tenant2', 'Admin', true) RETURNING id`,
      [clinic2Id, roleMap['admin'], c2AdminEmail, pwdHash]
    );
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [c2AdminRes.rows[0].id, branchCId]);

    // Login tokens
    const login = async (email) => {
      const res = await request({
        method: 'POST',
        path: '/api/auth/login',
        body: { email, password: 'Test@123456' },
      });
      return res.body.token;
    };

    adminToken = await login(adminEmail);
    receptionistToken = await login(recEmail);
    dentistAToken = await login(docAEmail);
    clinic2AdminToken = await login(c2AdminEmail);
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  let createdHolidayId;

  // Scenario 1: Suggested Holidays API
  test('1. GET /api/holidays/suggestions: returns curated Indian national and festive holidays catalogue for 2026', async () => {
    const res = await request({
      method: 'GET',
      path: '/api/holidays/suggestions?year=2026',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.year, 2026);
    assert.ok(Array.isArray(res.body.suggestions));
    assert.ok(res.body.suggestions.length >= 10);
    const repDay = res.body.suggestions.find((s) => s.name === 'Republic Day');
    assert.ok(repDay);
    assert.equal(repDay.holiday_date, '2026-01-26');
    assert.equal(repDay.category, 'national');
  });

  // Scenario 2: Admin creates single clinic-wide closed holiday
  test('2. POST /api/holidays: Admin creates clinic-wide closed holiday (Republic Day)', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/holidays',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        name: 'Republic Day',
        holiday_date: '2026-01-26',
        category: 'national',
        is_closed: true,
        description: 'National holiday celebration',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.holiday.id);
    assert.equal(res.body.holiday.name, 'Republic Day');
    assert.equal(res.body.holiday.is_closed, true);
    assert.equal(res.body.holiday.branch_id, null); // Clinic-wide
    createdHolidayId = res.body.holiday.id;
  });

  // Scenario 3: Duplicate holiday in same scope rejected
  test('3. POST /api/holidays: Duplicate active holiday within the exact same scope is rejected with HTTP 409 Conflict', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/holidays',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        name: 'Republic Day Duplicate',
        holiday_date: '2026-01-26',
        category: 'national',
        is_closed: true,
      },
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /already exists/i);
  });

  // Scenario 4: Batch create holidays
  test('4. POST /api/holidays/batch: Batch create holidays skips duplicate dates and returns counts', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/holidays/batch',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        holidays: [
          { name: 'Republic Day (Duplicate)', holiday_date: '2026-01-26', category: 'national', is_closed: true },
          { name: 'Independence Day', holiday_date: '2026-08-15', category: 'national', is_closed: true },
          { name: 'Gandhi Jayanti', holiday_date: '2026-10-02', category: 'national', is_closed: true },
        ],
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.created.length, 2);
    assert.equal(res.body.skipped.length, 1);
  });

  // Scenario 5: Filter holidays by year and category
  test('5. GET /api/holidays: Filter by year, category, branchId; clinic-wide holidays show in all branches', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/holidays?year=2026&branchId=${branchAId}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.holidays.length >= 3);
  });

  // Scenario 6: Update holiday
  test('6. PUT /api/holidays/:id: Update holiday details', async () => {
    const res = await request({
      method: 'PUT',
      path: `/api/holidays/${createdHolidayId}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        name: 'Republic Day of India',
        category: 'national',
        description: 'Updated celebration description',
        is_closed: true,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.holiday.name, 'Republic Day of India');
  });

  // Scenario 7: Deactivate holiday (soft-delete)
  test('7. DELETE /api/holidays/:id: Soft-deactivate holiday (sets is_active = false)', async () => {
    // Create a temporary holiday to delete
    const tempRes = await request({
      method: 'POST',
      path: '/api/holidays',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        name: 'Temporary Holiday',
        holiday_date: '2026-12-31',
        category: 'clinic_specific',
      },
    });
    const tempId = tempRes.body.holiday.id;

    const delRes = await request({
      method: 'DELETE',
      path: `/api/holidays/${tempId}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });

    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.success, true);
    assert.equal(delRes.body.holiday.is_active, false);
  });

  // Scenario 8: Export holidays as RFC 4180 CSV
  test('8. GET /api/holidays/export/csv: Export valid RFC 4180 CSV with correct headers', async () => {
    const res = await request({
      method: 'GET',
      path: '/api/holidays/export/csv?year=2026',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);
    assert.ok(typeof res.body === 'string');
    assert.ok(res.body.includes('date,name,category,is_closed'));
    assert.ok(res.body.includes('Republic Day of India'));
  });

  // Scenario 9: Import holidays from CSV text
  test('9. POST /api/holidays/import/csv: Import holidays from CSV text with row-by-row validation', async () => {
    const csvData = [
      'date,name,category,is_closed,description',
      '2026-05-01,May Day,state,true,Labor Day',
      '2026-12-25,Christmas,festival,true,Christmas Day',
    ].join('\n');

    const res = await request({
      method: 'POST',
      path: '/api/holidays/import/csv',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        csvText: csvData,
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.result.importedCount, 2);
  });

  // Scenario 10: Import invalid CSV returns 400
  test('10. POST /api/holidays/import/csv: Invalid CSV rows return HTTP 400 with detailed errors', async () => {
    const invalidCsv = [
      'date,name,category,is_closed',
      'invalid-date,Bad Date Holiday,national,true',
    ].join('\n');

    const res = await request({
      method: 'POST',
      path: '/api/holidays/import/csv',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        csvText: invalidCsv,
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.validationErrors);
  });

  // Scenario 11: Precedence Level 1 (Closed Holiday)
  test('11. Precedence Level 1: Closed holiday closes slots (isAvailable: false, isHoliday: true, slots: [])', async () => {
    // 2026-12-25 is a future Christmas holiday imported in test 9
    const res = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/slots?date=2026-12-25`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });

    assert.equal(res.status, 200);
    const data = res.body.availability || res.body;
    assert.equal(data.isAvailable, false);
    assert.equal(data.isHoliday, true);
    assert.equal(data.slots.length, 0);
    assert.match(data.reason, /Christmas/i);
  });

  // Scenario 11b: Closed Holiday Rejection Guard
  test('11b. Closed Holiday Guard: Scheduling on closed holiday without explicit override returns HTTP 422', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/multi-date`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        dates: ['2026-12-25'],
        mode: 'uniform',
        slot_duration_minutes: 30,
        buffer_minutes: 0,
        is_working_override: false,
        sessions: [
          { session_name: 'Regular Shift', start_time: '10:00', end_time: '12:00', is_break: false },
        ],
      },
    });

    assert.equal(res.status, 422);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /closed holiday/i);
    assert.equal(res.body.holidayDate, '2026-12-25');
  });

  // Scenario 12: Precedence Level 2 (Special Working Override)
  test('12. Precedence Level 2: Special working override on holiday generates working slots', async () => {
    // Save multi-date schedule for 2026-12-25 with is_working_override = true
    const overrideRes = await request({
      method: 'POST',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/multi-date`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        dates: ['2026-12-25'],
        mode: 'uniform',
        slot_duration_minutes: 30,
        buffer_minutes: 0,
        is_working_override: true,
        override_reason: 'Christmas Duty Shift',
        sessions: [
          { session_name: 'Emergency Shift', start_time: '10:00', end_time: '12:00', is_break: false },
        ],
      },
    });

    assert.equal(overrideRes.status, 200);
    assert.equal(overrideRes.body.success, true);

    // Now query available slots on 2026-12-25: it should generate available slots!
    const slotRes = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/slots?date=2026-12-25`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });

    assert.equal(slotRes.status, 200);
    const slotData = slotRes.body.availability || slotRes.body;
    assert.equal(slotData.isAvailable, true);
    assert.equal(slotData.isOverride, true);
    assert.equal(slotData.overrideReason, 'Christmas Duty Shift');
    assert.ok(slotData.slots.length >= 4); // 10:00 to 12:00 = 4 slots
  });

  // Scenario 13: Original Holiday Record Remains Intact
  test('13. Original Holiday Intact: Special working override does not alter or delete clinic_holidays record', async () => {
    const checkRes = await query(
      `SELECT id, name, is_closed, is_active FROM clinic_holidays WHERE clinic_id = $1 AND holiday_date = '2026-12-25'`,
      [clinicId]
    );

    assert.equal(checkRes.rows.length, 1);
    assert.equal(checkRes.rows[0].is_active, true);
    assert.equal(checkRes.rows[0].is_closed, true);
  });


  // Scenario 14: Multi-Date Scheduling across non-consecutive dates
  test('14. Multi-Date Scheduling: Save uniform multi-date schedule across non-consecutive dates', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/multi-date`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        dates: ['2026-11-10', '2026-11-12', '2026-11-17'],
        mode: 'uniform',
        slot_duration_minutes: 30,
        buffer_minutes: 0,
        sessions: [
          { session_name: 'Morning Session', start_time: '09:00', end_time: '12:00', is_break: false },
          { session_name: 'Lunch Break', start_time: '12:00', end_time: '13:00', is_break: true, break_reason: 'Lunch' },
          { session_name: 'Afternoon Session', start_time: '14:00', end_time: '17:00', is_break: false },
        ],
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.schedules.length, 3);
  });

  // Scenario 15: Multi-Date Weekly Template Mode
  test('15. Multi-Date Weekly Template Mode: Inherits weekly recurring shifts for each date', async () => {
    // 2026-11-23 is a Monday (day_of_week = 1). Dentist A's weekly template has 09:00 - 13:00.
    const res = await request({
      method: 'POST',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/multi-date`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        dates: ['2026-11-23'],
        mode: 'weekly_template',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.schedules[0].sessions.length, 1);
    assert.equal(res.body.schedules[0].sessions[0].start_time, '09:00:00');
  });

  // Scenario 16: Recurring Weekly Schedule is UNTOUCHED
  test('16. Recurring Schedule Protection: Multi-date save does NOT mutate recurring doctor_schedules table', async () => {
    const weeklyCheck = await query(
      `SELECT ds.id, ds.day_of_week, dss.start_time, dss.end_time
       FROM doctor_schedules ds
       JOIN doctor_schedule_sessions dss ON ds.id = dss.schedule_id
       WHERE ds.clinic_id = $1 AND ds.branch_id = $2 AND ds.doctor_id = $3 AND ds.day_of_week = 1`,
      [clinicId, branchAId, dentistAId]
    );

    assert.equal(weeklyCheck.rows.length, 1);
    assert.equal(weeklyCheck.rows[0].start_time, '09:00:00');
    assert.equal(weeklyCheck.rows[0].end_time, '13:00:00');
  });

  // Scenario 17: Active Appointment Guard (HTTP 409 Conflict)
  test('17. Active Appointment Guard: Multi-date save fails with HTTP 409 Conflict if shifts conflict with active appointment', async () => {
    // Book an active appointment on 2026-11-10 at 10:00 - 10:30
    await query(
      `INSERT INTO appointments (
        clinic_id, branch_id, doctor_id, patient_id, appointment_number,
        appointment_date, start_time, end_time, status, appointment_type
      )
      VALUES ($1, $2, $3, $4, 'APP-GUARD-01', '2026-11-10', '10:00', '10:30', 'scheduled', 'consultation')`,
      [clinicId, branchAId, dentistAId, patientId]
    );

    // Attempt to update multi-date schedule for 2026-11-10 with sessions only from 14:00 to 17:00 (omitting 10:00)
    const res = await request({
      method: 'POST',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/multi-date`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        dates: ['2026-11-10'],
        mode: 'uniform',
        sessions: [
          { session_name: 'Late Shift', start_time: '14:00', end_time: '17:00', is_break: false },
        ],
      },
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.ok(res.body.conflictingAppointments.length >= 1);
    assert.equal(res.body.conflictingAppointments[0].appointmentNumber, 'APP-GUARD-01');
  });

  // Scenario 18: Cross-Branch Appointment Conflict Guard
  test('18. Cross-Branch Guard: Multi-date save detects if doctor already has an appointment in another branch at that time', async () => {
    // Book an appointment for Dentist A in Branch B on 2026-11-12 at 11:00 - 11:30
    await query(
      `INSERT INTO appointments (
        clinic_id, branch_id, doctor_id, patient_id, appointment_number,
        appointment_date, start_time, end_time, status, appointment_type
      )
      VALUES ($1, $2, $3, $4, 'APP-CROSS-01', '2026-11-12', '11:00', '11:30', 'scheduled', 'consultation')`,
      [clinicId, branchBId, dentistAId, patientId]
    );

    // Try to schedule Dentist A at Branch A on 2026-11-12 during 10:00 - 13:00 (overlaps 11:00)
    const res = await request({
      method: 'POST',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/multi-date`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        dates: ['2026-11-12'],
        mode: 'uniform',
        sessions: [
          { session_name: 'Overlapping Shift', start_time: '10:00', end_time: '13:00', is_break: false },
        ],
      },
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.ok(res.body.conflictingAppointments.length >= 1);
    assert.match(res.body.conflictingAppointments[0].issue, /branch/i);
  });

  // Scenario 19: Annual Overview 12-Month Aggregated View
  test('19. GET /api/schedules/branches/:branchId/annual-overview: Returns 12-month aggregated calendar metadata', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/annual-overview?year=2026&doctorId=${dentistAId}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.overview.year, 2026);
    assert.ok(res.body.overview.holidays.length >= 1);
    assert.ok(res.body.overview.dateEvents);
    assert.ok(res.body.overview.appointmentCounts['2026-11-10'] >= 1);
  });

  // Scenario 20: Role-Based Security & Receptionist Read-Only Guard
  test('20. Security Guard: Receptionists cannot modify holidays or doctor multi-date schedules (HTTP 403 Forbidden)', async () => {
    // 1. Receptionist cannot create holiday
    const holRes = await request({
      method: 'POST',
      path: '/api/holidays',
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        name: 'Receptionist Holiday',
        holiday_date: '2026-06-01',
        category: 'clinic_specific',
      },
    });
    assert.equal(holRes.status, 403);

    // 2. Receptionist cannot save multi-date schedule
    const schedRes = await request({
      method: 'POST',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/multi-date`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        dates: ['2026-07-01'],
        mode: 'uniform',
        sessions: [
          { session_name: 'Shift', start_time: '09:00', end_time: '12:00', is_break: false },
        ],
      },
    });
    assert.equal(schedRes.status, 403);

    // 3. Receptionist CAN read annual overview
    const readRes = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/annual-overview?year=2026`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'X-Branch-ID': branchAId,
      },
    });
    assert.equal(readRes.status, 200);
    assert.equal(readRes.body.success, true);
  });
});
