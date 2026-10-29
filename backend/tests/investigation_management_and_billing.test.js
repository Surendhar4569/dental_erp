const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { query, pool, initializeDatabase } = require('../config/database');

describe('Phase 6: Laboratory, Diagnostics, Investigation Management & Central Billing Integration Test Suite', () => {
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
  let assistantToken;
  let billingToken;
  let receptionistToken;
  let branchBStaffToken;

  let patientId;
  let visitId;
  let appointmentId;
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
    baseUrl = `http://localhost:${port}`;

    // 1. Primary Tenant
    const cRes = await query(
      `INSERT INTO clinics (code, name, is_active, subscription_status)
       VALUES ($1, 'Phase 6 Dental Health Clinic', true, 'active')
       RETURNING id`,
      [`P6-${Date.now().toString().slice(-6)}`]
    );
    clinicId = cRes.rows[0].id;

    // Seed standard catalogue items for primary test clinic
    await query(`
      INSERT INTO investigation_catalogue (clinic_id, code, name, category, specimen_type, sample_required, description, preparation_instructions, price, turnaround_time_hours, reference_ranges, is_active)
      VALUES
        ($1, 'CBC', 'Complete Blood Count (CBC)', 'laboratory', 'Blood (EDTA)', true, 'Automated full blood count', 'No special fasting required', 350.00, 12, '[{"parameter":"Hemoglobin","unit":"g/dL","min":13.0,"max":17.0}]'::jsonb, true),
        ($1, 'OPG', 'Orthopantomogram (Full Mouth Panoramic X-Ray)', 'radiology', null, false, 'Comprehensive 2D panoramic scanning dental X-ray', 'Remove metallic appliances', 800.00, 2, '[{"parameter":"Impression","unit":"Text","normal":"Normal"}]'::jsonb, true),
        ($1, 'IOPA', 'Intraoral Periapical Radiograph (IOPA)', 'radiology', null, false, 'High-resolution single tooth periapical radiograph', 'Remove metallic appliances', 250.00, 1, '[{"parameter":"Impression","unit":"Text","normal":"Intact"}]'::jsonb, true)
      ON CONFLICT (clinic_id, code) DO NOTHING
    `, [clinicId]);

    // Branches
    const bARes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BA-P6', 'Branch Alpha P6', 'Asia/Kolkata', true, true)
       RETURNING id`,
      [clinicId]
    );
    branchAId = bARes.rows[0].id;

    const bBRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BB-P6', 'Branch Beta P6', 'Asia/Kolkata', true, false)
       RETURNING id`,
      [clinicId]
    );
    branchBId = bBRes.rows[0].id;

    // Secondary Tenant (Tenant Isolation)
    const c2Res = await query(
      `INSERT INTO clinics (code, name, is_active, subscription_status)
       VALUES ($1, 'Phase 6 Tenant Two Clinic', true, 'active')
       RETURNING id`,
      [`T2-P6-${Date.now().toString().slice(-5)}`]
    );
    clinic2Id = c2Res.rows[0].id;

    const bCRes = await query(
      `INSERT INTO branches (clinic_id, branch_code, branch_name, timezone, is_active, is_default)
       VALUES ($1, 'BC-P6', 'Branch Charlie T2', 'Asia/Kolkata', true, true)
       RETURNING id`,
      [clinic2Id]
    );
    branchCId = bCRes.rows[0].id;

    // Roles map
    const rolesRes = await query(`SELECT id, name FROM roles`);
    const roleMap = {};
    for (const r of rolesRes.rows) {
      roleMap[r.name] = r.id;
    }

    const pwdHash = await bcrypt.hash('Test@123456', 10);

    // Users
    const adminEmail = `admin_p6_${Date.now()}@test.com`;
    const adminRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Admin', 'User', true) RETURNING id`,
      [clinicId, roleMap['admin'], adminEmail, pwdHash]
    );
    await query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2), ($1, $3)`, [adminRes.rows[0].id, branchAId, branchBId]);

    const docAEmail = `doc_p6_${Date.now()}@test.com`;
    const docARes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Sarah', 'Jenkins', true) RETURNING id`,
      [clinicId, roleMap['dentist'], docAEmail, pwdHash]
    );
    dentistAId = docARes.rows[0].id;
    await query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [dentistAId, branchAId]);

    const asstEmail = `asst_p6_${Date.now()}@test.com`;
    const asstRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Priya', 'Sharma', true) RETURNING id`,
      [clinicId, roleMap['assistant'], asstEmail, pwdHash]
    );
    await query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [asstRes.rows[0].id, branchAId]);

    const billEmail = `bill_p6_${Date.now()}@test.com`;
    const billRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Ramesh', 'Cashier', true) RETURNING id`,
      [clinicId, roleMap['billing'], billEmail, pwdHash]
    );
    await query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [billRes.rows[0].id, branchAId]);

    const recEmail = `rec_p6_${Date.now()}@test.com`;
    const recRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Anita', 'Reception', true) RETURNING id`,
      [clinicId, roleMap['receptionist'], recEmail, pwdHash]
    );
    await query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [recRes.rows[0].id, branchAId]);

    const staffBEmail = `staff_b_p6_${Date.now()}@test.com`;
    const staffBRes = await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'Beta', 'Staff', true) RETURNING id`,
      [clinicId, roleMap['assistant'], staffBEmail, pwdHash]
    );
    await query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [staffBRes.rows[0].id, branchBId]);

    // Create Patient
    const patRes = await query(
      `INSERT INTO patients (clinic_id, branch_id, patient_number, first_name, last_name, phone, gender, date_of_birth)
       VALUES ($1, $2, $3, 'Aarav', 'Patel', '9876543210', 'male', '1990-05-15')
       RETURNING id`,
      [clinicId, branchAId, `${Date.now().toString().slice(-6)}`]
    );
    patientId = patRes.rows[0].id;

    // Create Appointment
    const apptRes = await query(
      `INSERT INTO appointments (
         clinic_id, branch_id, patient_id, doctor_id, appointment_number,
         appointment_date, start_time, end_time, duration_minutes,
         appointment_type, status, consultation_fee, amount_paid, payment_status
       ) VALUES ($1, $2, $3, $4, $5, '2026-11-02', '10:00', '10:30', 30, 'consultation', 'in_consultation', 500.00, 0.00, 'pending')
       RETURNING id`,
      [clinicId, branchAId, patientId, dentistAId, `APT-${Date.now().toString().slice(-6)}`]
    );
    appointmentId = apptRes.rows[0].id;

    // Create Visit Encounter
    const visitRes = await query(
      `INSERT INTO patient_visits (
         clinic_id, branch_id, patient_id, appointment_id, doctor_id,
         visit_date, token_number, token_display, visit_type, status, reason_for_visit
       ) VALUES ($1, $2, $3, $4, $5, '2026-11-02', 1, '001', 'consultation', 'in_progress', 'Severe molar pain')
       RETURNING id`,
      [clinicId, branchAId, patientId, appointmentId, dentistAId]
    );
    visitId = visitRes.rows[0].id;

    await query(`UPDATE appointments SET visit_id = $1 WHERE id = $2`, [visitId, appointmentId]);

    // Cross-clinic Patient (Tenant 2)
    const pat2Res = await query(
      `INSERT INTO patients (clinic_id, branch_id, patient_number, first_name, last_name, phone)
       VALUES ($1, $2, $3, 'Other', 'TenantPatient', '9999988888')
       RETURNING id`,
      [clinic2Id, branchCId, `${(Date.now() + 1).toString().slice(-6)}`]
    );
    crossClinicPatientId = pat2Res.rows[0].id;

    // Logins
    const lAdmin = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: adminEmail, password: 'Test@123456' },
    });
    adminToken = lAdmin.body.token;

    const lDoc = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: docAEmail, password: 'Test@123456' },
    });
    dentistAToken = lDoc.body.token;

    const lAsst = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: asstEmail, password: 'Test@123456' },
    });
    assistantToken = lAsst.body.token;

    const lBill = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: billEmail, password: 'Test@123456' },
    });
    billingToken = lBill.body.token;

    const lRec = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: recEmail, password: 'Test@123456' },
    });
    receptionistToken = lRec.body.token;

    const lStaffB = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: staffBEmail, password: 'Test@123456' },
    });
    branchBStaffToken = lStaffB.body.token;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ==========================================
  // MODULE A: INVESTIGATION CATALOGUE TESTS
  // ==========================================

  let createdInvestigationId;
  let inactiveInvestigationId;

  test('1. Admin can create an investigation in the catalogue with price and reference ranges', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/investigations/catalogue',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        code: 'CBCT_3D',
        name: 'Cone Beam Computed Tomography (CBCT) 3D Scan',
        category: 'radiology',
        description: 'High-resolution 3D volumetric maxillofacial imaging.',
        price: 2500.00,
        sample_required: false,
        turnaround_time_hours: 4,
        reference_ranges: [{ parameter: 'Bone Density', unit: 'HU', min: 400, max: 1200 }],
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.investigation.code, 'CBCT_3D');
    assert.equal(parseFloat(res.body.investigation.price), 2500.00);
    createdInvestigationId = res.body.investigation.id;
  });

  test('2. Duplicate investigation code within the same clinic is rejected (HTTP 409 Conflict)', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/investigations/catalogue',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        code: 'CBCT_3D',
        name: 'Another Scan with duplicate code',
        category: 'radiology',
        price: 1500.00,
      },
    });

    assert.equal(res.status, 409);
    assert.match(res.body.message, /already exists/i);
  });

  test('3. Non-admin users cannot create catalogue items (HTTP 403 Forbidden)', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/investigations/catalogue',
      headers: { Authorization: `Bearer ${dentistAToken}` },
      body: {
        code: 'TEST_UNAUTH',
        name: 'Unauthorized Item',
        category: 'laboratory',
        price: 100.00,
      },
    });

    assert.equal(res.status, 403);
  });

  test('4. Admin can update investigation catalogue fields and configure price', async () => {
    const res = await request({
      method: 'PUT',
      path: `/api/investigations/catalogue/${createdInvestigationId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        price: 2800.00,
        description: 'Updated 3D CBCT description with FOV specs.',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(parseFloat(res.body.investigation.price), 2800.00);
  });

  test('5. Admin can deactivate an investigation; inactive items are rejected for new orders', async () => {
    // Create an item to deactivate
    const createRes = await request({
      method: 'POST',
      path: '/api/investigations/catalogue',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        code: 'DEACTIVATED_TEST',
        name: 'Obsolete Test Item',
        category: 'laboratory',
        price: 300.00,
      },
    });
    inactiveInvestigationId = createRes.body.investigation.id;

    // Deactivate it
    const deactRes = await request({
      method: 'PATCH',
      path: `/api/investigations/catalogue/${inactiveInvestigationId}/status`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { is_active: false },
    });

    assert.equal(deactRes.status, 200);
    assert.equal(deactRes.body.investigation.is_active, false);

    // Doctor attempts to order inactive item -> Must be rejected with HTTP 400
    const orderRes = await request({
      method: 'POST',
      path: '/api/investigations/orders',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        patient_id: patientId,
        visit_id: visitId,
        items: [{ investigation_id: inactiveInvestigationId }],
      },
    });

    assert.equal(orderRes.status, 400);
    assert.match(orderRes.body.message, /inactive and cannot be ordered/i);
  });

  // ==========================================
  // MODULE B: DOCTOR INVESTIGATION ORDERS
  // MODULE C: CENTRAL BILLING INTEGRATION
  // ==========================================

  let activeOrderId;
  let activeOrderNumber;
  let orderItemId1;
  let orderItemId2;

  test('6. Doctor orders two investigations against active visit; generates unique INV-10001+ order number', async () => {
    // Look up CBC and OPG from catalogue
    const catRes = await request({
      method: 'GET',
      path: '/api/investigations/catalogue',
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });

    const cbc = catRes.body.investigations.find((i) => i.code === 'CBC');
    const opg = catRes.body.investigations.find((i) => i.code === 'OPG');

    assert.ok(cbc, 'CBC should exist in catalogue');
    assert.ok(opg, 'OPG should exist in catalogue');

    const res = await request({
      method: 'POST',
      path: '/api/investigations/orders',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        patient_id: patientId,
        visit_id: visitId,
        clinical_indication: 'Pre-extraction assessment and bone density check',
        priority: 'urgent',
        items: [
          { investigation_id: cbc.id, quantity: 1 },
          { investigation_id: opg.id, quantity: 1 },
        ],
        notes: 'Patient exhibits swelling in quadrant 4',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    const { order } = res.body;

    assert.ok(order.order_number.startsWith('INV-'));
    assert.equal(order.status, 'ordered');
    assert.equal(order.priority, 'urgent');
    assert.equal(order.items.length, 2);

    // CBC is 350, OPG is 800 => Total = 1150
    assert.equal(parseFloat(order.total_amount), 1150.00);

    activeOrderId = order.id;
    activeOrderNumber = order.order_number;
    orderItemId1 = order.items[0].id;
    orderItemId2 = order.items[1].id;
  });

  test('7. Central Billing Integration: Investigation order atomically creates billable lines in billing_charges', async () => {
    // Check billing_charges in database
    const charges = await query(
      `SELECT * FROM billing_charges 
       WHERE clinic_id = $1 AND visit_id = $2 AND charge_type = 'investigation'
       ORDER BY created_at ASC`,
      [clinicId, visitId]
    );

    assert.equal(charges.rows.length, 2, 'Should create exactly 2 billable charge lines');
    assert.equal(charges.rows[0].source_reference, activeOrderNumber);
    assert.equal(charges.rows[0].status, 'pending');
    assert.equal(charges.rows[1].status, 'pending');

    const sumGross = charges.rows.reduce((acc, c) => acc + parseFloat(c.gross_amount), 0);
    assert.equal(sumGross, 1150.00, 'Gross charges should equal order total');
  });

  test('8. Duplicate Prevention: Repeating identical order item insertion is blocked by unique constraints', async () => {
    // Attempt direct duplicate insertion on billing_charges
    const dupRes = await query(
      `INSERT INTO billing_charges (
         clinic_id, branch_id, patient_id, visit_id, charge_type,
         source_id, source_reference, item_code, description,
         unit_price, quantity, gross_amount, discount_amount, net_amount, amount_paid, status
       ) VALUES ($1, $2, $3, $4, 'investigation', $5, 'INV-DUP-TEST', 'CBC', 'CBC Duplicate', 350, 1, 350, 0, 350, 0, 'pending')
       ON CONFLICT (clinic_id, charge_type, source_id) DO NOTHING
       RETURNING *`,
      [clinicId, branchAId, patientId, visitId, orderItemId1]
    );

    assert.equal(dupRes.rows.length, 0, 'ON CONFLICT DO NOTHING must prevent duplicate charge line for same order item');
  });

  test('9. Validation: Mismatched visit, wrong patient, or unauthorized branch orders are strictly rejected', async () => {
    // Mismatched patient and visit
    const mismatchedRes = await request({
      method: 'POST',
      path: '/api/investigations/orders',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        patient_id: crossClinicPatientId, // Patient from Tenant 2
        visit_id: visitId, // Visit from Tenant 1
        items: [{ investigation_id: createdInvestigationId }],
      },
    });

    assert.ok(mismatchedRes.status === 400 || mismatchedRes.status === 404);

    // Unauthorized branch: Staff B (assigned ONLY to Branch B) cannot order for Branch A
    const branchGuardRes = await request({
      method: 'POST',
      path: '/api/investigations/orders',
      headers: {
        Authorization: `Bearer ${branchBStaffToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        patient_id: patientId,
        visit_id: visitId,
        items: [{ investigation_id: createdInvestigationId }],
      },
    });

    assert.equal(branchGuardRes.status, 403);
  });

  test('10. Central Billing UI: Cashier retrieves encounter billing summary showing consultation and investigations', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/investigations/billing/visit/${visitId}`,
      headers: {
        Authorization: `Bearer ${billingToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const { billing } = res.body;

    // Consultation (500) + CBC (350) + OPG (800) = 1650
    assert.equal(billing.summary.totalGross, 1650.00);
    assert.equal(billing.summary.remainingBalance, 1650.00);
    assert.equal(billing.summary.paymentStatus, 'pending');
    assert.ok(billing.lineItems.length >= 3, 'Should list consultation and investigation lines');
  });

  test('11. Central Billing Collection: Cashier collects partial payment; sequential REC-10001+ receipt issued', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/investigations/billing/pay',
      headers: {
        Authorization: `Bearer ${billingToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        visit_id: visitId,
        patient_id: patientId,
        amount_paid: 650.00,
        payment_method: 'upi',
        transaction_reference: 'UPI-REF-998877',
        notes: 'Partial payment covering consultation fee + part of labs',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    const { receipt } = res.body;

    assert.ok(receipt.receipt_number.startsWith('REC-'));
    assert.equal(parseFloat(receipt.amount_paid), 650.00);
    // 1650 - 650 = 1000 remaining
    assert.equal(parseFloat(receipt.remaining_balance), 1000.00);

    // Verify stored in appointment_payments table
    const dbReceipt = await query('SELECT * FROM appointment_payments WHERE receipt_number = $1 AND clinic_id = $2', [receipt.receipt_number, clinicId]);
    assert.equal(dbReceipt.rows.length, 1);
    assert.equal(dbReceipt.rows[0].payment_method, 'upi');
  });

  test('12. Central Billing Collection: Cashier settles remaining balance; status updates to paid', async () => {
    const res = await request({
      method: 'POST',
      path: '/api/investigations/billing/pay',
      headers: {
        Authorization: `Bearer ${billingToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        visit_id: visitId,
        patient_id: patientId,
        amount_paid: 1000.00,
        payment_method: 'cash',
        notes: 'Remaining balance settled',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(parseFloat(res.body.receipt.remaining_balance), 0.00);

    // Check visit billing summary
    const sumRes = await request({
      method: 'GET',
      path: `/api/investigations/billing/visit/${visitId}`,
      headers: {
        Authorization: `Bearer ${billingToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(sumRes.body.billing.summary.remainingBalance, 0.00);
    assert.equal(sumRes.body.billing.summary.paymentStatus, 'paid');
    assert.equal(sumRes.body.billing.receipts.length, 2, 'Should record both partial receipts');
  });

  // ==========================================
  // MODULE D: OPERATIONAL WORKFLOW & WORKLIST
  // ==========================================

  test('13. Laboratory Worklist: Lists active orders with priority sorting and search filters', async () => {
    const res = await request({
      method: 'GET',
      path: '/api/investigations/worklist?status=all&priority=urgent',
      headers: {
        Authorization: `Bearer ${assistantToken}`,
        'x-branch-id': branchAId,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.orders.length > 0);
    const found = res.body.orders.find((o) => o.id === activeOrderId);
    assert.ok(found, 'Active urgent order must be present in worklist');
    assert.equal(found.order_number, activeOrderNumber);
  });

  test('14. Workflow: Advance order status from ordered -> sample_collected -> in_progress', async () => {
    // Advance to sample_collected
    const s1 = await request({
      method: 'PATCH',
      path: `/api/investigations/orders/${activeOrderId}/status`,
      headers: { Authorization: `Bearer ${assistantToken}` },
      body: { status: 'sample_collected', notes: 'Blood and saliva specimens collected at chairside' },
    });

    assert.equal(s1.status, 200);
    assert.equal(s1.body.order.status, 'sample_collected');

    // Advance to in_progress
    const s2 = await request({
      method: 'PATCH',
      path: `/api/investigations/orders/${activeOrderId}/status`,
      headers: { Authorization: `Bearer ${assistantToken}` },
      body: { status: 'in_progress', notes: 'Sent to in-house hematology analyzer and digital panoramic room' },
    });

    assert.equal(s2.status, 200);
    assert.equal(s2.body.order.status, 'in_progress');
  });

  // ==========================================
  // MODULE E: RESULTS MANAGEMENT TESTS
  // ==========================================

  let cbcResultId;

  test('15. Clinical Staff enters draft results for CBC order item', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/investigations/orders/${activeOrderId}/items/${orderItemId1}/results`,
      headers: { Authorization: `Bearer ${assistantToken}` },
      body: {
        result_type: 'structured',
        results_data: [
          { parameter: 'Hemoglobin', value: '14.5', unit: 'g/dL', reference_range: '13.0 - 17.0', flag: 'normal' },
          { parameter: 'WBC (Total)', value: '12500', unit: 'cells/mcL', reference_range: '4000 - 11000', flag: 'high' },
          { parameter: 'Platelet Count', value: '250000', unit: '/mcL', reference_range: '150000 - 450000', flag: 'normal' },
        ],
        observations: 'Mild leukocytosis secondary to acute odontogenic infection.',
        abnormal_flag: true,
        critical_flag: false,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.result.status, 'draft');
    assert.equal(res.body.result.abnormal_flag, true);
    cbcResultId = res.body.result.id;
  });

  test('16. Authorization Guard: Receptionists and Assistants CANNOT authorize clinical results (HTTP 403 Forbidden)', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/investigations/results/${cbcResultId}/authorize`,
      headers: { Authorization: `Bearer ${receptionistToken}` },
    });

    assert.equal(res.status, 403);
  });

  test('17. Authorized Practitioner reviews and authorizes result; seals record', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/investigations/results/${cbcResultId}/authorize`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.result.status, 'authorized');
    assert.ok(res.body.result.authorized_at);
  });

  test('18. Immutability Guard: Direct modification of authorized result is strictly rejected (HTTP 409 Conflict)', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/investigations/orders/${activeOrderId}/items/${orderItemId1}/results`,
      headers: { Authorization: `Bearer ${assistantToken}` },
      body: {
        observations: 'Attempted overwrite of authorized note',
      },
    });

    assert.equal(res.status, 409);
    assert.match(res.body.message, /already authorized/i);
  });

  test('19. Authorized Amendment: Practitioner appends legal amendment with mandatory reason; snapshots history', async () => {
    const res = await request({
      method: 'POST',
      path: `/api/investigations/results/${cbcResultId}/amend`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
      body: {
        reason: 'Laboratory repeat verification confirmed platelet count at 265000.',
        results_data: [
          { parameter: 'Hemoglobin', value: '14.5', unit: 'g/dL', reference_range: '13.0 - 17.0', flag: 'normal' },
          { parameter: 'WBC (Total)', value: '12500', unit: 'cells/mcL', reference_range: '4000 - 11000', flag: 'high' },
          { parameter: 'Platelet Count', value: '265000', unit: '/mcL', reference_range: '150000 - 450000', flag: 'normal' },
        ],
        observations: 'Repeat run confirms platelet value 265k.',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.result.status, 'amended');

    // Verify amendment history table has the audit snapshot
    const amCheck = await query(
      'SELECT * FROM investigation_result_amendments WHERE result_id = $1',
      [cbcResultId]
    );
    assert.equal(amCheck.rows.length, 1);
    assert.match(amCheck.rows[0].reason, /platelet count/i);
  });

  // ==========================================
  // MODULE F: REPORTS AND ATTACHMENTS
  // ==========================================

  test('20. Printable Report Endpoint: Returns structured layout with clinic branding, patient details, and results', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/investigations/orders/${activeOrderId}/report`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const { report } = res.body;

    assert.equal(report.clinic.name, 'Phase 6 Dental Health Clinic');
    assert.equal(report.patient.name, 'Aarav Patel');
    assert.equal(report.order.orderNumber, activeOrderNumber);
    assert.ok(report.items.length >= 2);
  });

  test('21. Attachments: Upload external diagnostic report and retrieve attachments', async () => {
    const uploadRes = await request({
      method: 'POST',
      path: `/api/investigations/orders/${activeOrderId}/attachments`,
      headers: { Authorization: `Bearer ${assistantToken}` },
      body: {
        file_name: 'OPG_Panoramic_Scan.jpg',
        file_type: 'image/jpeg',
        file_size: 204800,
        file_path: '/uploads/investigations/mock_opg_scan.jpg',
        description: 'Digital panoramic radiograph acquired at Branch Alpha.',
      },
    });

    assert.equal(uploadRes.status, 201);
    assert.equal(uploadRes.body.success, true);

    const listRes = await request({
      method: 'GET',
      path: `/api/investigations/orders/${activeOrderId}/attachments`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });

    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.attachments.length, 1);
    assert.equal(listRes.body.attachments[0].file_name, 'OPG_Panoramic_Scan.jpg');
  });

  // ==========================================
  // MODULE H: PATIENT HISTORY & ENCOUNTER VIEWER INTEGRATION
  // ==========================================

  test('22. Patient Timeline Integration: Timeline aggregates investigation order events', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/patients/${patientId}/timeline?category=investigations`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.events.length > 0);
    const invEvent = res.body.events.find((e) => e.event_type === 'investigation_order');
    assert.ok(invEvent, 'Investigation order event must appear in patient timeline');
    assert.equal(invEvent.category, 'investigations');
  });

  test('23. Unified Encounter Viewer Integration: Visit record endpoint returns unified encounter including investigations', async () => {
    const res = await request({
      method: 'GET',
      path: `/api/patients/${patientId}/visits/${visitId}/records`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const encounter = res.body;

    assert.ok(encounter.investigations, 'Unified encounter must include investigations array');
    assert.ok(encounter.investigations.length > 0);
    const order = encounter.investigations[0];
    assert.equal(order.order_number, activeOrderNumber);
    assert.ok(order.items.length >= 2);
  });

  // ==========================================
  // CANCELLATION & FINANCIAL INTEGRATION
  // ==========================================

  test('24. Order Cancellation: Preserves history, requires mandatory reason, cancels pending billing charges', async () => {
    // Create a new order to test cancellation
    const newOrd = await request({
      method: 'POST',
      path: '/api/investigations/orders',
      headers: {
        Authorization: `Bearer ${dentistAToken}`,
        'x-branch-id': branchAId,
      },
      body: {
        patient_id: patientId,
        visit_id: visitId,
        priority: 'routine',
        items: [{ investigation_id: createdInvestigationId, quantity: 1 }],
      },
    });

    assert.equal(newOrd.status, 201);
    const cancelOrderId = newOrd.body.order.id;

    // Cancellation without reason -> Rejected
    const noReason = await request({
      method: 'PATCH',
      path: `/api/investigations/orders/${cancelOrderId}/status`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
      body: { status: 'cancelled' },
    });
    assert.equal(noReason.status, 400);

    // Cancel with reason
    const cancelRes = await request({
      method: 'PATCH',
      path: `/api/investigations/orders/${cancelOrderId}/status`,
      headers: { Authorization: `Bearer ${dentistAToken}` },
      body: { status: 'cancelled', notes: 'Patient declined 3D scan due to claustrophobia' },
    });

    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.body.order.status, 'cancelled');

    // Verify billing_charges were marked cancelled
    const chargeCheck = await query(
      `SELECT status FROM billing_charges 
       WHERE source_id IN (SELECT id FROM investigation_order_items WHERE order_id = $1)`,
      [cancelOrderId]
    );
    assert.ok(chargeCheck.rows.length > 0);
    assert.equal(chargeCheck.rows[0].status, 'cancelled');
  });

  // ==========================================
  // SECURITY & MULTI-TENANT ISOLATION
  // ==========================================

  test('25. Strict Multi-Tenant Isolation: Secondary tenant is blocked from accessing primary clinic orders', async () => {
    // Secondary tenant admin logs in
    const t2Email = `t2_admin_${Date.now()}@test.com`;
    const pwdHash = await bcrypt.hash('Test@123456', 10);
    const rolesRes = await query(`SELECT id FROM roles WHERE name = 'admin'`);
    await query(
      `INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, 'T2Admin', 'User', true)`,
      [clinic2Id, rolesRes.rows[0].id, t2Email, pwdHash]
    );

    const lT2 = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: t2Email, password: 'Test@123456' },
    });

    const t2Token = lT2.body.token;

    // Attempt to access primary clinic order
    const crossRes = await request({
      method: 'GET',
      path: `/api/investigations/orders/${activeOrderId}`,
      headers: { Authorization: `Bearer ${t2Token}` },
    });

    assert.equal(crossRes.status, 404, 'Cross-tenant access must return 404 Not Found without leaking data');
  });
});
