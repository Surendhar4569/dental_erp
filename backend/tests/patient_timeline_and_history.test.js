const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { query, pool, initializeDatabase } = require('../config/database');

describe('Phase 5: Visit-Wise Patient History & Unified Medical Record Timeline Test Suite', () => {
  let server;
  let baseUrl;

  let clinicId;
  let branchAId;
  let branchBId;
  let clinic2Id;
  let branchCId;

  let adminToken;
  let dentistAToken;
  let dentistAId;
  let receptionistToken;
  let branchBStaffToken;

  let patientId;
  let visit1Id;
  let visit2Id;
  let appointment1Id;
  let appointment2Id;
  let crossClinicPatientId;
  let crossClinicVisitId;

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
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    });
  };

  const loginUser = async (email, password) => {
    const res = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email, password },
    });
    assert.equal(res.status, 200, `Login failed for ${email}: ${JSON.stringify(res.body)}`);
    return res.body.token;
  };

  before(async () => {
    await initializeDatabase();

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    const stamp = Date.now();
    const hash = await bcrypt.hash('TestPassword@123', 6);

    // 1. Setup Primary Clinic & Branches
    const clinicRes = await query(
      `INSERT INTO clinics (name, code, is_active, subscription_status)
       VALUES ('Timeline Clinic ${stamp}', 'TC-' || substr(md5(random()::text), 1, 6), true, 'active')
       RETURNING id`
    );
    clinicId = clinicRes.rows[0].id;

    const bARes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-TL-A', 'Timeline Central Branch', true, true)
       RETURNING id`,
      [clinicId]
    );
    branchAId = bARes.rows[0].id;

    const bBRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-TL-B', 'Timeline West Branch', true, false)
       RETURNING id`,
      [clinicId]
    );
    branchBId = bBRes.rows[0].id;

    // 2. Setup Clinic 2 for multi-tenant isolation tests
    const clinic2Res = await query(
      `INSERT INTO clinics (name, code, is_active, subscription_status)
       VALUES ('Cross Clinic ${stamp}', 'CC-' || substr(md5(random()::text), 1, 6), true, 'active')
       RETURNING id`
    );
    clinic2Id = clinic2Res.rows[0].id;

    const bCRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-TL-C', 'Cross Branch', true, true)
       RETURNING id`,
      [clinic2Id]
    );
    branchCId = bCRes.rows[0].id;

    // 3. Create Users
    const rolesRes = await query('SELECT id, name FROM roles');
    const roleMap = {};
    rolesRes.rows.forEach((r) => {
      roleMap[r.name] = r.id;
    });

    const adminEmail = `admin_${stamp}@dentalerp.com`;
    const adminUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Arthur', 'Admin', true) RETURNING id`,
      [clinicId, roleMap['admin'], adminEmail, hash]
    );
    const adminId = adminUserRes.rows[0].id;
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true), ($1, $3, false)`,
      [adminId, branchAId, branchBId]
    );

    const dentistEmail = `dentist_${stamp}@dentalerp.com`;
    const dentistUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Dr. Sarah', 'Dentist', true) RETURNING id`,
      [clinicId, roleMap['dentist'], dentistEmail, hash]
    );
    dentistAId = dentistUserRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [dentistAId, branchAId]);

    const recEmail = `rec_${stamp}@dentalerp.com`;
    const recUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Rita', 'Receptionist', true) RETURNING id`,
      [clinicId, roleMap['receptionist'], recEmail, hash]
    );
    const recId = recUserRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [recId, branchAId]);

    // Branch B only staff
    const bBStaffEmail = `bob_${stamp}@dentalerp.com`;
    const bBStaffRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Bob', 'BranchBStaff', true) RETURNING id`,
      [clinicId, roleMap['dentist'], bBStaffEmail, hash]
    );
    const bBStaffId = bBStaffRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [bBStaffId, branchBId]);

    // 4. Authenticate & Obtain Tokens
    adminToken = await loginUser(adminEmail, 'TestPassword@123');
    dentistAToken = await loginUser(dentistEmail, 'TestPassword@123');
    receptionistToken = await loginUser(recEmail, 'TestPassword@123');
    branchBStaffToken = await loginUser(bBStaffEmail, 'TestPassword@123');

    // 5. Create Test Patient in Clinic 1
    const patNum = '77' + Math.floor(1000 + Math.random() * 9000);
    const patRes = await query(`
      INSERT INTO patients (clinic_id, branch_id, patient_number, first_name, last_name, phone, gender, date_of_birth, status)
      VALUES ($1, $2, $3, 'Elena', 'Gilbert', '+15557788', 'female', '1996-06-22', 'active')
      RETURNING id;
    `, [clinicId, branchAId, patNum]);
    patientId = patRes.rows[0].id;

    // Medical records with allergy
    await query(`
      INSERT INTO patient_medical_records (patient_id, clinic_id, allergies, medical_conditions, has_medical_alerts, medical_alert_details)
      VALUES ($1, $2, 'Amoxicillin, Latex', 'Mild Asthma', true, 'SEVERE LATEX ALLERGY');
    `, [patientId, clinicId]);

    // 6. Encounter 1 (30 days ago) — Visit 1 with Appointment 1, Vitals, Exam, Finding, Plan, and Payment
    const pastDate = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const appt1Res = await query(`
      INSERT INTO appointments (clinic_id, branch_id, patient_id, doctor_id, appointment_number, appointment_date, start_time, end_time, appointment_type, status, consultation_fee)
      VALUES ($1, $2, $3, $4, $5, $6, '09:00', '09:30', 'consultation', 'completed', 150.00)
      RETURNING id;
    `, [clinicId, branchAId, patientId, dentistAId, `APT-1-${stamp}`, pastDate]);
    appointment1Id = appt1Res.rows[0].id;

    const v1Res = await query(`
      INSERT INTO patient_visits (clinic_id, branch_id, patient_id, appointment_id, doctor_id, visit_date, token_number, token_display, visit_type, status, reason_for_visit, notes, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, 101, 'TK-101', 'consultation', 'completed', 'Severe toothache lower right molar', 'Intake completed', $5, $5)
      RETURNING id;
    `, [clinicId, branchAId, patientId, appointment1Id, dentistAId, pastDate]);
    visit1Id = v1Res.rows[0].id;

    await query(`UPDATE appointments SET visit_id = $1 WHERE id = $2`, [visit1Id, appointment1Id]);

    // Vitals for Visit 1
    await query(`
      INSERT INTO patient_visit_vitals (clinic_id, branch_id, visit_id, patient_id, blood_pressure, pulse_bpm, temperature_f, spo2_percent, triage_priority, triage_notes, recorded_by, recorded_at)
      VALUES ($1, $2, $3, $4, '120/80', 74, 98.6, 99, 'routine', 'Vitals within normal limits', $5, $6);
    `, [clinicId, branchAId, visit1Id, patientId, dentistAId, `${pastDate} 09:05:00`]);

    // Clinical Examination for Visit 1
    const exam1Res = await query(`
      INSERT INTO clinical_examinations (clinic_id, branch_id, patient_id, visit_id, appointment_id, doctor_id, chief_complaint, diagnosis, status, signed_by, signed_at, is_released_to_patient)
      VALUES ($1, $2, $3, $4, $5, $6, 'Pain in tooth #46', 'Irreversible Pulpitis #46', 'signed', $6, $7, true)
      RETURNING id;
    `, [clinicId, branchAId, patientId, visit1Id, appointment1Id, dentistAId, `${pastDate} 09:25:00`]);
    const exam1Id = exam1Res.rows[0].id;

    // Dental Finding for Visit 1
    const condRes = await query(`SELECT id FROM dental_conditions WHERE code = 'caries' LIMIT 1`);
    const condId = condRes.rows[0] ? condRes.rows[0].id : null;

    if (condId) {
      await query(`
        INSERT INTO patient_dental_findings (clinic_id, branch_id, patient_id, visit_id, examination_id, tooth_number, surface, condition_id, condition_code, condition_name, severity, status, created_by)
        VALUES ($1, $2, $3, $4, $5, 46, 'O', $6, 'caries', 'Dental Caries', 'severe', 'active', $7);
      `, [clinicId, branchAId, patientId, visit1Id, exam1Id, condId, dentistAId]);
    }

    // Treatment Plan originating from Visit 1
    const plan1Res = await query(`
      INSERT INTO treatment_plans (clinic_id, branch_id, patient_id, plan_number, plan_title, originating_visit_id, created_by_doctor_id, status, total_estimated_cost, version)
      VALUES ($1, $2, $3, $4, 'Root Canal Therapy #46', $5, $6, 'approved', 850.00, 1)
      RETURNING id;
    `, [clinicId, branchAId, patientId, `TP-1-${stamp}`, visit1Id, dentistAId]);
    const plan1Id = plan1Res.rows[0].id;

    // Treatment Consent for Plan 1 in Visit 1
    await query(`
      INSERT INTO treatment_consents (clinic_id, branch_id, patient_id, treatment_plan_id, visit_id, consent_number, consent_status, procedure_summary, material_risks_discussed, alternatives_discussed, acknowledgement_method, patient_name_acknowledged, recorded_by, obtained_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'obtained', 'Endodontic therapy and crown placement', 'Discomfort, mild swelling', 'Extraction, observation', 'in_person_verbal_witnessed', 'Elena Gilbert', $7, now());
    `, [clinicId, branchAId, patientId, plan1Id, visit1Id, `CNS-1-${stamp}`, dentistAId]);

    // Payment for Appointment 1
    await query(`
      INSERT INTO appointment_payments (clinic_id, branch_id, appointment_id, patient_id, receipt_number, amount_paid, gross_amount, discount_amount, remaining_balance, payment_method, payment_status, received_by)
      VALUES ($1, $2, $3, $4, $5, 150.00, 150.00, 0.00, 0.00, 'card', 'completed', $6);
    `, [clinicId, branchAId, appointment1Id, patientId, `RCP-1-${stamp}`, dentistAId]);

    // 7. Encounter 2 (Today) — Visit 2 with Prescription and Appointment 2
    const todayDate = new Date().toISOString().split('T')[0];
    const appt2Res = await query(`
      INSERT INTO appointments (clinic_id, branch_id, patient_id, doctor_id, appointment_number, appointment_date, start_time, end_time, appointment_type, status, consultation_fee)
      VALUES ($1, $2, $3, $4, $5, $6, '14:00', '14:30', 'follow_up', 'checked_in', 0.00)
      RETURNING id;
    `, [clinicId, branchAId, patientId, dentistAId, `APT-2-${stamp}`, todayDate]);
    appointment2Id = appt2Res.rows[0].id;

    const v2Res = await query(`
      INSERT INTO patient_visits (clinic_id, branch_id, patient_id, appointment_id, doctor_id, visit_date, token_number, token_display, visit_type, status, reason_for_visit, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, 102, 'TK-102', 'follow_up', 'in_progress', 'Post-procedure review and prescription', $5, $5)
      RETURNING id;
    `, [clinicId, branchAId, patientId, appointment2Id, dentistAId, todayDate]);
    visit2Id = v2Res.rows[0].id;

    // Prescription in Visit 2
    const rxRes = await query(`
      INSERT INTO prescriptions (clinic_id, branch_id, patient_id, visit_id, prescription_number, prescription_date, prescribing_doctor_id, status, diagnosis, general_instructions, signed_at, signed_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'signed', 'Post-endodontic analgesic relief', 'Take with meals', now(), $7)
      RETURNING id;
    `, [clinicId, branchAId, patientId, visit2Id, `RX-1-${stamp}`, todayDate, dentistAId]);
    const rxId = rxRes.rows[0].id;

    await query(`
      INSERT INTO prescription_items (prescription_id, clinic_id, patient_id, medicine_name, dosage, dosage_form, route, frequency, duration, quantity, quantity_unit, instructions)
      VALUES ($1, $2, $3, 'Ibuprofen', '400 mg', 'tablet', 'oral', 'TID', '3 days', 9, 'tablets', 'After food PRN');
    `, [rxId, clinicId, patientId]);

    // 8. Cross-Clinic Patient & Visit in Clinic 2
    const crossPatRes = await query(`
      INSERT INTO patients (clinic_id, branch_id, patient_number, first_name, last_name, phone, gender, date_of_birth, status)
      VALUES ($1, $2, $3, 'Stefan', 'Salvatore', '+15559900', 'male', '1994-01-15', 'active')
      RETURNING id;
    `, [clinic2Id, branchCId, '99' + Math.floor(1000 + Math.random() * 9000)]);
    crossClinicPatientId = crossPatRes.rows[0].id;

    const crossVRes = await query(`
      INSERT INTO patient_visits (clinic_id, branch_id, patient_id, visit_date, token_number, token_display, visit_type, status, created_by, updated_by)
      VALUES ($1, $2, $3, $4, 999, 'TK-999', 'consultation', 'completed', (SELECT id FROM users LIMIT 1), (SELECT id FROM users LIMIT 1))
      RETURNING id;
    `, [clinic2Id, branchCId, crossClinicPatientId, todayDate]);
    crossClinicVisitId = crossVRes.rows[0].id;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // Test 1: Timeline Aggregation across Multiple Visits
  test('1. GET /api/patients/:id/timeline: Aggregates chronological events across all visits and clinical categories', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/patients/${patientId}/timeline`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.events));
    assert.ok(res.body.events.length >= 7, `Expected at least 7 events, received ${res.body.events.length}`);

    // Verify ordering: newest first
    for (let i = 1; i < res.body.events.length; i++) {
      const prevTime = new Date(res.body.events[i - 1].event_timestamp).getTime();
      const currTime = new Date(res.body.events[i].event_timestamp).getTime();
      assert.ok(prevTime >= currTime, `Timeline not ordered chronologically descending at index ${i}`);
    }

    // Check categories present
    const categories = new Set(res.body.events.map((e) => e.category));
    assert.ok(categories.has('visits'), 'Visits category missing');
    assert.ok(categories.has('appointments'), 'Appointments category missing');
    assert.ok(categories.has('vitals'), 'Vitals category missing');
    assert.ok(categories.has('clinical'), 'Clinical category missing');
    assert.ok(categories.has('treatment_plans'), 'Treatment plans category missing');
    assert.ok(categories.has('consent'), 'Consent category missing');
    assert.ok(categories.has('prescriptions'), 'Prescriptions category missing');
    assert.ok(categories.has('billing'), 'Billing category missing');
  });

  // Test 2: Category Filter
  test('2. Timeline Category Filter: Returns only events matching requested category', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/patients/${patientId}/timeline?category=prescriptions`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.events.length >= 1);
    assert.ok(res.body.events.every((e) => e.category === 'prescriptions'));
    assert.equal(res.body.events[0].event_type, 'prescription');
  });

  // Test 3: Specific Visit Filter
  test('3. Timeline Visit Filter: Filters timeline to events associated with a specific visit encounter', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/patients/${patientId}/timeline?visitId=${visit1Id}`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.events.length >= 4);
    assert.ok(res.body.events.every((e) => e.visit_id === visit1Id));
  });

  // Test 4: Date Range Filter
  test('4. Timeline Date Range Filter: Restricts events to requested calendar interval', async () => {
    const todayDate = new Date().toISOString().split('T')[0];
    const res = await request({
      method: 'GET',
      path: `/api/patients/${patientId}/timeline?startDate=${todayDate}&endDate=${todayDate}`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.events.length >= 1);
    assert.ok(res.body.events.every((e) => e.event_timestamp.startsWith(todayDate)));
  });

  // Test 5: Search Query Filter
  test('5. Timeline Search Filter: Efficiently searches event title, summary, token, and practitioner', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/patients/${patientId}/timeline?search=Root%20Canal`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.events.length >= 1);
    assert.ok(res.body.events.some((e) => e.title.includes('Root Canal') || e.summary.includes('Root Canal')));
  });

  // Test 6: Pagination Metadata
  test('6. Timeline Pagination: Paginates long patient histories accurately', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/patients/${patientId}/timeline?page=1&limit=3`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.events.length, 3);
    assert.equal(res.body.pagination.page, 1);
    assert.equal(res.body.pagination.limit, 3);
    assert.ok(res.body.pagination.total >= 7);
    assert.ok(res.body.pagination.totalPages >= 3);
  });

  // Test 7: Visit-Wise Record Viewer Endpoint
  test('7. GET /api/patients/:id/visits/:visitId/records: Returns unified encounter breakdown across all sections', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/patients/${patientId}/visits/${visit1Id}/records`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // Verify encounter header
    assert.equal(res.body.visit.id, visit1Id);
    assert.equal(res.body.visit.tokenDisplay, 'TK-101');
    assert.equal(res.body.patient.id, patientId);

    // Verify Vitals section
    assert.ok(res.body.vitals, 'Vitals should be populated');
    assert.equal(res.body.vitals.blood_pressure, '120/80');
    assert.equal(res.body.vitals.pulse_bpm, 74);

    // Verify Clinical Examination section
    assert.ok(res.body.clinicalExamination, 'Clinical examination should be populated');
    assert.equal(res.body.clinicalExamination.diagnosis, 'Irreversible Pulpitis #46');
    assert.equal(res.body.clinicalExamination.status, 'signed');

    // Verify Dental Findings section
    assert.ok(Array.isArray(res.body.dentalFindings));
    assert.equal(res.body.dentalFindings.length, 1);
    assert.equal(res.body.dentalFindings[0].tooth_number, 46);

    // Verify Treatment Plans section
    assert.ok(Array.isArray(res.body.treatmentPlans));
    assert.equal(res.body.treatmentPlans.length, 1);
    assert.equal(res.body.treatmentPlans[0].plan_title, 'Root Canal Therapy #46');

    // Verify Treatment Consents section
    assert.ok(Array.isArray(res.body.treatmentConsents));
    assert.equal(res.body.treatmentConsents.length, 1);
    assert.equal(res.body.treatmentConsents[0].consent_status, 'obtained');

    // Verify Billing & Payments section
    assert.ok(Array.isArray(res.body.billing));
    assert.equal(res.body.billing.length, 1);
    assert.equal(Number(res.body.billing[0].amount_paid), 150);

    // Verify Patient-Level Context
    assert.equal(res.body.patientSafetyContext.isPatientLevel, true);
    assert.equal(res.body.patientSafetyContext.allergies, 'Amoxicillin, Latex');
    assert.equal(res.body.patientSafetyContext.hasMedicalAlerts, true);
  });

  // Test 8: Alternate Route GET /api/patients/visits/:visitId/records
  test('8. GET /api/patients/visits/:visitId/records: Accessible directly via visit encounter route', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/patients/visits/${visit2Id}/records`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.visit.id, visit2Id);
    assert.equal(res.body.visit.tokenDisplay, 'TK-102');

    // Prescriptions should be present in Visit 2
    assert.ok(Array.isArray(res.body.prescriptions));
    assert.equal(res.body.prescriptions.length, 1);
    assert.equal(res.body.prescriptions[0].items[0].medicine_name, 'Ibuprofen');
  });

  // Test 9: Clear Empty States for Sections with No Records
  test('9. Empty States: Returns clean null and empty arrays for sections without records in an encounter', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/patients/visits/${visit2Id}/records`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });

    assert.equal(res.status, 200);
    // Visit 2 has no recorded vitals or clinical exams
    assert.equal(res.body.vitals, null, 'Vitals should be null when not recorded');
    assert.equal(res.body.clinicalExamination, null, 'Examination should be null when not recorded');
    assert.deepEqual(res.body.dentalFindings, [], 'Dental findings should be empty array');
    assert.deepEqual(res.body.treatmentPlans, [], 'Treatment plans should be empty array');
    assert.deepEqual(res.body.treatmentConsents, [], 'Consents should be empty array');
  });

  // Test 10: Multi-Tenant Clinic Isolation
  test('10. Strict Multi-Tenant Isolation: Cross-clinic access to patient timeline is rejected (HTTP 404)', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/patients/${crossClinicPatientId}/timeline`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });

    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
  });

  // Test 11: Multi-Tenant Isolation on Visit Records
  test('11. Strict Multi-Tenant Isolation: Cross-clinic access to visit records is rejected (HTTP 404)', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/patients/visits/${crossClinicVisitId}/records`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });

    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
  });

  // Test 12: Branch Access Authorization
  test('12. Branch Authorization Guard: Staff without assigned branch access cannot view visit records (HTTP 403)', async () => {
    // Bob is assigned only to Branch B, Visit 1 took place in Branch A
    const res = await request({
      method: 'GET',
      path: `/api/patients/visits/${visit1Id}/records`,
      headers: { Authorization: `Bearer ${branchBStaffToken}` },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.ok(res.body.message.includes('Forbidden') || res.body.message.includes('permission'));
  });

  // Test 13: Unauthenticated Access Rejection
  test('13. Authentication Guard: Unauthenticated requests are rejected (HTTP 401)', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/patients/${patientId}/timeline`,
    });

    assert.equal(res.status, 401);
  });

  // Test 14: Invalid Identifier Validation
  test('14. Validation Guard: Invalid UUID or visit identifier formats return HTTP 400', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/patients/visits/not-a-valid-uuid/records`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  // Test 15: Role-based Authorization: Receptionist and Billing staff have read-only timeline access
  test('15. Role Authorization: Receptionist and Billing can view timeline and encounter summaries', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/patients/${patientId}/timeline`,
      headers: { Authorization: `Bearer ${receptionistToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.events));
  });

  // Test 16: Historical Integrity: Signed records remain immutable and preserve doctor identity
  test('16. Historical Integrity: Preserves signed practitioner identities and immutable timestamps', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/patients/${patientId}/visits/${visit1Id}/records`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.clinicalExamination.status, 'signed');
    assert.ok(res.body.clinicalExamination.signed_at, 'Signed timestamp must exist');
    assert.ok(res.body.clinicalExamination.signed_by_name.includes('Dr. Sarah'), 'Practitioner name must be preserved');
  });
});
