const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const app = require('../app');
const { pool, initializeDatabase, query } = require('../config/database');

let server;
let baseUrl;

let superAdminToken;
let clinicAdminToken;
let dentistToken;

let createdClinicId;
let createdBranchId;
let createdAdminEmail;

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

describe('Phase 1.6 SaaS Foundation & Multi-Tenant Platform Administration Test Suite', () => {
  before(async () => {
    await initializeDatabase();

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // 1. Authenticate seed SuperAdmin
    const saLogin = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'superadmin@voicegate.com', password: 'SuperAdmin@VoiceGate2026' },
    });
    assert.equal(saLogin.status, 200, 'SuperAdmin login failed');
    assert.equal(saLogin.body.user.isPlatformAdmin, true, 'isPlatformAdmin must be true');
    assert.equal(saLogin.body.user.role, 'superadmin');
    superAdminToken = saLogin.body.token;

    // 2. Authenticate seed clinic admin
    const caLogin = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'admin@dentalerp.com', password: 'Admin@123' },
    });
    assert.equal(caLogin.status, 200, 'Clinic Admin login failed');
    assert.equal(caLogin.body.user.isPlatformAdmin, false, 'Clinic admin must NOT be platform admin');
    clinicAdminToken = caLogin.body.token;

    // 3. Authenticate seed dentist
    const dLogin = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'dentist@dentalerp.com', password: 'Dentist@123' },
    });
    assert.equal(dLogin.status, 200, 'Dentist login failed');
    dentistToken = dLogin.body.token;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
  });

  test('1. SuperAdmin can access platform overview and metrics', async () => {
    const res = await request({
      method: 'GET',
      path: '/api/platform/overview',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.metrics.clinics.total_clinics >= 1);
    assert.ok(Array.isArray(res.body.metrics.planDistribution));
  });

  test('2. Clinic Administrator is strictly DENIED platform access (403 Forbidden)', async () => {
    const res = await request({
      method: 'GET',
      path: '/api/platform/overview',
      headers: { Authorization: `Bearer ${clinicAdminToken}` },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /VoiceGate Platform Super Admin/i);
  });

  test('3. Non-admin staff (dentist) is DENIED platform access (403 Forbidden)', async () => {
    const res = await request({
      method: 'GET',
      path: '/api/platform/overview',
      headers: { Authorization: `Bearer ${dentistToken}` },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  test('4. SuperAdmin can list all subscription plans and create a custom plan', async () => {
    const listRes = await request({
      method: 'GET',
      path: '/api/platform/plans',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.plans.length >= 4);

    const testPlanCode = `PILOT_${Date.now()}`;
    const createRes = await request({
      method: 'POST',
      path: '/api/platform/plans',
      headers: { Authorization: `Bearer ${superAdminToken}` },
      body: {
        plan_code: testPlanCode,
        plan_name: 'Pilot Evaluation Tier',
        description: 'Temporary trial plan for clinic network testing',
        max_branches: 2,
        is_active: true,
      },
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.plan.plan_code, testPlanCode);
    assert.equal(createRes.body.plan.max_branches, 2);
  });

  test('5. Managed Onboarding: SuperAdmin atomically provisions new clinic organization', async () => {
    const uniqueSuffix = Date.now().toString().slice(-6);
    const testClinicCode = `CLINIC-${uniqueSuffix}`;
    createdAdminEmail = `dr.smith.${uniqueSuffix}@smilecare.com`;

    const onboardRes = await request({
      method: 'POST',
      path: '/api/platform/clinics/onboard',
      headers: { Authorization: `Bearer ${superAdminToken}` },
      body: {
        clinic_name: `SmileCare Family Dentistry ${uniqueSuffix}`,
        clinic_code: testClinicCode,
        phone: '+91 91234 56789',
        email: `info@smilecare-${uniqueSuffix}.com`,
        address: '45 Dental Park Avenue',
        timezone: 'Asia/Kolkata',
        plan_code: 'STARTER',
        primary_branch: {
          branch_name: 'SmileCare Downtown Suite',
          branch_code: 'MAIN-01',
          city: 'Bangalore',
        },
        admin_user: {
          first_name: 'Dr. John',
          last_name: 'Smith',
          email: createdAdminEmail,
          password: 'AdminPassword@123',
          phone: '+91 91234 56789',
        },
      },
    });

    assert.equal(onboardRes.status, 201);
    assert.equal(onboardRes.body.success, true);
    assert.equal(onboardRes.body.clinic.code, testClinicCode);
    assert.equal(onboardRes.body.primaryBranch.branch_code, 'MAIN-01');
    assert.equal(onboardRes.body.administrator.email, createdAdminEmail);
    // Crucial security requirement: plain password must NEVER be in response
    assert.equal(onboardRes.body.administrator.password, undefined);

    createdClinicId = onboardRes.body.clinic.id;
    createdBranchId = onboardRes.body.primaryBranch.id;
  });

  test('6. Duplicate clinic code is rejected (409 Conflict)', async () => {
    const clinicRes = await query('SELECT code FROM clinics WHERE id = $1', [createdClinicId]);
    const existingCode = clinicRes.rows[0].code;

    const res = await request({
      method: 'POST',
      path: '/api/platform/clinics/onboard',
      headers: { Authorization: `Bearer ${superAdminToken}` },
      body: {
        clinic_name: 'Duplicate Clinic Test',
        clinic_code: existingCode,
        primary_branch: { branch_name: 'Branch A', branch_code: 'B-01' },
        admin_user: {
          first_name: 'Test',
          email: `unique.${Date.now()}@test.com`,
          password: 'Password@123',
        },
      },
    });

    assert.equal(res.status, 409);
    assert.match(res.body.message, /already exists/i);
  });

  test('7. Duplicate admin email is rejected (409 Conflict)', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/platform/clinics/onboard',
      headers: { Authorization: `Bearer ${superAdminToken}` },
      body: {
        clinic_name: 'New Org With Existing Email',
        clinic_code: `CODE-${Date.now()}`,
        primary_branch: { branch_name: 'Branch A', branch_code: 'B-01' },
        admin_user: {
          first_name: 'Test',
          email: createdAdminEmail, // already used in test 5
          password: 'Password@123',
        },
      },
    });

    assert.equal(res.status, 409);
    assert.match(res.body.message, /already exists/i);
  });

  test('8. Newly provisioned Clinic Administrator can log in and is isolated to their clinic', async () => {
    const loginRes = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: createdAdminEmail, password: 'AdminPassword@123' },
    });

    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.user.clinicId, createdClinicId);
    assert.equal(loginRes.body.user.isPlatformAdmin, false);
    assert.equal(loginRes.body.user.branches.length, 1);
    assert.equal(loginRes.body.user.branches[0].branch_code, 'MAIN-01');

    const newAdminToken = loginRes.body.token;

    // Cross-tenant security check: Attempting to access Branch from HQ-001 clinic
    const hqBranchRes = await query("SELECT id FROM branches WHERE branch_code = 'MAIN-01' AND clinic_id != $1 LIMIT 1", [createdClinicId]);
    if (hqBranchRes.rows.length > 0) {
      const crossAccessRes = await request({
        method: 'GET',
        path: `/api/branches/${hqBranchRes.rows[0].id}`,
        headers: { Authorization: `Bearer ${newAdminToken}` },
      });
      assert.equal(crossAccessRes.status, 403, 'Cross-tenant branch access must be blocked');
    }
  });

  test('9. Branch Limit Enforcement: STARTER plan (1 branch limit) blocks adding a second branch', async () => {
    const loginRes = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: createdAdminEmail, password: 'AdminPassword@123' },
    });
    const newAdminToken = loginRes.body.token;

    // Attempt to add a 2nd branch on STARTER plan
    const addBranchRes = await request({
      method: 'POST',
      path: '/api/branches',
      headers: { Authorization: `Bearer ${newAdminToken}` },
      body: {
        branch_name: 'SmileCare West Wing (Exceeds Limit)',
        branch_code: 'WEST-02',
        city: 'Bangalore West',
      },
    });

    assert.equal(addBranchRes.status, 403);
    assert.equal(addBranchRes.body.success, false);
    assert.match(addBranchRes.body.message, /Branch limit reached/i);
  });

  test('10. SuperAdmin can upgrade subscription plan and clinic can now add branches', async () => {
    // 1. Upgrade clinic to PROFESSIONAL plan (supports up to 3 branches)
    const upgradeRes = await request({
      method: 'POST',
      path: `/api/platform/clinics/${createdClinicId}/plan`,
      headers: { Authorization: `Bearer ${superAdminToken}` },
      body: { plan_code: 'PROFESSIONAL' },
    });
    assert.equal(upgradeRes.status, 200);

    // 2. Now clinic admin attempts to add 2nd branch
    const loginRes = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: createdAdminEmail, password: 'AdminPassword@123' },
    });
    const newAdminToken = loginRes.body.token;

    const addBranchRes = await request({
      method: 'POST',
      path: '/api/branches',
      headers: { Authorization: `Bearer ${newAdminToken}` },
      body: {
        branch_name: 'SmileCare West Wing (Allowed on Professional)',
        branch_code: 'WEST-02',
        city: 'Bangalore West',
      },
    });

    assert.equal(addBranchRes.status, 201);
    assert.equal(addBranchRes.body.branch.branch_code, 'WEST-02');
  });

  test('11. Suspended clinic organization cannot perform branch operations', async () => {
    // 1. Acquire token for clinic admin prior to suspension
    const loginRes = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: createdAdminEmail, password: 'AdminPassword@123' },
    });
    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token;

    // 2. SuperAdmin suspends clinic
    const suspendRes = await request({
      method: 'PATCH',
      path: `/api/platform/clinics/${createdClinicId}/status`,
      headers: { Authorization: `Bearer ${superAdminToken}` },
      body: { status: 'suspended' },
    });
    assert.equal(suspendRes.status, 200);
    assert.equal(suspendRes.body.clinic.subscription_status, 'suspended');

    // 3. Existing token is blocked on branch operations
    const branchOpRes = await request({
      method: 'POST',
      path: '/api/branches',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        branch_name: 'Branch While Suspended',
        branch_code: 'SUSP-03',
      },
    });

    assert.equal(branchOpRes.status, 403);
    assert.match(branchOpRes.body.message, /suspended/i);

    // 4. New login attempts while suspended are also blocked
    const newLoginRes = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: createdAdminEmail, password: 'AdminPassword@123' },
    });
    assert.equal(newLoginRes.status, 403);
    assert.match(newLoginRes.body.message, /suspended/i);

    // 3. SuperAdmin reactivates clinic
    const reactivateRes = await request({
      method: 'PATCH',
      path: `/api/platform/clinics/${createdClinicId}/status`,
      headers: { Authorization: `Bearer ${superAdminToken}` },
      body: { status: 'active' },
    });
    assert.equal(reactivateRes.status, 200);
    assert.equal(reactivateRes.body.clinic.subscription_status, 'active');
  });
});
