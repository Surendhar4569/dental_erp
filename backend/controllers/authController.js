const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { revokeToken } = require('../utils/tokenRevocation');

/**
 * Helper to fetch authorized branches for a user
 */
const getUserBranches = async (userId, clinicId, roleName) => {
  // Strict branch assignment: All roles (including admin) only receive branches assigned in user_branches
  const branchesQuery = `
    SELECT b.id, b.clinic_id, b.branch_code, b.branch_name,
           b.address_line1, b.address_line2, b.city, b.state, b.postal_code, b.country,
           b.phone, b.email, b.timezone, b.is_active, b.is_default,
           ub.is_default AS is_user_default
    FROM branches b
    JOIN user_branches ub ON b.id = ub.branch_id
    WHERE ub.user_id = $1 AND b.clinic_id = $2 AND b.is_active = true
    ORDER BY ub.is_default DESC, b.branch_name ASC
  `;
  const params = [userId, clinicId];

  const result = await query(branchesQuery, params);
  const branches = result.rows;
  
  // Find default branch: user's specific default, or clinic default, or first branch
  let defaultBranch =
    branches.find((b) => b.is_user_default) ||
    branches.find((b) => b.is_default) ||
    branches[0] ||
    null;

  return { branches, defaultBranch };
};

const { recordAuditLog } = require('../utils/auditLogger');

/**
 * User login
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password.',
      });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Query user with role, clinic status, and subscription expiry using database timestamp
    const result = await query(
      `SELECT u.id, u.clinic_id, u.role_id, u.email, u.password_hash,
              u.first_name, u.last_name, u.phone, u.specialization,
              u.license_number, u.is_active, u.is_platform_admin,
              r.name AS role_name, r.display_name AS role_display,
              c.name AS clinic_name, c.code AS clinic_code,
              c.is_active AS clinic_is_active,
              c.subscription_status,
              c.subscription_expires_at,
              (c.subscription_expires_at IS NOT NULL AND c.subscription_expires_at < now()) AS is_subscription_expired
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN clinics c ON u.clinic_id = c.id
       WHERE LOWER(u.email) = $1`,
      [trimmedEmail]
    );

    if (result.rows.length === 0) {
      // Audit log failed attempt without exposing passwords or detailed internal state
      await recordAuditLog({
        action: 'AUTH_LOGIN_FAILED',
        ipAddress: clientIp,
        details: { attemptedEmail: trimmedEmail, reason: 'USER_NOT_FOUND' },
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const user = result.rows[0];

    // Check user account active status
    if (!user.is_active) {
      await recordAuditLog({
        userId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        ipAddress: clientIp,
        details: { attemptedEmail: trimmedEmail, reason: 'ACCOUNT_DEACTIVATED' },
      });

      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated. Contact your clinic administrator.',
      });
    }

    // Verify password hash
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await recordAuditLog({
        userId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        ipAddress: clientIp,
        details: { attemptedEmail: trimmedEmail, reason: 'INVALID_CREDENTIALS' },
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // For clinic tenants (non-platform admins), enforce clinic organization active and subscription status
    if (!user.is_platform_admin && user.clinic_id) {
      // 1. Clinic subscription suspended
      if (user.subscription_status === 'suspended') {
        await recordAuditLog({
          userId: user.id,
          action: 'AUTH_LOGIN_FAILED',
          ipAddress: clientIp,
          details: { attemptedEmail: trimmedEmail, reason: 'CLINIC_SUSPENDED', clinicId: user.clinic_id },
        });

        return res.status(403).json({
          success: false,
          message: 'Your clinic subscription is suspended. Please contact clinic administration or VoiceGate support.',
        });
      }

      // 2. Clinic subscription expired (explicit status OR past expiry timestamp)
      if (user.subscription_status === 'expired' || user.is_subscription_expired) {
        await recordAuditLog({
          userId: user.id,
          action: 'AUTH_LOGIN_FAILED',
          ipAddress: clientIp,
          details: { attemptedEmail: trimmedEmail, reason: 'SUBSCRIPTION_EXPIRED', clinicId: user.clinic_id },
        });

        return res.status(403).json({
          success: false,
          message: 'Your clinic subscription has expired. Please renew your subscription to access the workspace.',
        });
      }

      // 3. Clinic organization deactivated
      if (user.clinic_is_active === false) {
        await recordAuditLog({
          userId: user.id,
          action: 'AUTH_LOGIN_FAILED',
          ipAddress: clientIp,
          details: { attemptedEmail: trimmedEmail, reason: 'CLINIC_DEACTIVATED', clinicId: user.clinic_id },
        });

        return res.status(403).json({
          success: false,
          message: 'Your clinic organization has been deactivated. Please contact VoiceGate support.',
        });
      }
    }

    // Update last_login_at
    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

    // Record successful login audit
    await recordAuditLog({
      userId: user.id,
      action: 'AUTH_LOGIN',
      entityType: 'users',
      entityId: user.id,
      ipAddress: clientIp,
      details: { email: user.email, role: user.role_name, isPlatformAdmin: user.is_platform_admin },
    });

    // Fetch authorized branches for user (only if bound to a clinic)
    let branches = [];
    let defaultBranch = null;
    if (user.clinic_id) {
      const branchData = await getUserBranches(
        user.id,
        user.clinic_id,
        user.role_name
      );
      branches = branchData.branches;
      defaultBranch = branchData.defaultBranch;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is not configured.');
    }

    // Generate JWT token with explicit platform flag and unique jti
    const token = jwt.sign(
      {
        jti: crypto.randomUUID(),
        id: user.id,
        email: user.email,
        role: user.role_name,
        isPlatformAdmin: Boolean(user.is_platform_admin),
        clinicId: user.clinic_id,
        defaultBranchId: defaultBranch ? defaultBranch.id : null,
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    // Return sanitized user object
    res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: `${user.first_name} ${user.last_name || ''}`.trim(),
        role: user.role_name,
        roleDisplay: user.role_display,
        isPlatformAdmin: Boolean(user.is_platform_admin),
        clinicId: user.clinic_id,
        clinicName: user.clinic_name,
        clinicCode: user.clinic_code,
        specialization: user.specialization,
        licenseNumber: user.license_number,
        branches,
        defaultBranch,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current authenticated user profile
 * GET /api/auth/me
 */
const getCurrentUser = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.id, u.clinic_id, u.role_id, u.email,
              u.first_name, u.last_name, u.phone, u.specialization,
              u.license_number, u.last_login_at, u.created_at, u.is_platform_admin,
              r.name AS role_name, r.display_name AS role_display,
              c.name AS clinic_name, c.code AS clinic_code, c.timezone
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN clinics c ON u.clinic_id = c.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found.',
      });
    }

    const user = result.rows[0];

    // Fetch authorized branches for current user (if bound to a clinic)
    let branches = [];
    let defaultBranch = null;
    if (user.clinic_id) {
      const branchData = await getUserBranches(
        user.id,
        user.clinic_id,
        user.role_name
      );
      branches = branchData.branches;
      defaultBranch = branchData.defaultBranch;
    }

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: `${user.first_name} ${user.last_name || ''}`.trim(),
        phone: user.phone,
        specialization: user.specialization,
        licenseNumber: user.license_number,
        role: user.role_name,
        roleDisplay: user.role_display,
        isPlatformAdmin: Boolean(user.is_platform_admin),
        clinicId: user.clinic_id,
        clinicName: user.clinic_name,
        clinicCode: user.clinic_code,
        timezone: user.timezone,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
        branches,
        defaultBranch,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * User logout
 * POST /api/auth/logout
 */
const logout = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      await revokeToken({
        token,
        decoded: req.tokenPayload,
        userId: req.user?.id,
        reason: req.body?.reason || 'USER_LOGOUT',
      });
    }

    if (req.user && req.user.id) {
      await recordAuditLog({
        userId: req.user.id,
        action: 'AUTH_LOGOUT',
        entityType: 'users',
        entityId: req.user.id,
        ipAddress: req.ip || '127.0.0.1',
        details: { email: req.user.email, reason: req.body?.reason || 'USER_LOGOUT' },
      });
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List all available roles
 * GET /api/auth/roles
 */
const getRoles = async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, name, display_name, description FROM roles ORDER BY name ASC'
    );
    res.status(200).json({
      success: true,
      roles: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  getCurrentUser,
  logout,
  getRoles,
};
