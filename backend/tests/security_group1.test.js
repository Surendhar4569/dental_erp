process.env.NODE_ENV = 'test';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const app = require('../app');
const { pool } = require('../config/database');
const { validateEnvironment } = require('../config/envValidation');

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

describe('Phase 1.7 — Group 1 Security Controls Test Suite', () => {
  before(async () => {
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

  test('1. Helmet sets secure HTTP response headers', async () => {
    const res = await request({ method: 'GET', path: '/api/health' });
    assert.equal(res.status, 200);
    // Helmet standard security headers
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
    assert.equal(res.headers['cross-origin-resource-policy'], 'cross-origin');
  });

  test('2. Rate limiting returns HTTP 429 when threshold exceeded', async () => {
    // Send requests with x-test-rate-limit header to trigger rate limiting in test mode
    let lastRes;
    for (let i = 0; i < 7; i++) {
      lastRes = await request({
        method: 'POST',
        path: '/api/auth/login',
        headers: { 'x-test-rate-limit': 'true' },
        body: { email: 'baduser@test.com', password: 'WrongPassword@123' },
      });
    }

    assert.equal(lastRes.status, 429, 'Excessive login requests must be blocked with HTTP 429');
    assert.equal(lastRes.body.success, false);
    assert.match(lastRes.body.message, /too many login attempts/i);
    assert.ok(lastRes.headers['ratelimit-limit'], 'RateLimit-Limit header must be present');
  });

  test('3. Environment validator fails fast if JWT_SECRET is missing or insecure', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.JWT_SECRET;

    try {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = '';

      assert.throws(
        () => validateEnvironment(),
        /JWT_SECRET environment variable is required/i,
        'Must reject empty JWT_SECRET in production'
      );

      process.env.JWT_SECRET = 'fallback_secret';
      assert.throws(
        () => validateEnvironment(),
        /Insecure default JWT_SECRET detected/i,
        'Must reject fallback_secret'
      );

      process.env.JWT_SECRET = 'short_secret_under_32_chars';
      assert.throws(
        () => validateEnvironment(),
        /too short/i,
        'Must reject secrets under 32 characters'
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.JWT_SECRET = originalSecret;
    }
  });
});
