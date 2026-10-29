const { pool, query } = require('../config/database');
const { generateInvestigationOrderNumber } = require('../utils/investigationOrderNumberGenerator');

const VALID_CATEGORIES = ['laboratory', 'radiology', 'diagnostic', 'dental_investigation', 'external_lab', 'other'];
const VALID_PRIORITIES = ['routine', 'urgent', 'stat'];
const VALID_STATUSES = ['ordered', 'sample_collected', 'in_progress', 'result_entered', 'authorized', 'completed', 'cancelled'];
const PRACTITIONER_ROLES = ['dentist', 'specialist', 'radiologist', 'admin'];

class InvestigationService {
  // ==========================================
  // MODULE A: INVESTIGATION CATALOGUE
  // ==========================================

  /**
   * Create a new investigation in the clinic catalogue
   */
  async createInvestigation(clinicId, data, userId) {
    const {
      code,
      name,
      category = 'laboratory',
      description = null,
      sample_required = false,
      specimen_type = null,
      preparation_instructions = null,
      price = 0,
      turnaround_time_hours = 24,
      reference_ranges = [],
      is_active = true,
    } = data;

    if (!code || !code.trim()) {
      const err = new Error('Investigation code is required.');
      err.statusCode = 400;
      throw err;
    }

    if (!name || !name.trim()) {
      const err = new Error('Investigation name is required.');
      err.statusCode = 400;
      throw err;
    }

    if (!VALID_CATEGORIES.includes(category)) {
      const err = new Error(`Category must be one of: ${VALID_CATEGORIES.join(', ')}.`);
      err.statusCode = 400;
      throw err;
    }

    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0) {
      const err = new Error('Investigation price must be a non-negative number.');
      err.statusCode = 400;
      throw err;
    }

    // Check duplicate code within clinic
    const existing = await query(
      `SELECT id FROM investigation_catalogue WHERE clinic_id = $1 AND UPPER(code) = UPPER($2)`,
      [clinicId, code.trim()]
    );
    if (existing.rows.length > 0) {
      const err = new Error(`An investigation with code '${code.trim().toUpperCase()}' already exists in this clinic.`);
      err.statusCode = 409;
      throw err;
    }

    const refJson = typeof reference_ranges === 'string'
      ? reference_ranges
      : JSON.stringify(reference_ranges || []);

    const res = await query(
      `INSERT INTO investigation_catalogue (
         clinic_id, code, name, category, description, sample_required, specimen_type,
         preparation_instructions, price, turnaround_time_hours, reference_ranges,
         is_active, created_by, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $13)
       RETURNING *`,
      [
        clinicId,
        code.trim().toUpperCase(),
        name.trim(),
        category,
        description ? description.trim() : null,
        Boolean(sample_required),
        specimen_type ? specimen_type.trim() : null,
        preparation_instructions ? preparation_instructions.trim() : null,
        numPrice,
        parseInt(turnaround_time_hours, 10) || 24,
        refJson,
        is_active !== false,
        userId,
      ]
    );

    return res.rows[0];
  }

  /**
   * Update investigation catalogue item
   */
  async updateInvestigation(clinicId, id, data, userId) {
    const checkRes = await query(
      `SELECT * FROM investigation_catalogue WHERE id = $1 AND clinic_id = $2`,
      [id, clinicId]
    );
    if (checkRes.rows.length === 0) {
      const err = new Error('Investigation catalogue item not found.');
      err.statusCode = 404;
      throw err;
    }

    const current = checkRes.rows[0];

    let code = current.code;
    if (data.code && data.code.trim().toUpperCase() !== current.code) {
      const dupCheck = await query(
        `SELECT id FROM investigation_catalogue WHERE clinic_id = $1 AND UPPER(code) = UPPER($2) AND id != $3`,
        [clinicId, data.code.trim(), id]
      );
      if (dupCheck.rows.length > 0) {
        const err = new Error(`An investigation with code '${data.code.trim().toUpperCase()}' already exists.`);
        err.statusCode = 409;
        throw err;
      }
      code = data.code.trim().toUpperCase();
    }

    const name = data.name ? data.name.trim() : current.name;
    const category = data.category || current.category;
    if (!VALID_CATEGORIES.includes(category)) {
      const err = new Error(`Category must be one of: ${VALID_CATEGORIES.join(', ')}.`);
      err.statusCode = 400;
      throw err;
    }

    let price = current.price;
    if (data.price !== undefined) {
      const numPrice = parseFloat(data.price);
      if (isNaN(numPrice) || numPrice < 0) {
        const err = new Error('Price must be a non-negative number.');
        err.statusCode = 400;
        throw err;
      }
      price = numPrice;
    }

    const refJson = data.reference_ranges !== undefined
      ? (typeof data.reference_ranges === 'string' ? data.reference_ranges : JSON.stringify(data.reference_ranges))
      : (current.reference_ranges ? (typeof current.reference_ranges === 'string' ? current.reference_ranges : JSON.stringify(current.reference_ranges)) : JSON.stringify([]));

    const res = await query(
      `UPDATE investigation_catalogue
       SET code = $1,
           name = $2,
           category = $3,
           description = $4,
           sample_required = $5,
           specimen_type = $6,
           preparation_instructions = $7,
           price = $8,
           turnaround_time_hours = $9,
           reference_ranges = $10::jsonb,
           is_active = $11,
           updated_by = $12,
           updated_at = now()
       WHERE id = $13 AND clinic_id = $14
       RETURNING *`,
      [
        code,
        name,
        category,
        data.description !== undefined ? data.description : current.description,
        data.sample_required !== undefined ? Boolean(data.sample_required) : current.sample_required,
        data.specimen_type !== undefined ? data.specimen_type : current.specimen_type,
        data.preparation_instructions !== undefined ? data.preparation_instructions : current.preparation_instructions,
        price,
        data.turnaround_time_hours !== undefined ? parseInt(data.turnaround_time_hours, 10) : current.turnaround_time_hours,
        refJson,
        data.is_active !== undefined ? Boolean(data.is_active) : current.is_active,
        userId,
        id,
        clinicId,
      ]
    );

    return res.rows[0];
  }

  /**
   * Toggle active status
   */
  async toggleInvestigationActive(clinicId, id, isActive, userId) {
    const res = await query(
      `UPDATE investigation_catalogue
       SET is_active = $1, updated_by = $2, updated_at = now()
       WHERE id = $3 AND clinic_id = $4
       RETURNING *`,
      [Boolean(isActive), userId, id, clinicId]
    );
    if (res.rows.length === 0) {
      const err = new Error('Investigation catalogue item not found.');
      err.statusCode = 404;
      throw err;
    }
    return res.rows[0];
  }

  /**
   * List catalogue items with optional filters
   */
  async getInvestigationCatalogue(clinicId, filters = {}) {
    const { category, search, activeOnly = 'false' } = filters;
    let sql = `SELECT * FROM investigation_catalogue WHERE clinic_id = $1`;
    const params = [clinicId];

    if (activeOnly === 'true' || activeOnly === true) {
      sql += ` AND is_active = true`;
    }

    if (category && category !== 'all') {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      sql += ` AND (name ILIKE $${params.length} OR code ILIKE $${params.length} OR description ILIKE $${params.length})`;
    }

    sql += ` ORDER BY category ASC, name ASC`;
    const res = await query(sql, params);
    return res.rows;
  }

  /**
   * Get single catalogue item by ID
   */
  async getInvestigationById(clinicId, id) {
    const res = await query(
      `SELECT * FROM investigation_catalogue WHERE id = $1 AND clinic_id = $2`,
      [id, clinicId]
    );
    if (res.rows.length === 0) {
      const err = new Error('Investigation catalogue item not found.');
      err.statusCode = 404;
      throw err;
    }
    return res.rows[0];
  }

  // ==========================================
  // MODULE B: DOCTOR INVESTIGATION ORDERS
  // MODULE C: CENTRAL BILLING INTEGRATION
  // ==========================================

  /**
   * Doctor creates an investigation order against an active visit
   * Atomically generates INV-10001+ order number and inserts Central Billing charges.
   */
  async createOrder(clinicId, branchId, data, doctorId, userBranchIds = []) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const {
        patient_id: patientId,
        visit_id: visitId,
        clinical_indication = null,
        priority = 'routine',
        items = [],
        notes = null,
      } = data;

      if (!patientId) {
        const err = new Error('patient_id is required.');
        err.statusCode = 400;
        throw err;
      }

      if (!visitId) {
        const err = new Error('visit_id is required.');
        err.statusCode = 400;
        throw err;
      }

      if (!Array.isArray(items) || items.length === 0) {
        const err = new Error('At least one investigation item must be selected for the order.');
        err.statusCode = 400;
        throw err;
      }

      if (!VALID_PRIORITIES.includes(priority)) {
        const err = new Error(`Priority must be one of: ${VALID_PRIORITIES.join(', ')}.`);
        err.statusCode = 400;
        throw err;
      }

      // Branch authorization guard
      if (userBranchIds && userBranchIds.length > 0 && !userBranchIds.includes(branchId)) {
        const err = new Error('Forbidden. You do not have permission to place orders for this branch.');
        err.statusCode = 403;
        throw err;
      }

      // Verify Patient exists and belongs to clinic
      const patRes = await client.query(
        `SELECT id, patient_number, first_name, last_name FROM patients WHERE id = $1 AND clinic_id = $2`,
        [patientId, clinicId]
      );
      if (patRes.rows.length === 0) {
        const err = new Error('Patient record not found in this clinic organization.');
        err.statusCode = 404;
        throw err;
      }

      // Verify Visit exists, belongs to patient and clinic, and is not cancelled
      const visitRes = await client.query(
        `SELECT id, patient_id, branch_id, appointment_id, status FROM patient_visits WHERE id = $1 AND clinic_id = $2`,
        [visitId, clinicId]
      );
      if (visitRes.rows.length === 0) {
        const err = new Error('Patient visit record not found in this clinic organization.');
        err.statusCode = 404;
        throw err;
      }

      const visit = visitRes.rows[0];
      if (visit.patient_id !== patientId) {
        const err = new Error('The specified visit encounter does not belong to the selected patient.');
        err.statusCode = 400;
        throw err;
      }

      if (visit.status === 'cancelled') {
        const err = new Error('Cannot order investigations for a cancelled patient encounter.');
        err.statusCode = 400;
        throw err;
      }

      // Resolve and validate investigation catalogue items (strictly server-side prices)
      let calculatedTotal = 0;
      const validatedItems = [];

      for (const item of items) {
        const invId = item.investigation_id || item.id;
        if (!invId) {
          const err = new Error('Each order item must reference a valid investigation catalogue item.');
          err.statusCode = 400;
          throw err;
        }

        const catRes = await client.query(
          `SELECT * FROM investigation_catalogue WHERE id = $1 AND clinic_id = $2`,
          [invId, clinicId]
        );

        if (catRes.rows.length === 0) {
          const err = new Error(`Investigation catalogue item '${invId}' was not found in this clinic.`);
          err.statusCode = 404;
          throw err;
        }

        const cat = catRes.rows[0];
        if (!cat.is_active) {
          const err = new Error(`Investigation '${cat.name}' (${cat.code}) is inactive and cannot be ordered.`);
          err.statusCode = 400;
          throw err;
        }

        const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
        const unitPrice = parseFloat(cat.price);
        const itemTotal = parseFloat((unitPrice * qty).toFixed(2));
        calculatedTotal += itemTotal;

        validatedItems.push({
          investigation_id: cat.id,
          investigation_code: cat.code,
          investigation_name: cat.name,
          category: cat.category,
          specimen_type: cat.specimen_type,
          sample_required: cat.sample_required,
          unit_price: unitPrice,
          quantity: qty,
          total_price: itemTotal,
        });
      }

      // Atomic Order Number generation
      const orderNumber = await generateInvestigationOrderNumber(client, clinicId);

      // Insert investigation order
      const orderRes = await client.query(
        `INSERT INTO investigation_orders (
           clinic_id, branch_id, order_number, patient_id, visit_id,
           appointment_id, ordered_by_doctor_id, clinical_indication,
           priority, status, total_amount, notes, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ordered', $10, $11, now(), now())
         RETURNING *`,
        [
          clinicId,
          branchId,
          orderNumber,
          patientId,
          visitId,
          visit.appointment_id || null,
          doctorId,
          clinical_indication ? clinical_indication.trim() : null,
          priority,
          calculatedTotal,
          notes ? notes.trim() : null,
        ]
      );

      const createdOrder = orderRes.rows[0];

      // Insert order items & Central Billing charges within the SAME transaction
      const insertedItems = [];
      for (const vi of validatedItems) {
        const itemRes = await client.query(
          `INSERT INTO investigation_order_items (
             clinic_id, order_id, investigation_id, investigation_code, investigation_name,
             category, specimen_type, unit_price, quantity, total_price,
             sample_required, status, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ordered', now(), now())
           RETURNING *`,
          [
            clinicId,
            createdOrder.id,
            vi.investigation_id,
            vi.investigation_code,
            vi.investigation_name,
            vi.category,
            vi.specimen_type,
            vi.unit_price,
            vi.quantity,
            vi.total_price,
            vi.sample_required,
          ]
        );

        const insertedItem = itemRes.rows[0];
        insertedItems.push(insertedItem);

        // Integrate into Central Billing charges table (Idempotent via unique constraint)
        await client.query(
          `INSERT INTO billing_charges (
             clinic_id, branch_id, patient_id, visit_id, appointment_id,
             charge_type, source_id, source_reference, item_code, description,
             unit_price, quantity, gross_amount, discount_amount, net_amount,
             amount_paid, status, created_by, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, 'investigation', $6, $7, $8, $9, $10, $11, $12, 0.00, $12, 0.00, 'pending', $13, now(), now())
           ON CONFLICT (clinic_id, charge_type, source_id) DO NOTHING`,
          [
            clinicId,
            branchId,
            patientId,
            visitId,
            visit.appointment_id || null,
            insertedItem.id,
            orderNumber,
            insertedItem.investigation_code,
            insertedItem.investigation_name,
            insertedItem.unit_price,
            insertedItem.quantity,
            insertedItem.total_price,
            doctorId,
          ]
        );
      }

      // Record in investigation_status_history
      await client.query(
        `INSERT INTO investigation_status_history (
           order_id, from_status, to_status, notes, changed_by, created_at
         ) VALUES ($1, NULL, 'ordered', $2, $3, now())`,
        [
          createdOrder.id,
          `Investigation order ${orderNumber} created with ${insertedItems.length} test item(s) by Dr. Indicating: ${clinical_indication || 'Routine investigation'}`,
          doctorId,
        ]
      );

      await client.query('COMMIT');

      return await this.getOrderById(clinicId, createdOrder.id, userBranchIds);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get complete order details with items, results, and billing summary
   */
  async getOrderById(clinicId, orderId, userBranchIds = []) {
    const orderRes = await query(
      `SELECT io.*,
              b.branch_name, b.branch_code,
              p.first_name AS patient_first_name, p.last_name AS patient_last_name, p.patient_number, p.phone AS patient_phone,
              p.gender AS patient_gender, p.date_of_birth AS patient_dob,
              TRIM(CONCAT(d.first_name, ' ', COALESCE(d.last_name, ''))) AS doctor_name,
              pv.token_display AS visit_token, pv.visit_date,
              TRIM(CONCAT(cb.first_name, ' ', COALESCE(cb.last_name, ''))) AS cancelled_by_name
       FROM investigation_orders io
       JOIN branches b ON io.branch_id = b.id
       JOIN patients p ON io.patient_id = p.id
       JOIN patient_visits pv ON io.visit_id = pv.id
       JOIN users d ON io.ordered_by_doctor_id = d.id
       LEFT JOIN users cb ON io.cancelled_by = cb.id
       WHERE io.id = $1 AND io.clinic_id = $2`,
      [orderId, clinicId]
    );

    if (orderRes.rows.length === 0) {
      const err = new Error('Investigation order not found.');
      err.statusCode = 404;
      throw err;
    }

    const order = orderRes.rows[0];

    // Branch authorization check
    if (userBranchIds && userBranchIds.length > 0 && !userBranchIds.includes(order.branch_id)) {
      const err = new Error('Forbidden. You do not have permission to view orders for this branch.');
      err.statusCode = 403;
      throw err;
    }

    // Fetch order items with any entered results
    const itemsRes = await query(
      `SELECT ioi.*,
              ir.id AS result_id, ir.result_type, ir.results_data, ir.observations,
              ir.abnormal_flag, ir.critical_flag, ir.status AS result_status,
              ir.recorded_at, ir.authorized_at,
              TRIM(CONCAT(rb.first_name, ' ', COALESCE(rb.last_name, ''))) AS recorded_by_name,
              TRIM(CONCAT(ab.first_name, ' ', COALESCE(ab.last_name, ''))) AS authorized_by_name,
              bc.id AS charge_id, bc.status AS billing_status, bc.amount_paid AS charge_amount_paid,
              bc.net_amount AS charge_net_amount
       FROM investigation_order_items ioi
       LEFT JOIN investigation_results ir ON ioi.id = ir.order_item_id
       LEFT JOIN users rb ON ir.recorded_by = rb.id
       LEFT JOIN users ab ON ir.authorized_by = ab.id
       LEFT JOIN billing_charges bc ON bc.source_id = ioi.id AND bc.charge_type = 'investigation'
       WHERE ioi.order_id = $1 AND ioi.clinic_id = $2
       ORDER BY ioi.created_at ASC`,
      [orderId, clinicId]
    );

    // Fetch order status history
    const historyRes = await query(
      `SELECT ish.*,
              TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS changed_by_name
       FROM investigation_status_history ish
       LEFT JOIN users u ON ish.changed_by = u.id
       WHERE ish.order_id = $1
       ORDER BY ish.created_at ASC`,
      [orderId]
    );

    // Fetch attachments
    const attachRes = await query(
      `SELECT ia.*,
              ia.file_path AS file_url,
              COALESCE(ia.description, 'radiograph') AS attachment_type,
              TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS uploaded_by_name
       FROM investigation_attachments ia
       LEFT JOIN users u ON ia.uploaded_by = u.id
       WHERE ia.order_id = $1 AND ia.clinic_id = $2
       ORDER BY ia.created_at DESC`,
      [orderId, clinicId]
    );

    // Central Billing summary for this order
    const totalOrderAmount = parseFloat(order.total_amount || 0);
    let totalPaidForOrder = 0;
    for (const itm of itemsRes.rows) {
      totalPaidForOrder += parseFloat(itm.charge_amount_paid || 0);
    }
    const billingSummary = {
      totalAmount: totalOrderAmount,
      totalPaid: totalPaidForOrder,
      remainingBalance: Math.max(0, parseFloat((totalOrderAmount - totalPaidForOrder).toFixed(2))),
      paymentStatus: totalPaidForOrder >= totalOrderAmount && totalOrderAmount > 0
        ? 'paid'
        : totalPaidForOrder > 0
        ? 'partial'
        : 'pending',
    };

    return {
      ...order,
      items: itemsRes.rows.map((row) => ({
        price_snapshot: row.unit_price,
        total_price: row.total_price || (row.unit_price * (row.quantity || 1)),
        ...row,
        result: row.result_id
          ? {
              id: row.result_id,
              status: row.result_status,
              result_type: row.result_type,
              results_data: row.results_data,
              observations: row.observations,
              abnormal_flag: row.abnormal_flag,
              critical_flag: row.critical_flag,
              recorded_at: row.recorded_at,
              authorized_at: row.authorized_at,
              integrity_hash: row.results_data?.integrity_hash || null,
              recorded_by_name: row.recorded_by_name,
              authorized_by_name: row.authorized_by_name,
              is_authorized: row.result_status === 'authorized' || row.result_status === 'amended',
            }
          : null,
      })),
      statusHistory: historyRes.rows,
      attachments: attachRes.rows,
      billingSummary,
    };
  }

  /**
   * Get orders placed for a specific visit
   */
  async getVisitInvestigationOrders(clinicId, visitId, userBranchIds = []) {
    const ordersRes = await query(
      `SELECT io.*,
              b.branch_name, b.branch_code,
              p.first_name AS patient_first_name, p.last_name AS patient_last_name, p.patient_number,
              TRIM(CONCAT(d.first_name, ' ', COALESCE(d.last_name, ''))) AS doctor_name,
              pv.token_display AS visit_token, pv.visit_date
       FROM investigation_orders io
       JOIN branches b ON io.branch_id = b.id
       JOIN patients p ON io.patient_id = p.id
       JOIN patient_visits pv ON io.visit_id = pv.id
       JOIN users d ON io.ordered_by_doctor_id = d.id
       WHERE io.visit_id = $1 AND io.clinic_id = $2
       ORDER BY io.created_at DESC`,
      [visitId, clinicId]
    );

    const orders = [];
    for (const row of ordersRes.rows) {
      if (userBranchIds && userBranchIds.length > 0 && !userBranchIds.includes(row.branch_id)) {
        continue;
      }
      const full = await this.getOrderById(clinicId, row.id, userBranchIds);
      orders.push(full);
    }

    return orders;
  }

  /**
   * Get all orders for a patient
   */
  async getPatientInvestigationOrders(clinicId, patientId, userBranchIds = []) {
    const ordersRes = await query(
      `SELECT io.*,
              b.branch_name, b.branch_code,
              p.first_name AS patient_first_name, p.last_name AS patient_last_name, p.patient_number,
              TRIM(CONCAT(d.first_name, ' ', COALESCE(d.last_name, ''))) AS doctor_name,
              pv.token_display AS visit_token, pv.visit_date
       FROM investigation_orders io
       JOIN branches b ON io.branch_id = b.id
       JOIN patients p ON io.patient_id = p.id
       JOIN patient_visits pv ON io.visit_id = pv.id
       JOIN users d ON io.ordered_by_doctor_id = d.id
       WHERE io.patient_id = $1 AND io.clinic_id = $2
       ORDER BY io.created_at DESC`,
      [patientId, clinicId]
    );

    const orders = [];
    for (const row of ordersRes.rows) {
      if (userBranchIds && userBranchIds.length > 0 && !userBranchIds.includes(row.branch_id)) {
        continue;
      }
      const full = await this.getOrderById(clinicId, row.id, userBranchIds);
      orders.push(full);
    }

    return orders;
  }

  // ==========================================
  // MODULE G: INVESTIGATION WORKLIST
  // ==========================================

  /**
   * Laboratory / Diagnostics Worklist with pagination and server-side filtering
   */
  async getInvestigationWorklist(clinicId, userBranchIds = [], filters = {}) {
    const {
      page = 1,
      limit = 20,
      status = 'all',
      priority = 'all',
      category = 'all',
      branchId,
      doctorId,
      search,
      startDate,
      endDate,
    } = filters;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let baseSql = `
      FROM investigation_orders io
      JOIN branches b ON io.branch_id = b.id
      JOIN patients p ON io.patient_id = p.id
      JOIN patient_visits pv ON io.visit_id = pv.id
      JOIN users d ON io.ordered_by_doctor_id = d.id
      WHERE io.clinic_id = $1
    `;
    const params = [clinicId];

    // Branch restrictions
    if (branchId) {
      params.push(branchId);
      baseSql += ` AND io.branch_id = $${params.length}`;
    } else if (userBranchIds && userBranchIds.length > 0) {
      params.push(userBranchIds);
      baseSql += ` AND io.branch_id = ANY($${params.length})`;
    }

    if (status && status !== 'all') {
      params.push(status);
      baseSql += ` AND io.status = $${params.length}`;
    }

    if (priority && priority !== 'all') {
      params.push(priority);
      baseSql += ` AND io.priority = $${params.length}`;
    }

    if (doctorId) {
      params.push(doctorId);
      baseSql += ` AND io.ordered_by_doctor_id = $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      baseSql += ` AND io.created_at >= $${params.length}::date`;
    }

    if (endDate) {
      params.push(endDate);
      baseSql += ` AND io.created_at <= ($${params.length}::date + interval '1 day')`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      baseSql += ` AND (
        io.order_number ILIKE $${params.length} OR
        p.patient_number ILIKE $${params.length} OR
        p.first_name ILIKE $${params.length} OR
        p.last_name ILIKE $${params.length} OR
        pv.token_display ILIKE $${params.length} OR
        EXISTS (
          SELECT 1 FROM investigation_order_items ioi
          WHERE ioi.order_id = io.id AND (
            ioi.investigation_name ILIKE $${params.length} OR
            ioi.investigation_code ILIKE $${params.length}
          )
        )
      )`;
    }

    if (category && category !== 'all') {
      params.push(category);
      baseSql += ` AND EXISTS (
        SELECT 1 FROM investigation_order_items ioi
        WHERE ioi.order_id = io.id AND ioi.category = $${params.length}
      )`;
    }

    // Count query
    const countRes = await query(`SELECT COUNT(io.id) AS total ${baseSql}`, params);
    const total = parseInt(countRes.rows[0].total, 10);

    // Data query
    const selectSql = `
      SELECT io.*,
             b.branch_name, b.branch_code,
             p.first_name AS patient_first_name, p.last_name AS patient_last_name, p.patient_number, p.phone AS patient_phone,
             TRIM(CONCAT(d.first_name, ' ', COALESCE(d.last_name, ''))) AS doctor_name,
             pv.token_display AS visit_token, pv.visit_date,
             (SELECT COUNT(*) FROM investigation_order_items WHERE order_id = io.id) AS item_count,
             (SELECT json_agg(json_build_object(
                'id', ioi.id,
                'order_id', ioi.order_id,
                'investigation_id', ioi.investigation_id,
                'investigation_code', ioi.investigation_code,
                'code', ioi.investigation_code,
                'investigation_name', ioi.investigation_name,
                'name', ioi.investigation_name,
                'category', ioi.category,
                'unit_price', ioi.unit_price,
                'quantity', ioi.quantity,
                'total_price', ioi.total_price,
                'status', ioi.status,
                'sample_required', ioi.sample_required,
                'sampleRequired', ioi.sample_required,
                'created_at', ioi.created_at,
                'result', (
                  SELECT json_build_object(
                    'id', ir.id,
                    'order_id', ir.order_id,
                    'order_item_id', ir.order_item_id,
                    'status', ir.status,
                    'result_type', ir.result_type,
                    'results_data', ir.results_data,
                    'abnormal_flag', ir.abnormal_flag,
                    'critical_flag', ir.critical_flag,
                    'observations', ir.observations,
                    'recorded_at', ir.recorded_at,
                    'authorized_at', ir.authorized_at,
                    'authorized_by_name', TRIM(CONCAT(doc.first_name, ' ', COALESCE(doc.last_name, ''))),
                    'is_authorized', (ir.status = 'authorized' OR ir.status = 'amended')
                  )
                  FROM investigation_results ir
                  LEFT JOIN users doc ON ir.authorized_by = doc.id
                  WHERE ir.order_item_id = ioi.id
                  ORDER BY ir.created_at DESC
                  LIMIT 1
                )
              ) ORDER BY ioi.created_at ASC) FROM investigation_order_items ioi WHERE ioi.order_id = io.id) AS items,
             (SELECT json_agg(json_build_object(
                'id', ioi.id,
                'code', ioi.investigation_code,
                'name', ioi.investigation_name,
                'category', ioi.category,
                'status', ioi.status,
                'sampleRequired', ioi.sample_required
              )) FROM investigation_order_items ioi WHERE ioi.order_id = io.id) AS items_preview,
             (SELECT COUNT(*) FROM investigation_results ir WHERE ir.order_id = io.id AND ir.status = 'authorized') AS authorized_results_count
      ${baseSql}
      ORDER BY 
        CASE io.priority
          WHEN 'stat' THEN 1
          WHEN 'urgent' THEN 2
          ELSE 3
        END ASC,
        io.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const dataRes = await query(selectSql, [...params, limitNum, offset]);

    return {
      orders: dataRes.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    };
  }

  // ==========================================
  // MODULE D: INVESTIGATION WORKFLOW
  // ==========================================

  /**
   * Update order status with validation and status history
   */
  async updateOrderStatus(clinicId, userBranchIds = [], orderId, newStatus, notes = null, userId, userRole) {
    if (!VALID_STATUSES.includes(newStatus)) {
      const err = new Error(`Invalid status '${newStatus}'. Allowed: ${VALID_STATUSES.join(', ')}.`);
      err.statusCode = 400;
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(
        `SELECT * FROM investigation_orders WHERE id = $1 AND clinic_id = $2 FOR UPDATE`,
        [orderId, clinicId]
      );

      if (orderRes.rows.length === 0) {
        const err = new Error('Investigation order not found.');
        err.statusCode = 404;
        throw err;
      }

      const order = orderRes.rows[0];

      if (userBranchIds && userBranchIds.length > 0 && !userBranchIds.includes(order.branch_id)) {
        const err = new Error('Forbidden. You do not have permission for this branch.');
        err.statusCode = 403;
        throw err;
      }

      const currentStatus = order.status;

      // Status State Machine Enforcements
      if (currentStatus === 'completed' && newStatus !== 'completed') {
        const err = new Error('Completed orders cannot be transitioned to another status.');
        err.statusCode = 400;
        throw err;
      }

      if (currentStatus === 'cancelled') {
        const err = new Error('Cancelled orders cannot be reopened or transitioned.');
        err.statusCode = 400;
        throw err;
      }

      // Authorization guard for 'authorized' status
      if (newStatus === 'authorized') {
        if (!PRACTITIONER_ROLES.includes(userRole)) {
          const err = new Error('Only authorized practitioners (dentists, specialists, radiologists, or admins) can authorize results.');
          err.statusCode = 403;
          throw err;
        }
      }

      // Handle Cancellation
      if (newStatus === 'cancelled') {
        if (!notes || !notes.trim()) {
          const err = new Error('A cancellation reason is required to cancel an order.');
          err.statusCode = 400;
          throw err;
        }

        // Cancel order items
        await client.query(
          `UPDATE investigation_order_items SET status = 'cancelled', updated_at = now() WHERE order_id = $1`,
          [orderId]
        );

        // Financial Cancellation Handling:
        // Cancel pending billing charges so cashier does not collect for cancelled tests
        await client.query(
          `UPDATE billing_charges
           SET status = 'cancelled',
               notes = CONCAT(COALESCE(notes, ''), ' [Cancelled with investigation order: ', $1::text, ']'),
               updated_at = now()
           WHERE source_id IN (SELECT id FROM investigation_order_items WHERE order_id = $2)
             AND charge_type = 'investigation'
             AND status = 'pending'`,
          [notes.trim(), orderId]
        );

        // Update order record
        await client.query(
          `UPDATE investigation_orders
           SET status = 'cancelled',
               cancellation_reason = $1,
               cancelled_by = $2,
               cancelled_at = now(),
               updated_at = now()
           WHERE id = $3`,
          [notes.trim(), userId, orderId]
        );
      } else {
        // Normal transition
        await client.query(
          `UPDATE investigation_orders
           SET status = $1,
               updated_at = now()
           WHERE id = $2`,
          [newStatus, orderId]
        );

        // Update items status if advancing
        if (['sample_collected', 'in_progress', 'completed'].includes(newStatus)) {
          await client.query(
            `UPDATE investigation_order_items
             SET status = $1, updated_at = now()
             WHERE order_id = $2 AND status != 'cancelled'`,
            [newStatus, orderId]
          );
        }
      }

      // Record in status history
      await client.query(
        `INSERT INTO investigation_status_history (
           order_id, from_status, to_status, notes, changed_by, created_at
         ) VALUES ($1, $2, $3, $4, $5, now())`,
        [orderId, currentStatus, newStatus, notes ? notes.trim() : null, userId]
      );

      await client.query('COMMIT');

      return await this.getOrderById(clinicId, orderId, userBranchIds);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ==========================================
  // MODULE E: RESULTS MANAGEMENT
  // ==========================================

  /**
   * Enter or update draft results for an investigation order item
   */
  async enterResult(clinicId, userBranchIds = [], orderId, itemId, data, userId, userRole) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify item exists and belongs to order and clinic
      const itemRes = await client.query(
        `SELECT ioi.*, io.branch_id, io.status AS order_status
         FROM investigation_order_items ioi
         JOIN investigation_orders io ON ioi.order_id = io.id
         WHERE ioi.id = $1 AND ioi.order_id = $2 AND ioi.clinic_id = $3
         FOR UPDATE`,
        [itemId, orderId, clinicId]
      );

      if (itemRes.rows.length === 0) {
        const err = new Error('Investigation order item not found.');
        err.statusCode = 404;
        throw err;
      }

      const item = itemRes.rows[0];

      if (userBranchIds && userBranchIds.length > 0 && !userBranchIds.includes(item.branch_id)) {
        const err = new Error('Forbidden. You do not have permission for this branch.');
        err.statusCode = 403;
        throw err;
      }

      if (item.status === 'cancelled') {
        const err = new Error('Cannot enter results for a cancelled investigation item.');
        err.statusCode = 400;
        throw err;
      }

      const {
        result_type = 'structured',
        results_data = {},
        observations = null,
        abnormal_flag = false,
        critical_flag = false,
      } = data;

      const resultsJson = typeof results_data === 'string' ? results_data : JSON.stringify(results_data);

      // Check existing result
      const existingRes = await client.query(
        `SELECT * FROM investigation_results WHERE order_item_id = $1 FOR UPDATE`,
        [itemId]
      );

      let savedResult;
      if (existingRes.rows.length === 0) {
        // Insert new draft result
        const ins = await client.query(
          `INSERT INTO investigation_results (
             clinic_id, order_id, order_item_id, investigation_id,
             result_type, results_data, observations, abnormal_flag, critical_flag,
             status, recorded_by, recorded_at, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10, now(), now(), now())
           RETURNING *`,
          [
            clinicId,
            orderId,
            itemId,
            item.investigation_id,
            result_type,
            resultsJson,
            observations ? observations.trim() : null,
            Boolean(abnormal_flag),
            Boolean(critical_flag),
            userId,
          ]
        );
        savedResult = ins.rows[0];
      } else {
        const currentRes = existingRes.rows[0];
        // If already authorized, direct edit is strictly rejected (requires amendResult)
        if (currentRes.status === 'authorized') {
          const err = new Error('This result is already authorized and sealed. Modifications must be recorded as an authorized amendment.');
          err.statusCode = 409;
          throw err;
        }

        const upd = await client.query(
          `UPDATE investigation_results
           SET result_type = $1,
               results_data = $2,
               observations = $3,
               abnormal_flag = $4,
               critical_flag = $5,
               recorded_by = $6,
               recorded_at = now(),
               updated_at = now()
           WHERE id = $7
           RETURNING *`,
          [
            result_type,
            resultsJson,
            observations ? observations.trim() : null,
            Boolean(abnormal_flag),
            Boolean(critical_flag),
            userId,
            currentRes.id,
          ]
        );
        savedResult = upd.rows[0];
      }

      // Advance item and order status to 'result_entered' if currently ordered or in_progress
      await client.query(
        `UPDATE investigation_order_items
         SET status = 'result_entered', updated_at = now()
         WHERE id = $1 AND status IN ('ordered', 'sample_collected', 'in_progress')`,
        [itemId]
      );

      if (['ordered', 'sample_collected', 'in_progress'].includes(item.order_status)) {
        await client.query(
          `UPDATE investigation_orders
           SET status = 'result_entered', updated_at = now()
           WHERE id = $1`,
          [orderId]
        );

        await client.query(
          `INSERT INTO investigation_status_history (
             order_id, item_id, from_status, to_status, notes, changed_by, created_at
           ) VALUES ($1, $2, $3, 'result_entered', 'Investigation results entered into clinical record.', $4, now())`,
          [orderId, itemId, item.order_status, userId]
        );
      }

      await client.query('COMMIT');
      return savedResult;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Authorize / Review investigation result (Practitioner authority required)
   */
  async authorizeResult(clinicId, userBranchIds = [], resultId, userId, userRole) {
    if (!PRACTITIONER_ROLES.includes(userRole)) {
      const err = new Error('Only authorized practitioners (dentists, specialists, radiologists, or admins) can authorize results.');
      err.statusCode = 403;
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const resCheck = await client.query(
        `SELECT ir.*, io.branch_id, io.id AS order_id, ioi.id AS item_id
         FROM investigation_results ir
         JOIN investigation_orders io ON ir.order_id = io.id
         JOIN investigation_order_items ioi ON ir.order_item_id = ioi.id
         WHERE ir.id = $1 AND ir.clinic_id = $2
         FOR UPDATE`,
        [resultId, clinicId]
      );

      if (resCheck.rows.length === 0) {
        const err = new Error('Investigation result not found.');
        err.statusCode = 404;
        throw err;
      }

      const resRecord = resCheck.rows[0];

      if (userBranchIds && userBranchIds.length > 0 && !userBranchIds.includes(resRecord.branch_id)) {
        const err = new Error('Forbidden. You do not have permission for this branch.');
        err.statusCode = 403;
        throw err;
      }

      // Mark result as authorized
      const updRes = await client.query(
        `UPDATE investigation_results
         SET status = 'authorized',
             authorized_by = $1,
             authorized_at = now(),
             updated_at = now()
         WHERE id = $2
         RETURNING *`,
        [userId, resultId]
      );

      // Advance item to 'authorized'
      await client.query(
        `UPDATE investigation_order_items
         SET status = 'authorized', updated_at = now()
         WHERE id = $1`,
        [resRecord.item_id]
      );

      // Check if all items in the order are authorized
      const pendingItems = await client.query(
        `SELECT COUNT(*) AS pending_count
         FROM investigation_order_items
         WHERE order_id = $1 AND status NOT IN ('authorized', 'completed', 'cancelled')`,
        [resRecord.order_id]
      );

      const allAuthorized = parseInt(pendingItems.rows[0].pending_count, 10) === 0;
      if (allAuthorized) {
        await client.query(
          `UPDATE investigation_orders
           SET status = 'authorized', updated_at = now()
           WHERE id = $1`,
          [resRecord.order_id]
        );
      }

      // Record in status history
      await client.query(
        `INSERT INTO investigation_status_history (
           order_id, item_id, from_status, to_status, notes, changed_by, created_at
         ) VALUES ($1, $2, 'result_entered', 'authorized', 'Investigation result formally reviewed and authorized by practitioner.', $3, now())`,
        [resRecord.order_id, resRecord.item_id, userId]
      );

      await client.query('COMMIT');
      return updRes.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Amend an authorized result with legal amendment audit trail
   */
  async amendResult(clinicId, userBranchIds = [], resultId, reason, newData, userId, userRole) {
    if (!PRACTITIONER_ROLES.includes(userRole)) {
      const err = new Error('Only authorized practitioners can record result amendments.');
      err.statusCode = 403;
      throw err;
    }

    if (!reason || !reason.trim()) {
      const err = new Error('A clinical reason is mandatory to amend an authorized result.');
      err.statusCode = 400;
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const resCheck = await client.query(
        `SELECT ir.*, io.branch_id, io.id AS order_id, ioi.id AS item_id
         FROM investigation_results ir
         JOIN investigation_orders io ON ir.order_id = io.id
         JOIN investigation_order_items ioi ON ir.order_item_id = ioi.id
         WHERE ir.id = $1 AND ir.clinic_id = $2
         FOR UPDATE`,
        [resultId, clinicId]
      );

      if (resCheck.rows.length === 0) {
        const err = new Error('Investigation result not found.');
        err.statusCode = 404;
        throw err;
      }

      const resRecord = resCheck.rows[0];

      if (userBranchIds && userBranchIds.length > 0 && !userBranchIds.includes(resRecord.branch_id)) {
        const err = new Error('Forbidden. You do not have permission for this branch.');
        err.statusCode = 403;
        throw err;
      }

      const prevData = {
        result_type: resRecord.result_type,
        results_data: resRecord.results_data,
        observations: resRecord.observations,
        abnormal_flag: resRecord.abnormal_flag,
        critical_flag: resRecord.critical_flag,
        authorized_by: resRecord.authorized_by,
        authorized_at: resRecord.authorized_at,
      };

      const newJson = typeof newData.results_data === 'string'
        ? newData.results_data
        : JSON.stringify(newData.results_data || resRecord.results_data);

      // Insert amendment audit record
      await client.query(
        `INSERT INTO investigation_result_amendments (
           result_id, amended_by, reason, previous_data, new_data, amended_at
         ) VALUES ($1, $2, $3, $4, $5, now())`,
        [
          resultId,
          userId,
          reason.trim(),
          JSON.stringify(prevData),
          newJson,
        ]
      );

      // Update current result
      const updRes = await client.query(
        `UPDATE investigation_results
         SET result_type = COALESCE($1, result_type),
             results_data = $2,
             observations = COALESCE($3, observations),
             abnormal_flag = COALESCE($4, abnormal_flag),
             critical_flag = COALESCE($5, critical_flag),
             status = 'amended',
             authorized_by = $6,
             authorized_at = now(),
             updated_at = now()
         WHERE id = $7
         RETURNING *`,
        [
          newData.result_type || null,
          newJson,
          newData.observations ? newData.observations.trim() : null,
          newData.abnormal_flag !== undefined ? Boolean(newData.abnormal_flag) : null,
          newData.critical_flag !== undefined ? Boolean(newData.critical_flag) : null,
          userId,
          resultId,
        ]
      );

      // Record in status history
      await client.query(
        `INSERT INTO investigation_status_history (
           order_id, item_id, from_status, to_status, notes, changed_by, created_at
         ) VALUES ($1, $2, 'authorized', 'authorized', $3, $4, now())`,
        [
          resRecord.order_id,
          resRecord.item_id,
          `Legal amendment recorded: ${reason.trim()}`,
          userId,
        ]
      );

      await client.query('COMMIT');
      return updRes.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ==========================================
  // MODULE F: REPORTS AND ATTACHMENTS
  // ==========================================

  /**
   * Get printable report data for an investigation order
   */
  async getPrintableReport(clinicId, orderId, userBranchIds = []) {
    const fullOrder = await this.getOrderById(clinicId, orderId, userBranchIds);

    // Fetch clinic branding and address
    const clinicRes = await query(
      `SELECT name, code, email, phone, address FROM clinics WHERE id = $1`,
      [clinicId]
    );
    const clinic = clinicRes.rows[0] || {};

    return {
      clinic: {
        name: clinic.name || 'VoiceGate Dental Care',
        code: clinic.code,
        email: clinic.email,
        phone: clinic.phone,
        address: clinic.address,
        branchName: fullOrder.branch_name,
        branchCode: fullOrder.branch_code,
      },
      patient: {
        id: fullOrder.patient_id,
        name: `${fullOrder.patient_first_name} ${fullOrder.patient_last_name}`,
        patientNumber: fullOrder.patient_number,
        phone: fullOrder.patient_phone,
        gender: fullOrder.patient_gender,
        dob: fullOrder.patient_dob,
      },
      order: {
        id: fullOrder.id,
        orderNumber: fullOrder.order_number,
        visitToken: fullOrder.visit_token,
        visitDate: fullOrder.visit_date,
        doctorName: fullOrder.doctor_name,
        orderDate: fullOrder.created_at,
        priority: fullOrder.priority,
        status: fullOrder.status,
        clinicalIndication: fullOrder.clinical_indication,
        notes: fullOrder.notes,
      },
      items: fullOrder.items,
      billingSummary: fullOrder.billingSummary,
    };
  }

  /**
   * Add attachment to an order
   */
  async addAttachment(clinicId, userBranchIds = [], orderId, fileData, userId) {
    const {
      file_name,
      file_type,
      file_size,
      file_path,
      file_url,
      description = null,
      notes = null,
    } = fileData;

    const resolvedFilePath = file_path || file_url;
    if (!file_name || !resolvedFilePath) {
      const err = new Error('file_name and file_path are required.');
      err.statusCode = 400;
      throw err;
    }

    const order = await this.getOrderById(clinicId, orderId, userBranchIds);

    const res = await query(
      `INSERT INTO investigation_attachments (
         clinic_id, order_id, file_name, file_type, file_size, file_path, description, uploaded_by, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       RETURNING *`,
      [
        clinicId,
        orderId,
        file_name,
        file_type || 'application/octet-stream',
        file_size || 0,
        resolvedFilePath,
        (description || notes) ? (description || notes).trim() : null,
        userId,
      ]
    );

    const row = res.rows[0];
    return {
      ...row,
      file_url: row.file_path,
      attachment_type: row.description || 'radiograph',
    };
  }

  /**
   * Delete attachment from an order
   */
  async deleteAttachment(clinicId, userBranchIds = [], orderId, attachmentId) {
    await this.getOrderById(clinicId, orderId, userBranchIds);
    const delRes = await query(
      `DELETE FROM investigation_attachments
       WHERE id = $1 AND order_id = $2 AND clinic_id = $3
       RETURNING id`,
      [attachmentId, orderId, clinicId]
    );
    if (delRes.rows.length === 0) {
      const err = new Error('Attachment not found.');
      err.statusCode = 404;
      throw err;
    }
    return { success: true, message: 'Attachment deleted successfully.' };
  }

  /**
   * List attachments for order
   */
  async getAttachments(clinicId, userBranchIds = [], orderId) {
    await this.getOrderById(clinicId, orderId, userBranchIds);
    const res = await query(
      `SELECT ia.*,
              ia.file_path AS file_url,
              COALESCE(ia.description, 'radiograph') AS attachment_type,
              TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS uploaded_by_name
       FROM investigation_attachments ia
       LEFT JOIN users u ON ia.uploaded_by = u.id
       WHERE ia.order_id = $1 AND ia.clinic_id = $2
       ORDER BY ia.created_at DESC`,
      [orderId, clinicId]
    );
    return res.rows;
  }
}

module.exports = new InvestigationService();
