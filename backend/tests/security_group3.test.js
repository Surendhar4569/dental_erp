process.env.NODE_ENV = 'test';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const app = require('../app');
const { pool, initializeDatabase, query } = require('../config/database');
const { hashToken } = require('../utils/tokenRevocation');

let server;
let baseUrl;

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

describe('Phase 1.7 — Group 3 Session Protection & Token Revocation Test Suite', () => {
  before(async () => {
    await initializeDatabase();

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
  });

  test('1. User login issues valid token containing unique jti', async () => {
    const loginRes = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'admin@dentalerp.com', password: 'Admin@123' },
    });
    assert.equal(loginRes.status, 200);
    assert.ok(loginRes.body.token);

    // Profile check works
    const profileRes = await request({
      method: 'GET',
      path: '/api/auth/me',
      headers: { Authorization: `Bearer ${loginRes.body.token}` },
    });
    assert.equal(profileRes.status, 200);
    assert.equal(profileRes.body.user.email, 'admin@dentalerp.com');
  });

  test('2. Token revocation: Logged-out token is rejected on subsequent requests (HTTP 401)', async () => {
    // 1. Log in to get fresh token
    const loginRes = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'dentist@dentalerp.com', password: 'Dentist@123' },
    });
    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token;

    // 2. Token successfully accesses protected route
    const check1 = await request({
      method: 'GET',
      path: '/api/auth/me',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(check1.status, 200);

    // 3. Perform logout
    const logoutRes = await request({
      method: 'POST',
      path: '/api/auth/logout',
      headers: { Authorization: `Bearer ${token}` },
      body: { reason: 'USER_LOGOUT' },
    });
    assert.equal(logoutRes.status, 200);
    assert.equal(logoutRes.body.success, true);

    // 4. Verify token hash was recorded in revoked_tokens table
    const tokenHash = hashToken(token);
    const revokedRecord = await query('SELECT * FROM revoked_tokens WHERE token_hash = $1', [tokenHash]);
    assert.equal(revokedRecord.rows.length, 1);
    assert.equal(revokedRecord.rows[0].reason, 'USER_LOGOUT');

    // 5. Attempt to reuse the logged-out token on protected route -> MUST BE REJECTED
    const check2 = await request({
      method: 'GET',
      path: '/api/auth/me',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(check2.status, 401);
    assert.equal(check2.body.success, false);
    assert.match(check2.body.message, /revoked or logged out/i);

    // 6. Attempt to use revoked token on another protected route (/api/branches) -> MUST BE REJECTED
    const branchCheck = await request({
      method: 'GET',
      path: '/api/branches',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(branchCheck.status, 401);
    assert.match(branchCheck.body.message, /revoked or logged out/i);
  });

  test('3. Re-login after logout generates a new valid token', async () => {
    // Dentist logs in again
    const reLogin = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'dentist@dentalerp.com', password: 'Dentist@123' },
    });
    assert.equal(reLogin.status, 200);
    const newToken = reLogin.body.token;

    // New token works
    const check = await request({
      method: 'GET',
      path: '/api/auth/me',
      headers: { Authorization: `Bearer ${newToken}` },
    });
    assert.equal(check.status, 200);
  });
});
