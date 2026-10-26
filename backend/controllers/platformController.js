const bcrypt = require('bcryptjs');
const { pool, query } = require('../config/database');
const { recordAuditLog } = require('../utils/auditLogger');
const {
  validateOnboardClinic,
  validateUpdateClinic,
  validatePlan,
  UUID_REGEX,
} = require('../validations/platformValidation');

/**
 * Platform Overview Dashboard Metrics
 * GET /api/platform/overview
 */
const getPlatformOverview = async (req, res, next) => {
  try {
    const [clinicsCountRes, branchesCountRes, usersCountRes, plansRes, recentLogsRes] =
      await Promise.all([
        query(`
          SELECT 
            COUNT(*)::int AS total_clinics,
            COUNT(CASE WHEN subscription_status = 'active' AND is_active = true THEN 1 END)::int AS active_clinics,
            COUNT(CASE WHEN subscription_status = 'suspended' THEN 1 END)::int AS suspended_clinics,
            COUNT(CASE WHEN subscription_status = 'trial' THEN 1 END)::int AS trial_clinics
          FROM clinics
        `),
        query('SELECT COUNT(*)::int AS total_branches FROM branches'),
        query('SELECT COUNT(*)::int AS total_users FROM users WHERE is_platform_admin = false'),
        query(`
          SELECT p.id, p.plan_code, p.plan_name, p.max_branches,
                 COUNT(c.id)::int AS assigned_clinics_count
          FROM subscription_plans p
          LEFT JOIN clinics c ON p.id = c.subscription_plan_id
          GROUP BY p.id
          ORDER BY p.max_branches ASC
        `),
        query(`
          SELECT a.id, a.action, a.entity_type, a.entity_id, a.created_at,
                 u.email AS performed_by_email
          FROM audit_logs a
          LEFT JOIN users u ON a.user_id = u.id
          WHERE a.action LIKE 'PLATFORM_%' OR a.action = 'CLINIC_ONBOARDED'
          ORDER BY a.created_at DESC
          LIMIT 10
        `),
      ]);

    res.status(200).json({
      success: true,
      metrics: {
        clinics: clinicsCountRes.rows[0],
        totalBranches: branchesCountRes.rows[0].total_branches,
        totalUsers: usersCountRes.rows[0].total_users,
        planDistribution: plansRes.rows,
        recentActivity: recentLogsRes.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List all clinic organizations with subscription and branch statistics
 * GET /api/platform/clinics
 */
const listClinics = async (req, res, next) => {
  try {
    const { search, status, plan } = req.query;

    let sql = `
      SELECT 
        c.id, c.code, c.name, c.phone, c.email, c.address, c.timezone,
        c.is_active, c.subscription_status, c.subscription_started_at,
        c.subscription_expires_at, c.max_branches_override,
        c.created_at, c.updated_at,
        p.id AS plan_id, p.plan_code, p.plan_name, p.max_branches,
        COALESCE(c.max_branches_override, p.max_branches, 1) AS effective_max_branches,
        COUNT(DISTINCT b.id)::int AS branches_count,
        COUNT(DISTINCT u.id)::int AS staff_count
      FROM clinics c
      LEFT JOIN subscription_plans p ON c.subscription_plan_id = p.id
      LEFT JOIN branches b ON c.id = b.clinic_id
      LEFT JOIN users u ON c.id = u.clinic_id AND u.is_platform_admin = false
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (status && status.trim()) {
      sql += ` AND c.subscription_status = $${paramIndex}`;
      params.push(status.trim().toLowerCase());
      paramIndex++;
    }

    if (plan && plan.trim()) {
      sql += ` AND p.plan_code = $${paramIndex}`;
      params.push(plan.trim().toUpperCase());
      paramIndex++;
    }

    if (search && search.trim()) {
      sql += ` AND (c.name ILIKE $${paramIndex} OR c.code ILIKE $${paramIndex} OR c.email ILIKE $${paramIndex})`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    sql += ` GROUP BY c.id, p.id ORDER BY c.created_at DESC`;

    const result = await query(sql, params);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      clinics: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get detailed information for a single clinic organization
 * GET /api/platform/clinics/:id
 */
const getClinicById = async (req, res, next) => {
  try {
    const clinicId = req.params.id;

    if (!UUID_REGEX.test(clinicId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid clinic ID format. Must be a valid UUID.',
      });
    }

    const clinicRes = await query(
      `SELECT 
        c.id, c.code, c.name, c.phone, c.email, c.address, c.timezone,
        c.is_active, c.subscription_status, c.subscription_started_at,
        c.subscription_expires_at, c.max_branches_override,
        c.created_at, c.updated_at,
        p.id AS plan_id, p.plan_code, p.plan_name, p.max_branches,
        COALESCE(c.max_branches_override, p.max_branches, 1) AS effective_max_branches
       FROM clinics c
       LEFT JOIN subscription_plans p ON c.subscription_plan_id = p.id
       WHERE c.id = $1`,
      [clinicId]
    );

    if (clinicRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Clinic organization not found.',
      });
    }

    const clinic = clinicRes.rows[0];

    // Fetch branches for this clinic
    const branchesRes = await query(
      `SELECT b.id, b.branch_code, b.branch_name, b.city, b.state, b.phone, b.email,
              b.is_active, b.is_default, b.created_at,
              COUNT(DISTINCT ub.user_id)::int AS assigned_staff_count
       FROM branches b
       LEFT JOIN user_branches ub ON b.id = ub.branch_id
       WHERE b.clinic_id = $1
       GROUP BY b.id
       ORDER BY b.is_default DESC, b.created_at ASC`,
      [clinicId]
    );

    // Fetch clinic administrators & staff counts
    const staffRes = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.is_active,
              r.name AS role_name, r.display_name AS role_display
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.clinic_id = $1
       ORDER BY (r.name = 'admin') DESC, u.created_at ASC`,
      [clinicId]
    );

    res.status(200).json({
      success: true,
      clinic: {
        ...clinic,
        branches: branchesRes.rows,
        staff: staffRes.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Managed Clinic Onboarding Workflow
 * POST /api/platform/clinics/onboard
 * 
 * Atomically provisions:
 * 1. Clinic organization record with subscription tier
 * 2. Primary default branch
 * 3. Initial Clinic Administrator account with hashed password
 * 4. User-branch assignment mapping
 * 5. Platform audit log trail
 */
const onboardClinic = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const validation = validateOnboardClinic(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Clinic onboarding validation failed.',
        errors: validation.errors,
      });
    }

    const {
      clinic_name,
      clinic_code,
      phone,
      email,
      address,
      timezone = 'Asia/Kolkata',
      subscription_plan_id,
      plan_code = 'STARTER',
      primary_branch = {},
      admin_user = {},
    } = req.body;

    const normalizedClinicCode = clinic_code.trim().toUpperCase();
    const normalizedAdminEmail = admin_user.email.trim().toLowerCase();
    const normalizedBranchCode = (primary_branch.branch_code || 'MAIN-01').trim().toUpperCase();

    // Check clinic code uniqueness
    const codeCheck = await client.query(
      'SELECT id FROM clinics WHERE LOWER(code) = LOWER($1)',
      [normalizedClinicCode]
    );
    if (codeCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Clinic code '${normalizedClinicCode}' already exists. Organization codes must be globally unique.`,
      });
    }

    // Check administrator email uniqueness
    const emailCheck = await client.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [normalizedAdminEmail]
    );
    if (emailCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `User with email '${normalizedAdminEmail}' already exists in the system.`,
      });
    }

    // Resolve and validate subscription plan
    let planId = subscription_plan_id;
    if (planId) {
      const planRes = await client.query(
        'SELECT id, plan_code, plan_name, is_active FROM subscription_plans WHERE id = $1',
        [planId]
      );
      if (planRes.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Selected subscription plan not found.',
        });
      }
      if (!planRes.rows[0].is_active) {
        return res.status(400).json({
          success: false,
          message: `Cannot assign inactive subscription plan '${planRes.rows[0].plan_code}'. Please select an active plan.`,
        });
      }
    } else {
      const planRes = await client.query(
        'SELECT id, plan_code, plan_name, is_active FROM subscription_plans WHERE plan_code = $1',
        [plan_code.toUpperCase()]
      );
      if (planRes.rows.length > 0) {
        if (!planRes.rows[0].is_active) {
          return res.status(400).json({
            success: false,
            message: `Cannot assign inactive subscription plan '${planRes.rows[0].plan_code}'. Please select an active plan.`,
          });
        }
        planId = planRes.rows[0].id;
      } else {
        // Fallback to first available active plan
        const defaultPlan = await client.query('SELECT id FROM subscription_plans WHERE is_active = true ORDER BY max_branches ASC LIMIT 1');
        planId = defaultPlan.rows[0]?.id || null;
      }
    }

    // Resolve clinic administrator role ID
    const roleRes = await client.query("SELECT id FROM roles WHERE name = 'admin'");
    if (roleRes.rows.length === 0) {
      throw new Error("System role 'admin' not found.");
    }
    const adminRoleId = roleRes.rows[0].id;

    // Begin atomic transaction
    await client.query('BEGIN');

    // 1. Insert Clinic Organization
    const clinicInsert = await client.query(
      `INSERT INTO clinics (
        code, name, phone, email, address, timezone,
        subscription_plan_id, subscription_status, subscription_started_at, is_active
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, 'active', now(), true
      ) RETURNING id, code, name, phone, email, address, timezone, subscription_status, created_at`,
      [
        normalizedClinicCode,
        clinic_name.trim(),
        phone ? phone.trim() : null,
        email ? email.trim() : null,
        address ? address.trim() : null,
        timezone.trim(),
        planId,
      ]
    );
    const newClinic = clinicInsert.rows[0];

    // 2. Insert Primary Default Branch
    const branchInsert = await client.query(
      `INSERT INTO branches (
        clinic_id, branch_code, branch_name, address_line1,
        city, state, postal_code, country, phone, email, timezone,
        is_default, is_active
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9, $10, $11,
        true, true
      ) RETURNING id, branch_code, branch_name, is_default, is_active`,
      [
        newClinic.id,
        normalizedBranchCode,
        (primary_branch.branch_name || `${newClinic.name} - Headquarters`).trim(),
        primary_branch.address_line1 || address || null,
        primary_branch.city || 'Metro City',
        primary_branch.state || null,
        primary_branch.postal_code || null,
        primary_branch.country || 'India',
        primary_branch.phone || phone || null,
        primary_branch.email || email || null,
        primary_branch.timezone || timezone,
      ]
    );
    const newBranch = branchInsert.rows[0];

    // 3. Hash Administrator Password
    const passwordHash = await bcrypt.hash(admin_user.password, 10);

    // 4. Insert Initial Clinic Administrator
    const userInsert = await client.query(
      `INSERT INTO users (
        clinic_id, role_id, email, password_hash, first_name, last_name,
        phone, is_platform_admin, is_active
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, false, true
      ) RETURNING id, email, first_name, last_name, is_active`,
      [
        newClinic.id,
        adminRoleId,
        normalizedAdminEmail,
        passwordHash,
        admin_user.first_name.trim(),
        admin_user.last_name ? admin_user.last_name.trim() : null,
        admin_user.phone ? admin_user.phone.trim() : null,
      ]
    );
    const newAdmin = userInsert.rows[0];

    // 5. Map Administrator to Primary Branch
    await client.query(
      `INSERT INTO user_branches (user_id, branch_id, is_default)
       VALUES ($1, $2, true)`,
      [newAdmin.id, newBranch.id]
    );

    // 6. Record Platform Audit Trail
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, branch_id, ip_address, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user.id,
        'PLATFORM_CLINIC_ONBOARDED',
        'clinics',
        newClinic.id,
        newBranch.id,
        req.ip || '127.0.0.1',
        JSON.stringify({
          clinicCode: newClinic.code,
          clinicName: newClinic.name,
          adminEmail: newAdmin.email,
          branchCode: newBranch.branch_code,
          planId,
        }),
      ]
    );

    // Commit Transaction
    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: `Clinic organization '${newClinic.name}' successfully provisioned.`,
      clinic: newClinic,
      primaryBranch: newBranch,
      administrator: {
        id: newAdmin.id,
        email: newAdmin.email,
        firstName: newAdmin.first_name,
        lastName: newAdmin.last_name,
        role: 'admin',
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

/**
 * Update Clinic Details
 * PUT /api/platform/clinics/:id
 */
const updateClinic = async (req, res, next) => {
  try {
    const clinicId = req.params.id;

    if (!UUID_REGEX.test(clinicId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid clinic ID format.',
      });
    }

    const validation = validateUpdateClinic(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: validation.errors,
      });
    }

    const { name, phone, email, address, timezone, max_branches_override } = req.body;

    const updateRes = await query(
      `UPDATE clinics
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           email = COALESCE($3, email),
           address = COALESCE($4, address),
           timezone = COALESCE($5, timezone),
           max_branches_override = $6,
           updated_at = now()
       WHERE id = $7
       RETURNING *`,
      [
        name ? name.trim() : null,
        phone !== undefined ? (phone ? phone.trim() : null) : null,
        email !== undefined ? (email ? email.trim() : null) : null,
        address !== undefined ? (address ? address.trim() : null) : null,
        timezone !== undefined ? (timezone ? timezone.trim() : null) : null,
        max_branches_override !== undefined ? (max_branches_override ? parseInt(max_branches_override, 10) : null) : null,
        clinicId,
      ]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Clinic not found.',
      });
    }

    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.user.id,
        'PLATFORM_CLINIC_UPDATED',
        'clinics',
        clinicId,
        req.ip || '127.0.0.1',
        JSON.stringify({ updatedFields: Object.keys(req.body) }),
      ]
    );

    res.status(200).json({
      success: true,
      message: 'Clinic organization updated successfully.',
      clinic: updateRes.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Activate, suspend, or reactivate a clinic organization
 * PATCH /api/platform/clinics/:id/status
 */
const updateClinicStatus = async (req, res, next) => {
  try {
    const clinicId = req.params.id;
    const { status, is_active } = req.body;

    if (!UUID_REGEX.test(clinicId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid clinic ID format.',
      });
    }

    const validStatuses = ['active', 'suspended', 'trial', 'expired'];
    let newStatus = status ? status.toLowerCase() : null;

    if (newStatus && !validStatuses.includes(newStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid subscription status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    let activeFlag = is_active;
    if (newStatus === 'suspended') {
      activeFlag = false;
    } else if (newStatus === 'active' && activeFlag === undefined) {
      activeFlag = true;
    }

    const updateRes = await query(
      `UPDATE clinics
       SET subscription_status = COALESCE($1, subscription_status),
           is_active = COALESCE($2, is_active),
           updated_at = now()
       WHERE id = $3
       RETURNING id, code, name, subscription_status, is_active, updated_at`,
      [newStatus, activeFlag, clinicId]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Clinic not found.',
      });
    }

    const clinic = updateRes.rows[0];

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.user.id,
        'PLATFORM_CLINIC_STATUS_CHANGED',
        'clinics',
        clinicId,
        req.ip || '127.0.0.1',
        JSON.stringify({ subscription_status: clinic.subscription_status, is_active: clinic.is_active }),
      ]
    );

    res.status(200).json({
      success: true,
      message: `Clinic status changed to '${clinic.subscription_status}' (active: ${clinic.is_active}).`,
      clinic,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List all subscription plans
 * GET /api/platform/plans
 */
const listPlans = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT p.id, p.plan_code, p.plan_name, p.description, p.max_branches,
             p.is_active, p.created_at, p.updated_at,
             COUNT(c.id)::int AS subscriber_count
      FROM subscription_plans p
      LEFT JOIN clinics c ON p.id = c.subscription_plan_id
      GROUP BY p.id
      ORDER BY p.max_branches ASC
    `);

    res.status(200).json({
      success: true,
      plans: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new subscription plan
 * POST /api/platform/plans
 */
const createPlan = async (req, res, next) => {
  try {
    const validation = validatePlan(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Plan validation failed.',
        errors: validation.errors,
      });
    }

    const { plan_code, plan_name, description, max_branches, is_active = true } = req.body;
    const normalizedCode = plan_code.trim().toUpperCase();

    const existingCheck = await query('SELECT id FROM subscription_plans WHERE plan_code = $1', [normalizedCode]);
    if (existingCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Plan with code '${normalizedCode}' already exists.`,
      });
    }

    const insertRes = await query(
      `INSERT INTO subscription_plans (plan_code, plan_name, description, max_branches, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [normalizedCode, plan_name.trim(), description ? description.trim() : null, parseInt(max_branches, 10), Boolean(is_active)]
    );

    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.user.id,
        'PLATFORM_PLAN_CREATED',
        'subscription_plans',
        insertRes.rows[0].id,
        req.ip || '127.0.0.1',
        JSON.stringify({ plan_code: normalizedCode, max_branches }),
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Subscription plan created.',
      plan: insertRes.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

const updatePlan = async (req, res, next) => {
  try {
    const planId = req.params.id;
    const { plan_name, description, max_branches, is_active } = req.body;

    // Fetch existing plan state before update for audit comparison
    const existingPlanRes = await query(
      'SELECT id, plan_code, plan_name, description, max_branches, is_active FROM subscription_plans WHERE id = $1',
      [planId]
    );

    if (existingPlanRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found.',
      });
    }

    const previousPlan = existingPlanRes.rows[0];

    const updateRes = await query(
      `UPDATE subscription_plans
       SET plan_name = COALESCE($1, plan_name),
           description = COALESCE($2, description),
           max_branches = COALESCE($3, max_branches),
           is_active = COALESCE($4, is_active),
           updated_at = now()
       WHERE id = $5
       RETURNING *`,
      [
        plan_name ? plan_name.trim() : null,
        description !== undefined ? description : null,
        max_branches ? parseInt(max_branches, 10) : null,
        is_active !== undefined ? Boolean(is_active) : null,
        planId,
      ]
    );

    const updatedPlan = updateRes.rows[0];

    // Audit log plan modifications with before and after state
    await recordAuditLog({
      userId: req.user.id,
      action: 'PLATFORM_PLAN_UPDATED',
      entityType: 'subscription_plans',
      entityId: planId,
      ipAddress: req.ip || '127.0.0.1',
      details: {
        planCode: previousPlan.plan_code,
        before: {
          planName: previousPlan.plan_name,
          maxBranches: previousPlan.max_branches,
          isActive: previousPlan.is_active,
        },
        after: {
          planName: updatedPlan.plan_name,
          maxBranches: updatedPlan.max_branches,
          isActive: updatedPlan.is_active,
        },
      },
    });

    res.status(200).json({
      success: true,
      message: 'Subscription plan updated.',
      plan: updatedPlan,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Assign / Upgrade / Downgrade Plan for a Clinic
 * POST /api/platform/clinics/:id/plan
 */
const assignPlanToClinic = async (req, res, next) => {
  try {
    const clinicId = req.params.id;
    const { plan_id, plan_code, max_branches_override, subscription_status, subscription_expires_at } = req.body;

    let targetPlan = null;

    if (plan_id) {
      const planRes = await query(
        'SELECT id, plan_code, plan_name, max_branches, is_active FROM subscription_plans WHERE id = $1',
        [plan_id]
      );
      if (planRes.rows.length > 0) {
        targetPlan = planRes.rows[0];
      }
    } else if (plan_code) {
      const planRes = await query(
        'SELECT id, plan_code, plan_name, max_branches, is_active FROM subscription_plans WHERE plan_code = $1',
        [plan_code.toUpperCase()]
      );
      if (planRes.rows.length > 0) {
        targetPlan = planRes.rows[0];
      }
    }

    if (!targetPlan) {
      return res.status(400).json({
        success: false,
        message: 'Valid plan_id or plan_code is required.',
      });
    }

    // Security & Business Rule: Inactive subscription plans cannot be assigned to clinics
    if (!targetPlan.is_active) {
      return res.status(400).json({
        success: false,
        message: `Cannot assign inactive subscription plan '${targetPlan.plan_code}'. Only active plans can be assigned to clinics.`,
      });
    }

    const updateRes = await query(
      `UPDATE clinics
       SET subscription_plan_id = $1,
           subscription_status = COALESCE($2, subscription_status),
           max_branches_override = $3,
           subscription_expires_at = COALESCE($4, subscription_expires_at),
           updated_at = now()
       WHERE id = $5
       RETURNING id, code, name, subscription_plan_id, subscription_status, max_branches_override, subscription_expires_at`,
      [
        targetPlan.id,
        subscription_status || 'active',
        max_branches_override !== undefined ? (max_branches_override ? parseInt(max_branches_override, 10) : null) : null,
        subscription_expires_at !== undefined ? subscription_expires_at : null,
        clinicId,
      ]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Clinic not found.',
      });
    }

    await recordAuditLog({
      userId: req.user.id,
      action: 'PLATFORM_CLINIC_PLAN_ASSIGNED',
      entityType: 'clinics',
      entityId: clinicId,
      ipAddress: req.ip || '127.0.0.1',
      details: {
        planId: targetPlan.id,
        planCode: targetPlan.plan_code,
        override: max_branches_override,
        subscriptionStatus: updateRes.rows[0].subscription_status,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Subscription plan successfully assigned to clinic.',
      clinic: updateRes.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPlatformOverview,
  listClinics,
  getClinicById,
  onboardClinic,
  updateClinic,
  updateClinicStatus,
  listPlans,
  createPlan,
  updatePlan,
  assignPlanToClinic,
};
