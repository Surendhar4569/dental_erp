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

describe('Phase 2: Interactive Dental Charting (Odontogram) Test Suite', () => {
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
       VALUES ('Apex Dental Multispecialty', 'CHART-' || substr(md5(random()::text), 1, 6), true, 'active')
       RETURNING id`
    );
    clinicId = clinicRes.rows[0].id;

    const branchARes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-CHART-A', 'Apex Central', true, true)
       RETURNING id`,
      [clinicId]
    );
    branchAId = branchARes.rows[0].id;

    const branchBRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-CHART-B', 'Apex West', true, false)
       RETURNING id`,
      [clinicId]
    );
    branchBId = branchBRes.rows[0].id;

    // 2. Cross-tenant Clinic 2
    const clinic2Res = await query(
      `INSERT INTO clinics (name, code, is_active, subscription_status)
       VALUES ('Pearl Dental', 'PEARL-' || substr(md5(random()::text), 1, 6), true, 'active')
       RETURNING id`
    );
    clinic2Id = clinic2Res.rows[0].id;

    const branchCRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, is_active, is_default)
       VALUES ($1, 'BR-PRL-C', 'Pearl City', true, true)
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
    const adminEmail = `admin_chart_${Date.now()}@example.com`;
    const adminUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Chart', 'Admin', true)
       RETURNING id`,
      [clinicId, roleMap['admin'], adminEmail, passwordHash]
    );
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true), ($1, $3, false)`,
      [adminUserRes.rows[0].id, branchAId, branchBId]
    );

    // Dentist user
    const dentistEmail = `dentist_chart_${Date.now()}@example.com`;
    const dentistUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, specialization, is_active)
       VALUES ($1, $2, $3, $4, 'Vikram', 'Mehta', 'Prosthodontics', true)
       RETURNING id`,
      [clinicId, roleMap['dentist'], dentistEmail, passwordHash]
    );
    dentistAId = dentistUserRes.rows[0].id;
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [dentistAId, branchAId]
    );
    await query(
      `INSERT INTO doctor_branch_fees (clinic_id, branch_id, doctor_id, consultation_fee, followup_fee, emergency_fee)
       VALUES ($1, $2, $3, 600.00, 300.00, 900.00)`,
      [clinicId, branchAId, dentistAId]
    );

    // Receptionist user
    const recepEmail = `recep_chart_${Date.now()}@example.com`;
    const recepUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Pooja', 'Sharma', true)
       RETURNING id`,
      [clinicId, roleMap['receptionist'], recepEmail, passwordHash]
    );
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [recepUserRes.rows[0].id, branchAId]
    );

    // Branch B user (different branch)
    const branchBEmail = `staff_b_chart_${Date.now()}@example.com`;
    const branchBUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'BranchB', 'Staff', true)
       RETURNING id`,
      [clinicId, roleMap['assistant'], branchBEmail, passwordHash]
    );
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [branchBUserRes.rows[0].id, branchBId]
    );

    // Login tokens
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

    const loginRecep = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: recepEmail, password: 'Password@123' },
    });
    receptionistToken = loginRecep.body.token;

    const loginBranchB = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: branchBEmail, password: 'Password@123' },
    });
    branchBStaffToken = loginBranchB.body.token;

    // Register Patient in Clinic 1 Branch A
    const patRes = await request({
      method: 'POST',
      path: '/api/patients',
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchAId },
      body: {
        first_name: 'Rajesh',
        last_name: 'Kumar',
        phone: '9888877771',
        gender: 'male',
        date_of_birth: '1988-06-15',
      },
    });
    patientId = patRes.body.patient.id;

    // Create Visit 1
    const v1Res = await request({
      method: 'POST',
      path: `/api/patients/${patientId}/visits`,
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchAId },
      body: {
        visit_date: '2026-10-22',
        doctor_id: dentistAId,
        reason_for_visit: 'Comprehensive Dental Examination',
      },
    });
    visit1Id = v1Res.body.visit.id;

    // Create Visit 2 (Follow-up visit for testing history preservation)
    const v2Res = await request({
      method: 'POST',
      path: `/api/patients/${patientId}/visits`,
      headers: { Authorization: `Bearer ${adminToken}`, 'x-branch-id': branchAId },
      body: {
        visit_date: '2026-10-23',
        doctor_id: dentistAId,
        reason_for_visit: 'Follow-up restoration',
      },
    });
    visit2Id = v2Res.body.visit.id;

    // Register Patient in Cross-tenant Clinic 2
    const c2AdminEmail = `c2_admin_${Date.now()}@example.com`;
    const c2AdminUserRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Clinic2', 'Admin', true)
       RETURNING id`,
      [clinic2Id, roleMap['admin'], c2AdminEmail, passwordHash]
    );
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default) VALUES ($1, $2, true)`,
      [c2AdminUserRes.rows[0].id, branchCId]
    );
    const loginC2 = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: c2AdminEmail, password: 'Password@123' },
    });
    const pat2Res = await request({
      method: 'POST',
      path: '/api/patients',
      headers: { Authorization: `Bearer ${loginC2.body.token}`, 'x-branch-id': branchCId },
      body: {
        first_name: 'Metro',
        last_name: 'Patient',
        phone: '9777766661',
        gender: 'female',
      },
    });
    crossClinicPatientId = pat2Res.body.patient.id;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // --------------------------------------------------------------------------
  // Step 2 & Step 3: FDI Notation & Anatomical Surface Unit Tests
  // --------------------------------------------------------------------------
  test('1. FDI Notation: Validates all 32 permanent teeth and 20 primary teeth', () => {
    // Permanent Quadrants: 11-18, 21-28, 31-38, 41-48
    for (let q = 1; q <= 4; q++) {
      for (let t = 1; t <= 8; t++) {
        const fdi = q * 10 + t;
        assert.equal(isValidToothNumber(fdi), true, `Tooth #${fdi} should be valid`);
        assert.equal(isPermanentTooth(fdi), true, `Tooth #${fdi} should be permanent`);
        assert.equal(isPrimaryTooth(fdi), false, `Tooth #${fdi} should not be primary`);
      }
    }

    // Primary Quadrants: 51-55, 61-65, 71-75, 81-85
    for (let q = 5; q <= 8; q++) {
      for (let t = 1; t <= 5; t++) {
        const fdi = q * 10 + t;
        assert.equal(isValidToothNumber(fdi), true, `Primary tooth #${fdi} should be valid`);
        assert.equal(isPrimaryTooth(fdi), true, `Primary tooth #${fdi} should be primary`);
        assert.equal(isPermanentTooth(fdi), false, `Primary tooth #${fdi} should not be permanent`);
      }
    }

    // Rejection of invalid tooth numbers
    assert.equal(isValidToothNumber(0), false);
    assert.equal(isValidToothNumber(19), false); // No 19 in quadrant 1
    assert.equal(isValidToothNumber(29), false);
    assert.equal(isValidToothNumber(56), false); // Primary teeth only go up to 5
    assert.equal(isValidToothNumber(99), false);
    assert.equal(isValidToothNumber(-5), false);
  });

  test('2. Surface Anatomy: Anterior incisal vs Posterior occlusal compatibility', () => {
    // Tooth 16 is posterior (Maxillary 1st molar) -> Has O (Occlusal), NOT I (Incisal)
    assert.equal(isPosteriorTooth(16), true);
    assert.equal(isAnteriorTooth(16), false);
    const validMolarSurface = normalizeAndValidateSurface(16, 'MOD');
    assert.equal(validMolarSurface, 'MOD');

    // Passing Incisal (I) on molar 16 must throw
    assert.throws(() => {
      normalizeAndValidateSurface(16, 'I');
    }, /Posterior teeth have an Occlusal \(O\) surface/);

    // Tooth 11 is anterior (Maxillary central incisor) -> Has I (Incisal), NOT O (Occlusal)
    assert.equal(isAnteriorTooth(11), true);
    assert.equal(isPosteriorTooth(11), false);
    const validIncisorSurface = normalizeAndValidateSurface(11, 'MID');
    assert.equal(validIncisorSurface, 'MDI');

    // Passing Occlusal (O) on incisor 11 must throw
    assert.throws(() => {
      normalizeAndValidateSurface(11, 'O');
    }, /Anterior teeth have an Incisal \(I\) edge/);
  });

  // --------------------------------------------------------------------------
  // Step 3: Centralized Dental Conditions Master Data
  // --------------------------------------------------------------------------
  test('3. Master Data: GET /api/clinical/dental-chart/conditions returns active condition catalog', async () => {
    const res = await request({
      method: 'GET',
      path: '/api/clinical/dental-chart/conditions',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.conditions));
    assert.ok(res.body.conditions.length >= 16);

    const codes = res.body.conditions.map((c) => c.code);
    assert.ok(codes.includes('caries'));
    assert.ok(codes.includes('missing'));
    assert.ok(codes.includes('restoration'));
    assert.ok(codes.includes('crown'));
    assert.ok(codes.includes('root_canal'));
    assert.ok(codes.includes('implant'));
    assert.ok(codes.includes('fracture'));

    // Check condition metadata structure
    const caries = res.body.conditions.find((c) => c.code === 'caries');
    assert.equal(caries.applies_to_surfaces, true);
    assert.ok(caries.color_hex);
    assert.ok(caries.badge_symbol);
  });

  // --------------------------------------------------------------------------
  // Step 4 & 5: Record Tooth-Level & Surface-Level Findings
  // --------------------------------------------------------------------------
  test('4. POST /api/clinical/dental-chart/findings: Records valid surface-level finding (Tooth 36 Caries Occlusal)', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/clinical/dental-chart/findings',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        visit_id: visit1Id,
        patient_id: patientId,
        tooth_number: 36,
        surface: 'O',
        condition_code: 'caries',
        finding_type: 'observed_finding',
        severity: 'moderate',
        is_existing_condition: false,
        notes: 'Deep occlusal dentinal caries requiring restorative filling.',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.finding.tooth_number, 36);
    assert.equal(res.body.finding.surface, 'O');
    assert.equal(res.body.finding.condition_code, 'caries');
    assert.equal(res.body.finding.visit_id, visit1Id);
  });

  test('5. POST /api/clinical/dental-chart/findings: Records whole-tooth finding (Tooth 18 Missing Tooth)', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/clinical/dental-chart/findings',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        visit_id: visit1Id,
        patient_id: patientId,
        tooth_number: 18,
        condition_code: 'missing',
        finding_type: 'pre_existing',
        is_existing_condition: true,
        notes: 'Extracted 5 years ago.',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.finding.tooth_number, 18);
    assert.equal(res.body.finding.surface, null);
    assert.equal(res.body.finding.condition_code, 'missing');
    assert.equal(res.body.finding.is_existing_condition, true);
  });

  test('6. POST /api/clinical/dental-chart/findings: Records primary tooth finding (Tooth 55 Caries)', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/clinical/dental-chart/findings',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        visit_id: visit1Id,
        patient_id: patientId,
        tooth_number: 55,
        surface: 'O',
        condition_code: 'caries',
        notes: 'Deciduous molar caries',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.finding.tooth_number, 55);
  });

  test('7. Validation Guard: Rejection of invalid tooth numbers (HTTP 400)', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/clinical/dental-chart/findings',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        visit_id: visit1Id,
        patient_id: patientId,
        tooth_number: 99, // Invalid FDI
        condition_code: 'caries',
      },
    });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /Invalid FDI tooth number/);
  });

  test('8. Validation Guard: Rejection of invalid surface for tooth type (HTTP 400)', async () => {
    // Attempting Occlusal (O) on front incisor (Tooth 11)
    const res = await request({
      method: 'POST',
      path: '/api/clinical/dental-chart/findings',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        visit_id: visit1Id,
        patient_id: patientId,
        tooth_number: 11,
        surface: 'O', // Invalid for anterior!
        condition_code: 'caries',
      },
    });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /Anterior teeth have an Incisal \(I\) edge, not an Occlusal surface/);
  });

  test('9. Validation Guard: Rejection of mismatched patient and visit IDs (HTTP 400)', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/clinical/dental-chart/findings',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        visit_id: visit1Id,
        patient_id: crossClinicPatientId, // Mismatched patient!
        tooth_number: 21,
        condition_code: 'healthy',
      },
    });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /Supplied patient_id does not match the visit encounter patient/);
  });

  // --------------------------------------------------------------------------
  // Step 6: Patient Dental Chart Retrieval & Summary Statistics
  // --------------------------------------------------------------------------
  test('10. GET /api/clinical/patients/:patientId/dental-chart: Returns living baseline and visit findings', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/clinical/patients/${patientId}/dental-chart?visitId=${visit1Id}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.chart);
    assert.equal(res.body.chart.patient.id, patientId);
    assert.equal(res.body.chart.visit.id, visit1Id);

    // Verify baseline contains charted teeth
    assert.ok(Array.isArray(res.body.chart.baseline));
    assert.ok(res.body.chart.baseline.length >= 2);

    // Verify visit findings for Visit 1
    assert.ok(Array.isArray(res.body.chart.visitFindings));
    assert.ok(res.body.chart.visitFindings.length >= 2);

    // Verify statistical summary
    assert.ok(res.body.chart.stats);
    assert.ok(res.body.chart.stats.missing >= 1); // Tooth 18 missing
    assert.ok(res.body.chart.stats.caries >= 1); // Tooth 36 caries
  });

  test('11. GET /api/clinical/patients/:patientId/teeth/:toothNumber/history: Returns individual tooth timeline', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/clinical/patients/${patientId}/teeth/36/history`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.tooth.toothNumber, 36);
    assert.ok(Array.isArray(res.body.tooth.history));
    assert.ok(res.body.tooth.history.length >= 1);
    assert.equal(res.body.tooth.history[0].condition_code, 'caries');
  });

  // --------------------------------------------------------------------------
  // Step 4.A: Baseline vs Multi-Visit History Preservation
  // --------------------------------------------------------------------------
  test('12. Multi-Visit Preservation: Opening Visit 2 does not erase or overwrite Visit 1 findings', async () => {
    // In Visit 2, dentist charts an additional restoration on tooth 46
    const res2 = await request({
      method: 'POST',
      path: '/api/clinical/dental-chart/findings',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        visit_id: visit2Id,
        patient_id: patientId,
        tooth_number: 46,
        surface: 'MO',
        condition_code: 'restoration',
        notes: 'Pre-existing amalgam restoration intact.',
      },
    });
    assert.equal(res2.status, 201);

    // Fetch chart for Visit 1 -> Visit 1 should strictly have its own findings (teeth 36, 18, 55)
    const chartV1 = await request({
      method: 'GET',
      path: `/api/clinical/patients/${patientId}/dental-chart?visitId=${visit1Id}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(chartV1.status, 200);
    const v1ToothNums = chartV1.body.chart.visitFindings.map((f) => f.tooth_number);
    assert.ok(v1ToothNums.includes(36));
    assert.ok(v1ToothNums.includes(18));
    assert.ok(!v1ToothNums.includes(46), 'Visit 1 findings must not be contaminated by Visit 2');

    // Fetch chart for Visit 2 -> Visit 2 should strictly show tooth 46 in visitFindings
    const chartV2 = await request({
      method: 'GET',
      path: `/api/clinical/patients/${patientId}/dental-chart?visitId=${visit2Id}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(chartV2.status, 200);
    const v2ToothNums = chartV2.body.chart.visitFindings.map((f) => f.tooth_number);
    assert.ok(v2ToothNums.includes(46));
    assert.ok(!v2ToothNums.includes(36), 'Visit 2 visitFindings must only show findings recorded in Visit 2');

    // The living patient baseline includes cumulative active conditions (36, 18, 55, 46)
    const baselineTeeth = chartV2.body.chart.baseline.map((b) => b.tooth_number);
    assert.ok(baselineTeeth.includes(36));
    assert.ok(baselineTeeth.includes(18));
    assert.ok(baselineTeeth.includes(46));
  });

  // --------------------------------------------------------------------------
  // Step 4.B: Signed/Sealed Record Protection & Legal Amendments
  // --------------------------------------------------------------------------
  test('13. Immutability Guard: Modifying or deleting findings from signed examination is blocked (HTTP 403 & Trigger)', async () => {
    // 1. Create clinical examination draft for Visit 1 and digitally sign it
    const draftRes = await request({
      method: 'POST',
      path: '/api/clinical/draft',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        visit_id: visit1Id,
        patient_id: patientId,
        examination_notes: 'Initial clinical case notes completed.',
      },
    });
    assert.equal(draftRes.status, 201);
    const examId = draftRes.body.examination.id;

    // Doctor signs off and seals the examination
    const signRes = await request({
      method: 'POST',
      path: `/api/clinical/examinations/${examId}/sign`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(signRes.status, 200);
    assert.equal(signRes.body.examination.status, 'signed');

    // 2. Attempting to add an ordinary finding to this signed visit must be blocked (HTTP 403)
    const addAttempt = await request({
      method: 'POST',
      path: '/api/clinical/dental-chart/findings',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        visit_id: visit1Id,
        patient_id: patientId,
        tooth_number: 14,
        condition_code: 'caries',
      },
    });
    assert.equal(addAttempt.status, 403);
    assert.match(addAttempt.body.message, /Cannot add ordinary findings to a signed or locked clinical examination/);

    // 3. Attempting to delete an existing finding from Visit 1 must be blocked (HTTP 403)
    const chartRes = await request({
      method: 'GET',
      path: `/api/clinical/patients/${patientId}/dental-chart?visitId=${visit1Id}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });
    const findingToDelete = chartRes.body.chart.visitFindings[0];

    const delAttempt = await request({
      method: 'DELETE',
      path: `/api/clinical/dental-chart/findings/${findingToDelete.id}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });
    assert.equal(delAttempt.status, 403);
    assert.match(delAttempt.body.message, /Cannot delete findings from a signed or locked visit encounter/);

    // 4. Test database trigger immutability: direct SQL DELETE on signed finding is blocked by trigger
    await assert.rejects(
      async () => {
        await query('DELETE FROM patient_dental_findings WHERE id = $1', [findingToDelete.id]);
      },
      /Cannot delete dental chart findings from a signed or locked visit encounter/,
      'PostgreSQL trigger must reject direct SQL delete on signed visit finding'
    );
  });

  test('14. Legal Amendment: Modifying signed chart findings succeeds via amendment addendum', async () => {
    const chartRes = await request({
      method: 'GET',
      path: `/api/clinical/patients/${patientId}/dental-chart?visitId=${visit1Id}`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });
    const findingToAmend = chartRes.body.chart.visitFindings[0];

    // Submit legal amendment
    const amendRes = await request({
      method: 'POST',
      path: `/api/clinical/dental-chart/findings/${findingToAmend.id}/amend`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        amendment_reason: 'Radiograph revealed secondary caries extending distally.',
        new_notes: 'Caries extends to distal margin on bite-wing evaluation.',
        action: 'modified',
      },
    });

    assert.equal(amendRes.status, 200);
    assert.equal(amendRes.body.success, true);
    assert.equal(amendRes.body.finding.status, 'amended');
    assert.match(amendRes.body.finding.notes, /Radiograph revealed secondary caries/);

    // Verify amendment was recorded in patient_dental_chart_amendments table
    const auditRes = await query(
      `SELECT * FROM patient_dental_chart_amendments WHERE finding_id = $1`,
      [findingToAmend.id]
    );
    assert.ok(auditRes.rows.length >= 1);
    assert.equal(auditRes.rows[0].amendment_reason, 'Radiograph revealed secondary caries extending distally.');
  });

  // --------------------------------------------------------------------------
  // Step 7: Security & Tenant Isolation
  // --------------------------------------------------------------------------
  test('15. Strict Tenant Isolation: Cross-clinic access is denied (HTTP 404 / 403)', async () => {
    // Dentist from Clinic 1 attempting to view Clinic 2 patient chart
    const crossRes = await request({
      method: 'GET',
      path: `/api/clinical/patients/${crossClinicPatientId}/dental-chart`,
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(crossRes.status, 404);
    assert.match(crossRes.body.message, /Patient record not found in this clinic/);
  });

  test('16. Strict Branch Isolation: Branch B staff cannot access Branch A patient chart (HTTP 403)', async () => {
    const branchRes = await request({
      method: 'GET',
      path: `/api/clinical/patients/${patientId}/dental-chart`,
      headers: {
        Authorization: `Bearer ${branchBStaffToken}`,
        'x-branch-id': branchAId, // Branch B staff cannot access Branch A
      },
    });

    assert.equal(branchRes.status, 403);
    assert.match(branchRes.body.message, /Forbidden. You are not authorized to access this branch/);
  });

  test('17. Role Authorization: Receptionist cannot record chart findings (HTTP 403)', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/clinical/dental-chart/findings',
      headers: {
        Authorization: `Bearer ${receptionistToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        visit_id: visit2Id,
        patient_id: patientId,
        tooth_number: 24,
        condition_code: 'caries',
      },
    });

    assert.equal(res.status, 403);
  });

  test('18. Pre-consultation vitals, appointments, and payments continue functioning alongside dental charting', async () => {
    // 1. Vitals (Phase 1.5)
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

    // 2. Reception metrics continue working
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
