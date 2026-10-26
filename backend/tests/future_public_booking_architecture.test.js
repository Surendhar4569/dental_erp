const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { query, pool, initializeDatabase } = require('../config/database');

describe('Future-Ready Public Booking Architecture Test Suite', () => {
  let server;
  let baseUrl;

  // Clinic 1 (Primary Tenant)
  let clinicId;
  let branchAId;
  let branchBId;

  // Clinic 2 (Secondary Tenant for Multi-Tenant Isolation)
  let clinic2Id;
  let branchCId;

  // Users & Tokens
  let adminToken;
  let adminId;
  let receptionistToken;
  let dentistAToken;
  let dentistAId;
  let dentistBId;
  let dentistDualId;
  let clinic2AdminToken;

  // Patients
  let patientId;
  const existingPhone = '9876543210';

  // Booking references and appointments captured across tests
  let appointmentOneBookingRef;
  let appointmentOneId;

  // Date constants (all scheduled future days)
  const mondayDate = '2026-10-26';
  const tuesdayDate = '2026-10-27';
  const wednesdayDate = '2026-10-28';
  const thursdayDate = '2026-10-29';
  const fridayDate = '2026-10-30';

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

    const suffix = Date.now().toString().slice(-6);

    // 1. Create Primary Clinic 1
    const clinicRes = await query(
      `INSERT INTO clinics (code, name, is_active, subscription_status)
       VALUES ($1, 'Future Public Booking Dental Org', true, 'active')
       RETURNING id`,
      [`FPB-${suffix}`]
    );
    clinicId = clinicRes.rows[0].id;

    // Branches for Clinic 1
    const bARes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, address_line1, city, state, postal_code, country, phone, email, timezone, is_active, is_default)
       VALUES ($1, 'BA-FPB', 'Downtown Branch Alpha', '123 Main Street', 'Metro City', 'CA', '90210', 'USA', '+1-555-0101', 'alpha@clinic.com', 'Asia/Kolkata', true, true)
       RETURNING id`,
      [clinicId]
    );
    branchAId = bARes.rows[0].id;

    const bBRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, address_line1, city, state, postal_code, country, phone, email, timezone, is_active, is_default)
       VALUES ($1, 'BB-FPB', 'Uptown Branch Beta', '456 High Street', 'Metro City', 'CA', '90211', 'USA', '+1-555-0102', 'beta@clinic.com', 'Asia/Kolkata', true, false)
       RETURNING id`,
      [clinicId]
    );
    branchBId = bBRes.rows[0].id;

    // 2. Create Tenant 2 for Cross-Tenant Isolation Tests
    const c2Res = await query(
      `INSERT INTO clinics (code, name, is_active, subscription_status)
       VALUES ($1, 'Unrelated Tenant Dental Org', true, 'active')
       RETURNING id`,
      [`T2-${suffix}`]
    );
    clinic2Id = c2Res.rows[0].id;

    const bCRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, address_line1, city, state, postal_code, country, phone, email, timezone, is_active, is_default)
       VALUES ($1, 'BC-FPB', 'Cross Tenant Branch Charlie', '789 Other Ave', 'Suburbs', 'CA', '90212', 'USA', '+1-555-0103', 'charlie@otherclinic.com', 'Asia/Kolkata', true, true)
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

    // Create Admin for Clinic 1 (Assigned to both Branch A and Branch B)
    const adminEmail = `admin_fpb_${suffix}@test.com`;
    const adminRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'SuperAdmin', 'Director', true) RETURNING id`,
      [clinicId, roleMap['admin'], adminEmail, pwdHash]
    );
    adminId = adminRes.rows[0].id;
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true), ($1, $3, false)`,
      [adminId, branchAId, branchBId]
    );

    // Create Receptionist for Clinic 1 (Assigned to Branch A)
    const recEmail = `rec_fpb_${suffix}@test.com`;
    const recRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Alice', 'Receptionist', true) RETURNING id`,
      [clinicId, roleMap['receptionist'], recEmail, pwdHash]
    );
    const recId = recRes.rows[0].id;
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [recId, branchAId]
    );

    // Create Doctor A (Dr. Sarah Jenkins - Assigned ONLY to Branch A)
    const docAEmail = `doc_a_${suffix}@test.com`;
    const docARes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, specialization, license_number, is_active)
       VALUES ($1, $2, $3, $4, 'Dr. Sarah', 'Jenkins', 'Orthodontics', 'LIC-A-001', true) RETURNING id`,
      [clinicId, roleMap['dentist'], docAEmail, pwdHash]
    );
    dentistAId = docARes.rows[0].id;
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [dentistAId, branchAId]
    );
    const staffARes = await query(
      `INSERT INTO staff (clinic_id, primary_branch_id, staff_number, first_name, last_name, phone, email, staff_category, user_id, specialization, license_number, is_active)
       VALUES ($1, $2, $3, 'Dr. Sarah', 'Jenkins', '9800000001', $4, 'dentist', $5, 'Orthodontics', 'LIC-A-001', true) RETURNING id`,
      [clinicId, branchAId, `STF-A-${suffix}`, docAEmail, dentistAId]
    );
    await query(`INSERT INTO staff_branches (staff_id, branch_id, is_default) VALUES ($1, $2, true)`, [staffARes.rows[0].id, branchAId]);

    // Create Doctor B (Dr. Robert Chen - Assigned ONLY to Branch B)
    const docBEmail = `doc_b_${suffix}@test.com`;
    const docBRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, specialization, license_number, is_active)
       VALUES ($1, $2, $3, $4, 'Dr. Robert', 'Chen', 'Periodontics', 'LIC-B-002', true) RETURNING id`,
      [clinicId, roleMap['dentist'], docBEmail, pwdHash]
    );
    dentistBId = docBRes.rows[0].id;
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [dentistBId, branchBId]
    );
    const staffBRes = await query(
      `INSERT INTO staff (clinic_id, primary_branch_id, staff_number, first_name, last_name, phone, email, staff_category, user_id, specialization, license_number, is_active)
       VALUES ($1, $2, $3, 'Dr. Robert', 'Chen', '9800000002', $4, 'dentist', $5, 'Periodontics', 'LIC-B-002', true) RETURNING id`,
      [clinicId, branchBId, `STF-B-${suffix}`, docBEmail, dentistBId]
    );
    await query(`INSERT INTO staff_branches (staff_id, branch_id, is_default) VALUES ($1, $2, true)`, [staffBRes.rows[0].id, branchBId]);

    // Create Doctor Dual (Dr. Emily Stone - Assigned to BOTH Branch A and Branch B)
    const docDualEmail = `doc_dual_${suffix}@test.com`;
    const docDualRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, specialization, license_number, is_active)
       VALUES ($1, $2, $3, $4, 'Dr. Emily', 'Stone', 'Endodontics', 'LIC-D-003', true) RETURNING id`,
      [clinicId, roleMap['dentist'], docDualEmail, pwdHash]
    );
    dentistDualId = docDualRes.rows[0].id;
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true), ($1, $3, false)`,
      [dentistDualId, branchAId, branchBId]
    );
    const staffDualRes = await query(
      `INSERT INTO staff (clinic_id, primary_branch_id, staff_number, first_name, last_name, phone, email, staff_category, user_id, specialization, license_number, is_active)
       VALUES ($1, $2, $3, 'Dr. Emily', 'Stone', '9800000003', $4, 'dentist', $5, 'Endodontics', 'LIC-D-003', true) RETURNING id`,
      [clinicId, branchAId, `STF-D-${suffix}`, docDualEmail, dentistDualId]
    );
    await query(`INSERT INTO staff_branches (staff_id, branch_id, is_default) VALUES ($1, $2, true)`, [staffDualRes.rows[0].id, branchAId]);
    await query(`INSERT INTO staff_branches (staff_id, branch_id, is_default) VALUES ($1, $2, false)`, [staffDualRes.rows[0].id, branchBId]);

    // Create Admin for Clinic 2 (Tenant 2)
    const c2AdminEmail = `c2_admin_${suffix}@test.com`;
    const c2AdminRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Tenant2', 'Admin', true) RETURNING id`,
      [clinic2Id, roleMap['admin'], c2AdminEmail, pwdHash]
    );
    const c2AdminId = c2AdminRes.rows[0].id;
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [c2AdminId, branchCId]
    );

    // Create Initial Patient at Branch A
    const patientNum = `${Math.floor(100000 + Math.random() * 899999)}`;
    const patRes = await query(
      `INSERT INTO patients (clinic_id, branch_id, patient_number, first_name, last_name, phone, email, status)
       VALUES ($1, $2, $3, 'John', 'Doe', $4, 'john.doe@example.com', 'active')
       RETURNING id`,
      [clinicId, branchAId, patientNum, existingPhone]
    );
    patientId = patRes.rows[0].id;

    // Log in to acquire JWT Tokens
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

    // Set up weekly schedules
    // Dr. Sarah at Branch A: Mondays, Tuesdays, Fridays (09:00 - 13:00 and 16:00 - 18:00)
    const sarahSchedules = [
      {
        day_of_week: 1, // Monday
        slot_duration_minutes: 30,
        buffer_minutes: 0,
        is_active: true,
        sessions: [
          { session_name: 'Morning', start_time: '09:00', end_time: '13:00', session_order: 1 },
          { session_name: 'Evening', start_time: '16:00', end_time: '18:00', session_order: 2 },
        ],
      },
      {
        day_of_week: 2, // Tuesday
        slot_duration_minutes: 30,
        buffer_minutes: 0,
        is_active: true,
        sessions: [
          { session_name: 'Full Day', start_time: '09:00', end_time: '13:00', session_order: 1 },
        ],
      },
      {
        day_of_week: 5, // Friday
        slot_duration_minutes: 30,
        buffer_minutes: 0,
        is_active: true,
        sessions: [
          { session_name: 'Shift', start_time: '11:00', end_time: '17:00', session_order: 1 },
        ],
      },
    ];

    await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { schedules: sarahSchedules },
    });

    // Dr. Robert at Branch B: Wednesdays (10:00 - 14:00)
    await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchBId}/doctors/${dentistBId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        schedules: [
          {
            day_of_week: 3, // Wednesday
            slot_duration_minutes: 30,
            buffer_minutes: 0,
            is_active: true,
            sessions: [
              { session_name: 'Regular', start_time: '10:00', end_time: '14:00', session_order: 1 },
            ],
          },
        ],
      },
    });

    // Dr. Emily Stone: Thursdays (10:00 - 14:00) at BOTH Branch A and Branch B
    await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistDualId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        schedules: [
          {
            day_of_week: 4, // Thursday
            slot_duration_minutes: 30,
            buffer_minutes: 0,
            is_active: true,
            sessions: [
              { session_name: 'Branch A Session', start_time: '10:00', end_time: '14:00', session_order: 1 },
            ],
          },
        ],
      },
    });

    await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchBId}/doctors/${dentistDualId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        schedules: [
          {
            day_of_week: 4, // Thursday
            slot_duration_minutes: 30,
            buffer_minutes: 0,
            is_active: true,
            sessions: [
              { session_name: 'Branch B Session', start_time: '10:00', end_time: '14:00', session_order: 1 },
            ],
          },
        ],
      },
    });

    // Set doctor consultation fees
    await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchBId}/doctors/${dentistBId}/fees`,
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchBId },
      body: { consultation_fee: 500.0 },
    });

    await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistDualId}/fees`,
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchAId },
      body: { consultation_fee: 600.0 },
    });

    await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchBId}/doctors/${dentistDualId}/fees`,
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchBId },
      body: { consultation_fee: 600.0 },
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // Test 1: Reusable bookable branches lookup returns active branches with sanitized public attributes
  test('1. Bookable branches lookup returns active branches with sanitized public attributes', async () => {
    const res = await request({
      method: 'GET',
      path: '/api/appointments/bookable-branches',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.branches));
    assert.equal(res.body.branches.length, 2);

    const branchIds = res.body.branches.map((b) => b.id);
    assert.ok(branchIds.includes(branchAId), 'Branch Alpha should be included');
    assert.ok(branchIds.includes(branchBId), 'Branch Beta should be included');
    assert.ok(!branchIds.includes(branchCId), 'Clinic 2 Branch Charlie must NOT be included');

    // Verify sanitized public attributes
    const branchA = res.body.branches.find((b) => b.id === branchAId);
    assert.equal(branchA.branch_name, 'Downtown Branch Alpha');
    assert.equal(branchA.branch_code, 'BA-FPB');
    assert.equal(branchA.timezone, 'Asia/Kolkata');
    assert.equal(branchA.is_default, true);
    assert.equal(branchA.phone, '+1-555-0101');
    assert.equal(branchA.email, 'alpha@clinic.com');

    // Ensure internal administrative details are omitted
    assert.equal(branchA.staff_count, undefined);
    assert.equal(branchA.salary_expenses, undefined);
    assert.equal(branchA.created_by, undefined);
  });

  // Test 2: Bookable doctors lookup for a branch returns only actively assigned doctors
  test('2. Bookable doctors lookup returns only active doctors assigned to the specified branch', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/appointments/branches/${branchAId}/bookable-doctors`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.doctors));

    const doctorIds = res.body.doctors.map((d) => d.id);
    // Dr. Sarah and Dr. Emily are assigned to Branch A
    assert.ok(doctorIds.includes(dentistAId), 'Dr. Sarah should be listed for Branch A');
    assert.ok(doctorIds.includes(dentistDualId), 'Dr. Emily should be listed for Branch A');
    // Dr. Robert is assigned ONLY to Branch B -> must NOT be returned for Branch A
    assert.ok(!doctorIds.includes(dentistBId), 'Dr. Robert Chen must NOT be returned for Branch A');

    // Check sanitized public profile fields
    const docSarah = res.body.doctors.find((d) => d.id === dentistAId);
    assert.equal(docSarah.first_name, 'Dr. Sarah');
    assert.equal(docSarah.last_name, 'Jenkins');
    assert.equal(docSarah.specialization, 'Orthodontics');
    assert.equal(docSarah.license_number, 'LIC-A-001');

    // Internal sensitive details must be absent
    assert.equal(docSarah.password_hash, undefined);
    assert.equal(docSarah.email, undefined);
    assert.equal(docSarah.salary, undefined);
  });

  // Test 3: Booking attempt for unassigned doctor at a branch is strictly rejected (HTTP 400)
  test('3. Booking attempt for unassigned doctor at a branch is strictly rejected with 400 Bad Request', async () => {
    // Dr. Robert Chen (dentistBId) is NOT assigned to Branch A
    const res = await request({
      method: 'POST',
      path: '/api/appointments',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        branch_id: branchAId,
        doctor_id: dentistBId,
        patient_id: patientId,
        appointment_date: mondayDate,
        start_time: '10:00',
        end_time: '10:30',
        appointment_type: 'consultation',
        chief_complaint: 'Testing unassigned doctor rejection',
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Doctor is not assigned/i);

    // Also check availability service directly rejects slot generation
    const slotRes = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistBId}/slots?date=${mondayDate}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(slotRes.status, 200);
    assert.equal(slotRes.body.availability.isAvailable, false);
    assert.match(slotRes.body.availability.reason, /Doctor is not assigned/i);
  });

  // Test 4: Availability slot generation for bookable doctor respects holiday closures
  test('4. Availability engine returns valid slots and respects branch holiday closures', async () => {
    // 1. Check open slots before holiday
    const slotResBefore = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/slots?date=${mondayDate}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(slotResBefore.status, 200);
    assert.equal(slotResBefore.body.availability.isAvailable, true);
    assert.ok(slotResBefore.body.availability.slots.length > 0);

    // 2. Declare a holiday on mondayDate for Branch A
    const holidayRes = await query(
      `INSERT INTO clinic_holidays (clinic_id, branch_id, holiday_date, holiday_year, name, category, is_closed, is_active)
       VALUES ($1, $2, $3, 2026, 'Founder Day Holiday', 'clinic_specific', true, true)
       RETURNING id`,
      [clinicId, branchAId, mondayDate]
    );
    const holidayId = holidayRes.rows[0].id;

    // 3. Re-query slots on holiday date -> should be unavailable due to holiday
    const slotResAfter = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/slots?date=${mondayDate}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(slotResAfter.status, 200);
    assert.equal(slotResAfter.body.availability.isAvailable, false);
    assert.match(slotResAfter.body.availability.reason, /Founder Day Holiday/i);

    // 4. Remove holiday so subsequent tests on mondayDate run normally
    await query(`DELETE FROM clinic_holidays WHERE id = $1`, [holidayId]);
  });

  // Test 5: Server-side authoritative fee resolution snapshotting into appointment
  test('5. Server-side authoritative fee resolution is snapshotted into appointment', async () => {
    // Configure doctor fee at Branch A = 750.00
    await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${dentistAId}/fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        consultation_fee: 750.0,
      },
    });

    // Book appointment without client consultation_fee (or with spoofed fee)
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
        appointment_date: tuesdayDate,
        start_time: '09:00',
        end_time: '09:30',
        appointment_type: 'consultation',
        chief_complaint: 'Routine consultation checkup',
        consultation_fee: 10.0, // Attempted client-side spoof should be overridden
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(parseFloat(res.body.appointment.consultation_fee), 750.0, 'Server-side fee matrix must take precedence');
  });

  // Test 6: Creating appointment issues sequential appointment_number and secure unguessable booking_reference
  test('6. Creating appointment issues sequential appointment_number and secure unguessable booking_reference', async () => {
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
        appointment_date: mondayDate,
        start_time: '09:00',
        end_time: '09:30',
        appointment_type: 'consultation',
        booking_source: 'online_website',
        booking_metadata: { user_agent: 'AntigravityTestRunner/1.0', referral: 'google' },
        chief_complaint: 'Tooth cleaning & polish',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    const appt = res.body.appointment;

    // Save for later tests
    appointmentOneId = appt.id;
    appointmentOneBookingRef = appt.booking_reference;

    // Check appointment number pattern (APT-10001+)
    assert.match(appt.appointment_number, /^APT-\d+$/, 'Sequential appointment number must start with APT-');

    // Check secure unguessable booking reference pattern (BK-XXXX-XXXX-XXXX)
    assert.match(appt.booking_reference, /^BK-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'Booking reference format must match BK-XXXX-XXXX-XXXX');
    assert.ok(appt.booking_reference.length >= 16, 'Booking reference must have sufficient entropy');

    // Check booking source and metadata
    assert.equal(appt.booking_source, 'online_website');
    assert.equal(appt.booking_metadata.referral, 'google');
  });

  // Test 7: Existing patient phone match reuses existing patient record across branches without duplicate creation
  test('7. Patient booking at a different branch matches existing phone and reuses clinic patient record', async () => {
    // Existing patient John Doe has phone '9876543210' and patientId
    // Book at Branch B passing `new_patient` payload with matching phone
    const res = await request({
      method: 'POST',
      path: '/api/appointments',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchBId,
      },
      body: {
        doctor_id: dentistBId,
        new_patient: {
          first_name: 'John',
          last_name: 'Doe',
          phone: existingPhone,
          email: 'john.doe.updated@example.com',
        },
        appointment_date: wednesdayDate,
        start_time: '10:00',
        end_time: '10:30',
        appointment_type: 'consultation',
        chief_complaint: 'Consultation at Uptown Branch Beta',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    const createdAppt = res.body.appointment;

    // Verify appointment was linked to existing patient record
    assert.equal(createdAppt.patient_id, patientId, 'Existing patient ID must be reused across branches');

    // Verify no duplicate patient was created in DB for this phone number
    const countRes = await query(
      `SELECT COUNT(*) FROM patients WHERE clinic_id = $1 AND phone = $2`,
      [clinicId, existingPhone]
    );
    assert.equal(parseInt(countRes.rows[0].count, 10), 1, 'Only 1 patient record should exist for this phone number');
  });

  // Test 8: Concurrent booking of the same slot is rejected (HTTP 409 Conflict)
  test('8. Concurrent booking of the same slot is rejected with 409 Conflict', async () => {
    // From Test 6, Dr. Sarah at Branch A is booked on mondayDate at 09:00 - 09:30
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
        appointment_date: mondayDate,
        start_time: '09:00',
        end_time: '09:30',
        appointment_type: 'consultation',
        chief_complaint: 'Attempting to double book 09:00 slot',
      },
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Doctor (is already booked|already has an appointment|has a conflicting appointment)/i);
  });

  // Test 9: Cross-branch concurrent booking for the same doctor at the same date/time blocked
  test('9. Cross-branch concurrent booking for the same doctor at the same time is blocked at app and DB levels', async () => {
    // Dr. Emily Stone is assigned to BOTH Branch A and Branch B
    // 1. Book Dr. Emily at Branch A on thursdayDate at 11:00
    const apptBranchARes = await request({
      method: 'POST',
      path: '/api/appointments',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        doctor_id: dentistDualId,
        patient_id: patientId,
        appointment_date: thursdayDate,
        start_time: '11:00',
        end_time: '11:30',
        appointment_type: 'consultation',
        chief_complaint: 'Branch A booking for Dr. Emily',
      },
    });

    assert.equal(apptBranchARes.status, 201);
    assert.equal(apptBranchARes.body.success, true);

    // 2. Attempt to book Dr. Emily at Branch B at the EXACT SAME time (11:00 on thursdayDate)
    const apptBranchBRes = await request({
      method: 'POST',
      path: '/api/appointments',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchBId,
      },
      body: {
        doctor_id: dentistDualId,
        patient_id: patientId,
        appointment_date: thursdayDate,
        start_time: '11:00',
        end_time: '11:30',
        appointment_type: 'consultation',
        chief_complaint: 'Concurrent Branch B booking for Dr. Emily',
      },
    });

    assert.equal(apptBranchBRes.status, 409);
    assert.equal(apptBranchBRes.body.success, false);
    assert.match(apptBranchBRes.body.message, /Doctor has a conflicting appointment at another branch|Doctor already has an appointment/i);

    // 3. Test physical database constraint: Attempt direct SQL insert across branches
    await assert.rejects(
      async () => {
        await query(
          `INSERT INTO appointments (
             clinic_id, branch_id, doctor_id, patient_id, appointment_number,
             appointment_date, start_time, end_time, status, booking_reference
           )
           VALUES ($1, $2, $3, $4, 'APT-DIRECT-CONFLICT', $5, '11:00', '11:30', 'scheduled', 'BK-DIRECT-CONFLICT-TEST')`,
          [clinicId, branchBId, dentistDualId, patientId, thursdayDate]
        );
      },
      (err) => {
        assert.ok(
          err.message.includes('uq_doctor_clinic_active_slot'),
          `Error should reference clinic-wide index uq_doctor_clinic_active_slot. Got: ${err.message}`
        );
        return true;
      }
    );
  });

  // Test 10: Confirmation re-checks slot availability and rejects if doctor has taken leave (HTTP 409)
  test('10. Confirmation re-checks slot availability and rejects if doctor has taken leave (HTTP 409)', async () => {
    // 1. Create scheduled appointment for Dr. Sarah on fridayDate at 14:00
    const createRes = await request({
      method: 'POST',
      path: '/api/appointments',
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        doctor_id: dentistAId,
        patient_id: patientId,
        appointment_date: fridayDate,
        start_time: '14:00',
        end_time: '14:30',
        appointment_type: 'consultation',
        chief_complaint: 'Friday afternoon consultation',
      },
    });

    assert.equal(createRes.status, 201);
    const apptId = createRes.body.appointment.id;
    assert.equal(createRes.body.appointment.status, 'scheduled');

    // 2. Doctor logs a leave/exception covering 14:00 on fridayDate
    const exRes = await query(
      `INSERT INTO doctor_schedule_exceptions (
         clinic_id, branch_id, doctor_id, exception_date, exception_type,
         reason, start_time, end_time
       ) VALUES ($1, $2, $3, $4, 'leave', 'Emergency Medical Leave', '13:30', '15:00')
       RETURNING id`,
      [clinicId, branchAId, dentistAId, fridayDate]
    );
    const exceptionId = exRes.rows[0].id;

    // 3. Attempt to confirm appointment -> should be rejected with 409 Conflict
    const confirmRes = await request({
      method: 'PATCH',
      path: `/api/appointments/${apptId}/status`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        status: 'confirmed',
        notes: 'Attempting confirmation while doctor is on leave',
      },
    });

    assert.equal(confirmRes.status, 409);
    assert.equal(confirmRes.body.success, false);
    assert.match(confirmRes.body.message, /Cannot confirm appointment: (Target slot is blocked|The doctor slot is no longer available)/i);

    // 4. Remove the exception
    await query(`DELETE FROM doctor_schedule_exceptions WHERE id = $1`, [exceptionId]);

    // 5. Retry confirmation -> now succeeds with 200 OK
    const retryConfirmRes = await request({
      method: 'PATCH',
      path: `/api/appointments/${apptId}/status`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        status: 'confirmed',
        notes: 'Confirmed after doctor leave was cleared',
      },
    });

    assert.equal(retryConfirmRes.status, 200);
    assert.equal(retryConfirmRes.body.appointment.status, 'confirmed');
  });

  // Test 11: Rescheduling validates doctor branch eligibility and target slot availability
  test('11. Rescheduling validates doctor branch eligibility and target slot availability', async () => {
    // 1. Create appointment for Dr. Sarah on fridayDate at 15:00
    const createRes = await request({
      method: 'POST',
      path: '/api/appointments',
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        doctor_id: dentistAId,
        patient_id: patientId,
        appointment_date: fridayDate,
        start_time: '15:00',
        end_time: '15:30',
        appointment_type: 'consultation',
        chief_complaint: 'Testing rescheduling validation',
      },
    });

    assert.equal(createRes.status, 201);
    const apptId = createRes.body.appointment.id;

    // 2. Attempt to reschedule to Dr. Robert (not assigned to Branch A) -> 400 Bad Request
    const resUnassigned = await request({
      method: 'PATCH',
      path: `/api/appointments/${apptId}/reschedule`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        doctor_id: dentistBId,
        appointment_date: fridayDate,
        start_time: '15:00',
        end_time: '15:30',
        reason: 'Attempting reschedule to unassigned doctor',
      },
    });

    assert.equal(resUnassigned.status, 400);
    assert.equal(resUnassigned.body.success, false);
    assert.match(resUnassigned.body.message, /Doctor is not assigned/i);

    // 3. Attempt to reschedule to slot already taken (14:00 is booked in Test 10) -> 409 Conflict
    const resConflict = await request({
      method: 'PATCH',
      path: `/api/appointments/${apptId}/reschedule`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        appointment_date: fridayDate,
        start_time: '14:00',
        end_time: '14:30',
        reason: 'Attempting reschedule to conflicting slot',
      },
    });

    assert.equal(resConflict.status, 409);
    assert.equal(resConflict.body.success, false);
    assert.match(resConflict.body.message, /Target slot conflicts|already booked|conflicting/i);

    // 4. Reschedule to an open slot (15:30 - 16:00) -> 200 OK
    const resSuccess = await request({
      method: 'PATCH',
      path: `/api/appointments/${apptId}/reschedule`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        appointment_date: fridayDate,
        start_time: '15:30',
        end_time: '16:00',
        reason: 'Patient requested later time',
      },
    });

    assert.equal(resSuccess.status, 200);
    assert.equal(resSuccess.body.success, true);
    assert.equal(resSuccess.body.appointment.start_time.slice(0, 5), '15:30');
  });

  // Test 12: Booking confirmation retrieved by booking_reference
  test('12. Booking confirmation can be securely retrieved using booking_reference', async () => {
    assert.ok(appointmentOneBookingRef, 'Should have captured appointment booking reference');

    const res = await request({
      method: 'GET',
      path: `/api/appointments/reference/${appointmentOneBookingRef}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const conf = res.body.confirmation;

    assert.equal(conf.booking_reference, appointmentOneBookingRef);
    assert.match(conf.appointment_number, /^APT-\d+$/);
    assert.equal(conf.appointment_date.slice(0, 10), mondayDate);
    assert.equal(conf.start_time.slice(0, 5), '09:00');
    assert.equal(conf.booking_source, 'online_website');

    // Verify sanitized branch details
    assert.equal(conf.branch_name, 'Downtown Branch Alpha');
    assert.equal(conf.branch_phone, '+1-555-0101');

    // Verify doctor details
    assert.equal(conf.doctor_first_name, 'Dr. Sarah');
    assert.equal(conf.doctor_last_name, 'Jenkins');
    assert.equal(conf.doctor_specialization, 'Orthodontics');

    // Verify patient public details
    assert.equal(conf.patient_first_name, 'John');
    assert.equal(conf.patient_last_name, 'Doe');

    // Sensitive internal fields must NOT be present
    assert.equal(conf.medical_history, undefined);
    assert.equal(conf.doctor_salary, undefined);
  });

  // Test 13: Non-existent or invalid booking_reference returns HTTP 404
  test('13. Non-existent or invalid booking_reference returns HTTP 404 Not Found', async () => {
    const res = await request({
      method: 'GET',
      path: '/api/appointments/reference/BK-NONEXISTENT-9999-XXXX',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Booking confirmation not found/i);
  });

  // Test 14: Tenant isolation: Tenant 2 cannot view Tenant 1 booking confirmation
  test('14. Cross-tenant isolation: Tenant 2 cannot view Tenant 1 booking confirmation', async () => {
    // Attempt to access Clinic 1's booking reference using Clinic 2's token & branch
    const res = await request({
      method: 'GET',
      path: `/api/appointments/reference/${appointmentOneBookingRef}`,
      headers: {
        Authorization: `Bearer ${clinic2AdminToken}`,
        'x-branch-id': branchCId,
      },
    });

    // Tenant 2 has a different clinic_id, so the record does not exist in their tenant scope
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Booking confirmation not found/i);
  });

  // Test 15: Existing reception desk metrics and walk-in encounters continue working without regression
  test('15. Reception desk metrics and walk-in encounters continue working seamlessly', async () => {
    // 1. Create a walk-in appointment at Branch A
    const walkInRes = await request({
      method: 'POST',
      path: '/api/appointments/walk-in',
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        doctor_id: dentistAId,
        patient_id: patientId,
        appointment_type: 'walk_in',
        chief_complaint: 'Sudden toothache walk-in patient',
        consultation_fee: 750.0,
      },
    });

    assert.equal(walkInRes.status, 201);
    assert.equal(walkInRes.body.success, true);
    const walkInAppt = walkInRes.body.appointment;
    assert.equal(walkInAppt.booking_source, 'walk_in');
    assert.match(walkInAppt.booking_reference, /^BK-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.equal(walkInAppt.status, 'checked_in');

    // Verify queue token was issued
    assert.ok(walkInRes.body.visit);
    assert.ok(walkInRes.body.visit.token_display);

    // 2. Query reception desk metrics
    const metricsRes = await request({
      method: 'GET',
      path: '/api/appointments/reception/metrics',
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(metricsRes.status, 200);
    assert.equal(metricsRes.body.success, true);
    const metrics = metricsRes.body.metrics;
    assert.ok(parseInt(metrics.total_active_today, 10) >= 1);
    assert.ok(parseInt(metrics.walk_in_count, 10) >= 1);
    assert.ok(parseInt(metrics.checked_in_count, 10) >= 1);
  });
});
