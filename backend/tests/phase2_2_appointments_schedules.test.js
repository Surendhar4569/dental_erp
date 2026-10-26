const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { query, pool, initializeDatabase } = require('../config/database');

describe('Phase 2.2: Appointments, Schedules, Reception & Billing Test Suite', () => {
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
  let dentistAId;
  let dentistBId;
  let branchBStaffToken;

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

    // 1. Create Test Clinic 1
    const clinicCode = `P22-${Date.now().toString().slice(-5)}`;
    const clinicRes = await query(
      `INSERT INTO clinics (code, name, is_active, subscription_status)
       VALUES ($1, 'Phase 2.2 Test Clinic', true, 'active')
       RETURNING id`,
      [clinicCode]
    );
    clinicId = clinicRes.rows[0].id;

    // Branches for Clinic 1
    const bARes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BA-P22', 'Branch Alpha', 'Asia/Kolkata', true, true)
       RETURNING id`,
      [clinicId]
    );
    branchAId = bARes.rows[0].id;

    const bBRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BB-P22', 'Branch Beta', 'Asia/Kolkata', true, false)
       RETURNING id`,
      [clinicId]
    );
    branchBId = bBRes.rows[0].id;

    // Clinic 2 (for tenant isolation)
    const c2Res = await query(
      `INSERT INTO clinics (code, name, is_active, subscription_status)
       VALUES ($1, 'Phase 2.2 Tenant 2', true, 'active')
       RETURNING id`,
      [`T2-${Date.now().toString().slice(-5)}`]
    );
    clinic2Id = c2Res.rows[0].id;

    const bCRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BC-P22', 'Branch Charlie T2', 'Asia/Kolkata', true, true)
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

    const pwdHash = await bcrypt.hash('Test@123456', 10);

    // Create Admin (Assigned to Branch A)
    const adminEmail = `admin_p22_${Date.now()}@test.com`;
    const adminRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Admin', 'P22', true) RETURNING id`,
      [clinicId, roleMap['admin'], adminEmail, pwdHash]
    );
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [adminRes.rows[0].id, branchAId]
    );

    // Create Receptionist (Assigned to Branch A)
    const recEmail = `rec_p22_${Date.now()}@test.com`;
    const recRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'FrontDesk', 'Reception', true) RETURNING id`,
      [clinicId, roleMap['receptionist'], recEmail, pwdHash]
    );
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [recRes.rows[0].id, branchAId]
    );

    // Create Dentist A (Assigned to Branch A)
    const docAEmail = `dentist_a_${Date.now()}@test.com`;
    const docARes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Dr. Sarah', 'Jenkins', true) RETURNING id`,
      [clinicId, roleMap['dentist'], docAEmail, pwdHash]
    );
    dentistAId = docARes.rows[0].id;
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [dentistAId, branchAId]
    );

    // Create Dentist B (Assigned to Branch B)
    const docBEmail = `dentist_b_${Date.now()}@test.com`;
    const docBRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Dr. Robert', 'Chen', true) RETURNING id`,
      [clinicId, roleMap['dentist'], docBEmail, pwdHash]
    );
    dentistBId = docBRes.rows[0].id;
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [dentistBId, branchBId]
    );

    // Create Staff B (Assigned only to Branch B)
    const staffBEmail = `staff_b_${Date.now()}@test.com`;
    const staffBRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Staff', 'Beta', true) RETURNING id`,
      [clinicId, roleMap['receptionist'], staffBEmail, pwdHash]
    );
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [staffBRes.rows[0].id, branchBId]
    );

    // Create a base Patient in Branch A
    const patRes = await query(
      `INSERT INTO patients (clinic_id, branch_id, patient_number, first_name, last_name, phone, status)
       VALUES ($1, $2, '100099', 'John', 'Doe', '9876543210', 'active')
       RETURNING id`,
      [clinicId, branchAId]
    );
    patientId = patRes.rows[0].id;

    // Log in all actors
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

    const lStaffB = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: staffBEmail, password: 'Test@123456' },
    });
    branchBStaffToken = lStaffB.body.token;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // 1. Doctors Listing Scoped to Branch
  test('1. List doctors assigned to Branch A returns Dr. Sarah Jenkins', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.doctors));
    const docIds = res.body.doctors.map((d) => d.id);
    assert.ok(docIds.includes(dentistAId), 'Dr. Sarah Jenkins should be listed for Branch A');
    assert.ok(!docIds.includes(dentistBId), 'Dr. Robert Chen should NOT be listed for Branch A');
  });

  // 2. Weekly Schedule Management & Sessions
  test('2. Configure weekly schedule with Morning & Evening sessions for Dr. Sarah', async () => {
    // Configure Monday (day_of_week = 1)
    const schedules = [
      {
        day_of_week: 1,
        slot_duration_minutes: 30,
        buffer_minutes: 0,
        is_active: true,
        sessions: [
          { session_name: 'Morning Session', start_time: '09:00', end_time: '13:00', session_order: 1 },
          { session_name: 'Evening Session', start_time: '16:00', end_time: '20:00', session_order: 2 },
        ],
      },
      {
        day_of_week: 2,
        slot_duration_minutes: 30,
        buffer_minutes: 0,
        is_active: true,
        sessions: [
          { session_name: 'Full Day', start_time: '10:00', end_time: '18:00', session_order: 1 },
        ],
      },
    ];

    const res = await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { schedules },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.schedules.length, 2);

    // Retrieve schedule
    const getRes = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}`,
      headers: { Authorization: `Bearer ${receptionistToken}` },
    });

    assert.equal(getRes.status, 200);
    const mon = getRes.body.schedules.find((s) => s.day_of_week === 1);
    assert.ok(mon);
    assert.equal(mon.sessions.length, 2);
  });

  // 3. Consultation Fee Matrix Configuration
  test('3. Save consultation fee for Dr. Sarah and verify precedence', async () => {
    const feePayload = {
      consultation_fee: 650.0,
      followup_fee: 400.0,
      emergency_fee: 1000.0,
    };

    const saveRes = await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/fees`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: feePayload,
    });

    assert.equal(saveRes.status, 200);
    assert.equal(saveRes.body.success, true);

    const getRes = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/fees`,
      headers: { Authorization: `Bearer ${receptionistToken}` },
    });

    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.fees.consultation_fee, 650.0);
    assert.equal(getRes.body.fees.source, 'doctor_branch_specific');
  });

  // 4. Dynamic Slot Availability Engine
  test('4. Calculate available slots on a scheduled Monday (future date)', async () => {
    // 2026-10-26 is a Monday (day_of_week = 1)
    const testDate = '2026-10-26';

    const res = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/slots?date=${testDate}`,
      headers: { Authorization: `Bearer ${receptionistToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const { availability } = res.body;
    assert.equal(availability.dayOfWeek, 1);
    assert.ok(availability.slots.length > 0);
    // Morning 09:00 - 13:00 = 8 slots; Evening 16:00 - 20:00 = 8 slots => 16 total slots
    assert.equal(availability.totalSlots, 16);
    assert.equal(availability.availableSlotsCount, 16);
    assert.equal(availability.slots[0].startTime, '09:00');
    assert.equal(availability.slots[0].endTime, '09:30');
    assert.equal(availability.slots[0].isAvailable, true);
  });

  // 5. Booking an Appointment
  let bookedAppointmentId;
  let appointmentNumber;

  test('5. Book an appointment for Dr. Sarah at 09:00 on Monday', async () => {
    const testDate = '2026-10-26';
    const apptPayload = {
      doctor_id: dentistAId,
      patient_id: patientId,
      appointment_date: testDate,
      start_time: '09:00',
      end_time: '09:30',
      appointment_type: 'consultation',
      chief_complaint: 'Severe toothache lower left molar',
    };

    const res = await request({
      method: 'POST',
      path: '/api/appointments',
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: apptPayload,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    const appt = res.body.appointment;
    assert.ok(appt.appointment_number.startsWith('APT-'));
    assert.equal(parseFloat(appt.consultation_fee), 650.0, 'Fee snapshot should match doctor fee');
    assert.equal(appt.status, 'scheduled');

    bookedAppointmentId = appt.id;
    appointmentNumber = appt.appointment_number;
  });

  // 6. Concurrency / Double-Booking Prevention
  test('6. Attempting to book the EXACT SAME slot is rejected with 409 Conflict', async () => {
    const testDate = '2026-10-26';
    const res = await request({
      method: 'POST',
      path: '/api/appointments',
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        doctor_id: dentistAId,
        patient_id: patientId,
        appointment_date: testDate,
        start_time: '09:00',
        end_time: '09:30',
        appointment_type: 'consultation',
      },
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.ok(res.body.message.includes('already booked'));
  });

  test('7. Attempting to book an OVERLAPPING interval (e.g. 09:15-09:45) is rejected with 409 Conflict', async () => {
    const testDate = '2026-10-26';
    const res = await request({
      method: 'POST',
      path: '/api/appointments',
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        doctor_id: dentistAId,
        patient_id: patientId,
        appointment_date: testDate,
        start_time: '09:15',
        end_time: '09:45',
        appointment_type: 'consultation',
      },
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.ok(res.body.message.includes('already booked'));
  });

  // 8. Slot Availability reflects booked slot
  test('8. Availability engine shows 09:00 slot as booked and unavailable', async () => {
    const testDate = '2026-10-26';
    const res = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/slots?date=${testDate}`,
      headers: { Authorization: `Bearer ${receptionistToken}` },
    });

    assert.equal(res.status, 200);
    const { availability } = res.body;
    assert.equal(availability.availableSlotsCount, 15);
    const slot0900 = availability.slots.find((s) => s.startTime === '09:00');
    assert.ok(slot0900);
    assert.equal(slot0900.isAvailable, false);
    assert.equal(slot0900.status, 'booked');
  });

  // 9. Rescheduling
  test('9. Reschedule appointment to 10:00 succeeds and updates slot availability', async () => {
    const testDate = '2026-10-26';
    const res = await request({
      method: 'PATCH',
      path: `/api/appointments/${bookedAppointmentId}/reschedule`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        appointment_date: testDate,
        start_time: '10:00',
        end_time: '10:30',
        reason: 'Patient requested later morning slot',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.appointment.start_time, '10:00:00');

    // 09:00 slot should now be FREE again!
    const slotRes = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/slots?date=${testDate}`,
      headers: { Authorization: `Bearer ${receptionistToken}` },
    });
    const slot0900 = slotRes.body.availability.slots.find((s) => s.startTime === '09:00');
    assert.equal(slot0900.isAvailable, true);

    const slot1000 = slotRes.body.availability.slots.find((s) => s.startTime === '10:00');
    assert.equal(slot1000.isAvailable, false);
  });

  // 10. Status Transitions
  test('10. Lifecycle state machine: confirm appointment', async () => {
    const res = await request({
      method: 'PATCH',
      path: `/api/appointments/${bookedAppointmentId}/status`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        status: 'confirmed',
        notes: 'Confirmed by patient over phone',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.appointment.status, 'confirmed');
  });

  // 11. Check-In & Daily Visit Token Issuance
  let dailyVisitToken;
  let walkInAppointmentId;
  test('11. Reception check-in generates atomic daily visit token (001+) and links visit', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/appointments/${bookedAppointmentId}/check-in`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.appointment.status, 'checked_in');
    assert.ok(res.body.visit);
    assert.ok(res.body.visit.token_display.length === 3);
    dailyVisitToken = res.body.visit.token_display;
  });

  // 12. Quick Walk-In Registration
  test('12. Quick walk-in appointment registration automatically checks in and assigns next token', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/appointments/walk-in',
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        doctor_id: dentistAId,
        new_patient: {
          first_name: 'WalkIn',
          last_name: 'Patient',
          phone: '9988776655',
          gender: 'female',
        },
        chief_complaint: 'Bleeding gums emergency walk-in',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.appointment.appointment_type, 'walk_in');
    assert.equal(res.body.appointment.status, 'checked_in');
    assert.ok(res.body.visit.token_display);
    assert.notEqual(res.body.visit.token_display, dailyVisitToken, 'Should receive next sequential token');
    walkInAppointmentId = res.body.appointment.id;
  });

  // 13. Consultation Payment Collection & Receipt Issuance
  let paymentReceiptId;
  let receiptNumber;

  test('13. Collect partial payment: issues REC-10001+ receipt and updates balance', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/appointments/${bookedAppointmentId}/payments`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        amount_paid: 400.0,
        payment_method: 'upi',
        transaction_reference: 'UPI/REF/99881122',
        notes: 'Initial consultation deposit',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    const r = res.body.receipt;
    assert.ok(r.receipt_number.startsWith('REC-'));
    assert.equal(parseFloat(r.amount_paid), 400.0);
    // Gross: 650.0, Paid: 400.0 => Remaining: 250.0
    assert.equal(parseFloat(r.remaining_balance), 250.0);

    paymentReceiptId = r.id;
    receiptNumber = r.receipt_number;

    // Check appointment payment_status is 'partial'
    const apptRes = await request({
      method: 'GET',
      path: `/api/appointments/${bookedAppointmentId}`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(apptRes.body.appointment.payment_status, 'partial');
    assert.equal(parseFloat(apptRes.body.appointment.amount_paid), 400.0);
  });

  test('14. Collect remaining balance: marks appointment payment_status as paid', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/appointments/${bookedAppointmentId}/payments`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        amount_paid: 250.0,
        payment_method: 'cash',
        notes: 'Settled balance at desk',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(parseFloat(res.body.receipt.remaining_balance), 0.0);

    const apptRes = await request({
      method: 'GET',
      path: `/api/appointments/${bookedAppointmentId}`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(apptRes.body.appointment.payment_status, 'paid');
    assert.equal(parseFloat(apptRes.body.appointment.amount_paid), 650.0);
  });

  test('14b. Duplicate payment protection: Collecting payment on already fully settled appointment is rejected with HTTP 400', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/appointments/${bookedAppointmentId}/payments`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        amount_paid: 100.0,
        payment_method: 'cash',
        notes: 'Accidental retry payment',
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /already fully settled/i);
  });

  test('14c. Overpayment protection: Collecting payment exceeding remaining balance due is rejected with HTTP 400', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/appointments/${walkInAppointmentId}/payments`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        amount_paid: 9999.0,
        payment_method: 'upi',
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /exceeds remaining balance due/i);
  });

  test('15. Receipt reprint tracking: increments reprint count without altering receipt number', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/appointments/payments/${paymentReceiptId}/receipt?reprint=true`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.receipt.receipt_number, receiptNumber);
    assert.equal(res.body.receipt.reprint_count, 1);
  });

  // 16. Reception Metrics
  test('16. Reception metrics endpoint returns accurate today counts', async () => {
    const res = await request({
      method: 'GET',
      path: '/api/appointments/reception/metrics',
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.metrics);
    assert.ok(parseInt(res.body.metrics.walk_in_count, 10) >= 1);
  });

  // 17. Doctor Schedule Exceptions (Leave)
  test('17. Creating whole-day leave marks all slots as unavailable with reason', async () => {
    const leaveDate = '2026-10-27'; // Tuesday (day 2)

    const res = await request({
      method: 'POST',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/exceptions`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        exception_date: leaveDate,
        exception_type: 'leave',
        reason: 'Attending Dental Conference',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);

    // Slot check on leave date
    const slotRes = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/slots?date=${leaveDate}`,
      headers: { Authorization: `Bearer ${receptionistToken}` },
    });

    assert.equal(slotRes.status, 200);
    assert.equal(slotRes.body.availability.isAvailable, false);
    assert.ok(slotRes.body.availability.reason.includes('Dental Conference'));
    assert.equal(slotRes.body.availability.slots.length, 0);
  });

  // 18. STRICT BRANCH-LEVEL ISOLATION
  test('18. Staff assigned ONLY to Branch B CANNOT access Branch A appointments (403 Forbidden)', async () => {
    const res = await request({
      method: 'GET',
      path: '/api/appointments',
      headers: {
        Authorization: `Bearer ${branchBStaffToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  test('19. Staff assigned ONLY to Branch B CANNOT collect payment for Branch A appointment (403 Forbidden)', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/appointments/${bookedAppointmentId}/payments`,
      headers: {
        Authorization: `Bearer ${branchBStaffToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        amount_paid: 100.0,
        payment_method: 'cash',
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  test('20. Cross-Tenant access to Branch Charlie (Clinic 2) is strictly rejected (403 Forbidden)', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchCId}/doctors`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchCId,
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });
});
