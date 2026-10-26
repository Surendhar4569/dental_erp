process.env.NODE_ENV = 'test';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const app = require('../app');
const { pool, initializeDatabase, query } = require('../config/database');

let server;
let baseUrl;

let superAdminToken;
let clinicAdminToken;
let testClinicId;
let testBranchId;
let testAdminEmail;

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

describe('Phase 1.7 — Group 2 Subscription Enforcement & Audit Trail Test Suite', () => {
  before(async () => {
    await initializeDatabase();

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // SuperAdmin login
    const saRes = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'superadmin@voicegate.com', password: 'SuperAdmin@VoiceGate2026' },
    });
    assert.equal(saRes.status, 200);
    superAdminToken = saRes.body.token;

    // Clinic Admin login (default clinic)
    const caRes = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'admin@dentalerp.com', password: 'Admin@123' },
    });
    assert.equal(caRes.status, 200);
    clinicAdminToken = caRes.body.token;

    // Provision a test clinic organization for group 2 checks
    const unique = Date.now().toString().slice(-5);
    testAdminEmail = `g2admin.${unique}@clinic.com`;
    const onboardRes = await request({
      method: 'POST',
      path: '/api/platform/clinics/onboard',
      headers: { Authorization: `Bearer ${superAdminToken}` },
      body: {
        clinic_name: `Group2 Clinic ${unique}`,
        clinic_code: `G2-${unique}`,
        primary_branch: { branch_name: 'Main Branch', branch_code: 'MAIN-01' },
        admin_user: {
          first_name: 'Dr. Group2',
          email: testAdminEmail,
          password: 'Group2Password@123',
        },
      },
    });
    assert.equal(onboardRes.status, 201);
    testClinicId = onboardRes.body.clinic.id;
    testBranchId = onboardRes.body.primaryBranch.id;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
  });

  test('1. Failed login attempts are recorded in audit_logs without raw passwords', async () => {
    const bogusEmail = `nonexistent.${Date.now()}@domain.com`;
    const res1 = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: bogusEmail, password: 'WrongPassword@123' },
    });
    assert.equal(res1.status, 401);

    // Verify non-existent user attempt is logged
    const logRes1 = await query(
      "SELECT * FROM audit_logs WHERE action = 'AUTH_LOGIN_FAILED' AND details->>'attemptedEmail' = $1",
      [bogusEmail]
    );
    assert.equal(logRes1.rows.length, 1);
    assert.equal(logRes1.rows[0].details.reason, 'USER_NOT_FOUND');
    // Ensure raw password is NOT in details
    assert.equal(logRes1.rows[0].details.password, undefined);

    // Verify bad password for existing user is logged
    const res2 = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: testAdminEmail, password: 'IncorrectPassword@999' },
    });
    assert.equal(res2.status, 401);

    const logRes2 = await query(
      "SELECT * FROM audit_logs WHERE action = 'AUTH_LOGIN_FAILED' AND details->>'attemptedEmail' = $1 AND details->>'reason' = 'INVALID_CREDENTIALS'",
      [testAdminEmail]
    );
    assert.ok(logRes2.rows.length >= 1);
    assert.equal(logRes2.rows[0].details.password, undefined);
  });

  test('2. Cross-tenant branch access denial is logged in audit_logs', async () => {
    // Authenticate testAdminEmail to acquire token for testClinicId
    const loginRes = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: testAdminEmail, password: 'Group2Password@123' },
    });
    assert.equal(loginRes.status, 200);
    const tenantToken = loginRes.body.token;

    // Fetch branch from HQ-001 clinic
    const hqBranch = await query("SELECT id FROM branches WHERE branch_code = 'MAIN-01' AND clinic_id != $1 LIMIT 1", [testClinicId]);
    assert.ok(hqBranch.rows.length > 0);
    const foreignBranchId = hqBranch.rows[0].id;

    // Attempt access
    const crossRes = await request({
      method: 'GET',
      path: `/api/branches/${foreignBranchId}`,
      headers: { Authorization: `Bearer ${tenantToken}` },
    });
    assert.equal(crossRes.status, 403);

    // Verify audit log has SECURITY_CROSS_TENANT_ACCESS_DENIED
    const auditRes = await query(
      "SELECT * FROM audit_logs WHERE action = 'SECURITY_CROSS_TENANT_ACCESS_DENIED' AND branch_id = $1",
      [foreignBranchId]
    );
    assert.ok(auditRes.rows.length >= 1);
  });

  test('3. Inactive subscription plans cannot be assigned to clinics (400 Bad Request)', async () => {
    // Create an inactive plan
    const planCode = `INACT_${Date.now()}`;
    const createRes = await request({
      method: 'POST',
      path: '/api/platform/plans',
      headers: { Authorization: `Bearer ${superAdminToken}` },
      body: {
        plan_code: planCode,
        plan_name: 'Retired Legacy Plan',
        max_branches: 1,
        is_active: false,
      },
    });
    assert.equal(createRes.status, 201);
    const inactivePlanId = createRes.body.plan.id;

    // Attempt to assign inactive plan
    const assignRes = await request({
      method: 'POST',
      path: `/api/platform/clinics/${testClinicId}/plan`,
      headers: { Authorization: `Bearer ${superAdminToken}` },
      body: { plan_id: inactivePlanId },
    });

    assert.equal(assignRes.status, 400);
    assert.equal(assignRes.body.success, false);
    assert.match(assignRes.body.message, /Cannot assign inactive subscription plan/i);
  });

  test('4. Subscription plan modifications are audit logged with before/after state', async () => {
    // Create an isolated plan to modify
    const planCode = `EDIT_${Date.now().toString().slice(-6)}`;
    const createRes = await request({
      method: 'POST',
      path: '/api/platform/plans',
      headers: { Authorization: `Bearer ${superAdminToken}` },
      body: {
        plan_code: planCode,
        plan_name: 'Audit Edit Plan',
        max_branches: 2,
        is_active: true,
      },
    });
    assert.equal(createRes.status, 201);
    const plan = createRes.body.plan;

    const updateRes = await request({
      method: 'PUT',
      path: `/api/platform/plans/${plan.id}`,
      headers: { Authorization: `Bearer ${superAdminToken}` },
      body: {
        plan_name: `${plan.plan_name} (Audited Edit)`,
        max_branches: plan.max_branches + 1,
      },
    });
    assert.equal(updateRes.status, 200);

    // Verify audit log
    const logRes = await query(
      "SELECT * FROM audit_logs WHERE action = 'PLATFORM_PLAN_UPDATED' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1",
      [plan.id]
    );
    assert.equal(logRes.rows.length, 1);
    const logDetails = logRes.rows[0].details;
    assert.ok(logDetails.before);
    assert.ok(logDetails.after);
    assert.equal(logDetails.after.maxBranches, plan.max_branches + 1);
  });

  test('5. Suspended or Expired clinic organizations are blocked at login and on protected routes', async () => {
    // 1. Set clinic subscription to expired in database
    await query("UPDATE clinics SET subscription_status = 'expired' WHERE id = $1", [testClinicId]);

    const expiredLogin = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: testAdminEmail, password: 'Group2Password@123' },
    });
    assert.equal(expiredLogin.status, 403);
    assert.match(expiredLogin.body.message, /subscription has expired/i);

    // 2. Set clinic subscription_expires_at to past date
    await query("UPDATE clinics SET subscription_status = 'active', subscription_expires_at = now() - INTERVAL '1 day' WHERE id = $1", [testClinicId]);

    const dateExpiredLogin = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: testAdminEmail, password: 'Group2Password@123' },
    });
    assert.equal(dateExpiredLogin.status, 403);
    assert.match(dateExpiredLogin.body.message, /subscription has expired/i);

    // 3. Set clinic to suspended
    await query("UPDATE clinics SET subscription_status = 'suspended', subscription_expires_at = NULL WHERE id = $1", [testClinicId]);

    const suspendedLogin = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: testAdminEmail, password: 'Group2Password@123' },
    });
    assert.equal(suspendedLogin.status, 403);
    assert.match(suspendedLogin.body.message, /subscription is suspended/i);

    // 4. Verify SuperAdmin is NOT blocked even when managing expired or suspended clinics
    const saCheck = await request({
      method: 'GET',
      path: `/api/platform/clinics/${testClinicId}`,
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(saCheck.status, 200, 'SuperAdmin must maintain access for management and reactivation');

    // Reactivate test clinic
    await query("UPDATE clinics SET subscription_status = 'active', subscription_expires_at = NULL WHERE id = $1", [testClinicId]);
  });
});
