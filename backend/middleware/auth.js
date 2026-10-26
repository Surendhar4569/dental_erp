const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { recordAuditLog } = require('../utils/auditLogger');
const { isTokenRevoked } = require('../utils/tokenRevocation');

/**
 * Middleware to authenticate requests using JWT Bearer token
 */
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authentication token provided.',
    });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({
        success: false,
        message: 'Internal server error: Authentication secret configuration is missing.',
      });
    }

    const decoded = jwt.verify(token, jwtSecret);

    // Verify token has not been revoked / blacklisted via logout
    const revoked = await isTokenRevoked(token);
    if (revoked) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token has been revoked or logged out. Please log in again.',
      });
    }

    req.tokenPayload = decoded;
    
    // Verify user exists and is active in database, fetching live clinic and subscription status
    const userRes = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.is_active, u.clinic_id, u.is_platform_admin,
              r.name AS role_name, r.display_name AS role_display,
              c.name AS clinic_name, c.code AS clinic_code,
              c.is_active AS clinic_is_active,
              c.subscription_status,
              c.subscription_expires_at,
              (c.subscription_expires_at IS NOT NULL AND c.subscription_expires_at < now()) AS is_subscription_expired
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN clinics c ON u.clinic_id = c.id
       WHERE u.id = $1`,
      [decoded.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid session. User account not found.',
      });
    }

    const user = userRes.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact clinic administrator.',
      });
    }

    // Query authorized branches assigned to user from trusted server-side user_branches
    let assignedBranches = [];
    let assignedBranchIds = [];
    let primaryBranch = null;

    if (user.clinic_id) {
      const ubRes = await query(
        `SELECT b.id, b.clinic_id, b.branch_code, b.branch_name, b.timezone, b.is_active, b.is_default,
                ub.is_default AS is_user_default
         FROM branches b
         JOIN user_branches ub ON b.id = ub.branch_id
         WHERE ub.user_id = $1 AND b.clinic_id = $2 AND (b.is_active = true OR $3 = 'admin')
         ORDER BY ub.is_default DESC, b.is_default DESC, b.branch_name ASC`,
        [user.id, user.clinic_id, user.role_name]
      );
      assignedBranches = ubRes.rows;
      assignedBranchIds = assignedBranches.map((b) => b.id);
      primaryBranch =
        assignedBranches.find((b) => b.is_user_default && b.is_active) ||
        assignedBranches.find((b) => b.is_active) ||
        assignedBranches[0] ||
        null;
    }

    // Server-side check for client-provided branch parameters (e.g. x-branch-id header or query)
    const clientBranchId = req.headers['x-branch-id'] || req.query.branchId;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    let resolvedActiveBranchId = primaryBranch ? primaryBranch.id : null;

    if (clientBranchId && uuidRegex.test(clientBranchId) && !user.is_platform_admin && user.clinic_id) {
      if (!assignedBranchIds.includes(clientBranchId)) {
        await recordAuditLog({
          userId: user.id,
          action: 'SECURITY_BRANCH_ACCESS_DENIED',
          ipAddress: req.ip || '127.0.0.1',
          details: {
            attemptedBranchId: clientBranchId,
            userAssignedBranches: assignedBranchIds,
            role: user.role_name,
            reason: 'UNAUTHORIZED_BRANCH_HEADER_OR_QUERY',
          },
        });

        return res.status(403).json({
          success: false,
          message: 'Forbidden. You are not authorized to access this branch.',
        });
      }
      resolvedActiveBranchId = clientBranchId;
    }

    // Attach user information to request object with trusted server-side branch scope
    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role_name,
      roleDisplay: user.role_display,
      isPlatformAdmin: Boolean(user.is_platform_admin),
      clinicId: user.clinic_id,
      clinicName: user.clinic_name,
      clinicCode: user.clinic_code,
      clinicIsActive: user.clinic_is_active !== false,
      subscriptionStatus: user.subscription_status || 'active',
      subscriptionExpiresAt: user.subscription_expires_at,
      isSubscriptionExpired: Boolean(user.is_subscription_expired),
      assignedBranches,
      assignedBranchIds,
      primaryBranch,
      authorizedBranchId: resolvedActiveBranchId,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Authentication token has expired. Please log in again.',
      });
    }
    return res.status(403).json({
      success: false,
      message: 'Invalid or malformed authentication token.',
    });
  }
};

/**
 * Middleware strictly restricted to VoiceGate Platform Super Administrators
 */
const authorizePlatformAdmin = (req, res, next) => {
  if (!req.user || !req.user.isPlatformAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden. VoiceGate Platform Super Admin authorization required.',
    });
  }
  next();
};

/**
 * Middleware ensuring clinic organization subscription is active and not expired
 */
const requireActiveSubscription = (req, res, next) => {
  // Platform Super Admins are exempt from clinic subscription restrictions
  if (!req.user || req.user.isPlatformAdmin) {
    return next();
  }

  // Check suspended status
  if (req.user.subscriptionStatus === 'suspended') {
    return res.status(403).json({
      success: false,
      message: 'Clinic subscription is suspended. Please contact VoiceGate support or clinic administration.',
    });
  }

  // Check expired status or past expiration date
  if (req.user.subscriptionStatus === 'expired' || req.user.isSubscriptionExpired) {
    return res.status(403).json({
      success: false,
      message: 'Clinic subscription has expired. Please renew your subscription to access this resource.',
    });
  }

  // Check clinic organization active flag
  if (req.user.clinicIsActive === false) {
    return res.status(403).json({
      success: false,
      message: 'Clinic organization is deactivated. Please contact VoiceGate support.',
    });
  }

  next();
};

/**
 * Middleware for Role-Based Access Control
 * @param  {...string} allowedRoles - Array of allowed role names (e.g. 'admin', 'dentist')
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required before checking permissions.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. Role '${req.user.role}' is not authorized for this resource.`,
      });
    }

    next();
  };
};

/**
 * Middleware to authorize branch access
 * Verifies:
 * 1. Branch exists in the database
 * 2. Branch belongs to the authenticated user's clinic organization (isolation)
 * 3. User is either an organization admin, or explicitly assigned to this branch in user_branches
 * 4. Inactive branches cannot be accessed by non-admin users
 */
const authorizeBranchAccess = async (req, res, next) => {
  try {
    const isBranchRoute = req.baseUrl === '/api/branches' || req.baseUrl === '/branches';
    const branchId =
      req.params.branchId ||
      (isBranchRoute ? req.params.id : null) ||
      req.headers['x-branch-id'] ||
      req.query.branchId ||
      req.body.branchId ||
      req.user.authorizedBranchId;

    if (!branchId) {
      return res.status(400).json({
        success: false,
        message: 'Branch ID parameter is required.',
      });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(branchId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid branch ID format. Must be a valid UUID.',
      });
    }

    // Fetch branch details
    const branchRes = await query(
      `SELECT b.id, b.clinic_id, b.branch_code, b.branch_name,
              b.address_line1, b.address_line2, b.city, b.state, b.postal_code, b.country,
              b.phone, b.email, b.timezone, b.is_active, b.is_default
       FROM branches b
       WHERE b.id = $1`,
      [branchId]
    );

    if (branchRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found.',
      });
    }

    const branch = branchRes.rows[0];

    // Security Rule: Multi-tenant / Organization isolation
    if (branch.clinic_id !== req.user.clinicId) {
      await recordAuditLog({
        userId: req.user.id,
        action: 'SECURITY_CROSS_TENANT_ACCESS_DENIED',
        entityType: 'branches',
        entityId: branch.id,
        branchId: branch.id,
        ipAddress: req.ip || '127.0.0.1',
        details: {
          attemptedBranchId: branch.id,
          targetClinicId: branch.clinic_id,
          userClinicId: req.user.clinicId,
        },
      });

      return res.status(403).json({
        success: false,
        message: 'Forbidden. You cannot access a branch belonging to another clinic organization.',
      });
    }

    // STRICT BRANCH-LEVEL DATA ISOLATION FOR EVERY ROLE (including admin!)
    // A user's assigned branch determines which branch's data they can access.
    // No role can bypass the assigned branch restriction.
    if (!req.user.assignedBranchIds || !req.user.assignedBranchIds.includes(branch.id)) {
      await recordAuditLog({
        userId: req.user.id,
        action: 'SECURITY_BRANCH_ACCESS_DENIED',
        entityType: 'branches',
        entityId: branch.id,
        branchId: branch.id,
        ipAddress: req.ip || '127.0.0.1',
        details: {
          attemptedBranchId: branch.id,
          userAssignedBranches: req.user.assignedBranchIds,
          role: req.user.role,
        },
      });

      return res.status(403).json({
        success: false,
        message: 'Forbidden. You are not authorized to access this branch.',
      });
    }

    // Check branch active status (non-admin staff cannot access inactive branch)
    if (!branch.is_active && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This branch is currently inactive.',
      });
    }

    req.branch = branch;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  authorizeBranchAccess,
  authorizePlatformAdmin,
  requireActiveSubscription,
};
