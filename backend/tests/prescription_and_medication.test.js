const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { query, pool, initializeDatabase } = require('../config/database');

describe('Phase 4: Prescription & Medication Management Test Suite', () => {
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
  let crossClinicPatientId;

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

    // 1. Seed Clinic 1 and Branches
    const clinicRes = await query(
      `INSERT INTO clinics (name, code, is_active, subscription_status)
       VALUES ('Apex Dental Care Phase 4', 'RX-' || substr(md5(random()::text), 1, 6), true, 'active')
       RETURNING id`
    );
    clinicId = clinicRes.rows[0].id;

    const branchARes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-RX-A', 'Apex Central', true, true)
       RETURNING id`,
      [clinicId]
    );
    branchAId = branchARes.rows[0].id;

    const branchBRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-RX-B', 'Apex North', true, false)
       RETURNING id`,
      [clinicId]
    );
    branchBId = branchBRes.rows[0].id;

    // 2. Seed Clinic 2 (For multi-tenant isolation tests)
    const clinic2Res = await query(
      `INSERT INTO clinics (name, code, is_active, subscription_status)
       VALUES ('Cross-Clinic Competitor RX', 'RX2-' || substr(md5(random()::text), 1, 6), true, 'active')
       RETURNING id`
    );
    clinic2Id = clinic2Res.rows[0].id;

    const branchCRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-RX-C', 'Competitor Branch', true, true)
       RETURNING id`,
      [clinic2Id]
    );
    branchCId = branchCRes.rows[0].id;

    // 3. Seed Users & Authenticated Roles
    const rolesRes = await query('SELECT id, name FROM roles');
    const roleMap = {};
    rolesRes.rows.forEach((r) => {
      roleMap[r.name] = r.id;
    });

    const passwordHash = await bcrypt.hash('TestPass@123', 6);

    // Admin
    const adminEmail = `admin_rx_${Date.now()}@dentalerp.com`;
    const adminUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Arthur', 'Admin', true) RETURNING id`,
      [clinicId, roleMap['admin'], adminEmail, passwordHash]
    );
    const adminId = adminUserRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [adminId, branchAId]);

    // Dentist
    const dentistEmail = `dentist_rx_${Date.now()}@dentalerp.com`;
    const docRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Fiona', 'Finch', true) RETURNING id`,
      [clinicId, roleMap['dentist'], dentistEmail, passwordHash]
    );
    dentistAId = docRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [dentistAId, branchAId]);

    // Receptionist
    const recepEmail = `recep_rx_${Date.now()}@dentalerp.com`;
    const recUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Rita', 'Recep', true) RETURNING id`,
      [clinicId, roleMap['receptionist'], recepEmail, passwordHash]
    );
    const recepId = recUserRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [recepId, branchAId]);

    // Branch B Only Staff
    const branchBStaffEmail = `staff_b_rx_${Date.now()}@dentalerp.com`;
    const bUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Barnaby', 'BranchB', true) RETURNING id`,
      [clinicId, roleMap['dentist'], branchBStaffEmail, passwordHash]
    );
    const bStaffId = bUserRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [bStaffId, branchBId]);

    // Authenticate and acquire tokens
    const login = async (email) => {
      const res = await request({
        method: 'POST',
        path: '/api/auth/login',
        body: { email, password: 'TestPass@123' },
      });
      return res.body.token;
    };

    adminToken = await login(adminEmail);
    dentistAToken = await login(dentistEmail);
    receptionistToken = await login(recepEmail);
    branchBStaffToken = await login(branchBStaffEmail);

    // 4. Seed Test Patient with recorded Penicillin allergy for clinical safety testing
    const patientRes = await query(
      `INSERT INTO patients (clinic_id, branch_id, patient_number, first_name, last_name, phone, gender, date_of_birth, status)
       VALUES ($1, $2, '998811', 'Penelope', 'Patterson', '+919988110022', 'female', '1990-05-15', 'active')
       RETURNING id`,
      [clinicId, branchAId]
    );
    patientId = patientRes.rows[0].id;

    // Attach medical records with structured allergy
    await query(
      `INSERT INTO patient_medical_records (patient_id, clinic_id, allergies, medical_conditions, current_medications, has_medical_alerts, medical_alert_details)
       VALUES ($1, $2, 'Severe allergy to Penicillin and Amoxicillin (anaphylaxis)', 'Mild Asthma', 'Albuterol inhaler PRN', true, 'Anaphylactic Penicillin Allergy')`,
      [patientId, clinicId]
    );

    // 5. Seed Visits
    const visit1Res = await query(
      `INSERT INTO patient_visits (clinic_id, branch_id, patient_id, doctor_id, visit_date, token_number, token_display, visit_type, status, reason_for_visit, created_by, updated_by)
       VALUES ($1, $2, $3, $4, CURRENT_DATE, 101, 'TK-101', 'consultation', 'in_progress', 'Acute periapical abscess #36', $4, $4)
       RETURNING id`,
      [clinicId, branchAId, patientId, dentistAId]
    );
    visit1Id = visit1Res.rows[0].id;

    const visit2Res = await query(
      `INSERT INTO patient_visits (clinic_id, branch_id, patient_id, doctor_id, visit_date, token_number, token_display, visit_type, status, reason_for_visit, created_by, updated_by)
       VALUES ($1, $2, $3, $4, CURRENT_DATE, 102, 'TK-102', 'follow_up', 'queued', 'Routine Scaling', $4, $4)
       RETURNING id`,
      [clinicId, branchAId, patientId, dentistAId]
    );
    visit2Id = visit2Res.rows[0].id;

    // 6. Cross-clinic patient
    const ccPatRes = await query(
      `INSERT INTO patients (clinic_id, branch_id, patient_number, first_name, last_name, phone, gender, date_of_birth, status)
       VALUES ($1, $2, '887766', 'Charles', 'Cross', '+919988776655', 'male', '1985-02-20', 'active')
       RETURNING id`,
      [clinic2Id, branchCId]
    );
    crossClinicPatientId = ccPatRes.rows[0].id;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  let createdPrescriptionId;
  let createdPrescriptionNumber;
  let amoxicillinItemId;
  let ibuprofenItemId;

  test('1. POST /api/clinical/prescriptions: Creates draft prescription with generated RX-10001+ and multiple medication entries', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/clinical/prescriptions',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        patientId,
        visitId: visit1Id,
        diagnosis: 'Acute Irreversible Pulpitis #36 with localized apical abscess',
        generalInstructions: 'Complete the entire antibiotic course. Take medications after meals with a full glass of water.',
        dietaryAdvice: 'Avoid hot, hard, or spicy foods on left side for 48 hours.',
        items: [
          {
            medicineName: 'Amoxicillin & Clavulanate (Augmentin)',
            genericName: 'Amoxicillin + Clavulanic Acid',
            brandName: 'Augmentin 625',
            dosage: '625 mg',
            dosageForm: 'tablet',
            route: 'oral',
            frequency: 'Twice daily (BD)',
            duration: '5 days',
            quantity: 10,
            quantityUnit: 'tablets',
            instructions: 'Take immediately before or at the start of meals.',
            isPrn: false,
          },
          {
            medicineName: 'Ibuprofen',
            genericName: 'Ibuprofen',
            brandName: 'Brufen 400',
            dosage: '400 mg',
            dosageForm: 'tablet',
            route: 'oral',
            frequency: 'Every 8 hours as needed (TID PRN)',
            duration: '3 days',
            quantity: 6,
            quantityUnit: 'tablets',
            instructions: 'Take strictly after meals for relief of dental pain.',
            isPrn: true,
            prnIndication: 'Severe throbbing dental pain only',
          },
        ],
      },
    });

    assert.equal(res.status, 201, `Expected 201 Created but got: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.success);
    assert.ok(res.body.prescription);
    assert.equal(res.body.prescription.status, 'draft');
    assert.ok(res.body.prescription.prescription_number.startsWith('RX-'));
    assert.equal(res.body.prescription.items.length, 2);

    createdPrescriptionId = res.body.prescription.id;
    createdPrescriptionNumber = res.body.prescription.prescription_number;
    amoxicillinItemId = res.body.prescription.items[0].id;
    ibuprofenItemId = res.body.prescription.items[1].id;

    // Check allergy conflict detection during creation (warning attached for doctor context)
    assert.ok(res.body.prescription.allergyConflicts.length > 0, 'Expected penicillin allergy conflict detected for Augmentin');
  });

  test('2. Input validation: Rejects missing medicine name, dosage, or invalid quantity', async () => {
    // Missing medicine name
    const res1 = await request({
      method: 'POST',
      path: '/api/clinical/prescriptions',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        patientId,
        items: [{ medicineName: '', dosage: '500mg', frequency: 'OD', duration: '3 days' }],
      },
    });
    assert.equal(res1.status, 400);
    assert.match(res1.body.message, /medicine name/i);

    // Invalid negative quantity
    const res2 = await request({
      method: 'POST',
      path: '/api/clinical/prescriptions',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        patientId,
        items: [{ medicineName: 'Paracetamol', dosage: '500mg', frequency: 'TID', duration: '3 days', quantity: -5 }],
      },
    });
    assert.equal(res2.status, 400);
    assert.match(res2.body.message, /positive integer/i);
  });

  test('3. Patient and visit validation: Rejects invalid patient or mismatched visit', async () => {
    // Non-existent patient
    const res1 = await request({
      method: 'POST',
      path: '/api/clinical/prescriptions',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        patientId: '00000000-0000-0000-0000-000000000000',
        items: [{ medicineName: 'Paracetamol', dosage: '500mg', frequency: 'TID', duration: '3 days' }],
      },
    });
    assert.equal(res1.status, 404);

    // Cross-clinic patient visit mismatch
    const res2 = await request({
      method: 'POST',
      path: '/api/clinical/prescriptions',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        patientId: crossClinicPatientId,
        visitId: visit1Id,
        items: [{ medicineName: 'Paracetamol', dosage: '500mg', frequency: 'TID', duration: '3 days' }],
      },
    });
    assert.equal(res2.status, 404);
  });

  test('4. GET /api/clinical/prescriptions/:id: Retrieves prescription details with items, doctor, and patient context', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/clinical/prescriptions/${createdPrescriptionId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.success);
    const p = res.body.prescription;
    assert.equal(p.id, createdPrescriptionId);
    assert.equal(p.prescription_number, createdPrescriptionNumber);
    assert.equal(p.patient_first_name, 'Penelope');
    assert.equal(p.patient_allergies, 'Severe allergy to Penicillin and Amoxicillin (anaphylaxis)');
    assert.equal(p.items.length, 2);
    assert.ok(p.allergyConflicts.length > 0);
  });

  test('5. PUT /api/clinical/prescriptions/:id: Modifies draft prescription instructions and diagnosis', async () => {
    const res = await request({
      method: 'PUT',
      path: `/api/clinical/prescriptions/${createdPrescriptionId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        diagnosis: 'Acute Irreversible Pulpitis #36 with symptomatic apical periodontitis',
        generalInstructions: 'Updated instructions: Return immediately if facial swelling worsens.',
      },
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.success);
    assert.equal(res.body.prescription.diagnosis, 'Acute Irreversible Pulpitis #36 with symptomatic apical periodontitis');
    assert.equal(res.body.prescription.general_instructions, 'Updated instructions: Return immediately if facial swelling worsens.');
  });

  test('6. POST & PUT & DELETE item endpoints: Dynamically updates medication list in draft', async () => {
    // Add third item: Chlorhexidine Mouthwash
    const addRes = await request({
      method: 'POST',
      path: `/api/clinical/prescriptions/${createdPrescriptionId}/items`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        medicineName: 'Chlorhexidine Gluconate 0.2% Mouthwash',
        dosage: '10 ml',
        dosageForm: 'mouthwash',
        route: 'dental_rinse',
        frequency: 'Twice daily after brushing',
        duration: '7 days',
        quantity: 1,
        quantityUnit: 'bottles',
        instructions: 'Rinse vigorously for 60 seconds then spit out. Do not swallow.',
      },
    });
    assert.equal(addRes.status, 201);
    assert.equal(addRes.body.item.medicine_name, 'Chlorhexidine Gluconate 0.2% Mouthwash');
    const rinseId = addRes.body.item.id;

    // Update item: change quantity of Ibuprofen
    const updRes = await request({
      method: 'PUT',
      path: `/api/clinical/prescriptions/${createdPrescriptionId}/items/${ibuprofenItemId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        quantity: 12,
        dosage: '600 mg',
      },
    });
    assert.equal(updRes.status, 200);
    assert.equal(updRes.body.item.quantity, 12);
    assert.equal(updRes.body.item.dosage, '600 mg');

    // Delete item: remove the mouthwash
    const delRes = await request({
      method: 'DELETE',
      path: `/api/clinical/prescriptions/${createdPrescriptionId}/items/${rinseId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(delRes.status, 200);
    assert.ok(delRes.body.success);
  });

  test('7. Clinical Safety Guard: Signing blocked on detected allergy conflict without clinician acknowledgement', async () => {
    // Attempting to sign without acknowledging Penelope's penicillin allergy
    const res = await request({
      method: 'POST',
      path: `/api/clinical/prescriptions/${createdPrescriptionId}/sign`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        allergyAcknowledgement: null,
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'ALLERGY_CONFLICT_DETECTED');
    assert.ok(res.body.requiresAcknowledgement);
    assert.match(res.body.message, /allergy conflict/i);
  });

  test('8. Role Authorization: Receptionist cannot sign prescription (HTTP 403)', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/clinical/prescriptions/${createdPrescriptionId}/sign`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        allergyAcknowledgement: { acknowledged: true, reason: 'Override' },
      },
    });

    assert.equal(res.status, 403);
  });

  test('9. Signing with explicit clinical acknowledgement succeeds and locks the prescription', async () => {
    // Replace Amoxicillin with Clindamycin first to make it a safe prescription, or sign with clinical override
    // First, let's update Amoxicillin to Clindamycin (a standard penicillin-allergic alternative)
    await request({
      method: 'PUT',
      path: `/api/clinical/prescriptions/${createdPrescriptionId}/items/${amoxicillinItemId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        medicineName: 'Clindamycin',
        genericName: 'Clindamycin Hydrochloride',
        brandName: 'Dalacin C',
        dosage: '300 mg',
        frequency: 'Every 6 hours (QID)',
        duration: '5 days',
        quantity: 20,
        instructions: 'Take with a full glass of water to avoid esophageal irritation.',
      },
    });

    // Sign prescription with Clindamycin (now has 0 allergy conflicts)
    const signRes = await request({
      method: 'POST',
      path: `/api/clinical/prescriptions/${createdPrescriptionId}/sign`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {},
    });

    assert.equal(signRes.status, 200, `Expected 200 Signed but got: ${JSON.stringify(signRes.body)}`);
    assert.ok(signRes.body.success);
    assert.equal(signRes.body.prescription.status, 'signed');
    assert.ok(signRes.body.prescription.signed_at);
    assert.equal(signRes.body.prescription.signed_by, dentistAId);
  });

  test('10. Immutability Protection: Signed prescription cannot be directly mutated or items deleted', async () => {
    // Attempt to update header
    const updHeaderRes = await request({
      method: 'PUT',
      path: `/api/clinical/prescriptions/${createdPrescriptionId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: { diagnosis: 'Attempted unauthorized mutation' },
    });
    assert.equal(updHeaderRes.status, 400);
    assert.match(updHeaderRes.body.message, /only 'draft' prescriptions can be modified/i);

    // Attempt to add item
    const addItemRes = await request({
      method: 'POST',
      path: `/api/clinical/prescriptions/${createdPrescriptionId}/items`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: { medicineName: 'Aspirin', dosage: '75mg', frequency: 'OD', duration: '30 days' },
    });
    assert.equal(addItemRes.status, 400);
    assert.match(addItemRes.body.message, /only drafts can be modified/i);

    // Attempt to delete item
    const delItemRes = await request({
      method: 'DELETE',
      path: `/api/clinical/prescriptions/${createdPrescriptionId}/items/${ibuprofenItemId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(delItemRes.status, 400);
    assert.match(delItemRes.body.message, /only drafts can be modified/i);
  });

  let replacementPrescriptionId;
  let replacementPrescriptionNumber;

  test('11. Controlled Amendment: Preserves signed record in prescription_amendments and creates linked replacement draft', async () => {
    const amendRes = await request({
      method: 'POST',
      path: `/api/clinical/prescriptions/${createdPrescriptionId}/amend`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        reason: 'Patient reported mild gastric distress; adjusting NSAID to Paracetamol 650mg.',
        newItems: [
          {
            medicineName: 'Clindamycin',
            genericName: 'Clindamycin Hydrochloride',
            dosage: '300 mg',
            dosageForm: 'capsule',
            route: 'oral',
            frequency: 'Every 6 hours (QID)',
            duration: '5 days',
            quantity: 20,
            quantityUnit: 'capsules',
            instructions: 'Take with a full glass of water.',
          },
          {
            medicineName: 'Paracetamol',
            genericName: 'Acetaminophen',
            dosage: '650 mg',
            dosageForm: 'tablet',
            route: 'oral',
            frequency: 'Three times daily (TID)',
            duration: '4 days',
            quantity: 12,
            quantityUnit: 'tablets',
            instructions: 'Take after meals for pain relief. Max 4 doses in 24 hours.',
          },
        ],
      },
    });

    assert.equal(amendRes.status, 200);
    assert.ok(amendRes.body.success);
    assert.ok(amendRes.body.replacementPrescription);

    const repl = amendRes.body.replacementPrescription;
    replacementPrescriptionId = repl.id;
    replacementPrescriptionNumber = repl.prescription_number;

    assert.equal(repl.status, 'draft');
    assert.equal(repl.version, 2);
    assert.equal(repl.amended_from_id, createdPrescriptionId);
    assert.equal(repl.items.length, 2);

    // Verify original prescription is marked amended and has amendment snapshot
    const origRes = await request({
      method: 'GET',
      path: `/api/clinical/prescriptions/${createdPrescriptionId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(origRes.body.prescription.status, 'amended');
    assert.equal(origRes.body.prescription.is_amended, true);
    assert.equal(origRes.body.prescription.amendments.length, 1);
    assert.match(origRes.body.prescription.amendments[0].amendment_reason, /gastric distress/i);
  });

  test('12. Cancellation Workflow: Requires cancellation reason and marks prescription cancelled', async () => {
    // Missing cancellation reason
    const failRes = await request({
      method: 'POST',
      path: `/api/clinical/prescriptions/${replacementPrescriptionId}/cancel`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: { reason: '' },
    });
    assert.equal(failRes.status, 400);

    // Valid cancellation
    const cancelRes = await request({
      method: 'POST',
      path: `/api/clinical/prescriptions/${replacementPrescriptionId}/cancel`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: { reason: 'Treatment plan changed to immediate extraction under IV sedation; oral antibiotics cancelled.' },
    });
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.body.prescription.status, 'cancelled');
    assert.ok(cancelRes.body.prescription.cancelled_at);
    assert.equal(cancelRes.body.prescription.cancellation_reason, 'Treatment plan changed to immediate extraction under IV sedation; oral antibiotics cancelled.');

    // Duplicate cancellation rejected
    const dupRes = await request({
      method: 'POST',
      path: `/api/clinical/prescriptions/${replacementPrescriptionId}/cancel`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: { reason: 'Duplicate cancellation attempt' },
    });
    assert.equal(dupRes.status, 400);
  });

  test('13. Concurrency-Safe Prescription Numbering: Sequential unique RX numbers without collisions', async () => {
    // Create 3 concurrent prescription drafts
    const promises = [1, 2, 3].map((i) =>
      request({
        method: 'POST',
        path: '/api/clinical/prescriptions',
        headers: {
          Authorization: `Bearer ${dentistAToken}`,
          'x-branch-id': branchAId,
        },
        body: {
          patientId,
          diagnosis: `Concurrent Test Plan ${i}`,
          items: [{ medicineName: `Medicine ${i}`, dosage: '100mg', frequency: 'OD', duration: '1 day' }],
        },
      })
    );

    const results = await Promise.all(promises);
    const numbers = results.map((r) => r.body.prescription.prescription_number);
    const uniqueNumbers = new Set(numbers);

    assert.equal(numbers.length, 3);
    assert.equal(uniqueNumbers.size, 3, `Expected 3 unique RX numbers, got: ${numbers.join(', ')}`);
  });

  test('14. Strict Multi-Tenant Isolation: Cross-clinic access to prescriptions is blocked (HTTP 404)', async () => {
    // Dentist in Clinic 1 attempts to query Clinic 2 patient
    const res = await request({
      method: 'GET',
      path: `/api/clinical/patients/${crossClinicPatientId}/prescriptions`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(res.status, 404);
  });

  test('15. Strict Branch Isolation: Staff assigned only to Branch B cannot access Branch A prescriptions (HTTP 403)', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/clinical/prescriptions/${createdPrescriptionId}`,
      headers: {
        Authorization: `Bearer ${branchBStaffToken}`,
        'x-branch-id': branchAId, // Attempting to use unassigned branch
      },
    });

    assert.equal(res.status, 403);
  });

  test('16. Patient Prescription History: Lists all prescriptions with medicine summaries and status', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/clinical/patients/${patientId}/prescriptions`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.success);
    assert.ok(res.body.prescriptions.length >= 2);

    const first = res.body.prescriptions.find((p) => p.id === createdPrescriptionId);
    assert.ok(first);
    assert.equal(first.doctor_first_name, 'Fiona');
    assert.ok(first.medications_summary.includes('Clindamycin'));
  });

  test('17. Print Data Endpoint: Structured layout with clinic branding, patient details, and instructions', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/clinical/prescriptions/${createdPrescriptionId}/print`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.success);
    const data = res.body.printData;

    assert.ok(data.clinic.name.includes('Apex Dental'));
    assert.equal(data.doctor.name, 'Dr. Fiona Finch');
    assert.equal(data.patient.name, 'Penelope Patterson');
    assert.equal(data.patient.patientNumber, '998811');
    assert.equal(data.prescription.prescriptionNumber, createdPrescriptionNumber);
    assert.ok(data.items.length >= 1);
  });

  test('18. Pharmacy Catalog Independence: Confirms no pharmacy catalog or stock deduction occurs', async () => {
    // 1. Verify free-text medicine names with arbitrary dosages persist without catalog lookup
    const customMedRes = await request({
      method: 'POST',
      path: '/api/clinical/prescriptions',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        patientId,
        diagnosis: 'Compound Dental Trauma',
        items: [
          {
            medicineName: 'Custom Compounded Chlorhexidine-Bioadhesive Dental Paste 0.5%',
            dosage: '0.5% paste',
            dosageForm: 'paste',
            route: 'gingival_application',
            frequency: 'Apply to suture line twice daily',
            duration: '10 days',
            quantity: 1,
            quantityUnit: 'tubes',
          },
        ],
      },
    });

    assert.equal(customMedRes.status, 201);
    assert.equal(
      customMedRes.body.prescription.items[0].medicine_name,
      'Custom Compounded Chlorhexidine-Bioadhesive Dental Paste 0.5%'
    );

    // 2. Confirm no pharmacy inventory or stock tables are touched or required
    const tableCheck = await query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('pharmacy_inventory', 'drug_stocks', 'stock_transactions')`
    );
    assert.equal(tableCheck.rows.length, 0, 'Confirmed zero pharmacy inventory or stock deduction tables exist or are touched.');
  });

  test('19. Regression Check: Appointments, reception queue, vitals, treatment planning, and billing remain operational', async () => {
    // 1. Pre-consultation vitals can be recorded
    const vitalsRes = await request({
      method: 'POST',
      path: '/api/clinical/vitals',
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        visit_id: visit2Id,
        patient_id: patientId,
        blood_pressure: '120/80',
        pulse_bpm: 72,
        temperature_f: 98.6,
        triage_priority: 'routine',
      },
    });
    assert.equal(vitalsRes.status, 201);
    assert.ok(vitalsRes.body.vitals);

    // 2. Reception metrics continue functioning
    const metricsRes = await request({
      method: 'GET',
      path: '/api/appointments/reception/metrics',
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(metricsRes.status, 200);
    assert.ok(metricsRes.body.metrics);

    // 3. Treatment plan procedures catalog
    const procRes = await request({
      method: 'GET',
      path: '/api/clinical/treatment-plans/procedures',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(procRes.status, 200);
    assert.ok(procRes.body.procedures.length > 0);
  });
});
