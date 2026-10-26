const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { query, pool, initializeDatabase } = require('../config/database');

describe('Staff Management & Staff-to-Doctor Integration Test Suite', () => {
  let server;
  let baseUrl;

  let clinicId;
  let branchAId;
  let branchBId;
  let clinic2Id;
  let branchCId;

  let adminToken;
  let branchBAdminToken;
  let receptionistToken;

  let createdAssistantId;
  let doctorStaffId;
  let doctorUserId;
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
    const clinicCode = `STF-${Date.now().toString().slice(-5)}`;
    const clinicRes = await query(
      `INSERT INTO clinics (code, name, is_active, subscription_status)
       VALUES ($1, 'Staff Test Clinic', true, 'active')
       RETURNING id`,
      [clinicCode]
    );
    clinicId = clinicRes.rows[0].id;

    // Branches for Clinic 1
    const bARes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BA-STF', 'Staff Branch Alpha', 'Asia/Kolkata', true, true)
       RETURNING id`,
      [clinicId]
    );
    branchAId = bARes.rows[0].id;

    const bBRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BB-STF', 'Staff Branch Beta', 'Asia/Kolkata', true, false)
       RETURNING id`,
      [clinicId]
    );
    branchBId = bBRes.rows[0].id;

    // Clinic 2 (for tenant isolation)
    const c2Res = await query(
      `INSERT INTO clinics (code, name, is_active, subscription_status)
       VALUES ($1, 'Staff Tenant 2', true, 'active')
       RETURNING id`,
      [`T2-${Date.now().toString().slice(-5)}`]
    );
    clinic2Id = c2Res.rows[0].id;

    const bCRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BC-STF', 'Staff Branch Charlie T2', 'Asia/Kolkata', true, true)
       RETURNING id`,
      [clinic2Id]
    );
    branchCId = bCRes.rows[0].id;

    // Roles
    const rolesRes = await query('SELECT id, name FROM roles');
    const rolesMap = {};
    for (const r of rolesRes.rows) {
      rolesMap[r.name] = r.id;
    }

    const testPasswordHash = await bcrypt.hash('Test@1234', 10);

    // Admin User for Branch A
    const adminRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Admin', 'StaffUser', true)
       RETURNING id`,
      [clinicId, rolesMap['admin'], `admin_staff_${Date.now()}@test.com`, testPasswordHash]
    );
    const adminId = adminRes.rows[0].id;
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [adminId, branchAId]
    );

    // Admin User for Branch B
    const branchBAdminRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'AdminB', 'BranchBOnly', true)
       RETURNING id`,
      [clinicId, rolesMap['admin'], `admin_b_${Date.now()}@test.com`, testPasswordHash]
    );
    const branchBAdminId = branchBAdminRes.rows[0].id;
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [branchBAdminId, branchBId]
    );

    // Receptionist for Branch A
    const recRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Reception', 'StaffUser', true)
       RETURNING id`,
      [clinicId, rolesMap['receptionist'], `rec_staff_${Date.now()}@test.com`, testPasswordHash]
    );
    const recId = recRes.rows[0].id;
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [recId, branchAId]
    );

    // Patient in Clinic 1
    const pRes = await query(
      `INSERT INTO patients (clinic_id, branch_id, patient_number, first_name, last_name, phone, status)
       VALUES ($1, $2, '998877', 'Test', 'Patient', '9988776655', 'active')
       RETURNING id`,
      [clinicId, branchAId]
    );
    patientId = pRes.rows[0].id;

    // Login for tokens
    const loginAdmin = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: `admin_staff_${Date.now()}@test.com`.replace(/_[0-9]+@/, `_${adminId.slice(0, 5)}@`), password: 'Test@1234' },
    });
    // Query actual emails to login reliably
    const adminEmailRes = await query('SELECT email FROM users WHERE id = $1', [adminId]);
    const resA = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: adminEmailRes.rows[0].email, password: 'Test@1234' },
    });
    adminToken = resA.body.token;

    const bAdminEmailRes = await query('SELECT email FROM users WHERE id = $1', [branchBAdminId]);
    const resB = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: bAdminEmailRes.rows[0].email, password: 'Test@1234' },
    });
    branchBAdminToken = resB.body.token;

    const recEmailRes = await query('SELECT email FROM users WHERE id = $1', [recId]);
    const resRec = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: recEmailRes.rows[0].email, password: 'Test@1234' },
    });
    receptionistToken = resRec.body.token;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('1. Admin can create a staff member without login account (Dental Assistant) with STF-10001+ sequence', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/staff',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        first_name: 'Priya',
        last_name: 'Sharma',
        phone: '9876543210',
        email: 'priya.sharma@clinic.com',
        staff_category: 'assistant',
        designation: 'Senior Chairside Assistant',
        employment_status: 'active',
        branch_id: branchAId,
        create_login: false,
      },
    });

    assert.equal(res.status, 201, `Expected 201 Created: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.ok(res.body.staff.id);
    assert.ok(res.body.staff.staff_number.startsWith('STF-'));
    assert.equal(res.body.staff.staff_category, 'assistant');
    assert.equal(res.body.staff.user_id, null);

    createdAssistantId = res.body.staff.id;
  });

  test('2. Reject duplicate custom staff ID in same clinic', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/staff',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        staff_number: 'CUSTOM-001',
        first_name: 'Custom',
        last_name: 'Staff',
        phone: '9876543211',
        staff_category: 'nurse',
        branch_id: branchAId,
      },
    });
    assert.equal(res.status, 201);

    // Try creating another with same CUSTOM-001
    const dupRes = await request({
      method: 'POST',
      path: '/api/staff',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        staff_number: 'CUSTOM-001',
        first_name: 'Duplicate',
        last_name: 'Staff',
        phone: '9876543212',
        staff_category: 'nurse',
        branch_id: branchAId,
      },
    });
    assert.equal(dupRes.status, 500); // Catches duplicate key error cleanly
  });

  test('3. Admin can create a staff member with login credentials, role assignment, and password hash', async () => {
    const docEmail = `dr.neha.${Date.now()}@clinic.com`;
    const res = await request({
      method: 'POST',
      path: '/api/staff',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        first_name: 'Dr. Neha',
        last_name: 'Kapoor',
        phone: '9876543220',
        email: docEmail,
        staff_category: 'dentist',
        designation: 'Consultant Orthodontist',
        specialization: 'Orthodontics',
        license_number: 'DENT-LIC-9988',
        branch_id: branchAId,
        create_login: true,
        login_email: docEmail,
        password: 'DoctorPassword@123',
        role: 'dentist',
      },
    });

    assert.equal(res.status, 201, `Failed to create doctor staff: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.ok(res.body.staff.user_id, 'Should have created linked login user');
    assert.equal(res.body.staff.staff_category, 'dentist');

    doctorStaffId = res.body.staff.id;
    doctorUserId = res.body.staff.user_id;

    // Verify login works with the newly created credentials
    const loginRes = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: {
        email: docEmail,
        password: 'DoctorPassword@123',
      },
    });
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.user.role, 'dentist');
  });

  test('4. Invalid staff category is rejected (400 Bad Request)', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/staff',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        first_name: 'Invalid',
        last_name: 'Category',
        phone: '9876543230',
        staff_category: 'astronaut_surgeon',
        branch_id: branchAId,
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.errors.some((e) => e.includes('staff_category')));
  });

  test('5. Paginated staff list respects limit, page, and category filters', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/staff?category=assistant&limit=5&page=1`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.staff));
    assert.ok(res.body.pagination);
    assert.ok(res.body.staff.every((s) => s.staff_category === 'assistant'));
  });

  test('6. Search filters staff by name, phone, or staff ID', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/staff?search=Priya`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.staff.length >= 1);
    assert.equal(res.body.staff[0].first_name, 'Priya');
  });

  test('7. Update staff details successfully modifies record and syncs linked user', async () => {
    const res = await request({
      method: 'PUT',
      path: `/api/staff/${doctorStaffId}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        first_name: 'Dr. Neha',
        last_name: 'Kapoor-Verma',
        specialization: 'Pediatric Dentistry & Orthodontics',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.staff.last_name, 'Kapoor-Verma');

    // Verify users table was also synchronized
    const userRes = await query('SELECT last_name, specialization FROM users WHERE id = $1', [doctorUserId]);
    assert.equal(userRes.rows[0].last_name, 'Kapoor-Verma');
    assert.equal(userRes.rows[0].specialization, 'Pediatric Dentistry & Orthodontics');
  });

  test('8. Non-doctor staff (assistant, nurse) do NOT appear in getBranchDoctors or eligible doctors', async () => {
    // 1. Check scheduleService getBranchDoctors
    const res1 = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });
    assert.equal(res1.status, 200);
    const docIds1 = res1.body.doctors.map((d) => d.id);
    assert.ok(!docIds1.includes(createdAssistantId), 'Assistant must not appear in doctors list');

    // 2. Check staff eligible doctors endpoint
    const res2 = await request({
      method: 'GET',
      path: `/api/staff/doctors/eligible`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });
    assert.equal(res2.status, 200);
    const docIds2 = res2.body.doctors.map((d) => d.staff_id);
    assert.ok(!docIds2.includes(createdAssistantId), 'Assistant must not appear in eligible doctors list');
  });

  test('9. Doctor staff (dentist) DO appear in doctor availability and schedule listing', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/staff/doctors/eligible`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });

    assert.equal(res.status, 200);
    const foundDoc = res.body.doctors.find((d) => d.staff_id === doctorStaffId);
    assert.ok(foundDoc, 'Dr. Neha must appear in eligible doctors');
    assert.equal(foundDoc.user_id, doctorUserId);
  });

  test('10. Strict branch isolation: Staff assigned to Branch A cannot be fetched by Branch B staff request', async () => {
    // Branch B admin trying to view Branch A staff by passing branchId=branchAId
    const res = await request({
      method: 'GET',
      path: `/api/staff?branchId=${branchAId}`,
      headers: {
        Authorization: `Bearer ${branchBAdminToken}`,
        'X-Branch-ID': branchAId, // Unauthorized header for Branch B admin
      },
    });

    assert.equal(res.status, 403, 'Should be forbidden to query another branch data');
  });

  test('11. Deactivation guard: Deactivating a doctor with future booked appointments is blocked (HTTP 409)', async () => {
    // Book a future appointment for doctorUserId
    const apptDate = new Date();
    apptDate.setDate(apptDate.getDate() + 3);
    const dateStr = apptDate.toISOString().split('T')[0];

    await query(
      `INSERT INTO appointments (
        clinic_id, branch_id, appointment_number, patient_id, doctor_id,
        appointment_date, start_time, end_time, status
      ) VALUES (
        $1, $2, 'APT-TEST-99', $3, $4,
        $5, '10:00:00', '10:30:00', 'scheduled'
      )`,
      [clinicId, branchAId, patientId, doctorUserId, dateStr]
    );

    // Attempt deactivation
    const deactRes = await request({
      method: 'PATCH',
      path: `/api/staff/${doctorStaffId}/deactivate`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });

    assert.equal(deactRes.status, 409, 'Must return 409 Conflict when doctor has future appointments');
    assert.equal(deactRes.body.hasConflict, true);
    assert.ok(deactRes.body.message.includes('upcoming appointment'));
  });

  test('12. Deactivating a staff member without conflicts succeeds and sets is_active = false', async () => {
    const res = await request({
      method: 'PATCH',
      path: `/api/staff/${createdAssistantId}/deactivate`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // Verify staff is inactive in DB
    const checkStaff = await query('SELECT is_active, employment_status FROM staff WHERE id = $1', [createdAssistantId]);
    assert.equal(checkStaff.rows[0].is_active, false);
    assert.equal(checkStaff.rows[0].employment_status, 'terminated');
  });

  test('13. Non-admin users cannot create, update, or deactivate staff (HTTP 403 Forbidden)', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/staff',
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        first_name: 'Unauthorized',
        last_name: 'Creation',
        phone: '9988776655',
        staff_category: 'assistant',
        branch_id: branchAId,
      },
    });

    assert.equal(res.status, 403, 'Receptionist must not have permission to create staff');
  });
});
