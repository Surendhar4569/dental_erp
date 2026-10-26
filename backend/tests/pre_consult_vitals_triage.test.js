const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { query, pool, initializeDatabase } = require('../config/database');

describe('Phase 1.5: Pre-Consultation Vitals & Triage Test Suite', () => {
  let server;
  let baseUrl;

  let clinicId;
  let branchAId;
  let branchBId;
  let clinic2Id;
  let branchCId;

  let adminToken;
  let dentistAToken;
  let assistantToken;
  let branchBStaffToken;

  let patientId;
  let dentistId;
  let appointmentId;
  let visitId;

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
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // Seed test clinic, branches, and users
    const clinicRes = await query(
      `INSERT INTO clinics (name, code, is_active, subscription_status)
       VALUES ('Aesthetic Dental Care', 'ADC-' || substr(md5(random()::text), 1, 6), true, 'active')
       RETURNING id`
    );
    clinicId = clinicRes.rows[0].id;

    const branchARes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-ADC-A', 'ADC Downtown Branch', true, true)
       RETURNING id`,
      [clinicId]
    );
    branchAId = branchARes.rows[0].id;

    const branchBRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-ADC-B', 'ADC Uptown Branch', true, false)
       RETURNING id`,
      [clinicId]
    );
    branchBId = branchBRes.rows[0].id;

    // Cross-tenant clinic
    const clinic2Res = await query(
      `INSERT INTO clinics (name, code, is_active, subscription_status)
       VALUES ('Cross Tenant Clinic', 'CTC-' || substr(md5(random()::text), 1, 6), true, 'active')
       RETURNING id`
    );
    clinic2Id = clinic2Res.rows[0].id;

    const branchCRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-CTC-C', 'CTC Main Branch', true, true)
       RETURNING id`,
      [clinic2Id]
    );
    branchCId = branchCRes.rows[0].id;

    const rolesRes = await query('SELECT id, name FROM roles');
    const roleMap = {};
    rolesRes.rows.forEach((r) => {
      roleMap[r.name] = r.id;
    });

    const passwordHash = await bcrypt.hash('Password@123', 10);

    // Admin user
    const adminEmail = `admin_triage_${Date.now()}@example.com`;
    const adminUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Admin', 'User', true)
       RETURNING id`,
      [clinicId, roleMap['admin'], adminEmail, passwordHash]
    );
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true), ($1, $3, false)`,
      [adminUserRes.rows[0].id, branchAId, branchBId]
    );

    // Dentist user
    const dentistEmail = `dr_triage_${Date.now()}@example.com`;
    const dentistUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, specialization, is_active)
       VALUES ($1, $2, $3, $4, 'Meera', 'Nair', 'Periodontics', true)
       RETURNING id`,
      [clinicId, roleMap['dentist'], dentistEmail, passwordHash]
    );
    dentistId = dentistUserRes.rows[0].id;
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [dentistId, branchAId]
    );
    await query(
      `INSERT INTO doctor_branch_fees (clinic_id, branch_id, doctor_id, consultation_fee, followup_fee, emergency_fee)
       VALUES ($1, $2, $3, 600.00, 300.00, 900.00)`,
      [clinicId, branchAId, dentistId]
    );

    // Assistant user (Branch A)
    const assistantEmail = `assistant_triage_${Date.now()}@example.com`;
    const assistantUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Sunita', 'Sharma', true)
       RETURNING id`,
      [clinicId, roleMap['assistant'], assistantEmail, passwordHash]
    );
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [assistantUserRes.rows[0].id, branchAId]
    );

    // Staff for Branch B only
    const branchBStaffEmail = `staff_b_triage_${Date.now()}@example.com`;
    const branchBStaffUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'BranchB', 'Nurse', true)
       RETURNING id`,
      [clinicId, roleMap['assistant'], branchBStaffEmail, passwordHash]
    );
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [branchBStaffUserRes.rows[0].id, branchBId]
    );

    // Obtain JWT tokens
    const loginAdmin = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: adminEmail, password: 'Password@123' },
    });
    adminToken = loginAdmin.body.token;

    const loginDentist = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: dentistEmail, password: 'Password@123' },
    });
    dentistAToken = loginDentist.body.token;

    const loginAssistant = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: assistantEmail, password: 'Password@123' },
    });
    assistantToken = loginAssistant.body.token;

    const loginBranchB = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: branchBStaffEmail, password: 'Password@123' },
    });
    branchBStaffToken = loginBranchB.body.token;

    // Register patient
    const patRes = await request({
      method: 'POST',
      path: '/api/patients',
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchAId },
      body: {
        first_name: 'Vikram',
        last_name: 'Verma',
        phone: '9888877777',
        gender: 'male',
        date_of_birth: '1990-05-15',
      },
    });
    patientId = patRes.body.patient.id;

    // Register walk-in encounter
    const walkInRes = await request({
      method: 'POST',
      path: '/api/appointments/walk-in',
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchAId },
      body: {
        patient_id: patientId,
        doctor_id: dentistId,
        chief_complaint: 'Acute lower molar toothache',
      },
    });
    assert.equal(walkInRes.status, 201);
    appointmentId = walkInRes.body.appointment.id;
    visitId = walkInRes.body.visit.id;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('1. Assistant records pre-consultation vitals and triage assessment', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/clinical/vitals',
      headers: { Authorization: `Bearer ${assistantToken}`, 'x-branch-id': branchAId },
      body: {
        visit_id: visitId,
        patient_id: patientId,
        appointment_id: appointmentId,
        blood_pressure: '120/80',
        pulse_bpm: 76,
        temperature_f: 98.6,
        spo2_percent: 98,
        respiratory_rate: 16,
        weight_kg: 70,
        height_cm: 175,
        triage_priority: 'priority',
        triage_notes: 'Moderate localized pain around #36, no facial asymmetry detected.',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.vitals.id);
    assert.equal(res.body.vitals.visit_id, visitId);
    assert.equal(res.body.vitals.triage_priority, 'priority');
    assert.equal(res.body.vitals.blood_pressure, '120/80');
    assert.equal(res.body.vitals.pulse_bpm, 76);
    assert.equal(Number(res.body.vitals.temperature_f), 98.6);
    // Auto-calculated BMI: 70 / (1.75 * 1.75) = 22.9
    assert.equal(Number(res.body.vitals.bmi), 22.9);
    assert.equal(res.body.vitals.recorded_by_first_name, 'Sunita');
    assert.equal(res.body.vitals.recorded_by_role, 'assistant');
  });

  test('2. Retrieve visit vitals history for encounter', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/clinical/visits/${visitId}/vitals`,
      headers: { Authorization: `Bearer ${assistantToken}`, 'x-branch-id': branchAId },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.vitals));
    assert.equal(res.body.vitals.length, 1);
    assert.equal(res.body.vitals[0].triage_priority, 'priority');
    assert.equal(res.body.vitals[0].blood_pressure, '120/80');
  });

  test('3. Doctor creates examination draft and vitals are auto-populated from triage', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/clinical/draft',
      headers: { Authorization: `Bearer ${dentistAToken}`, 'x-branch-id': branchAId },
      body: {
        visit_id: visitId,
        patient_id: patientId,
        appointment_id: appointmentId,
        chief_complaint: 'Severe throbbing pain #36',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    const exam = res.body.examination;
    assert.equal(exam.visit_id, visitId);
    assert.equal(exam.status, 'draft');

    // Verify auto-populated vitals from pre-consult triage
    assert.ok(exam.vital_signs);
    assert.equal(exam.vital_signs.blood_pressure, '120/80');
    assert.equal(exam.vital_signs.pulse_bpm, 76);
    assert.equal(Number(exam.vital_signs.temperature_f), 98.6);
    assert.equal(Number(exam.vital_signs.bmi), 22.9);
    assert.equal(exam.vital_signs.triage_priority, 'priority');
    assert.ok(exam.vital_signs.triage_notes.includes('Moderate localized pain'));

    // Verify triage_vitals array attached in response
    assert.ok(Array.isArray(exam.triage_vitals));
    assert.equal(exam.triage_vitals.length, 1);
    assert.equal(exam.triage_vitals[0].recorded_by_role, 'assistant');
  });

  test('4. Dynamic sync: recording new vitals updates active draft examination', async () => {
    const updateRes = await request({
      method: 'POST',
      path: '/api/clinical/vitals',
      headers: { Authorization: `Bearer ${assistantToken}`, 'x-branch-id': branchAId },
      body: {
        visit_id: visitId,
        patient_id: patientId,
        appointment_id: appointmentId,
        blood_pressure: '124/82',
        pulse_bpm: 80,
        temperature_f: 99.1,
        spo2_percent: 97,
        respiratory_rate: 18,
        weight_kg: 70,
        height_cm: 175,
        triage_priority: 'urgent',
        triage_notes: 'Temperature elevated, patient reports intensifying pain.',
      },
    });

    assert.equal(updateRes.status, 201);
    assert.equal(updateRes.body.vitals.triage_priority, 'urgent');

    // Retrieve examination to verify sync into draft vital_signs
    const examRes = await request({
      method: 'GET',
      path: `/api/clinical/visits/${visitId}/examination`,
      headers: { Authorization: `Bearer ${dentistAToken}`, 'x-branch-id': branchAId },
    });

    assert.equal(examRes.status, 200);
    const exam = examRes.body.examination;
    assert.equal(exam.vital_signs.blood_pressure, '124/82');
    assert.equal(exam.vital_signs.pulse_bpm, 80);
    assert.equal(Number(exam.vital_signs.temperature_f), 99.1);
    assert.equal(exam.vital_signs.triage_priority, 'urgent');
    assert.equal(exam.triage_vitals.length, 2);
  });

  test('5. Signed examination immutability: signing record locks vital_signs against mutation', async () => {
    // 1. Get draft
    const examRes = await request({
      method: 'GET',
      path: `/api/clinical/visits/${visitId}/examination`,
      headers: { Authorization: `Bearer ${dentistAToken}`, 'x-branch-id': branchAId },
    });
    const examId = examRes.body.examination.id;

    // 2. Doctor signs examination
    const signRes = await request({
      method: 'POST',
      path: `/api/clinical/examinations/${examId}/sign`,
      headers: { Authorization: `Bearer ${dentistAToken}`, 'x-branch-id': branchAId },
    });
    assert.equal(signRes.status, 200);
    assert.equal(signRes.body.examination.status, 'signed');
    const signedHash = signRes.body.examination.signature_hash;
    assert.ok(signedHash);

    // 3. Additional vitals recorded does NOT mutate signed exam's vital_signs
    const vitalsRes = await request({
      method: 'POST',
      path: '/api/clinical/vitals',
      headers: { Authorization: `Bearer ${assistantToken}`, 'x-branch-id': branchAId },
      body: {
        visit_id: visitId,
        patient_id: patientId,
        blood_pressure: '115/75',
        pulse_bpm: 72,
        triage_priority: 'routine',
      },
    });
    assert.equal(vitalsRes.status, 201);

    // 4. Verify signed examination signature and vitals remained immutable
    const afterRes = await request({
      method: 'GET',
      path: `/api/clinical/examinations/${examId}`,
      headers: { Authorization: `Bearer ${dentistAToken}`, 'x-branch-id': branchAId },
    });
    assert.equal(afterRes.body.examination.status, 'signed');
    assert.equal(afterRes.body.examination.signature_hash, signedHash);
    // Signed exam's vital_signs was not modified by the post-sign vitals
    assert.equal(afterRes.body.examination.vital_signs.blood_pressure, '124/82');
    // But triage_vitals history correctly lists all 3 records
    assert.equal(afterRes.body.examination.triage_vitals.length, 3);
  });

  test('6. Strict Branch & Tenant Isolation: foreign branch cannot record or view vitals', async () => {
    // Branch B staff attempts to record vitals for Branch A visit
    const forbiddenPost = await request({
      method: 'POST',
      path: '/api/clinical/vitals',
      headers: { Authorization: `Bearer ${branchBStaffToken}`, 'x-branch-id': branchBId },
      body: {
        visit_id: visitId,
        triage_priority: 'routine',
      },
    });
    assert.equal(forbiddenPost.status, 404);

    // Branch B staff attempts to read Branch A visit vitals
    const forbiddenGet = await request({
      method: 'GET',
      path: `/api/clinical/visits/${visitId}/vitals`,
      headers: { Authorization: `Bearer ${branchBStaffToken}`, 'x-branch-id': branchBId },
    });
    assert.equal(forbiddenGet.status, 404);
  });

  test('7. Validation checks: priority constraints and missing visit_id', async () => {
    // Missing visit_id
    const noVisit = await request({
      method: 'POST',
      path: '/api/clinical/vitals',
      headers: { Authorization: `Bearer ${assistantToken}`, 'x-branch-id': branchAId },
      body: {
        triage_priority: 'routine',
      },
    });
    assert.equal(noVisit.status, 400);

    // Invalid priority value
    const badPriority = await request({
      method: 'POST',
      path: '/api/clinical/vitals',
      headers: { Authorization: `Bearer ${assistantToken}`, 'x-branch-id': branchAId },
      body: {
        visit_id: visitId,
        triage_priority: 'extreme_emergency',
      },
    });
    assert.equal(badPriority.status, 400);
    assert.ok(badPriority.body.message.includes('Invalid triage_priority'));
  });

  test('8. Doctor updates draft examination without passing vitals: findings update, pre-consult triage vitals are preserved', async () => {
    // Book and check in a new appointment for patient
    const bookRes = await request({
      method: 'POST',
      path: '/api/appointments',
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchAId },
      body: {
        patient_id: patientId,
        doctor_id: dentistId,
        branch_id: branchAId,
        appointment_date: '2026-11-01',
        start_time: '10:00:00',
        end_time: '10:30:00',
        appointment_type: 'consultation',
        reason: 'Routine scaling and polishing check',
      },
    });
    assert.equal(bookRes.status, 201);
    const newApptId = bookRes.body.appointment.id;

    const checkInRes = await request({
      method: 'POST',
      path: `/api/appointments/${newApptId}/check-in`,
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchAId },
      body: {},
    });
    assert.equal(checkInRes.status, 200);
    const newVisitId = checkInRes.body.visit.id;

    // Staff records pre-consultation vitals
    const vitalsRes = await request({
      method: 'POST',
      path: '/api/clinical/vitals',
      headers: { Authorization: `Bearer ${assistantToken}`, 'x-branch-id': branchAId },
      body: {
        visit_id: newVisitId,
        patient_id: patientId,
        appointment_id: newApptId,
        blood_pressure: '118/78',
        pulse_bpm: 74,
        temperature_f: 98.4,
        spo2_percent: 99,
        respiratory_rate: 15,
        weight_kg: 68,
        height_cm: 172,
        triage_priority: 'routine',
        triage_notes: 'Patient reports no systemic conditions.',
      },
    });
    assert.equal(vitalsRes.status, 201);

    // Doctor initializes draft
    const draftRes = await request({
      method: 'POST',
      path: '/api/clinical/draft',
      headers: { Authorization: `Bearer ${dentistAToken}`, 'x-branch-id': branchAId },
      body: {
        visit_id: newVisitId,
        patient_id: patientId,
        appointment_id: newApptId,
        chief_complaint: 'Routine scaling and polishing check',
      },
    });
    assert.equal(draftRes.status, 201);
    const draftId = draftRes.body.examination.id;
    assert.equal(draftRes.body.examination.vital_signs.blood_pressure, '118/78');

    // Doctor saves clinical notes WITHOUT vitals payload (single entry point workflow)
    const updateRes = await request({
      method: 'PUT',
      path: `/api/clinical/examinations/${draftId}`,
      headers: { Authorization: `Bearer ${dentistAToken}`, 'x-branch-id': branchAId },
      body: {
        diagnosis: 'Mild Marginal Gingivitis',
        examination_notes: 'Generalized supragingival calculus on lower anteriors.',
        patient_facing_summary: 'Ultrasonic scaling performed. Good oral hygiene instructions given.',
        follow_up_instructions: 'Brush twice daily, review in 6 months.',
      },
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.success, true);
    const updatedExam = updateRes.body.examination;

    // Findings are updated
    assert.equal(updatedExam.diagnosis, 'Mild Marginal Gingivitis');
    assert.equal(updatedExam.examination_notes, 'Generalized supragingival calculus on lower anteriors.');
    assert.equal(updatedExam.follow_up_instructions, 'Brush twice daily, review in 6 months.');

    // Staff triage vitals are still perfectly preserved in vital_signs snapshot
    assert.ok(updatedExam.vital_signs);
    assert.equal(updatedExam.vital_signs.blood_pressure, '118/78');
    assert.equal(updatedExam.vital_signs.pulse_bpm, 74);
    assert.equal(Number(updatedExam.vital_signs.temperature_f), 98.4);
    assert.equal(updatedExam.vital_signs.triage_priority, 'routine');
    assert.equal(updatedExam.vital_signs.triage_notes, 'Patient reports no systemic conditions.');
    assert.equal(updatedExam.vital_signs.triage_recorded_by, 'Sunita Sharma');
  });

  test('9. Visit isolation: Vitals from visit 1 are never returned for an un-triaged visit 2 of the same patient', async () => {
    // Create another visit for the same patient (e.g. follow-up encounter on another slot)
    const bookRes2 = await request({
      method: 'POST',
      path: '/api/appointments',
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchAId },
      body: {
        patient_id: patientId,
        doctor_id: dentistId,
        branch_id: branchAId,
        appointment_date: '2026-11-01',
        start_time: '11:00:00',
        end_time: '11:30:00',
        appointment_type: 'consultation',
        reason: 'Follow-up visit without new triage yet',
      },
    });
    assert.equal(bookRes2.status, 201);
    const appt2Id = bookRes2.body.appointment.id;

    const checkInRes2 = await request({
      method: 'POST',
      path: `/api/appointments/${appt2Id}/check-in`,
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchAId },
      body: {},
    });
    assert.equal(checkInRes2.status, 200);
    const visit2Id = checkInRes2.body.visit.id;

    // Fetch vitals for visit 2 - must be empty array, not pulling previous visit 1 vitals
    const vitalsRes = await request({
      method: 'GET',
      path: `/api/clinical/visits/${visit2Id}/vitals`,
      headers: { Authorization: `Bearer ${dentistAToken}`, 'x-branch-id': branchAId },
    });
    assert.equal(vitalsRes.status, 200);
    assert.equal(vitalsRes.body.vitals.length, 0);

    // Create draft for visit 2 - vital_signs must be empty, not inheriting prior visits
    const draftRes = await request({
      method: 'POST',
      path: '/api/clinical/draft',
      headers: { Authorization: `Bearer ${dentistAToken}`, 'x-branch-id': branchAId },
      body: {
        visit_id: visit2Id,
        patient_id: patientId,
        chief_complaint: 'Follow-up visit without new triage yet',
      },
    });
    assert.equal(draftRes.status, 201);
    assert.deepEqual(draftRes.body.examination.vital_signs, {});
    assert.deepEqual(draftRes.body.examination.triage_vitals, []);
  });

  test('10. Appointment lifecycle integration: booking, check-in, token generation, payment collection remain fully functional', async () => {
    // 1. Book an appointment
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    const bookRes = await request({
      method: 'POST',
      path: '/api/appointments',
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchAId },
      body: {
        patient_id: patientId,
        doctor_id: dentistId,
        branch_id: branchAId,
        appointment_date: dateStr,
        start_time: '14:00:00',
        end_time: '14:30:00',
        appointment_type: 'consultation',
        reason: 'Tooth sensitivity evaluation',
      },
    });
    assert.equal(bookRes.status, 201);
    assert.ok(bookRes.body.appointment.id);
    const scheduledApptId = bookRes.body.appointment.id;

    // 2. Check-in the appointment at reception desk
    const checkInRes = await request({
      method: 'POST',
      path: `/api/appointments/${scheduledApptId}/check-in`,
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchAId },
      body: {},
    });
    assert.equal(checkInRes.status, 200);
    assert.ok(checkInRes.body.visit);
    assert.equal(checkInRes.body.visit.status, 'queued');
    assert.equal(checkInRes.body.appointment.status, 'checked_in');
    assert.ok(checkInRes.body.visit.token_number);

    // 3. Collect payment / receipt
    const payRes = await request({
      method: 'POST',
      path: `/api/appointments/${scheduledApptId}/payments`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        amount_paid: 600.0,
        payment_method: 'card',
        transaction_reference: 'TXN/CARD/443322',
        notes: 'Full consultation payment at reception',
      },
    });
    assert.equal(payRes.status, 201);
    assert.equal(payRes.body.success, true);
    assert.ok(payRes.body.receipt.receipt_number.startsWith('REC-'));
    assert.equal(parseFloat(payRes.body.receipt.amount_paid), 600.0);
  });
});

