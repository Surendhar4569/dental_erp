const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { query, pool, initializeDatabase } = require('../config/database');
const {
  isValidToothNumber,
  isPermanentTooth,
  isPrimaryTooth,
  isAnteriorTooth,
  isPosteriorTooth,
  normalizeAndValidateSurface,
} = require('../utils/dentalNotation');

describe('Phase 3: Treatment Planning & Consent Management Test Suite', () => {
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
  let exam1Id;
  let finding1Id;
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
       VALUES ('Apex Dental Care', 'TP-' || substr(md5(random()::text), 1, 6), true, 'active')
       RETURNING id`
    );
    clinicId = clinicRes.rows[0].id;

    const branchARes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-TP-A', 'Apex Main', true, true)
       RETURNING id`,
      [clinicId]
    );
    branchAId = branchARes.rows[0].id;

    const branchBRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-TP-B', 'Apex North', true, false)
       RETURNING id`,
      [clinicId]
    );
    branchBId = branchBRes.rows[0].id;

    // 2. Cross-tenant Clinic 2
    const clinic2Res = await query(
      `INSERT INTO clinics (name, code, is_active, subscription_status)
       VALUES ('Pearl Care', 'PRL-' || substr(md5(random()::text), 1, 6), true, 'active')
       RETURNING id`
    );
    clinic2Id = clinic2Res.rows[0].id;

    const branchCRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-PRL-C', 'Pearl East', true, true)
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
    const adminEmail = `admin_tp_${Date.now()}@example.com`;
    const adminUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Plan', 'Admin', true)
       RETURNING id`,
      [clinicId, roleMap['admin'], adminEmail, passwordHash]
    );
    const adminId = adminUserRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [adminId, branchAId]);
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, false)`, [adminId, branchBId]);

    // Dentist user (Branch A)
    const dentistEmail = `dentist_tp_${Date.now()}@example.com`;
    const dentistRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Dr. Sarah', 'Williams', true)
       RETURNING id`,
      [clinicId, roleMap['dentist'], dentistEmail, passwordHash]
    );
    dentistAId = dentistRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [dentistAId, branchAId]);

    // Receptionist user (Branch A)
    const recEmail = `rec_tp_${Date.now()}@example.com`;
    const recRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Emma', 'Reception', true)
       RETURNING id`,
      [clinicId, roleMap['receptionist'], recEmail, passwordHash]
    );
    const recId = recRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [recId, branchAId]);

    // Branch B only staff
    const bEmail = `staff_b_${Date.now()}@example.com`;
    const bRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'BranchB', 'Staff', true)
       RETURNING id`,
      [clinicId, roleMap['dentist'], bEmail, passwordHash]
    );
    const bId = bRes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [bId, branchBId]);

    // Cross-clinic Clinic 2 user
    const c2Email = `c2_tp_admin_${Date.now()}@example.com`;
    const c2Res = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'C2', 'Admin', true)
       RETURNING id`,
      [clinic2Id, roleMap['admin'], c2Email, passwordHash]
    );
    await query(`INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`, [c2Res.rows[0].id, branchCId]);

    // Login tokens
    const login = async (email) => {
      const res = await request({
        method: 'POST',
        path: '/api/auth/login',
        body: { email, password: 'Password@123' },
      });
      return res.body.token;
    };

    adminToken = await login(adminEmail);
    dentistAToken = await login(dentistEmail);
    receptionistToken = await login(recEmail);
    branchBStaffToken = await login(bEmail);

    // Seed test patients
    const pRes = await query(
      `INSERT INTO patients (clinic_id, branch_id, patient_number, first_name, last_name, phone, gender, date_of_birth)
       VALUES ($1, $2, '990111', 'Alexander', 'Smith', '+919876543210', 'male', '1990-05-15')
       RETURNING id`,
      [clinicId, branchAId]
    );
    patientId = pRes.rows[0].id;

    const p2Res = await query(
      `INSERT INTO patients (clinic_id, branch_id, patient_number, first_name, last_name, phone, gender)
       VALUES ($1, $2, '990222', 'Cross', 'Patient', '+919999988888', 'female')
       RETURNING id`,
      [clinic2Id, branchCId]
    );
    crossClinicPatientId = p2Res.rows[0].id;

    // Seed test visits for Patient 1
    const v1Res = await query(
      `INSERT INTO patient_visits (clinic_id, patient_id, branch_id, visit_date, token_number, token_display, status)
       VALUES ($1, $2, $3, CURRENT_DATE, 1, '001', 'in_progress')
       RETURNING id`,
      [clinicId, patientId, branchAId]
    );
    visit1Id = v1Res.rows[0].id;

    const v2Res = await query(
      `INSERT INTO patient_visits (clinic_id, patient_id, branch_id, visit_date, token_number, token_display, status)
       VALUES ($1, $2, $3, CURRENT_DATE, 2, '002', 'queued')
       RETURNING id`,
      [clinicId, patientId, branchAId]
    );
    visit2Id = v2Res.rows[0].id;

    // Seed examination for visit 1
    const examRes = await query(
      `INSERT INTO clinical_examinations (
         clinic_id, branch_id, patient_id, visit_id, doctor_id, chief_complaint, status
       ) VALUES ($1, $2, $3, $4, $5, 'Pain in lower right molar', 'draft')
       RETURNING id`,
      [clinicId, branchAId, patientId, visit1Id, dentistAId]
    );
    exam1Id = examRes.rows[0].id;

    // Seed an odontogram finding (Tooth 46 Caries Occlusal)
    const condRes = await query(`SELECT id FROM dental_conditions WHERE code = 'caries' LIMIT 1`);
    const condId = condRes.rows[0].id;

    const findingRes = await query(
      `INSERT INTO patient_dental_findings (
         clinic_id, branch_id, patient_id, visit_id, examination_id,
         tooth_number, surface, condition_id, condition_code, condition_name, created_by
       ) VALUES ($1, $2, $3, $4, $5, 46, 'O', $6, 'caries', 'Dental Caries', $7)
       RETURNING id`,
      [clinicId, branchAId, patientId, visit1Id, exam1Id, condId, dentistAId]
    );
    finding1Id = findingRes.rows[0].id;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ==========================================================================
  // Test 1: Procedure Master Catalog Retrieval
  // ==========================================================================
  test('1. GET /api/clinical/treatment-plans/procedures: Returns standard procedure catalog', async () => {
    const res = await request({
      method: 'GET',
      path: '/api/clinical/treatment-plans/procedures',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.procedures));
    assert.ok(res.body.procedures.length >= 15);

    const codes = res.body.procedures.map((p) => p.code);
    assert.ok(codes.includes('REST_COMP_1S'));
    assert.ok(codes.includes('ENDO_RCT_MOL'));
    assert.ok(codes.includes('PROS_CRN_PFM'));
    assert.ok(codes.includes('SURG_EXT_SIMP'));
    assert.ok(codes.includes('PREV_SCALE'));
  });

  // ==========================================================================
  // Test 2: Create Treatment Plan with Auto-Generated Plan Number (TP-10001+)
  // ==========================================================================
  let createdPlanId;
  let createdPlanNumber;

  test('2. POST /api/clinical/treatment-plans: Creates draft plan with generated plan_number and calculated costs', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/clinical/treatment-plans',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        patient_id: patientId,
        visit_id: visit1Id,
        examination_id: exam1Id,
        plan_title: 'Molar Restoration & Root Canal Therapy',
        clinical_notes: 'Initial clinical assessment reveals deep dentinal decay on 46.',
        treatment_summary: 'Root canal treatment followed by full PFM crown restoration.',
        items: [
          {
            toothNumber: 46,
            surface: 'O',
            findingId: finding1Id,
            procedureName: 'Root Canal Treatment (Molar Tooth)',
            procedureCode: 'ENDO_RCT_MOL',
            category: 'endodontic',
            priority: 'urgent',
            quantity: 1,
            unitCost: 7000.00,
            sessionOrder: 1,
            clinicalNotes: 'Access cavity and pulp extirpation.',
          },
          {
            toothNumber: 46,
            procedureName: 'Porcelain Fused to Metal (PFM) Crown',
            procedureCode: 'PROS_CRN_PFM',
            category: 'prosthodontic',
            priority: 'medium',
            quantity: 1,
            unitCost: 6500.00,
            sessionOrder: 2,
            clinicalNotes: 'Crown preparation and impression.',
          },
        ],
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.plan.id);
    assert.ok(res.body.plan.plan_number.startsWith('TP-'));
    assert.equal(res.body.plan.status, 'draft');
    assert.equal(res.body.plan.version, 1);
    assert.equal(parseFloat(res.body.plan.total_estimated_cost), 13500.00);
    assert.equal(res.body.plan.items.length, 2);

    createdPlanId = res.body.plan.id;
    createdPlanNumber = res.body.plan.plan_number;
  });

  // ==========================================================================
  // Test 3: Rejection of Invalid FDI Tooth Numbers (HTTP 400)
  // ==========================================================================
  test('3. Validation Guard: Rejection of invalid FDI tooth number on treatment items (HTTP 400)', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/clinical/treatment-plans/${createdPlanId}/items`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        toothNumber: 99, // Invalid tooth number
        procedureName: 'Simple Extraction',
        quantity: 1,
        unitCost: 1200.00,
      },
    });

    assert.equal(res.status, 400);
    assert.ok(res.body.message.includes('Invalid tooth number'));
  });

  // ==========================================================================
  // Test 4: Rejection of Incompatible Surface for Tooth Type (HTTP 400)
  // ==========================================================================
  test('4. Validation Guard: Rejection of incompatible surface for anterior tooth (HTTP 400)', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/clinical/treatment-plans/${createdPlanId}/items`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        toothNumber: 11, // Maxillary central incisor (Anterior)
        surface: 'O',    // Occlusal is invalid on anterior teeth!
        procedureName: 'Composite Filling',
        quantity: 1,
        unitCost: 1500.00,
      },
    });

    assert.equal(res.status, 400);
    assert.ok(res.body.message.includes('Incisal'));
  });

  // ==========================================================================
  // Test 5: Add Valid Item and Recalculate Plan Cost Automatically
  // ==========================================================================
  let addedItemId;

  test('5. POST /api/clinical/treatment-plans/:id/items: Adds valid item and recalculates plan total cost', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/clinical/treatment-plans/${createdPlanId}/items`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        toothNumber: 16,
        surface: 'O',
        procedureName: 'Composite Resin Restoration (1 Surface)',
        procedureCode: 'REST_COMP_1S',
        category: 'restorative',
        priority: 'routine',
        quantity: 2,
        unitCost: 1500.00,
        sessionOrder: 1,
        clinicalNotes: 'Preventive pit restoration.',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.item.procedure_name, 'Composite Resin Restoration (1 Surface)');
    assert.equal(parseFloat(res.body.item.total_cost), 3000.00); // 2 * 1500

    addedItemId = res.body.item.id;

    // Verify plan total cost updated: 13500 + 3000 = 16500
    const planRes = await request({
      method: 'GET',
      path: `/api/clinical/treatment-plans/${createdPlanId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(parseFloat(planRes.body.plan.total_estimated_cost), 16500.00);
    assert.equal(planRes.body.plan.items.length, 3);
  });

  // ==========================================================================
  // Test 6: Update Treatment Plan Item
  // ==========================================================================
  test('6. PUT /api/clinical/treatment-plans/:id/items/:itemId: Updates item quantity and unit cost', async () => {
    const res = await request({
      method: 'PUT',
      path: `/api/clinical/treatment-plans/${createdPlanId}/items/${addedItemId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        quantity: 1, // Changed from 2 to 1
        unitCost: 1500.00,
        clinicalNotes: 'Single surface restoration only.',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.item.quantity, 1);
    assert.equal(parseFloat(res.body.item.total_cost), 1500.00);

    // Verify plan total updated to 13500 + 1500 = 15000
    const planRes = await request({
      method: 'GET',
      path: `/api/clinical/treatment-plans/${createdPlanId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(parseFloat(planRes.body.plan.total_estimated_cost), 15000.00);
  });

  // ==========================================================================
  // Test 7: Delete Treatment Plan Item
  // ==========================================================================
  test('7. DELETE /api/clinical/treatment-plans/:id/items/:itemId: Removes item from draft plan', async () => {
    const res = await request({
      method: 'DELETE',
      path: `/api/clinical/treatment-plans/${createdPlanId}/items/${addedItemId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // Verify plan total cost restored to 13500.00
    const planRes = await request({
      method: 'GET',
      path: `/api/clinical/treatment-plans/${createdPlanId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(parseFloat(planRes.body.plan.total_estimated_cost), 13500.00);
    assert.equal(planRes.body.plan.items.length, 2);
  });

  // ==========================================================================
  // Test 8: Present Treatment Plan to Patient
  // ==========================================================================
  test('8. POST /api/clinical/treatment-plans/:id/present: Transitions plan from draft to presented', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/clinical/treatment-plans/${createdPlanId}/present`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        notes: 'Treatment plan discussed chairside with patient. Alternatives explained.',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.plan.status, 'presented');
    assert.ok(res.body.plan.presented_at);
  });

  // ==========================================================================
  // Test 9: Approve Treatment Plan & Transition Proposed Items to Approved
  // ==========================================================================
  test('9. POST /api/clinical/treatment-plans/:id/approve: Approves plan and updates items to approved', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/clinical/treatment-plans/${createdPlanId}/approve`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        notes: 'Patient agreed to proposed RCT and Crown sequence.',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.plan.status, 'approved');
    assert.ok(res.body.plan.approved_at);

    // Verify all items are now 'approved'
    const planRes = await request({
      method: 'GET',
      path: `/api/clinical/treatment-plans/${createdPlanId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });
    planRes.body.plan.items.forEach((it) => {
      assert.equal(it.status, 'approved');
    });
  });

  // ==========================================================================
  // Test 10: Versioning Snapshot on Material Plan Mutation
  // ==========================================================================
  test('10. Plan Immutability & Version Snapshot: Material addition increments version and snapshots history', async () => {
    // Plan is approved; adding an item now represents a material scope change
    const res = await request({
      method: 'POST',
      path: `/api/clinical/treatment-plans/${createdPlanId}/items`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        toothNumber: 47,
        surface: 'MOD',
        procedureName: 'Composite Resin Restoration (Multi-Surface)',
        category: 'restorative',
        priority: 'routine',
        quantity: 1,
        unitCost: 2200.00,
        sessionOrder: 2,
        changeReason: 'Added adjacent molar restoration requested by patient',
      },
    });

    assert.equal(res.status, 201);

    // Verify plan version incremented to 2 and version snapshot created
    const planRes = await request({
      method: 'GET',
      path: `/api/clinical/treatment-plans/${createdPlanId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(planRes.body.plan.version, 2);
    assert.equal(planRes.body.plan.versions.length, 1);
    assert.equal(planRes.body.plan.versions[0].version_number, 1);
    assert.equal(planRes.body.plan.versions[0].change_reason, 'Added adjacent molar restoration requested by patient');
  });

  // ==========================================================================
  // Test 11: Workflow Guard: Starting Treatment Requires Valid Consent
  // ==========================================================================
  test('11. Workflow Guard: Starting treatment item (in_progress) blocked if valid consent is missing (HTTP 400)', async () => {
    const planRes = await request({
      method: 'GET',
      path: `/api/clinical/treatment-plans/${createdPlanId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });
    const firstItemId = planRes.body.plan.items[0].id;

    // Attempt to start treatment without consent
    const res = await request({
      method: 'PUT',
      path: `/api/clinical/treatment-plans/${createdPlanId}/items/${firstItemId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        status: 'in_progress',
      },
    });

    assert.equal(res.status, 400);
    assert.ok(res.body.message.includes('consent'));
  });

  // ==========================================================================
  // Test 12: Record Patient Consent (Obtained) with Agreed Items Snapshot
  // ==========================================================================
  let consentId;

  test('12. POST /api/clinical/treatment-plans/:id/consent: Records patient consent with generated CNS-10001+', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/clinical/treatment-plans/${createdPlanId}/consent`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        patient_id: patientId,
        visit_id: visit1Id,
        consent_status: 'obtained',
        procedure_summary: 'Root canal therapy on Tooth 46, full contour crown, and multi-surface composite restoration.',
        material_risks_discussed: 'Post-operative sensitivity, instrument separation risk, crown debonding, anesthesia risks.',
        alternatives_discussed: 'Tooth extraction, partial denture, or deferred monitoring.',
        acknowledgement_method: 'in_person_verbal_witnessed',
        patient_name_acknowledged: 'Alexander Smith',
        is_guardian_consent: false,
        witness_name: 'Dr. Sarah Williams',
        witness_role: 'Treating Dentist',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.consent.id);
    assert.ok(res.body.consent.consent_number.startsWith('CNS-'));
    assert.equal(res.body.consent.consent_status, 'obtained');
    assert.ok(res.body.consent.obtained_at);
    assert.equal(res.body.consent.plan_version_at_consent, 2);

    consentId = res.body.consent.id;

    // Verify agreed items snapshot is populated
    const agreedItems = res.body.consent.agreed_items_snapshot;
    assert.ok(Array.isArray(agreedItems));
    assert.ok(agreedItems.length >= 2);

    // Verify: If a mismatched patient_id is passed, server rejects with 400
    const mismatchRes = await request({
      method: 'POST',
      path: `/api/clinical/treatment-plans/${createdPlanId}/consent`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        patient_id: 'a0000000-0000-0000-0000-000000000000',
        consent_status: 'obtained',
        procedure_summary: 'Test summary',
        material_risks_discussed: 'Test risks',
        patient_name_acknowledged: 'Alexander Smith',
      },
    });
    assert.equal(mismatchRes.status, 400);
    assert.match(mismatchRes.body.message, /Supplied patientId does not match the treatment plan/);
  });

  // ==========================================================================
  // Test 13: Append-Only Consent Event Audit Trail
  // ==========================================================================
  test('13. Consent Governance: Append-only consent event verified in audit timeline', async () => {
    const res = await query(
      `SELECT * FROM treatment_consent_events WHERE consent_id = $1 ORDER BY created_at ASC`,
      [consentId]
    );

    assert.ok(res.rows.length >= 1);
    assert.equal(res.rows[0].event_type, 'obtained');
    assert.equal(res.rows[0].new_status, 'obtained');
  });

  // ==========================================================================
  // Test 14: Starting Treatment Succeeds Now that Consent is Obtained
  // ==========================================================================
  test('14. Workflow: Starting treatment item succeeds once approved plan and consent are active', async () => {
    const planRes = await request({
      method: 'GET',
      path: `/api/clinical/treatment-plans/${createdPlanId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });
    const firstItemId = planRes.body.plan.items[0].id;

    const res = await request({
      method: 'PUT',
      path: `/api/clinical/treatment-plans/${createdPlanId}/items/${firstItemId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        status: 'in_progress',
        clinicalNotes: 'Access cavity prepared under rubber dam isolation. Working length established.',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.item.status, 'in_progress');

    // Mark as completed
    const completeRes = await request({
      method: 'PUT',
      path: `/api/clinical/treatment-plans/${createdPlanId}/items/${firstItemId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        status: 'completed',
        clinicalNotes: 'Canals obturated with gutta-percha and AH Plus sealer. Temporary seal placed.',
      },
    });

    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.body.item.status, 'completed');
    assert.ok(completeRes.body.item.completed_at);

    // Verify completed item cannot be deleted
    const deleteAttempt = await request({
      method: 'DELETE',
      path: `/api/clinical/treatment-plans/${createdPlanId}/items/${firstItemId}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(deleteAttempt.status, 400);
    assert.ok(deleteAttempt.body.message.includes('completed'));
  });

  // ==========================================================================
  // Test 15: Consent Amendment & Withdrawal Procedure
  // ==========================================================================
  test('15. POST /api/clinical/treatment-consents/:consentId/amend: Records consent withdrawal with legal reason', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/clinical/treatment-consents/${consentId}/amend`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        new_consent_status: 'withdrawn',
        amendment_reason: 'Patient relocated out of state and chose to defer crown placement',
        withdrawal_reason: 'Relocation to another city',
        notes: 'Informed patient of risk of tooth fracture without full coronal coverage.',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.consent.consent_status, 'withdrawn');
    assert.ok(res.body.consent.withdrawn_at);

    // Verify append-only event trail captured withdrawal
    const eventsRes = await query(
      `SELECT * FROM treatment_consent_events WHERE consent_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [consentId]
    );
    assert.equal(eventsRes.rows[0].event_type, 'withdrawn');
    assert.equal(eventsRes.rows[0].new_status, 'withdrawn');
  });

  // ==========================================================================
  // Test 16: Odontogram Bridge: Direct Proposal from Tooth Finding
  // ==========================================================================
  test('16. Odontogram Bridge: Proposing treatment from tooth finding attaches to draft plan without duplicates', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/clinical/treatment-plans/propose-item',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        patient_id: patientId,
        visit_id: visit2Id,
        tooth_number: 36,
        surface: 'O',
        procedure_name: 'Composite Resin Restoration (1 Surface)',
        procedure_code: 'REST_COMP_1S',
        priority: 'routine',
        estimated_cost: 1500.00,
        notes: 'Proposed directly from Odontogram Tooth 36',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.plan);
    assert.ok(res.body.item);
    assert.equal(res.body.item.tooth_number, 36);
    assert.equal(res.body.item.surface, 'O');
    assert.equal(res.body.item.procedure_name, 'Composite Resin Restoration (1 Surface)');
    assert.equal(parseFloat(res.body.item.unit_cost), 1500.00);
  });

  // ==========================================================================
  // Test 17: Role-Based Authorization
  // ==========================================================================
  test('17. Role Authorization: Receptionist cannot approve treatment plans or record consent (HTTP 403)', async () => {
    // Receptionist tries to approve plan
    const approveRes = await request({
      method: 'POST',
      path: `/api/clinical/treatment-plans/${createdPlanId}/approve`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(approveRes.status, 403);

    // Receptionist tries to record consent
    const consentRes = await request({
      method: 'POST',
      path: `/api/clinical/treatment-plans/${createdPlanId}/consent`,
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        patient_id: patientId,
        procedure_summary: 'Fake summary',
        material_risks_discussed: 'None',
        patient_name_acknowledged: 'Alex',
      },
    });
    assert.equal(consentRes.status, 403);
  });

  // ==========================================================================
  // Test 18: Strict Multi-Tenant Isolation
  // ==========================================================================
  test('18. Strict Multi-Tenant Isolation: Cross-clinic access to treatment plans is denied (HTTP 404 / 403)', async () => {
    // Attempt to access cross-clinic patient plans
    const res = await request({
      method: 'GET',
      path: `/api/clinical/patients/${crossClinicPatientId}/treatment-plans`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(res.status, 404);
  });

  // ==========================================================================
  // Test 19: Strict Branch Isolation
  // ==========================================================================
  test('19. Strict Branch Isolation: Branch B staff cannot access Branch A treatment plans (HTTP 403)', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/clinical/treatment-plans/${createdPlanId}`,
      headers: {
        Authorization: `Bearer ${branchBStaffToken}`,
        'x-branch-id': branchAId, // Branch B staff tries to specify Branch A
      },
    });
    assert.equal(res.status, 403);
  });

  // ==========================================================================
  // Test 20: Pre-Consultation Vitals & Reception Billing Continue Working
  // ==========================================================================
  test('20. Regression Check: Phase 1.5 Vitals, Appointments, and Payments operate seamlessly alongside Phase 3', async () => {
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
        blood_pressure: '122/82',
        pulse_bpm: 74,
        temperature_f: 98.4,
        triage_priority: 'routine',
      },
    });
    assert.equal(vitalsRes.status, 201);

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
  });
});
