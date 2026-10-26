/**
 * Staff Management Service
 * Handles staff creation, updates, pagination, search, branch assignment,
 * login account creation, doctor eligibility, and deactivation safety guards.
 */

const bcrypt = require('bcryptjs');
const { query, pool } = require('../config/database');
const { generateStaffNumber } = require('../utils/staffNumberGenerator');

/**
 * Get paginated list of staff members with filtering and search
 */
const getStaffList = async (clinicId, branchId, options = {}) => {
  const page = Math.max(1, parseInt(options.page || 1, 10));
  const limit = Math.min(100, Math.max(1, parseInt(options.limit || 15, 10)));
  const offset = (page - 1) * limit;

  const conditions = ['s.clinic_id = $1'];
  const params = [clinicId];
  let paramIdx = 2;

  // Filter by branch
  if (branchId) {
    conditions.push(`EXISTS (
      SELECT 1 FROM staff_branches sb 
      WHERE sb.staff_id = s.id AND sb.branch_id = $${paramIdx}
    )`);
    params.push(branchId);
    paramIdx++;
  }

  // Filter by staff category
  if (options.category && options.category !== 'all') {
    conditions.push(`s.staff_category = $${paramIdx}`);
    params.push(options.category);
    paramIdx++;
  }

  // Filter by employment status
  if (options.status && options.status !== 'all') {
    conditions.push(`s.employment_status = $${paramIdx}`);
    params.push(options.status);
    paramIdx++;
  }

  // Search by text (name, staff_number, phone, email, designation)
  if (options.search && options.search.trim()) {
    const term = `%${options.search.trim()}%`;
    conditions.push(`(
      s.staff_number ILIKE $${paramIdx} OR
      s.first_name ILIKE $${paramIdx} OR
      s.last_name ILIKE $${paramIdx} OR
      CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) ILIKE $${paramIdx} OR
      s.phone ILIKE $${paramIdx} OR
      s.email ILIKE $${paramIdx} OR
      s.designation ILIKE $${paramIdx}
    )`);
    params.push(term);
    paramIdx++;
  }

  const whereClause = conditions.join(' AND ');

  // Total count query
  const countRes = await query(
    `SELECT COUNT(*)::int AS total FROM staff s WHERE ${whereClause}`,
    params
  );
  const totalCount = countRes.rows[0]?.total || 0;

  // Data query with linked user, role, and assigned branches
  const dataQuery = `
    SELECT s.id, s.clinic_id, s.primary_branch_id, s.staff_number,
           s.first_name, s.last_name,
           CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS full_name,
           s.gender, s.date_of_birth, s.phone, s.email, s.address,
           s.staff_category, s.designation, s.department,
           s.specialization, s.license_number, s.joining_date,
           s.employment_status, s.user_id, s.is_active,
           s.created_at, s.updated_at,
           pb.branch_name AS primary_branch_name,
           u.email AS login_email, u.is_active AS login_is_active,
           r.name AS login_role_name, r.display_name AS login_role_display,
           COALESCE(
             json_agg(
               json_build_object(
                 'branch_id', b.id,
                 'branch_name', b.branch_name,
                 'branch_code', b.branch_code,
                 'is_default', sb.is_default
               )
             ) FILTER (WHERE b.id IS NOT NULL), '[]'
           ) AS assigned_branches
    FROM staff s
    LEFT JOIN branches pb ON s.primary_branch_id = pb.id
    LEFT JOIN users u ON s.user_id = u.id
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN staff_branches sb ON s.id = sb.staff_id
    LEFT JOIN branches b ON sb.branch_id = b.id
    WHERE ${whereClause}
    GROUP BY s.id, pb.branch_name, u.email, u.is_active, r.name, r.display_name
    ORDER BY s.created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `;

  const dataParams = [...params, limit, offset];
  const dataRes = await query(dataQuery, dataParams);

  return {
    staff: dataRes.rows,
    pagination: {
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit) || 1,
    },
  };
};

/**
 * Get single staff member by ID
 */
const getStaffById = async (clinicId, staffId) => {
  const text = `
    SELECT s.id, s.clinic_id, s.primary_branch_id, s.staff_number,
           s.first_name, s.last_name,
           CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS full_name,
           s.gender, s.date_of_birth, s.phone, s.email, s.address,
           s.staff_category, s.designation, s.department,
           s.specialization, s.license_number, s.joining_date,
           s.employment_status, s.user_id, s.is_active,
           s.created_at, s.updated_at,
           pb.branch_name AS primary_branch_name,
           u.email AS login_email, u.is_active AS login_is_active,
           r.name AS login_role_name, r.display_name AS login_role_display,
           COALESCE(
             json_agg(
               json_build_object(
                 'branch_id', b.id,
                 'branch_name', b.branch_name,
                 'branch_code', b.branch_code,
                 'is_default', sb.is_default
               )
             ) FILTER (WHERE b.id IS NOT NULL), '[]'
           ) AS assigned_branches
    FROM staff s
    LEFT JOIN branches pb ON s.primary_branch_id = pb.id
    LEFT JOIN users u ON s.user_id = u.id
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN staff_branches sb ON s.id = sb.staff_id
    LEFT JOIN branches b ON sb.branch_id = b.id
    WHERE s.clinic_id = $1 AND s.id = $2
    GROUP BY s.id, pb.branch_name, u.email, u.is_active, r.name, r.display_name
  `;
  const res = await query(text, [clinicId, staffId]);
  return res.rows[0] || null;
};

/**
 * Create a new staff record (with optional login user)
 */
const createStaff = async (clinicId, branchId, staffData, creatorUserId, permittedBranchIds = null) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Determine or generate staff number
    let staffNumber = staffData.staff_number ? staffData.staff_number.trim().toUpperCase() : null;
    if (staffNumber) {
      const existing = await client.query(
        'SELECT id FROM staff WHERE clinic_id = $1 AND LOWER(staff_number) = LOWER($2)',
        [clinicId, staffNumber]
      );
      if (existing.rows.length > 0) {
        throw new Error(`Staff ID '${staffNumber}' already exists in your clinic organization.`);
      }
    } else {
      staffNumber = await generateStaffNumber(client, clinicId);
    }

    // 2. Validate primary branch
    const primaryBranchId = staffData.branch_id || branchId;
    if (permittedBranchIds && permittedBranchIds.length > 0 && !permittedBranchIds.includes(primaryBranchId)) {
      const err = new Error('Forbidden. You are not authorized to assign staff to this primary branch.');
      err.statusCode = 403;
      throw err;
    }

    const branchCheck = await client.query(
      'SELECT id, branch_name FROM branches WHERE id = $1 AND clinic_id = $2',
      [primaryBranchId, clinicId]
    );
    if (branchCheck.rows.length === 0) {
      throw new Error('Assigned branch does not belong to your clinic organization.');
    }

    // 3. Handle optional login user creation
    let userId = null;
    if (staffData.create_login) {
      const loginEmail = (staffData.login_email || staffData.email).trim().toLowerCase();
      const existingUser = await client.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
        [loginEmail]
      );
      if (existingUser.rows.length > 0) {
        throw new Error(`Login email '${loginEmail}' is already registered.`);
      }

      const roleRes = await client.query('SELECT id, name FROM roles WHERE name = $1', [staffData.role]);
      if (roleRes.rows.length === 0) {
        throw new Error(`Role '${staffData.role}' is invalid.`);
      }
      const roleId = roleRes.rows[0].id;

      const passwordHash = await bcrypt.hash(staffData.password, 10);

      const userRes = await client.query(
        `INSERT INTO users (
          clinic_id, role_id, email, password_hash, first_name, last_name,
          phone, specialization, license_number, is_active
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, true
        ) RETURNING id`,
        [
          clinicId,
          roleId,
          loginEmail,
          passwordHash,
          staffData.first_name.trim(),
          staffData.last_name ? staffData.last_name.trim() : null,
          staffData.phone ? staffData.phone.trim() : null,
          staffData.specialization ? staffData.specialization.trim() : null,
          staffData.license_number ? staffData.license_number.trim() : null,
        ]
      );
      userId = userRes.rows[0].id;

      // Assign user to user_branches
      await client.query(
        `INSERT INTO user_branches (user_id, branch_id, is_default, assigned_by)
         VALUES ($1, $2, true, $3)
         ON CONFLICT (user_id, branch_id) DO NOTHING`,
        [userId, primaryBranchId, creatorUserId]
      );
    }

    // 4. Insert staff record
    const staffRes = await client.query(
      `INSERT INTO staff (
        clinic_id, primary_branch_id, staff_number, first_name, last_name,
        gender, date_of_birth, phone, email, address,
        staff_category, designation, department, specialization, license_number,
        joining_date, employment_status, user_id, is_active, created_by, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        COALESCE($16, CURRENT_DATE), COALESCE($17, 'active'), $18, true, $19, $19
      ) RETURNING *`,
      [
        clinicId,
        primaryBranchId,
        staffNumber,
        staffData.first_name.trim(),
        staffData.last_name ? staffData.last_name.trim() : null,
        staffData.gender || null,
        staffData.date_of_birth || null,
        staffData.phone.trim(),
        staffData.email ? staffData.email.trim() : null,
        staffData.address ? staffData.address.trim() : null,
        staffData.staff_category,
        staffData.designation ? staffData.designation.trim() : null,
        staffData.department ? staffData.department.trim() : null,
        staffData.specialization ? staffData.specialization.trim() : null,
        staffData.license_number ? staffData.license_number.trim() : null,
        staffData.joining_date || null,
        staffData.employment_status || 'active',
        userId,
        creatorUserId,
      ]
    );

    const newStaff = staffRes.rows[0];

    // 5. Assign staff branches
    const branchIdsToAssign = Array.isArray(staffData.assigned_branch_ids) && staffData.assigned_branch_ids.length > 0
      ? staffData.assigned_branch_ids
      : [primaryBranchId];

    for (const bId of branchIdsToAssign) {
      if (permittedBranchIds && permittedBranchIds.length > 0 && !permittedBranchIds.includes(bId)) {
        const err = new Error('Forbidden. You cannot assign staff to an unauthorized branch.');
        err.statusCode = 403;
        throw err;
      }
      await client.query(
        `INSERT INTO staff_branches (staff_id, branch_id, is_default)
         VALUES ($1, $2, $3)
         ON CONFLICT (staff_id, branch_id) DO NOTHING`,
        [newStaff.id, bId, bId === primaryBranchId]
      );
      if (userId) {
        await client.query(
          `INSERT INTO user_branches (user_id, branch_id, is_default, assigned_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, branch_id) DO NOTHING`,
          [userId, bId, bId === primaryBranchId, creatorUserId]
        );
      }
    }

    await client.query('COMMIT');
    return newStaff;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Update an existing staff record
 */
const updateStaff = async (clinicId, staffId, staffData, updaterUserId, permittedBranchIds = null) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify staff exists and belongs to clinic
    const existingRes = await client.query(
      'SELECT * FROM staff WHERE id = $1 AND clinic_id = $2 FOR UPDATE',
      [staffId, clinicId]
    );
    if (existingRes.rows.length === 0) {
      throw new Error('Staff record not found.');
    }
    const staff = existingRes.rows[0];

    // 2. Validate custom staff number uniqueness if changing
    let staffNumber = staff.staff_number;
    if (staffData.staff_number && staffData.staff_number.trim().toUpperCase() !== staff.staff_number) {
      const checkNumber = staffData.staff_number.trim().toUpperCase();
      const numExists = await client.query(
        'SELECT id FROM staff WHERE clinic_id = $1 AND LOWER(staff_number) = LOWER($2) AND id != $3',
        [clinicId, checkNumber, staffId]
      );
      if (numExists.rows.length > 0) {
        throw new Error(`Staff ID '${checkNumber}' is already in use by another staff member.`);
      }
      staffNumber = checkNumber;
    }

    // 3. Update staff columns
    const updateRes = await client.query(
      `UPDATE staff SET
        staff_number = $1,
        first_name = COALESCE($2, first_name),
        last_name = COALESCE($3, last_name),
        gender = COALESCE($4, gender),
        date_of_birth = COALESCE($5, date_of_birth),
        phone = COALESCE($6, phone),
        email = COALESCE($7, email),
        address = COALESCE($8, address),
        staff_category = COALESCE($9, staff_category),
        designation = COALESCE($10, designation),
        department = COALESCE($11, department),
        specialization = COALESCE($12, specialization),
        license_number = COALESCE($13, license_number),
        joining_date = COALESCE($14, joining_date),
        employment_status = COALESCE($15, employment_status),
        updated_by = $16,
        updated_at = now()
      WHERE id = $17 AND clinic_id = $18
      RETURNING *`,
      [
        staffNumber,
        staffData.first_name ? staffData.first_name.trim() : null,
        staffData.last_name !== undefined ? (staffData.last_name ? staffData.last_name.trim() : null) : null,
        staffData.gender !== undefined ? staffData.gender : null,
        staffData.date_of_birth !== undefined ? staffData.date_of_birth : null,
        staffData.phone ? staffData.phone.trim() : null,
        staffData.email !== undefined ? (staffData.email ? staffData.email.trim() : null) : null,
        staffData.address !== undefined ? (staffData.address ? staffData.address.trim() : null) : null,
        staffData.staff_category || null,
        staffData.designation !== undefined ? (staffData.designation ? staffData.designation.trim() : null) : null,
        staffData.department !== undefined ? (staffData.department ? staffData.department.trim() : null) : null,
        staffData.specialization !== undefined ? (staffData.specialization ? staffData.specialization.trim() : null) : null,
        staffData.license_number !== undefined ? (staffData.license_number ? staffData.license_number.trim() : null) : null,
        staffData.joining_date !== undefined ? staffData.joining_date : null,
        staffData.employment_status || null,
        updaterUserId,
        staffId,
        clinicId,
      ]
    );

    // 4. If linked to user_id, synchronize user basic details
    if (staff.user_id) {
      await client.query(
        `UPDATE users SET
          first_name = COALESCE($1, first_name),
          last_name = COALESCE($2, last_name),
          phone = COALESCE($3, phone),
          specialization = COALESCE($4, specialization),
          license_number = COALESCE($5, license_number),
          updated_at = now()
        WHERE id = $6`,
        [
          staffData.first_name ? staffData.first_name.trim() : null,
          staffData.last_name !== undefined ? (staffData.last_name ? staffData.last_name.trim() : null) : null,
          staffData.phone ? staffData.phone.trim() : null,
          staffData.specialization !== undefined ? (staffData.specialization ? staffData.specialization.trim() : null) : null,
          staffData.license_number !== undefined ? (staffData.license_number ? staffData.license_number.trim() : null) : null,
          staff.user_id,
        ]
      );
    }

    // 5. Update assigned branches if provided
    if (Array.isArray(staffData.assigned_branch_ids)) {
      if (permittedBranchIds && permittedBranchIds.length > 0) {
        for (const bId of staffData.assigned_branch_ids) {
          if (!permittedBranchIds.includes(bId)) {
            const err = new Error('Forbidden. You cannot assign staff to an unauthorized branch.');
            err.statusCode = 403;
            throw err;
          }
        }
      }
      await client.query('DELETE FROM staff_branches WHERE staff_id = $1', [staffId]);
      for (const bId of staffData.assigned_branch_ids) {
        await client.query(
          `INSERT INTO staff_branches (staff_id, branch_id, is_default)
           VALUES ($1, $2, $3)
           ON CONFLICT (staff_id, branch_id) DO NOTHING`,
          [staffId, bId, bId === staff.primary_branch_id]
        );
        if (staff.user_id) {
          await client.query(
            `INSERT INTO user_branches (user_id, branch_id, is_default, assigned_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, branch_id) DO NOTHING`,
            [staff.user_id, bId, bId === staff.primary_branch_id, updaterUserId]
          );
        }
      }
    }

    await client.query('COMMIT');
    return updateRes.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Deactivate a staff member with safety checks for doctors with future appointments
 */
const deactivateStaff = async (clinicId, staffId, actionUserId) => {
  const staff = await getStaffById(clinicId, staffId);
  if (!staff) {
    throw new Error('Staff record not found.');
  }

  // Safety check: if staff is doctor or has linked user, verify future active appointments
  const doctorUserId = staff.user_id;
  if (doctorUserId && ['dentist', 'specialist'].includes(staff.staff_category)) {
    const futureApptRes = await query(
      `SELECT COUNT(*)::int AS count 
       FROM appointments 
       WHERE doctor_id = $1 
         AND appointment_date >= CURRENT_DATE 
         AND status NOT IN ('cancelled', 'completed', 'no_show')`,
      [doctorUserId]
    );

    const futureCount = futureApptRes.rows[0]?.count || 0;
    if (futureCount > 0) {
      return {
        success: false,
        hasConflict: true,
        futureAppointmentsCount: futureCount,
        message: `Cannot deactivate doctor. Dr. ${staff.full_name} has ${futureCount} upcoming appointment(s). Please reschedule or cancel these appointments before deactivating.`,
      };
    }
  }

  // Perform deactivation
  await query(
    `UPDATE staff SET
      is_active = false,
      employment_status = 'terminated',
      updated_by = $1,
      updated_at = now()
    WHERE id = $2 AND clinic_id = $3`,
    [actionUserId, staffId, clinicId]
  );

  // If user linked, deactivate login account too
  if (doctorUserId) {
    await query(
      `UPDATE users SET is_active = false, updated_at = now() WHERE id = $1`,
      [doctorUserId]
    );
  }

  return {
    success: true,
    hasConflict: false,
    message: `Staff member ${staff.full_name} has been deactivated successfully.`,
  };
};

/**
 * Get active doctors/dentists assigned to a branch (for appointment booking & scheduling)
 */
const getEligibleDoctors = async (clinicId, branchId) => {
  const text = `
    SELECT s.id AS staff_id, s.staff_number, s.first_name, s.last_name,
           CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS full_name,
           s.phone, s.email, s.specialization, s.license_number,
           s.staff_category, s.designation,
           s.user_id,
           ub.is_default AS is_branch_default,
           dbf.consultation_fee AS default_fee,
           (dbf.consultation_fee IS NOT NULL) AS is_fee_configured
    FROM staff s
    JOIN staff_branches sb ON s.id = sb.staff_id
    LEFT JOIN user_branches ub ON s.user_id = ub.user_id AND ub.branch_id = sb.branch_id
    LEFT JOIN doctor_branch_fees dbf ON s.user_id = dbf.doctor_id AND dbf.branch_id = sb.branch_id
    LEFT JOIN doctor_schedules ds ON s.user_id = ds.doctor_id AND ds.branch_id = sb.branch_id
    WHERE s.clinic_id = $1
      AND sb.branch_id = $2
      AND s.staff_category IN ('dentist', 'specialist')
      AND s.is_active = true
      AND s.employment_status = 'active'
    GROUP BY s.id, sb.branch_id, ub.is_default, dbf.consultation_fee, ds.slot_duration_minutes
    ORDER BY s.first_name ASC, s.last_name ASC
  `;
  const result = await query(text, [clinicId, branchId]);
  return result.rows;
};

/**
 * Assign an existing clinic staff member to an additional branch
 * Preserves the single canonical staff identity without creating duplicate records.
 */
const assignExistingStaffToBranch = async (clinicId, branchId, staffId, userId, permittedBranchIds = null) => {
  if (permittedBranchIds && permittedBranchIds.length > 0 && !permittedBranchIds.includes(branchId)) {
    const err = new Error('Forbidden. You are not authorized to assign staff to this branch.');
    err.statusCode = 403;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify staff exists in clinic and is active
    const staffRes = await client.query(
      `SELECT s.*, u.email AS login_email
       FROM staff s
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.id = $1 AND s.clinic_id = $2`,
      [staffId, clinicId]
    );

    if (staffRes.rows.length === 0) {
      const err = new Error('Staff record not found in your clinic organization.');
      err.statusCode = 404;
      throw err;
    }

    const staff = staffRes.rows[0];

    // 2. Verify target branch exists in clinic
    const branchRes = await client.query(
      'SELECT id, branch_name, branch_code FROM branches WHERE id = $1 AND clinic_id = $2',
      [branchId, clinicId]
    );

    if (branchRes.rows.length === 0) {
      const err = new Error('Target branch not found in your clinic organization.');
      err.statusCode = 404;
      throw err;
    }

    // 3. Check if already assigned to this branch
    const existingCheck = await client.query(
      'SELECT id FROM staff_branches WHERE staff_id = $1 AND branch_id = $2',
      [staffId, branchId]
    );

    if (existingCheck.rows.length > 0) {
      const err = new Error(`Staff member '${staff.first_name} ${staff.last_name || ''}'.trim() is already assigned to this branch.`);
      err.statusCode = 409;
      throw err;
    }

    // 4. Insert into staff_branches
    await client.query(
      `INSERT INTO staff_branches (staff_id, branch_id, is_default, assigned_at)
       VALUES ($1, $2, false, now())`,
      [staffId, branchId]
    );

    // 5. If linked to user account, mirror in user_branches
    if (staff.user_id) {
      await client.query(
        `INSERT INTO user_branches (user_id, branch_id, is_default, assigned_by, assigned_at)
         VALUES ($1, $2, false, $3, now())
         ON CONFLICT (user_id, branch_id) DO NOTHING`,
        [staff.user_id, branchId, userId]
      );
    }

    await client.query('COMMIT');

    return {
      success: true,
      message: `Staff member ${staff.first_name} ${staff.last_name || ''} has been assigned to ${branchRes.rows[0].branch_name}.`,
      staff,
      branch: branchRes.rows[0],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Safely remove a staff member from a branch assignment
 * Guard: Blocks removal if a doctor has future active appointments at this branch
 */
const removeStaffFromBranch = async (clinicId, branchId, staffId, userId, permittedBranchIds = null) => {
  if (permittedBranchIds && permittedBranchIds.length > 0 && !permittedBranchIds.includes(branchId)) {
    const err = new Error('Forbidden. You are not authorized to modify staff assignments for this branch.');
    err.statusCode = 403;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch staff
    const staffRes = await client.query(
      'SELECT * FROM staff WHERE id = $1 AND clinic_id = $2',
      [staffId, clinicId]
    );
    if (staffRes.rows.length === 0) {
      const err = new Error('Staff record not found.');
      err.statusCode = 404;
      throw err;
    }
    const staff = staffRes.rows[0];

    // 2. Check if doctor with future appointments at this branch
    if (staff.user_id && ['dentist', 'specialist'].includes(staff.staff_category)) {
      const apptCheck = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM appointments
         WHERE clinic_id = $1 AND branch_id = $2 AND doctor_id = $3
           AND appointment_date >= CURRENT_DATE
           AND status NOT IN ('cancelled', 'completed')`,
        [clinicId, branchId, staff.user_id]
      );
      const futureCount = apptCheck.rows[0]?.count || 0;
      if (futureCount > 0) {
        const err = new Error(
          `Cannot remove doctor from branch: Practitioner has ${futureCount} scheduled future appointment(s) at this branch. Please reschedule or reassign them first.`
        );
        err.statusCode = 409;
        throw err;
      }
    }

    // 3. Remove branch assignment from staff_branches
    await client.query(
      'DELETE FROM staff_branches WHERE staff_id = $1 AND branch_id = $2',
      [staffId, branchId]
    );

    // 4. If linked user exists, remove from user_branches
    if (staff.user_id) {
      await client.query(
        'DELETE FROM user_branches WHERE user_id = $1 AND branch_id = $2',
        [staff.user_id, branchId]
      );
    }

    // 5. If this was the primary branch, set another assigned branch as primary if available
    if (staff.primary_branch_id === branchId) {
      const remainingBranch = await client.query(
        'SELECT branch_id FROM staff_branches WHERE staff_id = $1 ORDER BY assigned_at ASC LIMIT 1',
        [staffId]
      );
      const newPrimary = remainingBranch.rows[0]?.branch_id || null;
      await client.query(
        'UPDATE staff SET primary_branch_id = $1, updated_at = now() WHERE id = $2',
        [newPrimary, staffId]
      );
    }

    await client.query('COMMIT');

    return {
      success: true,
      message: `Staff assignment for ${staff.first_name} ${staff.last_name || ''} at this branch has been removed safely.`,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get active staff members in the clinic who are not assigned to the specified branch
 * Used by the "Assign Existing Staff" modal
 */
const getUnassignedStaffForBranch = async (clinicId, branchId) => {
  const text = `
    SELECT s.id, s.staff_number, s.first_name, s.last_name,
           CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS full_name,
           s.staff_category, s.designation, s.specialization, s.phone, s.email,
           s.user_id, pb.branch_name AS primary_branch_name
    FROM staff s
    LEFT JOIN branches pb ON s.primary_branch_id = pb.id
    WHERE s.clinic_id = $1
      AND s.is_active = true
      AND s.employment_status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM staff_branches sb
        WHERE sb.staff_id = s.id AND sb.branch_id = $2
      )
    ORDER BY s.first_name ASC, s.last_name ASC
  `;
  const res = await query(text, [clinicId, branchId]);
  return res.rows;
};

module.exports = {
  getStaffList,
  getStaffById,
  createStaff,
  updateStaff,
  deactivateStaff,
  getEligibleDoctors,
  assignExistingStaffToBranch,
  removeStaffFromBranch,
  getUnassignedStaffForBranch,
};
