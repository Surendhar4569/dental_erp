const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const app = require('../app');
const { query, pool } = require('../config/database');

describe('Strict Branch-Level Access Isolation Test Suite', () => {
  let server;
  let baseUrl;

  let clinicId;
  let branchAId;
  let branchBId;
  let clinic2Id;
  let branchCId;

  let adminAToken;
  let adminAId;
  let dentistAToken;
  let receptionistAToken;
  let staffBToken;
  let staffBId;
  let superAdminToken;

  let patientAId;
  let patientBId;
  let visitAId;
  let visitBId;

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
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // 1. Fetch super admin token
    const saLogin = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'superadmin@voicegate.com', password: 'SuperAdmin@VoiceGate2026' },
    });
    assert.equal(saLogin.status, 200);
    superAdminToken = saLogin.body.token;

    // 2. Setup Clinic 1
    const clinicCode = `SBA-${Date.now().toString().slice(-5)}`;
    const clinicRes = await query(
      `INSERT INTO clinics (code, name, is_active, subscription_status)
       VALUES ($1, 'Strict Branch Clinic', true, 'active')
       RETURNING id`,
      [clinicCode]
    );
    clinicId = clinicRes.rows[0].id;

    // Branch A & Branch B
    const branchARes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-A', 'Branch Alpha', true, true)
       RETURNING id`,
      [clinicId]
    );
    branchAId = branchARes.rows[0].id;

    const branchBRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-B', 'Branch Beta', true, false)
       RETURNING id`,
      [clinicId]
    );
    branchBId = branchBRes.rows[0].id;

    // Setup Clinic 2 (for tenant isolation)
    const clinic2Res = await query(
      `INSERT INTO clinics (code, name, is_active, subscription_status)
       VALUES ($1, 'Tenant Two Clinic', true, 'active')
       RETURNING id`,
      [`T2-${Date.now().toString().slice(-5)}`]
    );
    clinic2Id = clinic2Res.rows[0].id;

    const branchCRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-C', 'Branch Charlie Tenant 2', true, true)
       RETURNING id`,
      [clinic2Id]
    );
    branchCId = branchCRes.rows[0].id;

    // Roles
    const rolesRes = await query(`SELECT id, name FROM roles`);
    const roleMap = {};
    rolesRes.rows.forEach((r) => {
      roleMap[r.name] = r.id;
    });

    const pwdHash = '$2a$10$4qr5YbsawcrYf5KMF6P4TOxtABOLPdrEIzJBCO41LrKQvgr.BeI7e'; // Admin@123

    // Create Admin A (Assigned only to Branch A)
    const adminAEmail = `admin_a_${Date.now()}@test.com`;
    const adminARes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Admin', 'Alpha', true) RETURNING id`,
      [clinicId, roleMap['admin'], adminAEmail, pwdHash]
    );
    adminAId = adminARes.rows[0].id;
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [adminAId, branchAId]
    );

    // Create Dentist A (Assigned only to Branch A)
    const dentistAEmail = `dentist_a_${Date.now()}@test.com`;
    const dentistARes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Dentist', 'Alpha', true) RETURNING id`,
      [clinicId, roleMap['dentist'], dentistAEmail, pwdHash]
    );
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [dentistARes.rows[0].id, branchAId]
    );

    // Create Receptionist A (Assigned only to Branch A)
    const recAEmail = `rec_a_${Date.now()}@test.com`;
    const recARes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Reception', 'Alpha', true) RETURNING id`,
      [clinicId, roleMap['receptionist'], recAEmail, pwdHash]
    );
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [recARes.rows[0].id, branchAId]
    );

    // Create Staff B (Assigned only to Branch B)
    const staffBEmail = `staff_b_${Date.now()}@test.com`;
    const staffBRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Staff', 'Beta', true) RETURNING id`,
      [clinicId, roleMap['receptionist'], staffBEmail, pwdHash]
    );
    staffBId = staffBRes.rows[0].id;
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [staffBId, branchBId]
    );

    // Log in all users
    const lAdminA = await request({ method: 'POST', path: '/api/auth/login', body: { email: adminAEmail, password: 'Admin@123' } });
    adminAToken = lAdminA.body.token;

    const lDentistA = await request({ method: 'POST', path: '/api/auth/login', body: { email: dentistAEmail, password: 'Admin@123' } });
    dentistAToken = lDentistA.body.token;

    const lRecA = await request({ method: 'POST', path: '/api/auth/login', body: { email: recAEmail, password: 'Admin@123' } });
    receptionistAToken = lRecA.body.token;

    const lStaffB = await request({ method: 'POST', path: '/api/auth/login', body: { email: staffBEmail, password: 'Admin@123' } });
    staffBToken = lStaffB.body.token;

    // Register Patient A at Branch A (by Receptionist A)
    const patARes = await request({
      method: 'POST',
      path: '/api/patients',
      headers: { Authorization: `Bearer ${receptionistAToken}` },
      body: {
        firstName: 'Alice',
        lastName: 'Alpha',
        phone: '+91 91111 00001',
        branchId: branchAId,
        allergies: 'Latex',
        hasMedicalAlerts: true,
        medicalAlertDetails: 'Severe Latex Allergy',
      },
    });
    assert.equal(patARes.status, 201);
    patientAId = patARes.body.patient.id;

    // Register Patient B at Branch B (by Staff B)
    const patBRes = await request({
      method: 'POST',
      path: '/api/patients',
      headers: { Authorization: `Bearer ${staffBToken}` },
      body: {
        firstName: 'Bob',
        lastName: 'Beta',
        phone: '+91 92222 00002',
        branchId: branchBId,
        allergies: 'Aspirin',
        hasMedicalAlerts: true,
        medicalAlertDetails: 'Aspirin Sensitivity',
      },
    });
    assert.equal(patBRes.status, 201);
    patientBId = patBRes.body.patient.id;

    // Create visit for Patient A at Branch A
    const vARes = await request({
      method: 'POST',
      path: `/api/patients/${patientAId}/visits`,
      headers: { Authorization: `Bearer ${receptionistAToken}` },
      body: {
        branchId: branchAId,
        visitType: 'consultation',
        reasonForVisit: 'Alpha Toothache',
      },
    });
    assert.equal(vARes.status, 201);
    visitAId = vARes.body.visit.id;

    // Create visit for Patient B at Branch B
    const vBRes = await request({
      method: 'POST',
      path: `/api/patients/${patientBId}/visits`,
      headers: { Authorization: `Bearer ${staffBToken}` },
      body: {
        branchId: branchBId,
        visitType: 'consultation',
        reasonForVisit: 'Beta Checkup',
      },
    });
    assert.equal(vBRes.status, 201);
    visitBId = vBRes.body.visit.id;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
  });

  // =========================================================================
  // 1. PATIENT DIRECTORY & RECORD ISOLATION
  // =========================================================================

  test('1. Branch A staff cannot list patients specifying Branch B (403 Forbidden)', async () => {
    // Receptionist A
    const resRec = await request({
      method: 'GET',
      path: `/api/patients?branchId=${branchBId}`,
      headers: { Authorization: `Bearer ${receptionistAToken}` },
    });
    assert.equal(resRec.status, 403);
    assert.equal(resRec.body.success, false);

    // Admin A
    const resAdmin = await request({
      method: 'GET',
      path: `/api/patients?branchId=${branchBId}`,
      headers: { Authorization: `Bearer ${adminAToken}` },
    });
    assert.equal(resAdmin.status, 403);
    assert.equal(resAdmin.body.success, false);
  });

  test('2. Branch A staff patient listing does not leak Branch B patients', async () => {
    const res = await request({
      method: 'GET',
      path: '/api/patients',
      headers: { Authorization: `Bearer ${receptionistAToken}` },
    });
    assert.equal(res.status, 200);
    const foundBranchBPatient = res.body.patients.some((p) => p.branch_id === branchBId);
    assert.equal(foundBranchBPatient, false, 'Branch A staff must never see Branch B patients');
  });

  test('3. Branch A staff cannot view Branch B patient profile by UUID (403 Forbidden)', async () => {
    // Dentist A
    const resDentist = await request({
      method: 'GET',
      path: `/api/patients/${patientBId}`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });
    assert.equal(resDentist.status, 403);
    assert.equal(resDentist.body.success, false);

    // Admin A
    const resAdmin = await request({
      method: 'GET',
      path: `/api/patients/${patientBId}`,
      headers: { Authorization: `Bearer ${adminAToken}` },
    });
    assert.equal(resAdmin.status, 403);
    assert.equal(resAdmin.body.success, false);
  });

  test('4. Branch A staff cannot update Branch B patient demographics (403 Forbidden)', async () => {
    const res = await request({
      method: 'PUT',
      path: `/api/patients/${patientBId}`,
      headers: { Authorization: `Bearer ${adminAToken}` },
      body: {
        firstName: 'Tampered',
        lastName: 'Beta',
        phone: '+91 99999 00000',
      },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  test('5. Cross-branch medical record updates are denied (403 Forbidden)', async () => {
    const res = await request({
      method: 'PUT',
      path: `/api/patients/${patientBId}/medical`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
      body: {
        allergies: 'None',
        hasMedicalAlerts: false,
      },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  test('6. Branch A staff cannot change Branch B patient record status (403 Forbidden)', async () => {
    const res = await request({
      method: 'PATCH',
      path: `/api/patients/${patientBId}/status`,
      headers: { Authorization: `Bearer ${adminAToken}` },
      body: {
        status: 'inactive',
        reason: 'Attempted cross-branch deactivation',
      },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  // =========================================================================
  // 2. VISIT & DAILY QUEUE ISOLATION
  // =========================================================================

  test('7. Branch A staff cannot create a visit targeting Branch B (403 Forbidden)', async () => {
    // Attempting to create visit for Patient A at Branch B by Receptionist A
    const res = await request({
      method: 'POST',
      path: `/api/patients/${patientAId}/visits`,
      headers: { Authorization: `Bearer ${receptionistAToken}` },
      body: {
        branchId: branchBId,
        visitType: 'consultation',
        reasonForVisit: 'Cross-branch creation test',
      },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);

    // Also denied for Admin A
    const resAdmin = await request({
      method: 'POST',
      path: `/api/patients/${patientAId}/visits`,
      headers: { Authorization: `Bearer ${adminAToken}` },
      body: {
        branchId: branchBId,
        visitType: 'consultation',
      },
    });
    assert.equal(resAdmin.status, 403);
  });

  test('8. Branch A staff cannot view Branch B daily visit queue (403 Forbidden)', async () => {
    // Via direct branch route
    const res1 = await request({
      method: 'GET',
      path: `/api/branches/${branchBId}/visits/today`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });
    assert.equal(res1.status, 403);

    // Via patient controller route
    const res2 = await request({
      method: 'GET',
      path: `/api/patients/branches/${branchBId}/visits/today`,
      headers: { Authorization: `Bearer ${adminAToken}` },
    });
    assert.equal(res2.status, 403);
  });

  test('9. Branch A staff cannot view Branch B visit details by ID (403 Forbidden)', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/visits/${visitBId}`,
      headers: { Authorization: `Bearer ${receptionistAToken}` },
    });
    assert.equal(res.status, 403);
  });

  test('10. Branch A staff cannot update Branch B visit status or cancel visit (403 Forbidden)', async () => {
    const res = await request({
      method: 'PATCH',
      path: `/api/visits/${visitBId}/status`,
      headers: { Authorization: `Bearer ${adminAToken}` },
      body: { status: 'cancelled', notes: 'Cross branch cancellation' },
    });
    assert.equal(res.status, 403);
  });

  // =========================================================================
  // 3. HEADER INJECTION & TAMPERING PREVENTION
  // =========================================================================

  test('11. Direct API call with unauthorized x-branch-id header is rejected (403 Forbidden)', async () => {
    const res = await request({
      method: 'GET',
      path: '/api/patients',
      headers: {
        Authorization: `Bearer ${receptionistAToken}`,
        'x-branch-id': branchBId,
      },
    });
    assert.equal(res.status, 403);
    assert.match(res.body.message, /Forbidden.*not authorized/i);
  });

  // =========================================================================
  // 4. BRANCH & USER MANAGEMENT ISOLATION
  // =========================================================================

  test('12. Branch A administrator cannot view, assign, or delete users for Branch B (403 Forbidden)', async () => {
    // View users of Branch B
    const listRes = await request({
      method: 'GET',
      path: `/api/branches/${branchBId}/users`,
      headers: { Authorization: `Bearer ${adminAToken}` },
    });
    assert.equal(listRes.status, 403);

    // Assign user to Branch B
    const assignRes = await request({
      method: 'POST',
      path: `/api/branches/${branchBId}/users`,
      headers: { Authorization: `Bearer ${adminAToken}` },
      body: { userId: staffBId },
    });
    assert.equal(assignRes.status, 403);

    // Remove user from Branch B
    const delRes = await request({
      method: 'DELETE',
      path: `/api/branches/${branchBId}/users/${staffBId}`,
      headers: { Authorization: `Bearer ${adminAToken}` },
    });
    assert.equal(delRes.status, 403);
  });

  test('13. Branch A administrator cannot update Branch B details or status (403 Forbidden)', async () => {
    // Update branch details
    const putRes = await request({
      method: 'PUT',
      path: `/api/branches/${branchBId}`,
      headers: { Authorization: `Bearer ${adminAToken}` },
      body: { branch_name: 'Hacked Beta Branch' },
    });
    assert.equal(putRes.status, 403);

    // Update branch status
    const patchRes = await request({
      method: 'PATCH',
      path: `/api/branches/${branchBId}/status`,
      headers: { Authorization: `Bearer ${adminAToken}` },
      body: { is_active: false },
    });
    assert.equal(patchRes.status, 403);
  });

  // =========================================================================
  // 5. DYNAMIC ASSIGNMENT REVOCATION IMMEDIATE ENFORCEMENT
  // =========================================================================

  test('14. Revoking branch assignment immediately denies access on next HTTP request without stale session', async () => {
    // Temporarily assign Dentist A to Branch B
    await query(
      `INSERT INTO user_branches (user_id, branch_id)
       VALUES ((SELECT id FROM users WHERE email = $1), $2)
       ON CONFLICT DO NOTHING`,
      [(await query(`SELECT email FROM users WHERE id = (SELECT user_id FROM user_branches WHERE branch_id = $1 LIMIT 1)`, [branchAId])).rows[0]?.email, branchBId]
    );

    // Look up Dentist A user id
    const dRes = await query(`SELECT id FROM users WHERE email = $1`, [
      (await request({ method: 'GET', path: '/api/auth/me', headers: { Authorization: `Bearer ${dentistAToken}` } })).body.user.email,
    ]);
    const dentistId = dRes.rows[0].id;

    await query(
      `INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [dentistId, branchBId]
    );

    // Request with existing JWT token now succeeds
    const accessAllowed = await request({
      method: 'GET',
      path: `/api/branches/${branchBId}/visits/today`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });
    assert.equal(accessAllowed.status, 200, 'Access allowed once assigned');

    // Revoke assignment directly in database
    await query(`DELETE FROM user_branches WHERE user_id = $1 AND branch_id = $2`, [dentistId, branchBId]);

    // Very next request with the exact same JWT token is IMMEDIATELY rejected with 403
    const accessDenied = await request({
      method: 'GET',
      path: `/api/branches/${branchBId}/visits/today`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });
    assert.equal(accessDenied.status, 403, 'Access must be immediately revoked without token replay');
  });

  // =========================================================================
  // 6. CLINIC-TO-CLINIC TENANT ISOLATION
  // =========================================================================

  test('15. Tenant isolation: Clinic 1 staff cannot access Clinic 2 branch or patients (403 Forbidden)', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/branches/${branchCId}`,
      headers: { Authorization: `Bearer ${adminAToken}` },
    });
    assert.equal(res.status, 403);
    assert.match(res.body.message, /Forbidden.*another clinic organization/i);
  });

  // =========================================================================
  // 7. PLATFORM SUPER ADMIN FUNCTIONALITY PRESERVED WITHOUT CLINICAL DATA ACCESS
  // =========================================================================

  test('16. Platform Super Admin can manage onboarding & subscriptions but has no unrestricted clinical access', async () => {
    // SaaS Onboarding works
    const overviewRes = await request({
      method: 'GET',
      path: '/api/platform/overview',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(overviewRes.status, 200);

    // Clinical patient list returns 403 or empty since SuperAdmin has no clinic/branch assigned
    const patRes = await request({
      method: 'GET',
      path: '/api/patients',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    // Either 403 or empty array
    assert.ok([401, 403].includes(patRes.status) || (patRes.status === 200 && patRes.body.patients?.length === 0));
  });
});
