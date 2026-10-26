const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { query, pool, initializeDatabase } = require('../config/database');

describe('Stage 4: Calendar-Based Doctor Schedule Management Test Suite', () => {
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
  let dentistBToken;
  let branchBStaffToken;
  let clinic2AdminToken;

  let adminId;
  let receptionistId;
  let dentistAId;
  let dentistBId;
  let dentistCId;
  let patientId;
  let patient2Id;

  let chair1Id;
  let chair2Id;

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
    const clinicCode = `STG4-${Date.now().toString().slice(-5)}`;
    const clinicRes = await query(
      `INSERT INTO clinics (code, name, is_active, subscription_status)
       VALUES ($1, 'Stage 4 Schedule Clinic', true, 'active')
       RETURNING id`,
      [clinicCode]
    );
    clinicId = clinicRes.rows[0].id;

    // Branches for Clinic 1
    const bARes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BA-STG4', 'Stage 4 Branch Alpha', 'Asia/Kolkata', true, true)
       RETURNING id`,
      [clinicId]
    );
    branchAId = bARes.rows[0].id;

    const bBRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BB-STG4', 'Stage 4 Branch Beta', 'Asia/Kolkata', true, false)
       RETURNING id`,
      [clinicId]
    );
    branchBId = bBRes.rows[0].id;

    // Clinic 2 (for tenant isolation)
    const c2Res = await query(
      `INSERT INTO clinics (code, name, is_active, subscription_status)
       VALUES ($1, 'Stage 4 Tenant 2', true, 'active')
       RETURNING id`,
      [`T2-${Date.now().toString().slice(-5)}`]
    );
    clinic2Id = c2Res.rows[0].id;

    const bCRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BC-STG4', 'Branch Charlie T2', 'Asia/Kolkata', true, true)
       RETURNING id`,
      [clinic2Id]
    );
    branchCId = bCRes.rows[0].id;

    // Fetch Roles
    const rolesRes = await query(`SELECT id, name FROM roles`);
    const roleMap = {};
    for (const r of rolesRes.rows) {
      roleMap[r.name] = r.id;
    }

    const pwdHash = await bcrypt.hash('Test@123456', 4);

    // Admin (Assigned to Branch A & Branch B)
    const adminEmail = `admin_stg4_${Date.now()}@test.com`;
    const adminRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Super', 'Admin', true) RETURNING id`,
      [clinicId, roleMap['admin'], adminEmail, pwdHash]
    );
    adminId = adminRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [adminId, branchAId]);
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, false)`, [adminId, branchBId]);

    // Receptionist (Assigned only to Branch A)
    const recEmail = `rec_stg4_${Date.now()}@test.com`;
    const recRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'FrontDesk', 'Reception', true) RETURNING id`,
      [clinicId, roleMap['receptionist'], recEmail, pwdHash]
    );
    receptionistId = recRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [receptionistId, branchAId]);

    // Dentist A (Assigned initially to Branch A)
    const docAEmail = `dentist_a_${Date.now()}@test.com`;
    const docARes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, specialization, license_number, is_active)
       VALUES ($1, $2, $3, $4, 'Dr. Alice', 'Walker', 'General Dentistry', 'LIC-A-001', true) RETURNING id`,
      [clinicId, roleMap['dentist'], docAEmail, pwdHash]
    );
    dentistAId = docARes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [dentistAId, branchAId]);

    const staffARes = await query(
      `INSERT INTO staff (clinic_id, primary_branch_id, staff_number, first_name, last_name, phone, email, staff_category, user_id, is_active)
       VALUES ($1, $2, 'STF-A001', 'Dr. Alice', 'Walker', '9800000001', $3, 'dentist', $4, true) RETURNING id`,
      [clinicId, branchAId, docAEmail, dentistAId]
    );
    await query(`INSERT INTO staff_branches (staff_id, branch_id, is_default) VALUES ($1, $2, true)`, [staffARes.rows[0].id, branchAId]);

    // Set consultation fee for Dentist A at Branch A
    await query(
      `INSERT INTO doctor_branch_fees (clinic_id, branch_id, doctor_id, consultation_fee, followup_fee, emergency_fee)
       VALUES ($1, $2, $3, 500, 250, 800)`,
      [clinicId, branchAId, dentistAId]
    );

    // Dentist B (Assigned only to Branch B)
    const docBEmail = `dentist_b_${Date.now()}@test.com`;
    const docBRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, specialization, license_number, is_active)
       VALUES ($1, $2, $3, $4, 'Dr. Bob', 'Smith', 'Orthodontics', 'LIC-B-002', true) RETURNING id`,
      [clinicId, roleMap['dentist'], docBEmail, pwdHash]
    );
    dentistBId = docBRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [dentistBId, branchBId]);

    const staffBRes = await query(
      `INSERT INTO staff (clinic_id, primary_branch_id, staff_number, first_name, last_name, phone, email, staff_category, user_id, is_active)
       VALUES ($1, $2, 'STF-B002', 'Dr. Bob', 'Smith', '9800000002', $3, 'dentist', $4, true) RETURNING id`,
      [clinicId, branchBId, docBEmail, dentistBId]
    );
    await query(`INSERT INTO staff_branches (staff_id, branch_id, is_default) VALUES ($1, $2, true)`, [staffBRes.rows[0].id, branchBId]);

    // Dentist C (Assigned to Branch A for chair conflict testing)
    const docCEmail = `dentist_c_${Date.now()}@test.com`;
    const docCRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, specialization, license_number, is_active)
       VALUES ($1, $2, $3, $4, 'Dr. Clara', 'Oswald', 'Periodontics', 'LIC-C-003', true) RETURNING id`,
      [clinicId, roleMap['dentist'], docCEmail, pwdHash]
    );
    dentistCId = docCRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [dentistCId, branchAId]);
    await query(
      `INSERT INTO doctor_branch_fees (clinic_id, branch_id, doctor_id, consultation_fee, followup_fee, emergency_fee)
       VALUES ($1, $2, $3, 700, 350, 900)`,
      [clinicId, branchAId, dentistCId]
    );

    // Branch B Staff (receptionist at Branch B only)
    const staffBUserEmail = `staff_b_${Date.now()}@test.com`;
    const staffBUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Staff', 'BetaOnly', true) RETURNING id`,
      [clinicId, roleMap['receptionist'], staffBUserEmail, pwdHash]
    );
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [staffBUserRes.rows[0].id, branchBId]);

    // Clinic 2 Admin
    const c2AdminEmail = `admin_t2_${Date.now()}@test.com`;
    const c2AdminRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Tenant2', 'Admin', true) RETURNING id`,
      [clinic2Id, roleMap['admin'], c2AdminEmail, pwdHash]
    );
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [c2AdminRes.rows[0].id, branchCId]);

    // Base Patients in Branch A
    const pat1Res = await query(
      `INSERT INTO patients (clinic_id, branch_id, patient_number, first_name, last_name, phone, status)
       VALUES ($1, $2, '104001', 'Patient', 'One', '9811111111', 'active') RETURNING id`,
      [clinicId, branchAId]
    );
    patientId = pat1Res.rows[0].id;

    const pat2Res = await query(
      `INSERT INTO patients (clinic_id, branch_id, patient_number, first_name, last_name, phone, status)
       VALUES ($1, $2, '104002', 'Patient', 'Two', '9822222222', 'active') RETURNING id`,
      [clinicId, branchAId]
    );
    patient2Id = pat2Res.rows[0].id;

    // Dental chairs in Branch A
    const chair1Res = await query(
      `INSERT INTO dental_chairs (clinic_id, branch_id, chair_number, chair_name, is_active)
       VALUES ($1, $2, 'CH-01', 'Operatory 1', true) RETURNING id`,
      [clinicId, branchAId]
    );
    chair1Id = chair1Res.rows[0].id;

    const chair2Res = await query(
      `INSERT INTO dental_chairs (clinic_id, branch_id, chair_number, chair_name, is_active)
       VALUES ($1, $2, 'CH-02', 'Operatory 2', true) RETURNING id`,
      [clinicId, branchAId]
    );
    chair2Id = chair2Res.rows[0].id;

    // Logins
    const lAdmin = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: adminEmail, password: 'Test@123456' },
    });
    adminToken = lAdmin.body.token;

    const lRec = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: recEmail, password: 'Test@123456' },
    });
    receptionistToken = lRec.body.token;

    const lDocA = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: docAEmail, password: 'Test@123456' },
    });
    dentistAToken = lDocA.body.token;

    const lDocB = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: docBEmail, password: 'Test@123456' },
    });
    dentistBToken = lDocB.body.token;

    const lStaffB = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: staffBUserEmail, password: 'Test@123456' },
    });
    branchBStaffToken = lStaffB.body.token;

    const lC2Admin = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: c2AdminEmail, password: 'Test@123456' },
    });
    clinic2AdminToken = lC2Admin.body.token;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (clinicId) {
      await query('DELETE FROM clinics WHERE id = $1', [clinicId]);
    }
    if (clinic2Id) {
      await query('DELETE FROM clinics WHERE id = $1', [clinic2Id]);
    }
  });

  test('1. Doctor branch assignment validation: Schedule cannot be configured for unassigned branch', async () => {
    // Dentist A is not assigned to Branch B yet
    const res = await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchBId}/doctors/${dentistAId}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchBId,
      },
      body: {
        schedules: [
          {
            day_of_week: 1,
            is_working: true,
            slot_duration_minutes: 30,
            buffer_minutes: 5,
            sessions: [{ start_time: '09:00', end_time: '12:00', is_break: false }],
          },
        ],
      },
    });

    assert.equal(res.status, 400, 'Should reject unassigned doctor with 400');
    assert.match(res.body.message, /Doctor is not assigned to this branch/i);
  });

  test('2. Time validation guards: Rejects start >= end, overlapping sessions, invalid slot durations', async () => {
    // 2a. start_time >= end_time
    const res1 = await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        schedules: [
          {
            day_of_week: 1,
            is_working: true,
            slot_duration_minutes: 30,
            buffer_minutes: 5,
            sessions: [{ start_time: '14:00', end_time: '12:00', is_break: false }],
          },
        ],
      },
    });
    assert.equal(res1.status, 400, 'Should reject start_time >= end_time');

    // 2b. Overlapping sessions
    const res2 = await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        schedules: [
          {
            day_of_week: 1,
            is_working: true,
            slot_duration_minutes: 30,
            buffer_minutes: 5,
            sessions: [
              { start_time: '09:00', end_time: '13:00', is_break: false },
              { start_time: '12:30', end_time: '16:00', is_break: false },
            ],
          },
        ],
      },
    });
    assert.equal(res2.status, 400, 'Should reject overlapping sessions');

    // 2c. Invalid slot duration (e.g. 25 min)
    const res3 = await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        schedules: [
          {
            day_of_week: 1,
            is_working: true,
            slot_duration_minutes: 25,
            buffer_minutes: 5,
            sessions: [{ start_time: '09:00', end_time: '12:00', is_break: false }],
          },
        ],
      },
    });
    assert.equal(res3.status, 400, 'Should reject unsupported slot duration 25 min');
  });

  test('3. Multi-session configuration with break intervals: Saves and retrieves correctly', async () => {
    // Configure Day 1 (Monday) with Morning session, Break session, and Afternoon session
    const res = await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        schedules: [
          {
            day_of_week: 1, // Monday
            is_working: true,
            slot_duration_minutes: 30,
            buffer_minutes: 0,
            sessions: [
              { start_time: '09:00', end_time: '12:00', is_break: false },
              { start_time: '12:00', end_time: '13:00', is_break: true, break_reason: 'Lunch & Sterilization' },
              { start_time: '13:00', end_time: '17:00', is_break: false },
            ],
          },
          {
            day_of_week: 2, // Tuesday
            is_working: true,
            slot_duration_minutes: 60,
            buffer_minutes: 0,
            sessions: [{ start_time: '10:00', end_time: '14:00', is_break: false }],
          },
          { day_of_week: 0, is_working: false, sessions: [] },
          { day_of_week: 3, is_working: false, sessions: [] },
          { day_of_week: 4, is_working: false, sessions: [] },
          { day_of_week: 5, is_working: false, sessions: [] },
          { day_of_week: 6, is_working: false, sessions: [] },
        ],
      },
    });

    assert.equal(res.status, 200, 'Weekly schedule update should succeed');
    assert.equal(res.body.success, true);

    // Retrieve schedule
    const getRes = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(getRes.status, 200);
    const mon = getRes.body.schedules.find((d) => d.day_of_week === 1);
    assert.ok(mon, 'Monday schedule should be present');
    assert.equal(mon.is_working, true);
    assert.equal(mon.sessions.length, 3, 'Should have 3 sessions including break');

    const breakSess = mon.sessions.find((s) => s.is_break === true);
    assert.ok(breakSess, 'Break session should be flagged with is_break: true');
    assert.equal(breakSess.start_time.slice(0, 5), '12:00');
    assert.equal(breakSess.end_time.slice(0, 5), '13:00');
    assert.match(breakSess.break_reason, /Lunch/i);
  });

  test('4. Slot generation engine: Correctly marks break intervals as unavailable break status', async () => {
    // 2026-11-02 is a Monday
    const slotsRes = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/slots?date=2026-11-02`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(slotsRes.status, 200);
    assert.equal(slotsRes.body.success, true);
    const slots = slotsRes.body.availability.slots;
    assert.ok(slots && slots.length > 0, 'Slots should be generated for Monday');

    // 09:00 should be available
    const morningSlot = slots.find((s) => (s.startTime || s.start_time) === '09:00');
    assert.ok(morningSlot, '09:00 slot exists');
    assert.equal(morningSlot.status, 'available');

    // Break slots: 12:00 and 12:30 should be break status
    const breakSlot1 = slots.find((s) => (s.startTime || s.start_time) === '12:00');
    assert.ok(breakSlot1, '12:00 slot exists in break window');
    assert.equal(breakSlot1.status, 'break');
    assert.match(breakSlot1.reason, /Lunch/i);

    const breakSlot2 = slots.find((s) => (s.startTime || s.start_time) === '12:30');
    assert.ok(breakSlot2, '12:30 slot exists in break window');
    assert.equal(breakSlot2.status, 'break');

    // Afternoon slot: 13:00 should be available
    const afternoonSlot = slots.find((s) => (s.startTime || s.start_time) === '13:00');
    assert.ok(afternoonSlot, '13:00 afternoon slot exists');
    assert.equal(afternoonSlot.status, 'available');
  });

  test('5. Cross-branch schedule independence: Branch A config does not alter Branch B', async () => {
    // Now assign Dentist A to Branch B as well
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, false)`, [dentistAId, branchBId]);
    const stfRes = await query(`SELECT id FROM staff WHERE user_id = $1`, [dentistAId]);
    await query(`INSERT INTO staff_branches (staff_id, branch_id, is_default) VALUES ($1, $2, false)`, [stfRes.rows[0].id, branchBId]);

    // Set consultation fee for Dentist A at Branch B
    await query(
      `INSERT INTO doctor_branch_fees (clinic_id, branch_id, doctor_id, consultation_fee, followup_fee, emergency_fee)
       VALUES ($1, $2, $3, 600, 300, 850)`,
      [clinicId, branchBId, dentistAId]
    );

    // Dentist A has no custom schedule at Branch B yet -> should have all empty/default
    const getResB1 = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchBId}/doctors/${dentistAId}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchBId,
      },
    });
    assert.equal(getResB1.status, 200);
    const b1Mon = (getResB1.body.schedules || []).find((d) => d.day_of_week === 1);
    assert.ok(!b1Mon || b1Mon.is_working === false || b1Mon.is_active === false, 'Branch B Monday should not inherit Branch A schedule');

    // Configure distinct schedule for Dentist A at Branch B on Wednesday (day 3)
    const putB = await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchBId}/doctors/${dentistAId}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchBId,
      },
      body: {
        schedules: [
          {
            day_of_week: 3, // Wednesday
            is_working: true,
            slot_duration_minutes: 45,
            buffer_minutes: 0,
            sessions: [{ start_time: '14:00', end_time: '18:00', is_break: false }],
          },
          { day_of_week: 0, is_working: false, sessions: [] },
          { day_of_week: 1, is_working: false, sessions: [] },
          { day_of_week: 2, is_working: false, sessions: [] },
          { day_of_week: 4, is_working: false, sessions: [] },
          { day_of_week: 5, is_working: false, sessions: [] },
          { day_of_week: 6, is_working: false, sessions: [] },
        ],
      },
    });
    assert.equal(putB.status, 200);

    // Verify Branch A remains unchanged (Monday is still working 30m)
    const getResA = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
    });
    const aMon = getResA.body.schedules.find((d) => d.day_of_week === 1);
    assert.ok(aMon, 'Branch A Monday schedule should exist');
    assert.equal(aMon.slot_duration_minutes, 30);
    const aWed = getResA.body.schedules.find((d) => d.day_of_week === 3);
    assert.equal(aWed.is_working, false, 'Branch A Wednesday must remain non-working');
  });

  test('6. Concurrency-aware cross-branch double booking prevention', async () => {
    // Book Dentist A at Branch A on Monday 2026-11-02 at 10:00
    const apptResA = await request({
      method: 'POST',
      path: '/api/appointments',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        branch_id: branchAId,
        patient_id: patientId,
        doctor_id: dentistAId,
        appointment_date: '2026-11-02',
        start_time: '10:00',
        end_time: '10:30',
        appointment_type: 'consultation',
        notes: 'Branch A checkup',
      },
    });

    assert.equal(apptResA.status, 201, `Booking at Branch A should succeed: ${JSON.stringify(apptResA.body)}`);
    assert.equal(apptResA.body.appointment.status, 'scheduled');

    // Now attempt to book Dentist A at Branch B on the exact same date and time (2026-11-02 at 10:00)
    const apptResB = await request({
      method: 'POST',
      path: '/api/appointments',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchBId,
      },
      body: {
        branch_id: branchBId,
        patient_id: patientId,
        doctor_id: dentistAId,
        appointment_date: '2026-11-02',
        start_time: '10:00',
        end_time: '10:30',
        appointment_type: 'consultation',
        notes: 'Conflicting booking at Branch B',
      },
    });

    assert.equal(apptResB.status, 409, 'Must return HTTP 409 Conflict for cross-branch double-booking');
    assert.match(apptResB.body.message, /conflicting appointment/i);
    assert.match(apptResB.body.message, /Stage 4 Branch Alpha/i, 'Error message should indicate which branch holds the booking');
  });

  test('7. Pre-flight conflict check API and Doctor Leave Exception Guard (409 Conflict)', async () => {
    // 7a. Pre-flight conflict check for Dentist A on 2026-11-02
    const checkRes = await request({
      method: 'POST',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/check-conflicts`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        exception: {
          exception_date: '2026-11-02',
          exception_type: 'leave',
        },
      },
    });

    assert.equal(checkRes.status, 200);
    assert.ok(checkRes.body.conflictCount > 0, 'Should detect conflict on 2026-11-02');
    assert.equal(checkRes.body.conflictingAppointments[0].startTime.slice(0, 5), '10:00');

    // 7b. Attempt to create a leave exception for Dentist A on 2026-11-02 -> Must be rejected with 409
    const excRes = await request({
      method: 'POST',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/exceptions`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        exception_date: '2026-11-02',
        exception_type: 'leave',
        reason: 'Attending emergency medical summit',
      },
    });

    assert.equal(excRes.status, 409, 'Must return 409 Conflict when appointments exist');
    assert.match(excRes.body.message, /Cannot register exception/i);
    assert.ok(excRes.body.conflicts && excRes.body.conflicts.length > 0, 'Must return conflicts array');

    // Verify appointment was NOT cancelled or deleted
    const apptCheck = await query(`SELECT status FROM appointments WHERE doctor_id = $1 AND appointment_date = '2026-11-02'`, [dentistAId]);
    assert.equal(apptCheck.rows[0].status, 'scheduled', 'Appointment status must remain scheduled');

    // 7c. Create exception on a date with no appointments (e.g. 2026-11-09)
    const excRes2 = await request({
      method: 'POST',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/exceptions`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        exception_date: '2026-11-09',
        exception_type: 'leave',
        reason: 'Approved annual leave',
      },
    });

    assert.equal(excRes2.status, 201, 'Should create exception when no conflicts exist');
    assert.equal(excRes2.body.success, true);

    // Slot check on 2026-11-09 should show all slots unavailable due to leave
    const slotsRes = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/slots?date=2026-11-09`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(slotsRes.status, 200);
    const avail = slotsRes.body.availability;
    assert.equal(avail.isAvailable, false);
    assert.match(avail.reason, /Approved annual leave/i);
  });

  test('8. Dental chair conflict detection (Optional Resource Model)', async () => {
    // 8a. List chairs
    const chairListRes = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/chairs`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(chairListRes.status, 200);
    assert.ok(chairListRes.body.chairs.length >= 2, 'Should list at least 2 chairs');

    // 8b. Book Doctor A at 11:00 on 2026-11-02 using Chair 1
    const apptChair1 = await request({
      method: 'POST',
      path: '/api/appointments',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        branch_id: branchAId,
        patient_id: patientId,
        doctor_id: dentistAId,
        chair_id: chair1Id,
        appointment_date: '2026-11-02',
        start_time: '11:00',
        end_time: '11:30',
        appointment_type: 'consultation',
        notes: 'Operatory 1 appointment',
      },
    });
    assert.equal(apptChair1.status, 201, 'Booking with Chair 1 should succeed');

    // 8c. Doctor C attempts to book at 11:00 on 2026-11-02 using Chair 1 -> 409 Conflict
    const apptChairConflict = await request({
      method: 'POST',
      path: '/api/appointments',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        branch_id: branchAId,
        patient_id: patient2Id,
        doctor_id: dentistCId,
        chair_id: chair1Id,
        appointment_date: '2026-11-02',
        start_time: '11:00',
        end_time: '11:30',
        appointment_type: 'consultation',
        notes: 'Conflicting chair appointment',
      },
    });
    assert.equal(apptChairConflict.status, 409, 'Must reject chair double-booking with 409');
    assert.match(apptChairConflict.body.message, /Dental chair is already booked/i);

    // 8d. Doctor C books at 11:00 on 2026-11-02 using Chair 2 -> Succeeds
    const apptChair2 = await request({
      method: 'POST',
      path: '/api/appointments',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        branch_id: branchAId,
        patient_id: patient2Id,
        doctor_id: dentistCId,
        chair_id: chair2Id,
        appointment_date: '2026-11-02',
        start_time: '11:00',
        end_time: '11:30',
        appointment_type: 'consultation',
        notes: 'Operatory 2 appointment',
      },
    });
    assert.equal(apptChair2.status, 201, 'Booking with Chair 2 should succeed');
  });

  test('9. Role-based authorization & strict branch isolation', async () => {
    // 9a. Receptionist attempting to PUT schedule -> 403 Forbidden
    const putRec = await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: { schedules: [] },
    });
    assert.equal(putRec.status, 403, 'Receptionist must not be allowed to modify weekly schedule');

    // 9b. Receptionist attempting to POST exception -> 403 Forbidden
    const postExcRec = await request({
      method: 'POST',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/exceptions`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        exception_date: '2026-12-25',
        exception_type: 'holiday',
        reason: 'Christmas',
      },
    });
    assert.equal(postExcRec.status, 403, 'Receptionist must not be allowed to create schedule exceptions');

    // 9c. Receptionist CAN view schedule and slots -> 200 OK
    const getRec = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(getRec.status, 200, 'Receptionist must have read access to doctor schedules');

    // 9d. Branch B staff attempting to access Branch A schedule -> 403 Forbidden
    const bStaffOnA = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}`,
      headers: {
        Authorization: `Bearer ${branchBStaffToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(bStaffOnA.status, 403, 'Staff from Branch B must not access Branch A schedule');

    // 9e. Tenant 2 Admin attempting to access Clinic 1 Branch A schedule -> 403 Forbidden
    const t2AdminOnC1 = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}`,
      headers: {
        Authorization: `Bearer ${clinic2AdminToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(t2AdminOnC1.status, 403, 'Tenant 2 user must not access Clinic 1 schedules');
  });

  test('10. Calendar Events and Availability Range APIs work as expected', async () => {
    // 10a. Calendar events for Dentist A across 2026-11-01 to 2026-11-07
    const eventsRes = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/calendar-events?startDate=2026-11-01&endDate=2026-11-07`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(eventsRes.status, 200);
    assert.ok(Array.isArray(eventsRes.body.appointments), 'Returns appointments array');
    assert.ok(eventsRes.body.appointments.length >= 2, 'Should include booked appointments');

    // 10b. Availability range summary for week
    const rangeRes = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/availability-range?startDate=2026-11-01&endDate=2026-11-07`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(rangeRes.status, 200);
    assert.ok(Array.isArray(rangeRes.body.days), 'Returns days capacity summary');
    const monSummary = rangeRes.body.days.find((d) => d.date === '2026-11-02');
    assert.ok(monSummary, 'Monday summary should exist');
    assert.ok(monSummary.bookedSlotsCount >= 2, 'Should reflect booked slots count');
  });
});
