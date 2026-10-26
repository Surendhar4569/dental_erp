const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { query, pool, initializeDatabase } = require('../config/database');

describe('Stage 3: Doctor & Fee Management Test Suite', () => {
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

  let doctorUserId;
  let doctorStaffId;
  let nonDoctorStaffId;
  let patientId;
  let existingAppointmentId;
  let existingPaymentId;

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

    // 1. Create Clinic 1
    const clinicCode = `FEE-${Date.now().toString().slice(-5)}`;
    const clinicRes = await query(
      `INSERT INTO clinics (code, name, is_active, subscription_status)
       VALUES ($1, 'Fee Test Clinic', true, 'active')
       RETURNING id`,
      [clinicCode]
    );
    clinicId = clinicRes.rows[0].id;

    // Branches
    const bARes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BA-FEE', 'Fee Branch Alpha', 'Asia/Kolkata', true, true)
       RETURNING id`,
      [clinicId]
    );
    branchAId = bARes.rows[0].id;

    const bBRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BB-FEE', 'Fee Branch Beta', 'Asia/Kolkata', true, false)
       RETURNING id`,
      [clinicId]
    );
    branchBId = bBRes.rows[0].id;

    // Clinic 2 for tenant isolation
    const c2Res = await query(
      `INSERT INTO clinics (code, name, is_active, subscription_status)
       VALUES ($1, 'Fee Clinic Tenant 2', true, 'active')
       RETURNING id`,
      [`T2F-${Date.now().toString().slice(-5)}`]
    );
    clinic2Id = c2Res.rows[0].id;

    const bCRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BC-FEE', 'Fee Branch Charlie T2', 'Asia/Kolkata', true, true)
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

    const testPasswordHash = await bcrypt.hash('FeeTest@123', 10);

    // Admin in Branch A
    const adminEmail = `admin_fee_${Date.now()}@test.com`;
    const adminRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Admin', 'FeeManager', true)
       RETURNING id`,
      [clinicId, rolesMap['admin'], adminEmail, testPasswordHash]
    );
    const adminId = adminRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [adminId, branchAId]);

    // Admin in Branch B
    const branchBAdminEmail = `admin_b_fee_${Date.now()}@test.com`;
    const branchBAdminRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'AdminB', 'BranchBOnly', true)
       RETURNING id`,
      [clinicId, rolesMap['admin'], branchBAdminEmail, testPasswordHash]
    );
    const branchBAdminId = branchBAdminRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [branchBAdminId, branchBId]);

    // Receptionist in Branch A
    const recEmail = `rec_fee_${Date.now()}@test.com`;
    const recRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Reception', 'FeeDesk', true)
       RETURNING id`,
      [clinicId, rolesMap['receptionist'], recEmail, testPasswordHash]
    );
    const recId = recRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [recId, branchAId]);

    // Doctor (Dentist) in Branch A
    const docEmail = `doc_fee_${Date.now()}@test.com`;
    const docRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, specialization, license_number, is_active)
       VALUES ($1, $2, $3, $4, 'Dr. Marcus', 'Vance', 'Prosthodontics', 'DENT-LIC-7744', true)
       RETURNING id`,
      [clinicId, rolesMap['dentist'], docEmail, testPasswordHash]
    );
    doctorUserId = docRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [doctorUserId, branchAId]);

    // Staff record for Doctor
    const staffDocRes = await query(
      `INSERT INTO staff (
        clinic_id, primary_branch_id, staff_number, first_name, last_name,
        phone, email, staff_category, designation, specialization, license_number,
        user_id, is_active
      ) VALUES (
        $1, $2, 'STF-70001', 'Dr. Marcus', 'Vance',
        '9876500001', $3, 'dentist', 'Lead Prosthodontist', 'Prosthodontics', 'DENT-LIC-7744',
        $4, true
      ) RETURNING id`,
      [clinicId, branchAId, docEmail, doctorUserId]
    );
    doctorStaffId = staffDocRes.rows[0].id;
    await query(`INSERT INTO staff_branches (staff_id, branch_id, is_default) VALUES ($1, $2, true)`, [doctorStaffId, branchAId]);

    // Non-Doctor Staff (Receptionist / Assistant) in Branch A
    const staffNonDocRes = await query(
      `INSERT INTO staff (
        clinic_id, primary_branch_id, staff_number, first_name, last_name,
        phone, email, staff_category, designation,
        is_active
      ) VALUES (
        $1, $2, 'STF-70002', 'Anita', 'Deshmukh',
        '9876500002', 'anita@test.com', 'assistant', 'Dental Assistant',
        true
      ) RETURNING id`,
      [clinicId, branchAId]
    );
    nonDoctorStaffId = staffNonDocRes.rows[0].id;
    await query(`INSERT INTO staff_branches (staff_id, branch_id, is_default) VALUES ($1, $2, true)`, [nonDoctorStaffId, branchAId]);

    // Patient
    const pRes = await query(
      `INSERT INTO patients (clinic_id, branch_id, patient_number, first_name, last_name, phone, status)
       VALUES ($1, $2, '887766', 'Historical', 'Patient', '9888877777', 'active')
       RETURNING id`,
      [clinicId, branchAId]
    );
    patientId = pRes.rows[0].id;

    // Existing Historical Appointment with initial fee 450.00
    const apptRes = await query(
      `INSERT INTO appointments (
        clinic_id, branch_id, appointment_number, patient_id, doctor_id,
        appointment_date, start_time, end_time, fee_amount, final_amount, status
      ) VALUES (
        $1, $2, 'APT-HIST-01', $3, $4,
        CURRENT_DATE, '11:00:00', '11:30:00', 450.00, 450.00, 'completed'
      ) RETURNING id`,
      [clinicId, branchAId, patientId, doctorUserId]
    );
    existingAppointmentId = apptRes.rows[0].id;

    // Existing Historical Payment Record with Receipt Number
    const payRes = await query(
      `INSERT INTO appointment_payments (
        clinic_id, branch_id, appointment_id, patient_id, receipt_number,
        gross_amount, discount_amount, amount_paid, remaining_balance,
        payment_method, payment_status, received_by
      ) VALUES (
        $1, $2, $3, $4, 'REC-HIST-001',
        450.00, 0.00, 450.00, 0.00,
        'cash', 'completed', $5
      ) RETURNING id`,
      [clinicId, branchAId, existingAppointmentId, patientId, adminId]
    );
    existingPaymentId = payRes.rows[0].id;

    // Authenticate Tokens
    const loginA = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: adminEmail, password: 'FeeTest@123' },
    });
    adminToken = loginA.body.token;

    const loginB = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: branchBAdminEmail, password: 'FeeTest@123' },
    });
    branchBAdminToken = loginB.body.token;

    const loginRec = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: recEmail, password: 'FeeTest@123' },
    });
    receptionistToken = loginRec.body.token;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('1. Active dentists and specialists appear in the branch fee list', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctor-fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.doctors));
    const foundDoc = res.body.doctors.find((d) => d.staff_id === doctorStaffId);
    assert.ok(foundDoc, 'Dr. Marcus Vance must appear in branch fee list');
    assert.ok(foundDoc.fees, 'Must include fee matrix');
    assert.equal(foundDoc.staff_number, 'STF-70001');
  });

  test('2. Receptionists and other non-doctor staff do not appear in the doctor fee list', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctor-fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });

    assert.equal(res.status, 200);
    const nonDoc = res.body.doctors.find((d) => d.staff_id === nonDoctorStaffId);
    assert.equal(nonDoc, undefined, 'Dental Assistant Anita must not appear in doctor fee list');
  });

  test('3. Authorized users can configure valid fees', async () => {
    const res = await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${doctorUserId}/fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        consultation_fee: 750.0,
        followup_fee: 450.0,
        emergency_fee: 1200.0,
        scope: 'branch',
        reason: 'Senior specialist branch override',
      },
    });

    assert.equal(res.status, 200, `Failed to save fee: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.equal(Number(res.body.fee.consultation_fee), 750.0);
    assert.equal(Number(res.body.fee.followup_fee), 450.0);
    assert.equal(Number(res.body.fee.emergency_fee), 1200.0);
  });

  test('4. Invalid or negative fees are rejected (HTTP 400)', async () => {
    const res = await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${doctorUserId}/fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        consultation_fee: -100.0,
        followup_fee: 'invalid_amount',
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.errors.some((e) => e.includes('consultation_fee')));
  });

  test('5. Doctor-plus-branch fee takes precedence over general doctor fee', async () => {
    // Save general fee (Tier 2)
    await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${doctorUserId}/fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        scope: 'clinic_standard',
        consultation_fee: 600.0,
        followup_fee: 350.0,
        emergency_fee: 900.0,
      },
    });

    // Save exact branch override (Tier 1)
    await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${doctorUserId}/fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        scope: 'branch',
        consultation_fee: 850.0,
        followup_fee: 500.0,
        emergency_fee: 1400.0,
      },
    });

    // Query fee resolution
    const res = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${doctorUserId}/fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(Number(res.body.fees.consultation_fee), 850.0, 'Branch override must take precedence');
    assert.equal(res.body.fees.source, 'doctor_branch_specific');
  });

  test('6. General doctor fee is used when no branch-specific fee exists', async () => {
    // Delete exact branch override
    await query(
      `DELETE FROM doctor_branch_fees WHERE clinic_id = $1 AND branch_id = $2 AND doctor_id = $3`,
      [clinicId, branchAId, doctorUserId]
    );

    // Query fee resolution: should fall back to doctor_clinic_default (600.0)
    const res = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${doctorUserId}/fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(Number(res.body.fees.consultation_fee), 600.0, 'Doctor general fee must be used');
    assert.equal(res.body.fees.source, 'doctor_clinic_default');
  });

  test('7. Branch default fee is used only when appropriate (no doctor fee)', async () => {
    // Create new doctor without specific fee
    const doc2Email = `doc2_fee_${Date.now()}@test.com`;
    const doc2Res = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, (SELECT id FROM roles WHERE name='dentist'), $2, 'hash', 'Dr. BranchDefault', 'Test', true)
       RETURNING id`,
      [clinicId, doc2Email]
    );
    const doc2Id = doc2Res.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [doc2Id, branchAId]);

    // Insert Branch Default fee: branch_id = branchAId, doctor_id = null
    await query(
      `INSERT INTO doctor_branch_fees (clinic_id, branch_id, doctor_id, consultation_fee, followup_fee, emergency_fee)
       VALUES ($1, $2, NULL, 550.00, 320.00, 850.00)`,
      [clinicId, branchAId]
    );

    const res = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${doc2Id}/fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(Number(res.body.fees.consultation_fee), 550.00, 'Branch default must be resolved');
    assert.equal(res.body.fees.source, 'branch_default');
  });

  test('8. Missing fee configuration produces a clear response with source indicator', async () => {
    // Query a doctor in Branch B where no branch default or doctor fee exists
    const doc3Email = `doc3_fee_${Date.now()}@test.com`;
    const doc3Res = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, (SELECT id FROM roles WHERE name='dentist'), $2, 'hash', 'Dr. NoFee', 'Test', true)
       RETURNING id`,
      [clinicId, doc3Email]
    );
    const doc3Id = doc3Res.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [doc3Id, branchBId]);

    const res = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchBId}/doctors/${doc3Id}/fees`,
      headers: {
        Authorization: `Bearer ${branchBAdminToken}`,
        'X-Branch-ID': branchBId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.fees.source, 'not_configured');
    assert.equal(res.body.fees.is_configured, false);
    assert.equal(res.body.fees.consultation_fee, null);
  });

  test('9. Unauthorized users cannot modify fees (HTTP 403 Forbidden)', async () => {
    const res = await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${doctorUserId}/fees`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        consultation_fee: 999.0,
      },
    });

    assert.equal(res.status, 403, 'Receptionist must not be authorized to modify fees');
  });

  test('10. Branch A cannot read or update Branch B fee configurations (HTTP 403)', async () => {
    // Admin A tries to modify fees for Branch B
    const res = await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchBId}/doctors/${doctorUserId}/fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchBId,
      },
      body: {
        consultation_fee: 999.0,
      },
    });

    assert.equal(res.status, 403, 'Must be denied access to another branch');
  });

  test('11. Tampered branch identifiers are rejected (HTTP 403)', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchCId}/doctor-fees`, // Clinic 2 branch
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchCId,
      },
    });

    assert.equal(res.status, 403);
  });

  test('12. Historical appointment charges remain unchanged after fee updates (immutability)', async () => {
    // Verify historical appointment charge before update
    const beforeRes = await query('SELECT fee_amount, final_amount FROM appointments WHERE id = $1', [existingAppointmentId]);
    assert.equal(Number(beforeRes.rows[0].fee_amount), 450.00);

    // Update doctor's fee to 1200.00
    await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${doctorUserId}/fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        scope: 'branch',
        consultation_fee: 1200.0,
        followup_fee: 800.0,
        emergency_fee: 1800.0,
      },
    });

    // Verify historical appointment charge AFTER fee update remains 450.00
    const afterRes = await query('SELECT fee_amount, final_amount FROM appointments WHERE id = $1', [existingAppointmentId]);
    assert.equal(Number(afterRes.rows[0].fee_amount), 450.00, 'Historical appointment charge must not be altered');
  });

  test('13. Existing payments and receipts remain unchanged after fee updates', async () => {
    const payRes = await query(
      'SELECT gross_amount, amount_paid, receipt_number FROM appointment_payments WHERE id = $1',
      [existingPaymentId]
    );

    assert.equal(Number(payRes.rows[0].gross_amount), 450.00);
    assert.equal(Number(payRes.rows[0].amount_paid), 450.00);
    assert.equal(payRes.rows[0].receipt_number, 'REC-HIST-001');
  });

  test('14. Appointment booking uses the backend-calculated fee', async () => {
    // Current doctor fee is 1200.00
    // Book a new appointment
    const bookRes = await request({
      method: 'POST',
      path: '/api/appointments',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        patient_id: patientId,
        doctor_id: doctorUserId,
        appointment_date: new Date().toISOString().split('T')[0],
        start_time: '15:00',
        end_time: '15:30',
        booking_channel: 'reception',
        reason: 'Fee check test visit',
      },
    });

    assert.equal(bookRes.status, 201);
    const consultationFee = Number(bookRes.body.appointment?.consultation_fee ?? bookRes.body.appointment?.fee_amount);
    assert.equal(consultationFee, 1200.00, 'New booking must automatically adopt current fee 1200.00');
  });

  test('15. Existing schedule management still works', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${doctorUserId}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  test('16. Existing staff management still works', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/staff`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.staff.length >= 1);
  });

  test('17. Existing visit-token generation and reception workflow still work', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/appointments/walk-in',
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        patient_id: patientId,
        doctor_id: doctorUserId,
        chief_complaint: 'Walk-in emergency check',
      },
    });

    assert.equal(res.status, 201);
    const tokenDisplay = res.body.visit?.token_display || res.body.visitToken;
    assert.ok(tokenDisplay, 'Must generate visit token');
    assert.ok(tokenDisplay.startsWith('0'), 'Visit token format 001+');
  });
});
