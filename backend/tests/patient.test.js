const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const app = require('../app');
const { pool, initializeDatabase, query } = require('../config/database');

let server;
let baseUrl;

let clinicAdminToken;
let dentistToken;
let receptionistToken;
let otherClinicAdminToken;

let testClinicId;
let testBranchId;
let testBranchBId;
let otherClinicId;
let otherBranchId;

let registeredPatientId;
let registeredPatientNumber;
let branchAVisitId;
let branchAVisitToken;

// HTTP request helper
const request = ({ method, path, headers = {}, body = null }) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqHeaders = { ...headers };
    let payload = null;

    if (body) {
      payload = JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      url,
      {
        method,
        headers: reqHeaders,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          let parsed = null;
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
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
};

describe('Phase 2.1 Patient Management & Visit Token Test Suite', () => {
  before(async () => {
    await initializeDatabase();

    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // 1. Log in default Clinic Admin (HQ-001)
    const adminLogin = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'admin@dentalerp.com', password: 'Admin@123' },
    });
    assert.equal(adminLogin.status, 200);
    clinicAdminToken = adminLogin.body.token;
    testClinicId = adminLogin.body.user.clinicId;

    // 2. Log in Dentist
    const dentistLogin = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'dentist@dentalerp.com', password: 'Dentist@123' },
    });
    assert.equal(dentistLogin.status, 200);
    dentistToken = dentistLogin.body.token;

    // 3. Log in Receptionist
    const recLogin = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'reception@dentalerp.com', password: 'Reception@123' },
    });
    assert.equal(recLogin.status, 200);
    receptionistToken = recLogin.body.token;

    // 4. Create dedicated test branches for this test suite (Branch A & Branch B)
    const branchARes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default, timezone)
       VALUES ($1, $2, 'Test Suite Branch A', true, true, 'Asia/Kolkata')
       RETURNING id`,
      [testClinicId, `BR-A-${Date.now().toString().slice(-4)}`]
    );
    testBranchId = branchARes.rows[0].id;

    const branchBRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default, timezone)
       VALUES ($1, $2, 'Downtown Branch B', true, false, 'Asia/Kolkata')
       RETURNING id`,
      [testClinicId, `BR-B-${Date.now().toString().slice(-4)}`]
    );
    testBranchBId = branchBRes.rows[0].id;

    // Assign admin, dentist, and receptionist to test branches
    const adminUserRes = await query(`SELECT id FROM users WHERE email = 'admin@dentalerp.com'`);
    const dentistUserRes = await query(`SELECT id FROM users WHERE email = 'dentist@dentalerp.com'`);
    const recUserRes = await query(`SELECT id FROM users WHERE email = 'reception@dentalerp.com'`);
    if (adminUserRes.rows.length > 0 && dentistUserRes.rows.length > 0 && recUserRes.rows.length > 0) {
      await query(
        `INSERT INTO user_branches (user_id, branch_id)
         VALUES ($1, $2), ($1, $3), ($4, $2), ($4, $3), ($5, $2), ($5, $3)
         ON CONFLICT DO NOTHING`,
        [
          dentistUserRes.rows[0].id,
          testBranchId,
          testBranchBId,
          recUserRes.rows[0].id,
          adminUserRes.rows[0].id,
        ]
      );
    }

    // 6. Create a secondary tenant clinic and admin to test multi-tenant patient isolation
    const otherCode = `ISOL-${Date.now().toString().slice(-5)}`;
    const otherClinicRes = await query(
      `INSERT INTO clinics (code, name, is_active, subscription_status, timezone)
       VALUES ($1, 'Isolated Clinic Test', true, 'active', 'Asia/Kolkata')
       RETURNING id`,
      [otherCode]
    );
    otherClinicId = otherClinicRes.rows[0].id;

    const otherBranchRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default, timezone)
       VALUES ($1, 'SEC-01', 'Secondary Branch', true, true, 'Asia/Kolkata')
       RETURNING id`,
      [otherClinicId]
    );
    otherBranchId = otherBranchRes.rows[0].id;

    const roleRes = await query(`SELECT id FROM roles WHERE name = 'admin'`);
    const otherUserEmail = `other_admin_${Date.now()}@test.com`;
    const otherUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, '$2a$10$4qr5YbsawcrYf5KMF6P4TOxtABOLPdrEIzJBCO41LrKQvgr.BeI7e', 'Other', 'Admin', true)
       RETURNING id`,
      [otherClinicId, roleRes.rows[0].id, otherUserEmail]
    );

    // Assign other admin to other branch
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default)
       VALUES ($1, $2, true)
       ON CONFLICT DO NOTHING`,
      [otherUserRes.rows[0].id, otherBranchId]
    );

    const otherLogin = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: otherUserEmail, password: 'Admin@123' },
    });
    assert.equal(otherLogin.status, 200);
    otherClinicAdminToken = otherLogin.body.token;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
  });

  test('1. Patient Registration: Validates required inputs (missing name or phone returns 400)', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/patients',
      headers: { Authorization: `Bearer ${clinicAdminToken}` },
      body: {
        lastName: 'Doe',
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.errors.some((e) => e.includes('first name is required')));
    assert.ok(res.body.errors.some((e) => e.includes('phone number is required')));
  });

  test('2. Patient Registration: Generates pure numeric permanent Patient ID (digits only, >= 100001, no prefix)', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/patients',
      headers: { Authorization: `Bearer ${clinicAdminToken}` },
      body: {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-05-15',
        gender: 'male',
        phone: '+91 98888 11111',
        email: 'john.doe@example.com',
        address: '123 Park Avenue',
        city: 'Metro City',
        state: 'Central',
        postalCode: '400001',
        emergencyContactName: 'Jane Doe',
        emergencyContactPhone: '+91 98888 22222',
        emergencyContactRelation: 'Spouse',
        branchId: testBranchId,
        // Medical fields
        allergies: 'Penicillin, Sulfa drugs',
        medicalConditions: 'Mild Hypertension',
        currentMedications: 'Amlodipine 5mg',
        medicalHistory: 'Wisdom tooth extraction in 2021',
        dentalTreatmentNotes: 'Sensitive lower right molar; premedication recommended',
        hasMedicalAlerts: true,
        medicalAlertDetails: 'Severe Penicillin Allergy',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.patient.id);
    assert.ok(res.body.patient.patient_number);

    // Enforce digits only, no 'PAT-' prefix, numeric sequence >= 100001
    assert.match(res.body.patient.patient_number, /^[0-9]+$/);
    assert.ok(!res.body.patient.patient_number.includes('PAT'));
    assert.ok(parseInt(res.body.patient.patient_number, 10) >= 100001);

    assert.equal(res.body.patient.has_medical_alerts, true);
    assert.equal(res.body.patient.medical_alert_details, 'Severe Penicillin Allergy');

    registeredPatientId = res.body.patient.id;
    registeredPatientNumber = res.body.patient.patient_number;
  });

  test('3. Organization-Wide Sequence: Branch A and Branch B share single uninterrupted sequence', async () => {
    // Register at Branch A
    const resA1 = await request({
      method: 'POST',
      path: '/api/patients',
      headers: { Authorization: `Bearer ${clinicAdminToken}` },
      body: {
        firstName: 'Alice',
        lastName: 'BranchA',
        phone: `+91 91111 ${Date.now().toString().slice(-5)}`,
        branchId: testBranchId,
      },
    });
    assert.equal(resA1.status, 201);
    const idA1 = parseInt(resA1.body.patient.patient_number, 10);

    // Register at Branch B
    const resB = await request({
      method: 'POST',
      path: '/api/patients',
      headers: { Authorization: `Bearer ${clinicAdminToken}` },
      body: {
        firstName: 'Bob',
        lastName: 'BranchB',
        phone: `+91 92222 ${Date.now().toString().slice(-5)}`,
        branchId: testBranchBId,
      },
    });
    assert.equal(resB.status, 201);
    const idB = parseInt(resB.body.patient.patient_number, 10);

    // Register at Branch A again
    const resA2 = await request({
      method: 'POST',
      path: '/api/patients',
      headers: { Authorization: `Bearer ${clinicAdminToken}` },
      body: {
        firstName: 'Charlie',
        lastName: 'BranchA2',
        phone: `+91 93333 ${Date.now().toString().slice(-5)}`,
        branchId: testBranchId,
      },
    });
    assert.equal(resA2.status, 201);
    const idA2 = parseInt(resA2.body.patient.patient_number, 10);

    // Verify unbroken single sequence across branches
    assert.equal(idB, idA1 + 1, 'Branch B registration should increment organization sequence by 1');
    assert.equal(idA2, idB + 1, 'Next Branch A registration should increment organization sequence by 1');
  });

  test('4. Concurrency Safety: Multiple concurrent registrations produce unique sequential numeric IDs', async () => {
    const concurrentCount = 5;
    const promises = [];

    for (let i = 0; i < concurrentCount; i++) {
      promises.push(
        request({
          method: 'POST',
          path: '/api/patients',
          headers: { Authorization: `Bearer ${clinicAdminToken}` },
          body: {
            firstName: `ConcurrentPatient${i}`,
            lastName: 'Test',
            phone: `+91 97777 ${10000 + i}`,
            branchId: testBranchId,
          },
        })
      );
    }

    const responses = await Promise.all(promises);
    const patientNumbers = new Set();

    for (const r of responses) {
      assert.equal(r.status, 201);
      assert.ok(r.body.patient.patient_number);
      assert.match(r.body.patient.patient_number, /^[0-9]+$/);
      assert.ok(!patientNumbers.has(r.body.patient.patient_number), 'Duplicate patient number detected!');
      patientNumbers.add(r.body.patient.patient_number);
    }

    assert.equal(patientNumbers.size, concurrentCount);
  });

  test('5. Independent Organization Sequence: A brand new clinic organization starts at 100001', async () => {
    // Create a new clinic organization with no prior patients or counters
    const brandNewClinicCode = `NEWORG-${Date.now().toString().slice(-4)}`;
    const brandNewClinicRes = await query(
      `INSERT INTO clinics (code, name, is_active, subscription_status)
       VALUES ($1, 'Brand New Dental Org', true, 'active')
       RETURNING id`,
      [brandNewClinicCode]
    );
    const newClinicId = brandNewClinicRes.rows[0].id;

    const newBranchRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'NB-01', 'New Clinic Main Branch', true, true)
       RETURNING id`,
      [newClinicId]
    );
    const newBranchId = newBranchRes.rows[0].id;

    const roleRes = await query(`SELECT id FROM roles WHERE name = 'admin'`);
    const newAdminEmail = `new_admin_${Date.now()}@newdental.com`;
    const newUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, '$2a$10$4qr5YbsawcrYf5KMF6P4TOxtABOLPdrEIzJBCO41LrKQvgr.BeI7e', 'New', 'Admin', true)
       RETURNING id`,
      [newClinicId, roleRes.rows[0].id, newAdminEmail]
    );

    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default)
       VALUES ($1, $2, true)`,
      [newUserRes.rows[0].id, newBranchId]
    );

    const loginRes = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: newAdminEmail, password: 'Admin@123' },
    });
    assert.equal(loginRes.status, 200);

    const regRes = await request({
      method: 'POST',
      path: '/api/patients',
      headers: { Authorization: `Bearer ${loginRes.body.token}` },
      body: {
        firstName: 'Genesis',
        lastName: 'Patient',
        phone: '+91 99999 88888',
        branchId: newBranchId,
      },
    });

    assert.equal(regRes.status, 201);
    assert.equal(
      regRes.body.patient.patient_number,
      '100001',
      'First patient in new clinic organization must start at 100001'
    );
  });

  test('6. Permanent Patient ID Persistence & Lookup: ID is read-only, persistent, and searchable by numeric ID', async () => {
    // 1. Demographics update does not change patient_number
    const updateRes = await request({
      method: 'PUT',
      path: `/api/patients/${registeredPatientId}`,
      headers: { Authorization: `Bearer ${receptionistToken}` },
      body: {
        address: '789 Updated Avenue',
        patient_number: '999999', // attempt to tamper with patient_number should be ignored
      },
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.patient.patient_number, registeredPatientNumber);

    // 2. Lookup by numeric Patient ID in path
    const numLookupRes = await request({
      method: 'GET',
      path: `/api/patients/${registeredPatientNumber}`,
      headers: { Authorization: `Bearer ${clinicAdminToken}` },
    });
    assert.equal(numLookupRes.status, 200);
    assert.equal(numLookupRes.body.patient.id, registeredPatientId);
    assert.equal(numLookupRes.body.patient.patient_number, registeredPatientNumber);

    // 3. Lookup by UUID in path
    const uuidLookupRes = await request({
      method: 'GET',
      path: `/api/patients/${registeredPatientId}`,
      headers: { Authorization: `Bearer ${clinicAdminToken}` },
    });
    assert.equal(uuidLookupRes.status, 200);
    assert.equal(uuidLookupRes.body.patient.id, registeredPatientId);
    assert.equal(uuidLookupRes.body.patient.patient_number, registeredPatientNumber);
  });

  test('7. Duplicate Patient Warning: Detects potential existing patient by phone number', async () => {
    const res = await request({
      method: 'GET',
      path: '/api/patients/check-duplicate?phone=%2B91%2098888%2011111',
      headers: { Authorization: `Bearer ${receptionistToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.hasDuplicate, true);
    assert.ok(res.body.duplicates.length > 0);
    assert.equal(res.body.duplicates[0].phone, '+91 98888 11111');
  });

  test('8. Patient Listing: Supports search by numeric Patient ID, pagination, and branch filtering', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/patients?search=${registeredPatientNumber}&branchId=${testBranchId}&page=1&limit=5`,
      headers: { Authorization: `Bearer ${clinicAdminToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.patients));
    assert.ok(res.body.pagination);
    assert.ok(res.body.patients.some((p) => p.patient_number === registeredPatientNumber));
  });

  test('9. RBAC Profile & Medical Information: Clinical roles access full medical record', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/patients/${registeredPatientId}`,
      headers: { Authorization: `Bearer ${dentistToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.patient.id, registeredPatientId);
    assert.ok(res.body.medicalRecord);
    assert.equal(res.body.medicalRecord.allergies, 'Penicillin, Sulfa drugs');
    assert.equal(res.body.medicalRecord.has_medical_alerts, true);
    assert.equal(res.body.medicalRecord.dental_treatment_notes, 'Sensitive lower right molar; premedication recommended');
  });

  test('10. RBAC Medical Information Redaction: Receptionist sees alert status but sensitive notes are redacted', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/patients/${registeredPatientId}`,
      headers: { Authorization: `Bearer ${receptionistToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.patient.id, registeredPatientId);
    assert.ok(res.body.medicalRecord);
    assert.equal(res.body.medicalRecord.has_medical_alerts, true);
    assert.equal(res.body.medicalRecord.medical_alert_details, 'Severe Penicillin Allergy');
    assert.equal(res.body.medicalRecord.dental_treatment_notes, null);
    assert.equal(res.body.medicalRecord.medical_conditions, null);
  });

  test('11. Demographic Profile Updates: Authorized staff can update demographics', async () => {
    const res = await request({
      method: 'PUT',
      path: `/api/patients/${registeredPatientId}`,
      headers: { Authorization: `Bearer ${receptionistToken}` },
      body: {
        address: '456 Healthcare Blvd, Suite 2B',
        city: 'Apex City',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.patient.address, '456 Healthcare Blvd, Suite 2B');
    assert.equal(res.body.patient.city, 'Apex City');
  });

  test('12. Medical Record Updates: Only clinical practitioners can update medical profiles', async () => {
    // Receptionist attempt should be rejected (403)
    const recAttempt = await request({
      method: 'PUT',
      path: `/api/patients/${registeredPatientId}/medical`,
      headers: { Authorization: `Bearer ${receptionistToken}` },
      body: {
        allergies: 'New allergy detected',
      },
    });
    assert.equal(recAttempt.status, 403);

    // Dentist update succeeds (200)
    const dentistRes = await request({
      method: 'PUT',
      path: `/api/patients/${registeredPatientId}/medical`,
      headers: { Authorization: `Bearer ${dentistToken}` },
      body: {
        allergies: 'Penicillin, Sulfa drugs, Latex',
        hasMedicalAlerts: true,
        medicalAlertDetails: 'Severe Penicillin and Latex Allergy',
      },
    });
    assert.equal(dentistRes.status, 200);
    assert.equal(dentistRes.body.success, true);
    assert.equal(dentistRes.body.medicalRecord.allergies, 'Penicillin, Sulfa drugs, Latex');
  });

  test('13. Patient Status Changes: Administrator can deactivate or archive record with audit trail', async () => {
    const res = await request({
      method: 'PATCH',
      path: `/api/patients/${registeredPatientId}/status`,
      headers: { Authorization: `Bearer ${clinicAdminToken}` },
      body: {
        status: 'inactive',
        reason: 'Patient relocated out of state',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.patient.status, 'inactive');

    const auditRes = await query(
      `SELECT * FROM audit_logs WHERE action = 'PATIENT_STATUS_CHANGED' AND entity_id = $1`,
      [registeredPatientId]
    );
    assert.ok(auditRes.rows.length > 0);
    assert.equal(auditRes.rows[0].details.newStatus, 'inactive');

    // Reactivate for visit tests
    await query(`UPDATE patients SET status = 'active' WHERE id = $1`, [registeredPatientId]);
  });

  test('14. Daily Visit Token: First visit of a branch on a date receives 001, second increments to 002', async () => {
    // 1. Create first visit at Branch A
    const res1 = await request({
      method: 'POST',
      path: `/api/patients/${registeredPatientId}/visits`,
      headers: { Authorization: `Bearer ${clinicAdminToken}` },
      body: {
        branchId: testBranchId,
        purpose: 'Routine dental consultation and prophylaxis',
      },
    });

    assert.equal(res1.status, 201);
    assert.equal(res1.body.success, true);
    assert.ok(res1.body.visit);
    assert.equal(res1.body.visit.token_display, '001');
    assert.equal(res1.body.visit.token_number, 1);
    assert.equal(res1.body.visit.branch_id, testBranchId);
    assert.equal(res1.body.visit.status, 'queued');

    branchAVisitId = res1.body.visit.id;
    branchAVisitToken = res1.body.visit.token_display;

    // 2. Create second visit at Branch A for another patient
    const res2 = await request({
      method: 'POST',
      path: `/api/patients/${registeredPatientId}/visits`,
      headers: { Authorization: `Bearer ${clinicAdminToken}` },
      body: {
        branchId: testBranchId,
        purpose: 'Follow-up same day visit',
      },
    });

    assert.equal(res2.status, 201);
    assert.equal(res2.body.visit.token_display, '002', 'Subsequent visit at Branch A should receive token 002');
    assert.equal(res2.body.visit.token_number, 2);
  });

  test('15. Daily Visit Token Branch Independence: Branch B starts its daily sequence at 001 independently on the same date', async () => {
    // Create visit at Branch B on the same date
    const res = await request({
      method: 'POST',
      path: `/api/patients/${registeredPatientId}/visits`,
      headers: { Authorization: `Bearer ${clinicAdminToken}` },
      body: {
        branchId: testBranchBId,
        purpose: 'Visit at Branch B location',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(
      res.body.visit.token_display,
      '001',
      'Branch B must start its own daily sequence at 001 independently of Branch A'
    );
    assert.equal(res.body.visit.token_number, 1);
    assert.equal(res.body.visit.branch_id, testBranchBId);
  });

  test('16. Cancelled Tokens Never Reused: Cancelling a visit retains its token and next visit increments', async () => {
    // 1. Fetch today's visit count at Branch A
    const queueBefore = await request({
      method: 'GET',
      path: `/api/branches/${testBranchId}/visits/today`,
      headers: { Authorization: `Bearer ${clinicAdminToken}` },
    });
    assert.equal(queueBefore.status, 200);
    const lastTokenNum = parseInt(queueBefore.body.visits[queueBefore.body.visits.length - 1].token_number, 10);

    // 2. Cancel the latest visit
    const lastVisitId = queueBefore.body.visits[queueBefore.body.visits.length - 1].id;
    const cancelRes = await request({
      method: 'PATCH',
      path: `/api/visits/${lastVisitId}/status`,
      headers: { Authorization: `Bearer ${clinicAdminToken}` },
      body: {
        status: 'cancelled',
        notes: 'Patient called to cancel visit',
      },
    });
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.body.visit.status, 'cancelled');

    // 3. Create a new visit at Branch A
    const newVisitRes = await request({
      method: 'POST',
      path: `/api/patients/${registeredPatientId}/visits`,
      headers: { Authorization: `Bearer ${clinicAdminToken}` },
      body: {
        branchId: testBranchId,
        purpose: 'New booking after cancellation',
      },
    });

    assert.equal(newVisitRes.status, 201);
    const newTokenNum = parseInt(newVisitRes.body.visit.token_number, 10);
    assert.equal(
      newTokenNum,
      lastTokenNum + 1,
      'Cancelled visit tokens must never be reused; new visit must increment the counter'
    );
    assert.equal(newVisitRes.body.visit.token_display, String(lastTokenNum + 1).padStart(3, '0'));
  });

  test('17. Daily Visit Queue & Status Progression: Branch queue lists tokens and handles status transitions', async () => {
    // 1. Fetch Branch A today queue
    const queueRes = await request({
      method: 'GET',
      path: `/api/branches/${testBranchId}/visits/today`,
      headers: { Authorization: `Bearer ${clinicAdminToken}` },
    });

    assert.equal(queueRes.status, 200);
    assert.equal(queueRes.body.success, true);
    assert.ok(Array.isArray(queueRes.body.visits));
    assert.ok(queueRes.body.visits.length >= 2);

    // 2. Update status of the first visit: queued -> in_progress -> completed
    const progressRes = await request({
      method: 'PATCH',
      path: `/api/visits/${branchAVisitId}/status`,
      headers: { Authorization: `Bearer ${dentistToken}` },
      body: {
        status: 'in_progress',
        notes: 'Patient seated in operatory 1',
      },
    });
    assert.equal(progressRes.status, 200);
    assert.equal(progressRes.body.visit.status, 'in_progress');

    const completeRes = await request({
      method: 'PATCH',
      path: `/api/visits/${branchAVisitId}/status`,
      headers: { Authorization: `Bearer ${dentistToken}` },
      body: {
        status: 'completed',
        notes: 'Consultation completed successfully',
      },
    });
    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.body.visit.status, 'completed');

    // 3. Retrieve single visit by ID
    const singleVisitRes = await request({
      method: 'GET',
      path: `/api/visits/${branchAVisitId}`,
      headers: { Authorization: `Bearer ${receptionistToken}` },
    });
    assert.equal(singleVisitRes.status, 200);
    assert.equal(singleVisitRes.body.visit.id, branchAVisitId);
    assert.equal(singleVisitRes.body.visit.patient_number, registeredPatientNumber);
  });

  test('18. Patient Visit History: Retrieves cross-branch visit history for patient', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/patients/${registeredPatientId}/visits`,
      headers: { Authorization: `Bearer ${receptionistToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.visits));
    assert.ok(res.body.visits.length >= 3);

    // Ensure visits span both Branch A and Branch B
    const branchIds = new Set(res.body.visits.map((v) => v.branch_id));
    assert.ok(branchIds.has(testBranchId), 'Visits should include Branch A');
    assert.ok(branchIds.has(testBranchBId), 'Visits should include Branch B');
  });

  test('19. Multi-Tenant Clinic Isolation: Secondary tenant is blocked from accessing primary clinic patients and visits', async () => {
    // Patient access blocked
    const patientRes = await request({
      method: 'GET',
      path: `/api/patients/${registeredPatientId}`,
      headers: { Authorization: `Bearer ${otherClinicAdminToken}` },
    });
    assert.equal(patientRes.status, 404);

    // Visit access blocked
    const visitRes = await request({
      method: 'GET',
      path: `/api/visits/${branchAVisitId}`,
      headers: { Authorization: `Bearer ${otherClinicAdminToken}` },
    });
    assert.equal(visitRes.status, 404);

    // Creating visit for other tenant patient blocked
    const createRes = await request({
      method: 'POST',
      path: `/api/patients/${registeredPatientId}/visits`,
      headers: { Authorization: `Bearer ${otherClinicAdminToken}` },
      body: {
        branchId: otherBranchId,
        purpose: 'Cross-tenant illegal visit attempt',
      },
    });
    assert.equal(createRes.status, 404);
  });

  test('20. Inactive / Suspended Clinic Restriction: Blocked from patient management operations', async () => {
    // Temporarily suspend secondary clinic
    await query(`UPDATE clinics SET subscription_status = 'suspended' WHERE id = $1`, [otherClinicId]);

    const res = await request({
      method: 'GET',
      path: '/api/patients',
      headers: { Authorization: `Bearer ${otherClinicAdminToken}` },
    });

    assert.equal(res.status, 403);
    assert.ok(res.body.message.includes('suspended'));

    // Revert
    await query(`UPDATE clinics SET subscription_status = 'active' WHERE id = $1`, [otherClinicId]);
  });
});
