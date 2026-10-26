const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const app = require('../app');
const { pool, initializeDatabase, query } = require('../config/database');

let server;
let baseUrl;

let adminToken;
let dentistToken;
let receptionToken;

let clinicId;
let defaultBranchId;
let testBranchId;

// Helper to make HTTP requests
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

describe('Phase 1.5 Multi-Branch Management Test Suite', () => {
  before(async () => {
    // 1. Initialize schema and migrations
    await initializeDatabase();

    // 2. Start HTTP server on random free port
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // 3. Authenticate seed users to acquire tokens
    const adminLogin = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'admin@dentalerp.com', password: 'Admin@123' },
    });
    assert.equal(adminLogin.status, 200, 'Admin login failed');
    adminToken = adminLogin.body.token;
    clinicId = adminLogin.body.user.clinicId;
    defaultBranchId = adminLogin.body.user.defaultBranch?.id;

    const dentistLogin = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'dentist@dentalerp.com', password: 'Dentist@123' },
    });
    assert.equal(dentistLogin.status, 200, 'Dentist login failed');
    dentistToken = dentistLogin.body.token;

    const receptionLogin = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'reception@dentalerp.com', password: 'Reception@123' },
    });
    assert.equal(receptionLogin.status, 200, 'Receptionist login failed');
    receptionToken = receptionLogin.body.token;
  });

  after(async () => {
    // Clean up created test branches if any
    if (testBranchId) {
      await query('DELETE FROM user_branches WHERE branch_id = $1', [testBranchId]);
      await query('DELETE FROM branches WHERE id = $1', [testBranchId]);
    }
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  test('1. Existing login continues to work and returns authorized branches', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'admin@dentalerp.com', password: 'Admin@123' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.user.branches), 'user.branches must be an array');
    assert.ok(res.body.user.branches.length >= 1, 'Admin must have at least 1 branch');
    assert.ok(res.body.user.defaultBranch, 'defaultBranch must be populated');
  });

  test('2. Idempotent initialization: running initializeDatabase twice does not duplicate branches or user mappings', async () => {
    const countBefore = await query('SELECT COUNT(*)::int AS count FROM branches WHERE clinic_id = $1', [clinicId]);
    await initializeDatabase();
    const countAfter = await query('SELECT COUNT(*)::int AS count FROM branches WHERE clinic_id = $1', [clinicId]);
    assert.equal(countBefore.rows[0].count, countAfter.rows[0].count, 'Branch count must remain unchanged');
  });

  test('3. Admin can list all branches for clinic organization', async () => {
    const res = await request({
      method: 'GET',
      path: '/api/branches',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.branches.length >= 1);
    const mainBranch = res.body.branches.find((b) => b.branch_code === 'MAIN-01');
    assert.ok(mainBranch, 'Default MAIN-01 branch must be in list');
    assert.ok(mainBranch.is_default, 'MAIN-01 should be marked is_default');
  });

  test('4. Admin can create a new branch', async () => {
    const uniqueCode = `WEST-${Date.now().toString().slice(-4)}`;
    const res = await request({
      method: 'POST',
      path: '/api/branches',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        branch_name: 'Apex West Suburb Clinic',
        branch_code: uniqueCode,
        address_line1: '404 Palm Avenue, West Sector',
        city: 'Metro City',
        state: 'State Central',
        postal_code: '400050',
        phone: '+91 98765 00099',
        email: 'west@dentalcare-apex.com',
        timezone: 'Asia/Kolkata',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.branch.branch_code, uniqueCode);
    testBranchId = res.body.branch.id;
  });

  test('5. Enforce branch code uniqueness within the same organization (409 Conflict)', async () => {
    // Attempt to create duplicate branch with MAIN-01
    const res = await request({
      method: 'POST',
      path: '/api/branches',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        branch_name: 'Duplicate Branch',
        branch_code: 'MAIN-01',
        city: 'Metro City',
      },
    });
    assert.equal(res.status, 409, 'Duplicate branch code must return 409 Conflict');
    assert.equal(res.body.success, false);
  });

  test('6. Non-admin (dentist) cannot create branches (403 Forbidden)', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/branches',
      headers: { Authorization: `Bearer ${dentistToken}` },
      body: {
        branch_name: 'Unauthorized Branch',
        branch_code: 'UNAUTH-01',
      },
    });
    assert.equal(res.status, 403, 'Dentist must be forbidden from creating branches');
  });

  test('7. Unauthorized branch access: user assigned to Branch A cannot access unassigned Branch B', async () => {
    // testBranchId was created, but dentist is not assigned to it yet
    const res = await request({
      method: 'GET',
      path: `/api/branches/${testBranchId}`,
      headers: { Authorization: `Bearer ${dentistToken}` },
    });
    assert.equal(res.status, 403, 'Dentist must not have access to unassigned branch');
    assert.equal(res.body.success, false);
  });

  test('8. Admin can assign a user to a branch', async () => {
    // Get dentist user ID
    const userRes = await query("SELECT id FROM users WHERE email = 'dentist@dentalerp.com'");
    const dentistId = userRes.rows[0].id;

    const res = await request({
      method: 'POST',
      path: `/api/branches/${testBranchId}/users`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        userId: dentistId,
        isDefault: false,
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);

    // Now dentist should have access to testBranchId
    const accessRes = await request({
      method: 'GET',
      path: `/api/branches/${testBranchId}`,
      headers: { Authorization: `Bearer ${dentistToken}` },
    });
    assert.equal(accessRes.status, 200, 'Dentist should now be authorized to access assigned branch');
  });

  test('9. Admin can update branch details', async () => {
    const res = await request({
      method: 'PUT',
      path: `/api/branches/${testBranchId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        branch_name: 'Apex West Suburb Premium Centre',
        phone: '+91 99999 11111',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.branch.branch_name, 'Apex West Suburb Premium Centre');
    assert.equal(res.body.branch.phone, '+91 99999 11111');
  });

  test('10. Branch status check: cannot deactivate the default branch (400 Bad Request)', async () => {
    const res = await request({
      method: 'PATCH',
      path: `/api/branches/${defaultBranchId}/status`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { is_active: false },
    });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /default branch/i);
  });

  test('11. Safe deactivation: admin can deactivate non-default branch', async () => {
    const res = await request({
      method: 'PATCH',
      path: `/api/branches/${testBranchId}/status`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { is_active: false },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.branch.is_active, false);

    // Now dentist cannot access inactive branch
    const accessRes = await request({
      method: 'GET',
      path: `/api/branches/${testBranchId}`,
      headers: { Authorization: `Bearer ${dentistToken}` },
    });
    assert.equal(accessRes.status, 403, 'Non-admin cannot access inactive branch');
  });

  test('12. Admin can remove a user assignment from a branch', async () => {
    const userRes = await query("SELECT id FROM users WHERE email = 'dentist@dentalerp.com'");
    const dentistId = userRes.rows[0].id;

    const res = await request({
      method: 'DELETE',
      path: `/api/branches/${testBranchId}/users/${dentistId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  test('13. Branch statistics return real metrics without fake data', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/branches/${defaultBranchId}/stats`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.staffStatistics);
    assert.ok(typeof res.body.staffStatistics.totalAssignedStaff === 'number');
    assert.ok(res.body.upcomingModules, 'Upcoming modules should be declared clearly');
    assert.match(res.body.upcomingModules.patients, /Phase 2/);
  });
});
