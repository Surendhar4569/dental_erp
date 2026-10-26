const { query } = require('../config/database');
const {
  validateCreateBranch,
  validateUpdateBranch,
  validateAssignUser,
  UUID_REGEX,
} = require('../validations/branchValidation');

/**
 * List branches available to authenticated user
 * GET /api/branches
 * - Admin: All branches in organization (with user counts & active status)
 * - Non-admin: Only active branches assigned to this user
 */
const listBranches = async (req, res, next) => {
  try {
    const { clinicId, role, id: userId } = req.user;
    const { search, is_active } = req.query;

    let result;

    let sql;
    let params;

    if (role === 'admin') {
      sql = `
        SELECT b.id, b.clinic_id, b.branch_code, b.branch_name,
               b.address_line1, b.address_line2, b.city, b.state, b.postal_code, b.country,
               b.phone, b.email, b.timezone, b.is_active, b.is_default,
               b.created_at, b.updated_at,
               ub_self.is_default AS is_user_default,
               COUNT(DISTINCT ub_all.user_id)::int AS assigned_users_count,
               COUNT(DISTINCT CASE WHEN r.name = 'dentist' THEN ub_all.user_id END)::int AS active_dentists_count
        FROM branches b
        JOIN user_branches ub_self ON b.id = ub_self.branch_id AND ub_self.user_id = $1
        LEFT JOIN user_branches ub_all ON b.id = ub_all.branch_id
        LEFT JOIN users u ON ub_all.user_id = u.id AND u.is_active = true
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE b.clinic_id = $2
      `;
      params = [userId, clinicId];
      let paramIndex = 3;

      if (is_active !== undefined) {
        sql += ` AND b.is_active = $${paramIndex}`;
        params.push(is_active === 'true' || is_active === true);
        paramIndex++;
      }

      if (search && search.trim()) {
        sql += ` AND (b.branch_name ILIKE $${paramIndex} OR b.branch_code ILIKE $${paramIndex} OR b.city ILIKE $${paramIndex})`;
        params.push(`%${search.trim()}%`);
        paramIndex++;
      }

      sql += ` GROUP BY b.id, ub_self.is_default ORDER BY ub_self.is_default DESC, b.is_default DESC, b.created_at ASC`;
    } else {
      sql = `
        SELECT b.id, b.clinic_id, b.branch_code, b.branch_name,
               b.address_line1, b.address_line2, b.city, b.state, b.postal_code, b.country,
               b.phone, b.email, b.timezone, b.is_active, b.is_default,
               b.created_at, b.updated_at,
               ub.is_default AS is_user_default
        FROM branches b
        JOIN user_branches ub ON b.id = ub.branch_id
        WHERE ub.user_id = $1 AND b.clinic_id = $2 AND b.is_active = true
      `;
      params = [userId, clinicId];
      let paramIndex = 3;

      if (search && search.trim()) {
        sql += ` AND (b.branch_name ILIKE $${paramIndex} OR b.branch_code ILIKE $${paramIndex} OR b.city ILIKE $${paramIndex})`;
        params.push(`%${search.trim()}%`);
        paramIndex++;
      }

      sql += ` ORDER BY ub.is_default DESC, b.branch_name ASC`;
    }

    result = await query(sql, params);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      branches: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get branch details by ID
 * GET /api/branches/:id
 * Protected by authorizeBranchAccess
 */
const getBranchById = async (req, res, next) => {
  try {
    const branchId = req.params.id;

    const result = await query(
      `SELECT b.id, b.clinic_id, b.branch_code, b.branch_name,
              b.address_line1, b.address_line2, b.city, b.state, b.postal_code, b.country,
              b.phone, b.email, b.timezone, b.is_active, b.is_default,
              b.created_at, b.updated_at,
              COUNT(DISTINCT ub.user_id)::int AS assigned_users_count,
              COUNT(DISTINCT CASE WHEN r.name = 'dentist' THEN ub.user_id END)::int AS active_dentists_count
       FROM branches b
       LEFT JOIN user_branches ub ON b.id = ub.branch_id
       LEFT JOIN users u ON ub.user_id = u.id AND u.is_active = true
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE b.id = $1
       GROUP BY b.id`,
      [branchId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found.',
      });
    }

    res.status(200).json({
      success: true,
      branch: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new branch
 * POST /api/branches
 * Admin only
 */
const createBranch = async (req, res, next) => {
  try {
    const validation = validateCreateBranch(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Branch validation failed.',
        errors: validation.errors,
      });
    }

    const {
      branch_name,
      branch_code,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country,
      phone,
      email,
      timezone,
      is_default = false,
      is_active = true,
    } = req.body;

    const clinicId = req.user.clinicId;
    const normalizedCode = branch_code.trim().toUpperCase();

    // Verify subscription status and branch provisioning limits
    const subRes = await query(
      `SELECT c.subscription_status, c.max_branches_override,
              p.max_branches, p.plan_name, p.plan_code
       FROM clinics c
       LEFT JOIN subscription_plans p ON c.subscription_plan_id = p.id
       WHERE c.id = $1`,
      [clinicId]
    );

    // Check organization-scoped uniqueness of branch_code first (409 Conflict)
    const existingCodeRes = await query(
      'SELECT id FROM branches WHERE clinic_id = $1 AND LOWER(branch_code) = LOWER($2)',
      [clinicId, normalizedCode]
    );

    if (existingCodeRes.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Branch code '${normalizedCode}' already exists within your clinic organization.`,
      });
    }

    if (subRes.rows.length > 0) {
      const sub = subRes.rows[0];
      if (sub.subscription_status === 'suspended') {
        return res.status(403).json({
          success: false,
          message: 'Clinic subscription is suspended. Cannot create branch.',
        });
      }
      if (sub.subscription_status === 'expired') {
        return res.status(403).json({
          success: false,
          message: 'Clinic subscription has expired. Cannot create branch.',
        });
      }

      const allowedMax = sub.max_branches_override || sub.max_branches || 1;
      const countRes = await query(
        'SELECT COUNT(*)::int AS count FROM branches WHERE clinic_id = $1',
        [clinicId]
      );
      const currentBranchCount = countRes.rows[0]?.count || 0;

      if (currentBranchCount >= allowedMax) {
        return res.status(403).json({
          success: false,
          message: `Branch limit reached for current subscription plan (${sub.plan_name || 'Current Plan'}). Permitted maximum is ${allowedMax} branch(es).`,
          limit: allowedMax,
          currentCount: currentBranchCount,
        });
      }
    }

    // If marked as default, unset other defaults in this clinic
    if (is_default) {
      await query('UPDATE branches SET is_default = false WHERE clinic_id = $1', [clinicId]);
    }

    // Insert new branch
    const insertRes = await query(
      `INSERT INTO branches (
        clinic_id, branch_code, branch_name, address_line1, address_line2,
        city, state, postal_code, country, phone, email, timezone,
        is_active, is_default, created_by, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $15
      ) RETURNING *`,
      [
        clinicId,
        normalizedCode,
        branch_name.trim(),
        address_line1 ? address_line1.trim() : null,
        address_line2 ? address_line2.trim() : null,
        city ? city.trim() : null,
        state ? state.trim() : null,
        postal_code ? postal_code.trim() : null,
        country ? country.trim() : 'India',
        phone ? phone.trim() : null,
        email ? email.trim() : null,
        timezone ? timezone.trim() : 'Asia/Kolkata',
        is_active !== undefined ? Boolean(is_active) : true,
        Boolean(is_default),
        req.user.id,
      ]
    );

    const newBranch = insertRes.rows[0];

    // Automatically assign the creating administrator to the new branch
    await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default, assigned_by)
       VALUES ($1, $2, false, $1)
       ON CONFLICT (user_id, branch_id) DO NOTHING`,
      [req.user.id, newBranch.id]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, branch_id, ip_address, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user.id,
        'BRANCH_CREATE',
        'branches',
        newBranch.id,
        newBranch.id,
        req.ip || '127.0.0.1',
        JSON.stringify({ branch_code: normalizedCode, branch_name: newBranch.branch_name, city: newBranch.city }),
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Branch created successfully.',
      branch: newBranch,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update branch details
 * PUT /api/branches/:id
 * Admin only
 */
const updateBranch = async (req, res, next) => {
  try {
    const branchId = req.params.id;
    const clinicId = req.user.clinicId;

    if (!UUID_REGEX.test(branchId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid branch ID format.',
      });
    }

    // Verify branch belongs to user's organization
    const branchCheck = await query(
      'SELECT id, clinic_id, branch_code, is_default, is_active FROM branches WHERE id = $1',
      [branchId]
    );

    if (branchCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found.',
      });
    }

    if (branchCheck.rows[0].clinic_id !== clinicId) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You cannot edit a branch belonging to another clinic organization.',
      });
    }

    const validation = validateUpdateBranch(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Branch validation failed.',
        errors: validation.errors,
      });
    }

    const {
      branch_name,
      branch_code,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country,
      phone,
      email,
      timezone,
      is_default,
    } = req.body;

    // Check code uniqueness if changing
    if (branch_code) {
      const normalizedCode = branch_code.trim().toUpperCase();
      const codeCheck = await query(
        'SELECT id FROM branches WHERE clinic_id = $1 AND LOWER(branch_code) = LOWER($2) AND id != $3',
        [clinicId, normalizedCode, branchId]
      );

      if (codeCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Branch code '${normalizedCode}' already exists in your organization.`,
        });
      }
    }

    // Handle is_default change
    if (is_default === true) {
      await query('UPDATE branches SET is_default = false WHERE clinic_id = $1 AND id != $2', [
        clinicId,
        branchId,
      ]);
    }

    const updateRes = await query(
      `UPDATE branches SET
        branch_name = COALESCE($1, branch_name),
        branch_code = COALESCE($2, branch_code),
        address_line1 = COALESCE($3, address_line1),
        address_line2 = COALESCE($4, address_line2),
        city = COALESCE($5, city),
        state = COALESCE($6, state),
        postal_code = COALESCE($7, postal_code),
        country = COALESCE($8, country),
        phone = COALESCE($9, phone),
        email = COALESCE($10, email),
        timezone = COALESCE($11, timezone),
        is_default = COALESCE($12, is_default),
        updated_by = $13,
        updated_at = now()
      WHERE id = $14
      RETURNING *`,
      [
        branch_name ? branch_name.trim() : null,
        branch_code ? branch_code.trim().toUpperCase() : null,
        address_line1 !== undefined ? (address_line1 ? address_line1.trim() : null) : null,
        address_line2 !== undefined ? (address_line2 ? address_line2.trim() : null) : null,
        city !== undefined ? (city ? city.trim() : null) : null,
        state !== undefined ? (state ? state.trim() : null) : null,
        postal_code !== undefined ? (postal_code ? postal_code.trim() : null) : null,
        country !== undefined ? (country ? country.trim() : null) : null,
        phone !== undefined ? (phone ? phone.trim() : null) : null,
        email !== undefined ? (email ? email.trim() : null) : null,
        timezone !== undefined ? (timezone ? timezone.trim() : null) : null,
        is_default !== undefined ? Boolean(is_default) : null,
        req.user.id,
        branchId,
      ]
    );

    const updatedBranch = updateRes.rows[0];

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, branch_id, ip_address, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user.id,
        'BRANCH_UPDATE',
        'branches',
        branchId,
        branchId,
        req.ip || '127.0.0.1',
        JSON.stringify({ branch_code: updatedBranch.branch_code, branch_name: updatedBranch.branch_name }),
      ]
    );

    res.status(200).json({
      success: true,
      message: 'Branch details updated successfully.',
      branch: updatedBranch,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Activate or deactivate a branch
 * PATCH /api/branches/:id/status
 * Admin only
 */
const updateBranchStatus = async (req, res, next) => {
  try {
    const branchId = req.params.id;
    const clinicId = req.user.clinicId;

    if (!UUID_REGEX.test(branchId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid branch ID format.',
      });
    }

    // Determine target status
    let targetActive;
    if (req.body.is_active !== undefined) {
      targetActive = Boolean(req.body.is_active);
    } else if (req.body.status !== undefined) {
      targetActive = req.body.status === 'active';
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please provide either is_active (boolean) or status ("active" | "inactive").',
      });
    }

    // Verify branch belongs to organization
    const branchRes = await query(
      'SELECT id, clinic_id, branch_code, branch_name, is_default, is_active FROM branches WHERE id = $1',
      [branchId]
    );

    if (branchRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found.',
      });
    }

    const branch = branchRes.rows[0];

    if (branch.clinic_id !== clinicId) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You cannot modify a branch from another organization.',
      });
    }

    // Safety checks for deactivation
    if (!targetActive) {
      // 1. Cannot deactivate the default branch
      if (branch.is_default) {
        return res.status(400).json({
          success: false,
          message: 'Cannot deactivate the default branch. Please set another active branch as default first.',
        });
      }

      // 2. Cannot deactivate the last remaining active branch
      const activeCountRes = await query(
        'SELECT COUNT(*)::int AS count FROM branches WHERE clinic_id = $1 AND is_active = true AND id != $2',
        [clinicId, branchId]
      );

      if (activeCountRes.rows[0].count === 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot deactivate the only active branch in your clinic organization. At least one branch must remain active.',
        });
      }
    }

    const updateRes = await query(
      'UPDATE branches SET is_active = $1, updated_by = $2, updated_at = now() WHERE id = $3 RETURNING *',
      [targetActive, req.user.id, branchId]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, branch_id, ip_address, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user.id,
        'BRANCH_STATUS_CHANGE',
        'branches',
        branchId,
        branchId,
        req.ip || '127.0.0.1',
        JSON.stringify({ branch_code: branch.branch_code, is_active: targetActive }),
      ]
    );

    res.status(200).json({
      success: true,
      message: `Branch has been ${targetActive ? 'activated' : 'deactivated'} successfully.`,
      branch: updateRes.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List authorized users assigned to branch
 * GET /api/branches/:id/users
 */
const getBranchUsers = async (req, res, next) => {
  try {
    const branchId = req.params.id;
    const clinicId = req.user.clinicId;

    // Get assigned users
    const assignedRes = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name,
              CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) AS full_name,
              u.phone, u.specialization, u.license_number, u.is_active,
              r.name AS role_name, r.display_name AS role_display,
              ub.is_default AS is_user_default, ub.assigned_at
       FROM user_branches ub
       JOIN users u ON ub.user_id = u.id
       JOIN roles r ON u.role_id = r.id
       WHERE ub.branch_id = $1
       ORDER BY ub.is_default DESC, r.name ASC, u.first_name ASC`,
      [branchId]
    );

    let availableUsers = [];

    // If query includes available=true and requester is admin, return clinic users not yet assigned
    if (req.query.available === 'true' && req.user.role === 'admin') {
      const availRes = await query(
        `SELECT u.id, u.email, u.first_name, u.last_name,
                CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) AS full_name,
                u.phone, u.specialization,
                r.name AS role_name, r.display_name AS role_display
         FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE u.clinic_id = $1 AND u.is_active = true
           AND u.id NOT IN (SELECT user_id FROM user_branches WHERE branch_id = $2)
         ORDER BY r.name ASC, u.first_name ASC`,
        [clinicId, branchId]
      );
      availableUsers = availRes.rows;
    }

    res.status(200).json({
      success: true,
      assignedUsers: assignedRes.rows,
      availableUsers,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Assign a user to a branch
 * POST /api/branches/:id/users
 * Admin only
 */
const assignUserToBranch = async (req, res, next) => {
  try {
    const branchId = req.params.id;
    const clinicId = req.user.clinicId;

    const validation = validateAssignUser(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Assignment validation failed.',
        errors: validation.errors,
      });
    }

    const { userId, isDefault = false } = req.body;

    // Verify branch belongs to organization
    const branchCheck = await query(
      'SELECT id, branch_name, branch_code, clinic_id FROM branches WHERE id = $1',
      [branchId]
    );

    if (branchCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found.',
      });
    }

    if (branchCheck.rows[0].clinic_id !== clinicId) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Branch belongs to another organization.',
      });
    }

    // Verify user exists and belongs to the same clinic
    const userCheck = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.clinic_id, u.is_active,
              r.name AS role_name, r.display_name AS role_display
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.',
      });
    }

    const targetUser = userCheck.rows[0];

    if (targetUser.clinic_id !== clinicId) {
      return res.status(403).json({
        success: false,
        message: 'Cannot assign a user from a different clinic organization to this branch.',
      });
    }

    // If setting as default, unset other defaults for this user
    if (isDefault) {
      await query('UPDATE user_branches SET is_default = false WHERE user_id = $1', [userId]);
    }

    // Insert or update mapping
    const assignRes = await query(
      `INSERT INTO user_branches (user_id, branch_id, is_default, assigned_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, branch_id)
       DO UPDATE SET is_default = EXCLUDED.is_default
       RETURNING *`,
      [userId, branchId, Boolean(isDefault), req.user.id]
    );

    // Also mirror to staff_branches if staff record exists
    await query(
      `INSERT INTO staff_branches (staff_id, branch_id, is_default, assigned_at)
       SELECT s.id, $1, $2, now()
       FROM staff s
       WHERE s.user_id = $3
       ON CONFLICT (staff_id, branch_id)
       DO UPDATE SET is_default = EXCLUDED.is_default`,
      [branchId, Boolean(isDefault), userId]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, branch_id, ip_address, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user.id,
        'BRANCH_USER_ASSIGN',
        'user_branches',
        assignRes.rows[0].id,
        branchId,
        req.ip || '127.0.0.1',
        JSON.stringify({
          target_user_id: userId,
          target_email: targetUser.email,
          branch_code: branchCheck.rows[0].branch_code,
          is_default: Boolean(isDefault),
        }),
      ]
    );

    res.status(201).json({
      success: true,
      message: `User ${targetUser.first_name} has been assigned to ${branchCheck.rows[0].branch_name}.`,
      assignment: assignRes.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove a user from a branch safely
 * DELETE /api/branches/:id/users/:userId
 * Admin only
 */
const removeUserFromBranch = async (req, res, next) => {
  try {
    const { id: branchId, userId } = req.params;
    const clinicId = req.user.clinicId;

    if (!UUID_REGEX.test(branchId) || !UUID_REGEX.test(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid branch ID or user ID format.',
      });
    }

    // Verify branch belongs to organization
    const branchCheck = await query(
      'SELECT id, clinic_id, branch_name FROM branches WHERE id = $1',
      [branchId]
    );

    if (branchCheck.rows.length === 0 || branchCheck.rows[0].clinic_id !== clinicId) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found in your organization.',
      });
    }

    // Verify mapping exists
    const mapCheck = await query(
      'SELECT id, is_default FROM user_branches WHERE branch_id = $1 AND user_id = $2',
      [branchId, userId]
    );

    if (mapCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User is not assigned to this branch.',
      });
    }

    // Safety guard: Check if user is a doctor with scheduled future appointments at this branch
    const apptCheck = await query(
      `SELECT COUNT(*)::int AS count
       FROM appointments
       WHERE clinic_id = $1 AND branch_id = $2 AND doctor_id = $3
         AND appointment_date >= CURRENT_DATE
         AND status NOT IN ('cancelled', 'completed')`,
      [clinicId, branchId, userId]
    );

    const futureCount = apptCheck.rows[0]?.count || 0;
    if (futureCount > 0) {
      return res.status(409).json({
        success: false,
        hasConflict: true,
        futureAppointmentsCount: futureCount,
        message: `Cannot remove doctor from branch: Practitioner has ${futureCount} scheduled future appointment(s) at this branch. Please reschedule or reassign them first.`,
      });
    }

    // Delete mapping from user_branches
    await query('DELETE FROM user_branches WHERE branch_id = $1 AND user_id = $2', [
      branchId,
      userId,
    ]);

    // Also delete from staff_branches
    await query(
      `DELETE FROM staff_branches 
       WHERE branch_id = $1 AND staff_id = (SELECT id FROM staff WHERE user_id = $2)`,
      [branchId, userId]
    );

    // If removed assignment was default, set another branch as default if user has any remaining
    if (mapCheck.rows[0].is_default) {
      const remainingRes = await query(
        'SELECT id FROM user_branches WHERE user_id = $1 LIMIT 1',
        [userId]
      );
      if (remainingRes.rows.length > 0) {
        await query('UPDATE user_branches SET is_default = true WHERE id = $1', [
          remainingRes.rows[0].id,
        ]);
      }
    }

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, branch_id, ip_address, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user.id,
        'BRANCH_USER_REMOVE',
        'user_branches',
        mapCheck.rows[0].id,
        branchId,
        req.ip || '127.0.0.1',
        JSON.stringify({ removed_user_id: userId, branch_id: branchId }),
      ]
    );

    res.status(200).json({
      success: true,
      message: 'User assignment removed from branch successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Return real branch statistics
 * GET /api/branches/:id/stats
 * Protected by authorizeBranchAccess
 */
const getBranchStats = async (req, res, next) => {
  try {
    const branchId = req.params.id;

    // Fetch real staff statistics
    const statsRes = await query(
      `SELECT
        COUNT(DISTINCT ub.user_id)::int AS total_assigned_staff,
        COUNT(DISTINCT CASE WHEN r.name = 'dentist' THEN ub.user_id END)::int AS dentists_count,
        COUNT(DISTINCT CASE WHEN r.name = 'specialist' THEN ub.user_id END)::int AS specialists_count,
        COUNT(DISTINCT CASE WHEN r.name = 'receptionist' THEN ub.user_id END)::int AS receptionists_count,
        COUNT(DISTINCT CASE WHEN r.name IN ('billing', 'assistant', 'inventory') THEN ub.user_id END)::int AS other_staff_count
       FROM user_branches ub
       JOIN users u ON ub.user_id = u.id AND u.is_active = true
       JOIN roles r ON u.role_id = r.id
       WHERE ub.branch_id = $1`,
      [branchId]
    );

    const stats = statsRes.rows[0];

    res.status(200).json({
      success: true,
      branchId,
      branchName: req.branch.branch_name,
      branchCode: req.branch.branch_code,
      city: req.branch.city,
      isActive: req.branch.is_active,
      isDefault: req.branch.is_default,
      staffStatistics: {
        totalAssignedStaff: stats.total_assigned_staff,
        dentistsCount: stats.dentists_count,
        specialistsCount: stats.specialists_count,
        receptionistsCount: stats.receptionists_count,
        otherStaffCount: stats.other_staff_count,
      },
      // Clearly disclose upcoming modules without fabricating fake figures
      upcomingModules: {
        patients: 'Real patient metrics will activate in Phase 2 (Patient Management).',
        appointments: 'Calendar and appointments will activate in Phase 3.',
        clinical: 'Odontogram and dental records will activate in Phase 4.',
        billing: 'Invoicing and collections will activate in Phase 7.',
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listBranches,
  getBranchById,
  createBranch,
  updateBranch,
  updateBranchStatus,
  getBranchUsers,
  assignUserToBranch,
  removeUserFromBranch,
  getBranchStats,
};
