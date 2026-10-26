const { query } = require('../config/database');

/**
 * Safe Audit Logger
 * Inserts security, authentication, and clinical governance events into audit_logs.
 * Safely catches database write errors so an audit logging issue never breaks
 * active business requests or user workflows.
 */
const recordAuditLog = async ({
  userId = null,
  action,
  entityType = null,
  entityId = null,
  branchId = null,
  ipAddress = '127.0.0.1',
  details = {},
  client = null, // Optional transactional pg client
}) => {
  try {
    const sanitizedDetails = typeof details === 'object' ? JSON.stringify(details) : JSON.stringify({ note: String(details) });
    const sql = `
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, branch_id, ip_address, details)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    const params = [userId, action, entityType, entityId, branchId, ipAddress, sanitizedDetails];

    if (client) {
      await client.query(sql, params);
    } else {
      await query(sql, params);
    }
  } catch (error) {
    // Log warning to console without terminating caller workflow or leaking sensitive information
    console.error(`[Audit Logger Warning] Failed to insert audit log for action "${action}":`, error.message);
  }
};

module.exports = {
  recordAuditLog,
};
