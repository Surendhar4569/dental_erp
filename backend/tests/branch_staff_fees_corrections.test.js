const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { query, pool, initializeDatabase } = require('../config/database');

describe('Branch-Wise Staff, Doctor Fees & Financial Integrity Corrections Test Suite', () => {
  let server;
  let baseUrl;

  let clinicId;
  let branchAId;
  let branchBId;
  let clinic2Id;
  let branchCId;

  let adminId;
  let adminToken;
  let branchBAdminToken;
  let receptionistToken;

  let doctorUserId;
  let doctorStaffId;
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

    // 1. Create Clinic 1
    const clinicCode = `CORR-${Date.now().toString().slice(-5)}`;
    const clinicRes = await query(
      `INSERT INTO clinics (code, name, is_active, subscription_status)
       VALUES ($1, 'Branch Corrections Clinic', true, 'active')
       RETURNING id`,
      [clinicCode]
    );
    clinicId = clinicRes.rows[0].id;

    // Branches for Clinic 1
    const bARes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BA-CORR', 'Correction Branch Alpha', 'Asia/Kolkata', true, true)
       RETURNING id`,
      [clinicId]
    );
    branchAId = bARes.rows[0].id;

    const bBRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BB-CORR', 'Correction Branch Beta', 'Asia/Kolkata', true, false)
       RETURNING id`,
      [clinicId]
    );
    branchBId = bBRes.rows[0].id;

    // Clinic 2 & Branch C (for isolation testing)
    const c2Res = await query(
      `INSERT INTO clinics (code, name, is_active, subscription_status)
       VALUES ('C2-ISOL', 'Clinic 2 Isolation', true, 'active')
       RETURNING id`
    );
    clinic2Id = c2Res.rows[0].id;

    const bCRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BC-ISOL', 'Branch C Isolation', 'Asia/Kolkata', true, true)
       RETURNING id`,
      [clinic2Id]
    );
    branchCId = bCRes.rows[0].id;

    // Roles
    const rolesRes = await query('SELECT id, name FROM roles');
    const rolesMap = {};
    rolesRes.rows.forEach((r) => {
      rolesMap[r.name] = r.id;
    });

    const testPasswordHash = await bcrypt.hash('Secret123!', 4);

    // Admin in Branch A & B
    const adminEmail = `admin_corr_${Date.now()}@test.com`;
    const adminRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Super', 'Admin', true)
       RETURNING id`,
      [clinicId, rolesMap['admin'], adminEmail, testPasswordHash]
    );
    adminId = adminRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [adminId, branchAId]);
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, false)`, [adminId, branchBId]);

    // Branch B Only Admin
    const bBAdminEmail = `mgr_b_${Date.now()}@test.com`;
    const bBAdminRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Beta', 'Manager', true)
       RETURNING id`,
      [clinicId, rolesMap['admin'], bBAdminEmail, testPasswordHash]
    );
    const branchBAdminId = bBAdminRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [branchBAdminId, branchBId]);

    // Receptionist in Branch A
    const recEmail = `rec_corr_${Date.now()}@test.com`;
    const recRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Alpha', 'Receptionist', true)
       RETURNING id`,
      [clinicId, rolesMap['receptionist'], recEmail, testPasswordHash]
    );
    const recId = recRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [recId, branchAId]);

    // Doctor (initially assigned to Branch A)
    const docEmail = `doctor_corr_${Date.now()}@test.com`;
    const docRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, specialization, license_number, is_active)
       VALUES ($1, $2, $3, $4, 'Dr. Sarah', 'Lin', 'Endodontics', 'DENT-LIC-9901', true)
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
        $1, $2, 'STF-80001', 'Dr. Sarah', 'Lin',
        '9876543210', $3, 'dentist', 'Lead Endodontist', 'Endodontics', 'DENT-LIC-9901',
        $4, true
      ) RETURNING id`,
      [clinicId, branchAId, docEmail, doctorUserId]
    );
    doctorStaffId = staffDocRes.rows[0].id;
    await query(`INSERT INTO staff_branches (staff_id, branch_id, is_default) VALUES ($1, $2, true)`, [doctorStaffId, branchAId]);

    // Patient
    const pRes = await query(
      `INSERT INTO patients (clinic_id, branch_id, patient_number, first_name, last_name, phone, status)
       VALUES ($1, $2, '776655', 'Test', 'Patient', '9812345678', 'active')
       RETURNING id`,
      [clinicId, branchAId]
    );
    patientId = pRes.rows[0].id;

    // Login tokens
    const loginA = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: adminEmail, password: 'Secret123!' },
    });
    adminToken = loginA.body.token;

    const loginB = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: bBAdminEmail, password: 'Secret123!' },
    });
    branchBAdminToken = loginB.body.token;

    const loginRec = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: recEmail, password: 'Secret123!' },
    });
    receptionistToken = loginRec.body.token;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    // Cleanup created data
    if (clinicId) {
      await query('DELETE FROM clinics WHERE id = $1', [clinicId]);
    }
    if (clinic2Id) {
      await query('DELETE FROM clinics WHERE id = $1', [clinic2Id]);
    }
  });

  test('1. Doctor fees are independently configured across Branch A and Branch B', async () => {
    // Also assign doctor to Branch B
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, false) ON CONFLICT DO NOTHING`, [doctorUserId, branchBId]);
    await query(`INSERT INTO staff_branches (staff_id, branch_id, is_default) VALUES ($1, $2, false) ON CONFLICT DO NOTHING`, [doctorStaffId, branchBId]);

    // Configure Branch A fee = ₹750.00
    const resA = await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${doctorUserId}/fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        scope: 'branch',
        consultation_fee: 750.0,
        followup_fee: 450.0,
        emergency_fee: 1100.0,
      },
    });
    assert.equal(resA.status, 200);

    // Configure Branch B fee = ₹950.00
    const resB = await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchBId}/doctors/${doctorUserId}/fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchBId,
      },
      body: {
        scope: 'branch',
        consultation_fee: 950.0,
        followup_fee: 550.0,
        emergency_fee: 1400.0,
      },
    });
    assert.equal(resB.status, 200);

    // Read Branch A fees: must be 750
    const getA = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${doctorUserId}/fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });
    assert.equal(getA.status, 200);
    assert.equal(Number(getA.body.fees.consultation_fee), 750.0);
    assert.equal(getA.body.fees.source, 'doctor_branch_specific');

    // Read Branch B fees: must be 950
    const getB = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchBId}/doctors/${doctorUserId}/fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchBId,
      },
    });
    assert.equal(getB.status, 200);
    assert.equal(Number(getB.body.fees.consultation_fee), 950.0);
    assert.equal(getB.body.fees.source, 'doctor_branch_specific');
  });

  test('2. Fee precedence hierarchy: Branch Override > Clinic Standard > Not Configured (no 500 fallback)', async () => {
    // Delete Branch A fee override
    await query(
      `DELETE FROM doctor_branch_fees WHERE clinic_id = $1 AND branch_id = $2 AND doctor_id = $3`,
      [clinicId, branchAId, doctorUserId]
    );

    // Configure Doctor Clinic Standard (Tier 2) = ₹650.00
    await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${doctorUserId}/fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        scope: 'clinic_standard',
        consultation_fee: 650.0,
        followup_fee: 400.0,
        emergency_fee: 900.0,
      },
    });

    // Query Branch A: should resolve to doctor_clinic_default (650.00)
    const resStandard = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${doctorUserId}/fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });
    assert.equal(resStandard.status, 200);
    assert.equal(Number(resStandard.body.fees.consultation_fee), 650.0);
    assert.equal(resStandard.body.fees.source, 'doctor_clinic_default');

    // Delete Clinic Standard fee
    await query(
      `DELETE FROM doctor_branch_fees WHERE clinic_id = $1 AND branch_id IS NULL AND doctor_id = $2`,
      [clinicId, doctorUserId]
    );

    // Query Branch A: must return not_configured with null fee (NOT 500)
    const resUnconfigured = await request({
      method: 'GET',
      path: `/api/schedules/branches/${branchAId}/doctors/${doctorUserId}/fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
    });
    assert.equal(resUnconfigured.status, 200);
    assert.equal(resUnconfigured.body.fees.is_configured, false);
    assert.equal(resUnconfigured.body.fees.source, 'not_configured');
    assert.equal(resUnconfigured.body.fees.consultation_fee, null);
  });

  test('3. Unconfigured fee rejects new appointment booking (HTTP 400)', async () => {
    // Doctor currently has no configured fee at Branch A
    const res = await request({
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
        start_time: '16:00',
        end_time: '16:30',
        booking_channel: 'reception',
      },
    });

    assert.equal(res.status, 400, 'Must reject booking when fee is unconfigured');
    assert.match(res.body.message, /Consultation fee not configured for this doctor at this branch/i);
  });

  test('4. Unconfigured fee rejects walk-in registration (HTTP 400)', async () => {
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
        chief_complaint: 'Unconfigured walk-in attempt',
      },
    });

    assert.equal(res.status, 400, 'Must reject walk-in when fee is unconfigured');
    assert.match(res.body.message, /Consultation fee not configured for this doctor at this branch/i);
  });

  test('5. Re-configured fee enables appointment booking with server-calculated snapshot', async () => {
    // Configure fee for doctor at Branch A = ₹800.00
    await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${doctorUserId}/fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        scope: 'branch',
        consultation_fee: 800.0,
        followup_fee: 500.0,
        emergency_fee: 1200.0,
      },
    });

    // Booking now succeeds
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
        start_time: '16:00',
        end_time: '16:30',
        booking_channel: 'reception',
      },
    });

    assert.equal(bookRes.status, 201);
    const consultationFee = Number(bookRes.body.appointment?.consultation_fee ?? bookRes.body.appointment?.fee_amount);
    assert.equal(consultationFee, 800.00, 'Server snapshot must equal configured fee');
  });

  test('6. Payment recording prevents client payload override (gross_amount bypass prevented)', async () => {
    // Create an appointment with fee 800.00
    const apptRes = await request({
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
        start_time: '17:00',
        end_time: '17:30',
        booking_channel: 'reception',
      },
    });

    const appointmentId = apptRes.body.appointment.id;

    // Client maliciously sends gross_amount = 5.00
    const payRes = await request({
      method: 'POST',
      path: `/api/appointments/${appointmentId}/payments`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        gross_amount: 5.00,
        amount_paid: 800.00,
        payment_method: 'card',
      },
    });

    assert.equal(payRes.status, 201);
    // Verified that gross_amount recorded in the database equals the server's snapshot 800.00, not 5.00
    const checkDb = await query('SELECT gross_amount, amount_paid FROM appointment_payments WHERE appointment_id = $1', [appointmentId]);
    assert.equal(Number(checkDb.rows[0].gross_amount), 800.00, 'Server must enforce consultation fee snapshot over client gross_amount');
  });

  test('7. Assign existing staff to additional branch without duplicate staff or user records', async () => {
    // Create a new staff member (Hygienist) in Branch A
    const staffRes = await request({
      method: 'POST',
      path: '/api/staff',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        first_name: 'Priya',
        last_name: 'Sharma',
        email: `priya_${Date.now()}@test.com`,
        phone: '9988776655',
        staff_category: 'hygienist',
        primary_branch_id: branchAId,
        branch_ids: [branchAId],
      },
    });

    assert.equal(staffRes.status, 201);
    const createdStaffId = staffRes.body.staff.id;
    const staffNumber = staffRes.body.staff.staff_number;
    assert.ok(staffNumber.startsWith('STF-'));

    // Check unassigned staff for Branch B: Priya should appear
    const unassignedRes = await request({
      method: 'GET',
      path: `/api/staff/branches/${branchBId}/unassigned`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchBId,
      },
    });
    assert.equal(unassignedRes.status, 200);
    const inUnassigned = unassignedRes.body.staff.find((s) => s.id === createdStaffId);
    assert.ok(inUnassigned, 'Staff member should appear in unassigned list for Branch B');

    // Assign Priya to Branch B
    const assignRes = await request({
      method: 'POST',
      path: `/api/staff/branches/${branchBId}/assign`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchBId,
      },
      body: {
        staff_id: createdStaffId,
      },
    });
    assert.equal(assignRes.status, 200);

    // Verify staff_branches count for Priya: exactly 2 (Branch A and Branch B)
    const branchesRes = await query('SELECT branch_id FROM staff_branches WHERE staff_id = $1', [createdStaffId]);
    assert.equal(branchesRes.rows.length, 2);

    // Verify exactly ONE staff record exists in `staff` table for this clinic
    const allStaff = await query('SELECT id, staff_number FROM staff WHERE clinic_id = $1 AND staff_number = $2', [clinicId, staffNumber]);
    assert.equal(allStaff.rows.length, 1, 'Must not duplicate staff records');
  });

  test('8. Branch assignment authorization guard: Unauthorized branch assignments rejected (HTTP 403)', async () => {
    // Branch B manager (authorized only for Branch B) tries to assign staff to Branch A
    const res = await request({
      method: 'POST',
      path: `/api/staff/branches/${branchAId}/assign`,
      headers: {
        Authorization: `Bearer ${branchBAdminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        staff_id: doctorStaffId,
      },
    });

    assert.equal(res.status, 403, 'Manager without access to Branch A must receive HTTP 403');
  });

  test('9. Doctor branch removal guard: blocked when future active appointments exist (HTTP 409)', async () => {
    // Schedule a future appointment for Dr. Sarah Lin at Branch B
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);
    const dateStr = futureDate.toISOString().split('T')[0];

    const apptRes = await query(
      `INSERT INTO appointments (
        clinic_id, branch_id, appointment_number, patient_id, doctor_id,
        appointment_date, start_time, end_time, fee_amount, final_amount, status
      ) VALUES (
        $1, $2, 'APT-FUT-01', $3, $4,
        $5, '10:00:00', '10:30:00', 950.00, 950.00, 'scheduled'
      ) RETURNING id`,
      [clinicId, branchBId, patientId, doctorUserId, dateStr]
    );
    const futureApptId = apptRes.rows[0].id;

    // Try to remove doctor from Branch B: must fail with HTTP 409
    const removeRes = await request({
      method: 'DELETE',
      path: `/api/staff/branches/${branchBId}/staff/${doctorStaffId}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchBId,
      },
    });

    assert.equal(removeRes.status, 409, 'Must block doctor removal when future active appointments exist');
    assert.match(removeRes.body.message, /future appointment/i);

    // Cancel the future appointment
    await query(`UPDATE appointments SET status = 'cancelled' WHERE id = $1`, [futureApptId]);

    // Removal should now succeed
    const removeSuccessRes = await request({
      method: 'DELETE',
      path: `/api/staff/branches/${branchBId}/staff/${doctorStaffId}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchBId,
      },
    });

    assert.equal(removeSuccessRes.status, 200, 'Removal must succeed once appointments are cancelled');

    // Verify staff_branches no longer includes Branch B for this doctor
    const branchCheck = await query(
      'SELECT 1 FROM staff_branches WHERE staff_id = $1 AND branch_id = $2',
      [doctorStaffId, branchBId]
    );
    assert.equal(branchCheck.rows.length, 0);
  });

  test('10. Financial immutability: Fee changes do not mutate historical charges or payment receipts', async () => {
    // Historical appointment record
    const histRes = await query(
      `INSERT INTO appointments (
        clinic_id, branch_id, appointment_number, patient_id, doctor_id,
        appointment_date, start_time, end_time, fee_amount, final_amount, status
      ) VALUES (
        $1, $2, 'APT-HIST-CORR', $3, $4,
        CURRENT_DATE, '09:00:00', '09:30:00', 500.00, 500.00, 'completed'
      ) RETURNING id`,
      [clinicId, branchAId, patientId, doctorUserId]
    );
    const histApptId = histRes.rows[0].id;

    const histPayRes = await query(
      `INSERT INTO appointment_payments (
        clinic_id, branch_id, appointment_id, patient_id, receipt_number,
        gross_amount, discount_amount, amount_paid, remaining_balance,
        payment_method, payment_status, received_by
      ) VALUES (
        $1, $2, $3, $4, 'REC-HIST-CORR-01',
        500.00, 0.00, 500.00, 0.00,
        'cash', 'completed', $5
      ) RETURNING id`,
      [clinicId, branchAId, histApptId, patientId, adminId]
    );

    // Update doctor's fee to 2000.00
    await request({
      method: 'PUT',
      path: `/api/schedules/branches/${branchAId}/doctors/${doctorUserId}/fees`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Branch-ID': branchAId,
      },
      body: {
        scope: 'branch',
        consultation_fee: 2000.0,
      },
    });

    // Check historical appointment fee_amount remains 500.00
    const apptCheck = await query('SELECT fee_amount, final_amount FROM appointments WHERE id = $1', [histApptId]);
    assert.equal(Number(apptCheck.rows[0].fee_amount), 500.00);

    // Check payment receipt gross_amount and receipt_number remain unchanged
    const payCheck = await query('SELECT gross_amount, amount_paid, receipt_number FROM appointment_payments WHERE id = $1', [histPayRes.rows[0].id]);
    assert.equal(Number(payCheck.rows[0].gross_amount), 500.00);
    assert.equal(payCheck.rows[0].receipt_number, 'REC-HIST-CORR-01');
  });
});
