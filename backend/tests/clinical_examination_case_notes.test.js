const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { query, pool, initializeDatabase } = require('../config/database');

describe('Phase 1: Clinical Examination & Case Notes Test Suite', () => {
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
  let branchBStaffToken;

  let patientId;
  let bookedAppointmentId;
  let advanceVisitId;
  let walkInPatientId;
  let walkInVisitId;

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
       VALUES ('Apex Dental Hospital', 'APEX-' || substr(md5(random()::text), 1, 6), true, 'active')
       RETURNING id`
    );
    clinicId = clinicRes.rows[0].id;

    const branchARes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-APX-A', 'Apex Central Branch', true, true)
       RETURNING id`,
      [clinicId]
    );
    branchAId = branchARes.rows[0].id;

    const branchBRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-APX-B', 'Apex North Branch', true, false)
       RETURNING id`,
      [clinicId]
    );
    branchBId = branchBRes.rows[0].id;

    // Cross-tenant clinic
    const clinic2Res = await query(
      `INSERT INTO clinics (name, code, is_active, subscription_status)
       VALUES ('Metro Dental Care', 'METRO-' || substr(md5(random()::text), 1, 6), true, 'active')
       RETURNING id`
    );
    clinic2Id = clinic2Res.rows[0].id;

    const branchCRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-MTR-C', 'Metro South Branch', true, true)
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
    const adminEmail = `admin_clinical_${Date.now()}@example.com`;
    const adminUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Super', 'Admin', true)
       RETURNING id`,
      [clinicId, roleMap['admin'], adminEmail, passwordHash]
    );
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true), ($1, $3, false)`,
      [adminUserRes.rows[0].id, branchAId, branchBId]
    );

    // Dentist user for Branch A
    const dentistAEmail = `dr_clinical_${Date.now()}@example.com`;
    const dentistAUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, specialization, is_active)
       VALUES ($1, $2, $3, $4, 'Priya', 'Rao', 'Endodontics', true)
       RETURNING id`,
      [clinicId, roleMap['dentist'], dentistAEmail, passwordHash]
    );
    dentistAId = dentistAUserRes.rows[0].id;
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [dentistAId, branchAId]
    );
    await query(
      `INSERT INTO doctor_branch_fees (clinic_id, branch_id, doctor_id, consultation_fee, followup_fee, emergency_fee)
       VALUES ($1, $2, $3, 500.00, 250.00, 750.00)`,
      [clinicId, branchAId, dentistAId]
    );

    // Staff for Branch B only
    const branchBStaffEmail = `staff_b_${Date.now()}@example.com`;
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
      body: { email: dentistAEmail, password: 'Password@123' },
    });
    dentistAToken = loginDentist.body.token;

    const loginBranchB = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: branchBStaffEmail, password: 'Password@123' },
    });
    branchBStaffToken = loginBranchB.body.token;

    // Register a test patient
    const patRes = await request({
      method: 'POST',
      path: '/api/patients',
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchAId },
      body: {
        first_name: 'Anita',
        last_name: 'Deshmukh',
        phone: '9822001122',
        gender: 'female',
      },
    });
    patientId = patRes.body.patient.id;

    // Create an advance appointment
    const apptRes = await query(
      `INSERT INTO appointments (
         clinic_id, branch_id, patient_id, doctor_id, appointment_number,
         appointment_date, start_time, end_time, appointment_type, status, consultation_fee
       ) VALUES ($1, $2, $3, $4, 'APT-TEST-001', CURRENT_DATE, '10:00', '10:30', 'consultation', 'confirmed', 500.00)
       RETURNING id`,
      [clinicId, branchAId, patientId, dentistAId]
    );
    bookedAppointmentId = apptRes.rows[0].id;

    // Check in the appointment to allocate an active visit encounter
    const checkInRes = await request({
      method: 'POST',
      path: `/api/appointments/${bookedAppointmentId}/check-in`,
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchAId },
    });
    assert.equal(checkInRes.status, 200);
    advanceVisitId = checkInRes.body.visit.id;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  let createdExamId;

  // 1. Creating and retrieving an examination draft
  test('1. Create and retrieve clinical examination draft linked to a valid visit', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/clinical/draft',
      headers: { Authorization: `Bearer ${dentistAToken}`, 'x-branch-id': branchAId },
      body: {
        visit_id: advanceVisitId,
        patient_id: patientId,
        appointment_id: bookedAppointmentId,
        chief_complaint: 'Severe throbbing pain in lower left molar (#36) for 3 days',
        vital_signs: {
          blood_pressure: '120/80',
          pulse_bpm: 76,
          temperature_f: 98.6,
        },
        examination_notes: 'Deep occlusal caries on 36. Tender on vertical percussion. Pulp testing shows irreversible pulpitis.',
        diagnosis: 'Acute Irreversible Pulpitis #36 with Apical Periodontitis',
        diagnosis_icd10: 'K04.0',
        patient_facing_summary: 'Severe dental infection in lower left tooth requiring root canal treatment.',
        follow_up_instructions: 'Avoid chewing on left side. Warm salt water rinses. Start prescribed antibiotics and analgesics.',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.examination);
    assert.equal(res.body.examination.status, 'draft');
    assert.equal(res.body.examination.is_released_to_patient, false);
    assert.equal(res.body.examination.visit_id, advanceVisitId);
    assert.equal(res.body.examination.patient_id, patientId);
    assert.equal(res.body.examination.doctor_id, dentistAId);

    createdExamId = res.body.examination.id;

    // Retrieve by visit ID
    const getRes = await request({
      method: 'GET',
      path: `/api/clinical/visits/${advanceVisitId}/examination`,
      headers: { Authorization: `Bearer ${dentistAToken}`, 'x-branch-id': branchAId },
    });

    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.examination.id, createdExamId);
    assert.equal(getRes.body.examination.chief_complaint, 'Severe throbbing pain in lower left molar (#36) for 3 days');
    assert.equal(getRes.body.examination.vital_signs.pulse_bpm, 76);
  });

  // 2. Updating a draft with valid authorization
  test('2. Update examination draft with valid doctor authorization', async () => {
    const updateRes = await request({
      method: 'PUT',
      path: `/api/clinical/examinations/${createdExamId}`,
      headers: { Authorization: `Bearer ${dentistAToken}`, 'x-branch-id': branchAId },
      body: {
        vital_signs: {
          blood_pressure: '122/82',
          pulse_bpm: 78,
          temperature_f: 98.8,
          spo2_pct: 99,
        },
        examination_notes: 'Updated notes: Deep occlusal caries on 36 with pulpal involvement. Periapical radiograph indicates widening of periodontal ligament space.',
      },
    });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.success, true);
    assert.equal(updateRes.body.examination.vital_signs.spo2_pct, 99);
    assert.match(updateRes.body.examination.examination_notes, /widening of periodontal ligament/);
  });

  // 3. Signing an examination
  test('3. Doctor digital sign-off seals note with cryptographic signature hash', async () => {
    const signRes = await request({
      method: 'POST',
      path: `/api/clinical/examinations/${createdExamId}/sign`,
      headers: { Authorization: `Bearer ${dentistAToken}`, 'x-branch-id': branchAId },
    });

    assert.equal(signRes.status, 200);
    assert.equal(signRes.body.success, true);
    const exam = signRes.body.examination;
    assert.equal(exam.status, 'signed');
    assert.ok(exam.signed_at);
    assert.equal(exam.signed_by, dentistAId);
    assert.ok(exam.signature_hash);
    assert.equal(exam.signature_hash.length, 64); // SHA-256 hex digest length
  });

  // 4. Rejecting unauthorized changes to signed or locked records
  test('4. Direct modification of signed clinical examination is strictly rejected (409 Conflict)', async () => {
    const attemptEditRes = await request({
      method: 'PUT',
      path: `/api/clinical/examinations/${createdExamId}`,
      headers: { Authorization: `Bearer ${dentistAToken}`, 'x-branch-id': branchAId },
      body: {
        diagnosis: 'Attempting unauthorized modification of signed record',
      },
    });

    assert.equal(attemptEditRes.status, 409);
    assert.equal(attemptEditRes.body.success, false);
    assert.match(attemptEditRes.body.message, /Cannot modify clinical content of signed examination records/);

    // Database Trigger Verification: Even raw SQL updates to clinical data on signed record must fail
    await assert.rejects(
      async () => {
        await query(
          `UPDATE clinical_examinations 
           SET diagnosis = 'Hacked Diagnosis' 
           WHERE id = $1`,
          [createdExamId]
        );
      },
      /Cannot modify clinical content of signed or locked examination records/
    );

    // Database Trigger Verification: Deleting signed records is blocked
    await assert.rejects(
      async () => {
        await query(
          `DELETE FROM clinical_examinations WHERE id = $1`,
          [createdExamId]
        );
      },
      /Cannot delete signed or locked clinical examination records/
    );
  });

  // 5. Appending an amendment without changing the original signed record
  test('5. Append authorized legal amendment: creates addendum while preserving signed record byte-for-byte', async () => {
    // Read original signature hash before amendment
    const originalRes = await query('SELECT signature_hash, diagnosis FROM clinical_examinations WHERE id = $1', [createdExamId]);
    const originalHash = originalRes.rows[0].signature_hash;
    const originalDiagnosis = originalRes.rows[0].diagnosis;

    const amendRes = await request({
      method: 'POST',
      path: `/api/clinical/examinations/${createdExamId}/amendments`,
      headers: { Authorization: `Bearer ${dentistAToken}`, 'x-branch-id': branchAId },
      body: {
        amendment_reason: 'Additional periapical X-ray findings and sensitivity report',
        addendum_notes: 'Cold test response negative. Calcified canal orifices observed in mesiobuccal root. Recommended CBCT if needed.',
      },
    });

    assert.equal(amendRes.status, 201);
    assert.equal(amendRes.body.success, true);
    assert.ok(amendRes.body.amendment);
    assert.equal(amendRes.body.amendment.previous_signature_hash, originalHash);
    assert.ok(amendRes.body.amendment.new_signature_hash);

    // Check that original clinical record diagnosis and signature_hash are unchanged
    const afterRes = await query('SELECT signature_hash, diagnosis FROM clinical_examinations WHERE id = $1', [createdExamId]);
    assert.equal(afterRes.rows[0].signature_hash, originalHash);
    assert.equal(afterRes.rows[0].diagnosis, originalDiagnosis);

    // Fetch full examination with amendments
    const examDetailRes = await request({
      method: 'GET',
      path: `/api/clinical/examinations/${createdExamId}`,
      headers: { Authorization: `Bearer ${dentistAToken}`, 'x-branch-id': branchAId },
    });
    assert.equal(examDetailRes.body.examination.amendments.length, 1);
    assert.equal(examDetailRes.body.examination.amendments[0].amendment_reason, 'Additional periapical X-ray findings and sensitivity report');
  });

  // 6. Rejecting mismatched patient, visit, clinic, branch, or appointment relationships
  test('6. Reject mismatched patient, visit, or appointment relationships', async () => {
    // Create a second patient
    const p2Res = await request({
      method: 'POST',
      path: '/api/patients',
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchAId },
      body: {
        first_name: 'Vikram',
        last_name: 'Malhotra',
        phone: '9822998877',
      },
    });
    const patient2Id = p2Res.body.patient.id;

    // Attempt to link patient2 to visit 1 (which belongs to patient 1)
    const mismatchPatientRes = await request({
      method: 'POST',
      path: '/api/clinical/draft',
      headers: { Authorization: `Bearer ${dentistAToken}`, 'x-branch-id': branchAId },
      body: {
        visit_id: advanceVisitId,
        patient_id: patient2Id,
        chief_complaint: 'Mismatched patient test',
      },
    });
    assert.equal(mismatchPatientRes.status, 400);
    assert.match(mismatchPatientRes.body.message, /Supplied patient_id does not match the visit encounter patient/);

    // Cross-Branch Isolation Guard: Staff assigned only to Branch B cannot access Branch A clinical examination
    const crossBranchRes = await request({
      method: 'GET',
      path: `/api/clinical/examinations/${createdExamId}`,
      headers: { Authorization: `Bearer ${branchBStaffToken}`, 'x-branch-id': branchAId },
    });
    assert.equal(crossBranchRes.status, 403);
  });

  // 7. Handling a walk-in visit without an appointment
  test('7. Handle walk-in visit encounter without an advance appointment', async () => {
    // Quick walk-in registration
    const walkInRes = await request({
      method: 'POST',
      path: '/api/appointments/walk-in',
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchAId },
      body: {
        doctor_id: dentistAId,
        new_patient: {
          first_name: 'Rohan',
          last_name: 'Kulkarni',
          phone: '9876543210',
          gender: 'male',
        },
        chief_complaint: 'Severe fractured incisor emergency',
      },
    });

    assert.equal(walkInRes.status, 201);
    walkInPatientId = walkInRes.body.visit.patient_id;
    walkInVisitId = walkInRes.body.visit.id;

    // Create clinical examination without appointment_id
    const walkInExamRes = await request({
      method: 'POST',
      path: '/api/clinical/draft',
      headers: { Authorization: `Bearer ${dentistAToken}`, 'x-branch-id': branchAId },
      body: {
        visit_id: walkInVisitId,
        patient_id: walkInPatientId,
        appointment_id: null, // explicit walk-in without advance appointment
        chief_complaint: 'Coronal fracture #11 due to bicycle trauma',
        vital_signs: { blood_pressure: '118/76', pulse_bpm: 80 },
        examination_notes: 'Ellis Class II fracture of 11. Dentin exposed. No pulpal exposure. Cold test positive.',
        diagnosis: 'Enamel-Dentin Fracture #11 without pulpal involvement',
        patient_facing_summary: 'Broken front tooth repaired with composite restoration.',
        follow_up_instructions: 'Avoid biting hard foods on front teeth. Recall in 2 weeks for vitality check.',
      },
    });

    assert.equal(walkInExamRes.status, 201);
    assert.equal(walkInExamRes.body.examination.appointment_id, null);
    assert.equal(walkInExamRes.body.examination.visit_id, walkInVisitId);

    // Sign the walk-in examination
    const signWalkIn = await request({
      method: 'POST',
      path: `/api/clinical/examinations/${walkInExamRes.body.examination.id}/sign`,
      headers: { Authorization: `Bearer ${dentistAToken}`, 'x-branch-id': branchAId },
    });
    assert.equal(signWalkIn.status, 200);
    assert.equal(signWalkIn.body.examination.status, 'signed');
  });

  // 8. Keeping unreleased records and internal notes inaccessible to patient-facing access paths
  test('8. Portal gating: unreleased records hidden; internal notes strictly stripped from patient preview', async () => {
    // Initially unreleased: preview returns not released
    const previewUnreleased = await request({
      method: 'GET',
      path: `/api/clinical/visits/${advanceVisitId}/patient-portal-preview`,
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchAId },
    });

    assert.equal(previewUnreleased.status, 200);
    assert.equal(previewUnreleased.body.is_released, false);
    assert.match(previewUnreleased.body.message, /not been authorized or released for patient viewing/);

    // Release to patient portal
    const releaseRes = await request({
      method: 'PATCH',
      path: `/api/clinical/examinations/${createdExamId}/release`,
      headers: { Authorization: `Bearer ${dentistAToken}`, 'x-branch-id': branchAId },
      body: { is_released_to_patient: true },
    });
    assert.equal(releaseRes.status, 200);
    assert.equal(releaseRes.body.examination.is_released_to_patient, true);

    // Now query patient portal preview
    const previewReleased = await request({
      method: 'GET',
      path: `/api/clinical/visits/${advanceVisitId}/patient-portal-preview?patientId=${patientId}`,
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchAId },
    });

    assert.equal(previewReleased.status, 200);
    assert.equal(previewReleased.body.is_released, true);
    assert.ok(previewReleased.body.visit);
    assert.equal(previewReleased.body.visit.patient_facing_summary, 'Severe dental infection in lower left tooth requiring root canal treatment.');
    assert.equal(previewReleased.body.visit.diagnosis, 'Acute Irreversible Pulpitis #36 with Apical Periodontitis');

    // CRITICAL SECURITY ASSERTION: Internal examination_notes must NEVER be exposed in patient projection
    assert.equal(previewReleased.body.visit.examination_notes, undefined);
    assert.equal(JSON.stringify(previewReleased.body).includes('Deep occlusal caries on 36'), false);
  });

  // 9. Maintaining existing appointment, reception, and payment functionality
  test('9. Existing appointment, reception desk, and sequential payment receipts continue working seamlessly', async () => {
    // Collect fee payment for bookedAppointmentId
    const payRes = await request({
      method: 'POST',
      path: `/api/appointments/${bookedAppointmentId}/payments`,
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchAId },
      body: {
        amount_paid: 500.0,
        payment_method: 'upi',
        transaction_reference: 'UPI/APEX/CLINICAL/001',
      },
    });

    assert.equal(payRes.status, 201);
    assert.equal(payRes.body.success, true);
    assert.ok(payRes.body.receipt.receipt_number.startsWith('REC-'));
    assert.equal(parseFloat(payRes.body.receipt.remaining_balance), 0.0);

    // Verify reception metrics still functional
    const metricsRes = await request({
      method: 'GET',
      path: '/api/appointments/reception/metrics',
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchAId },
    });
    assert.equal(metricsRes.status, 200);
    assert.ok(metricsRes.body.metrics);
  });
});
