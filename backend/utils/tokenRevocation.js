const crypto = require('crypto');
const { query } = require('../config/database');

/**
 * Compute SHA-256 hash of raw JWT string for safe storage and fast O(1) indexed lookup
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
};

/**
 * Blacklist / revoke an active JWT token in the database
 */
const revokeToken = async ({ token, decoded = null, userId = null, reason = 'USER_LOGOUT' }) => {
  try {
    if (!token) return false;

    const tokenHash = hashToken(token);
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const jti = decoded?.jti || null;
    const targetUserId = userId || decoded?.id || null;

    await query(
      `INSERT INTO revoked_tokens (token_jti, token_hash, user_id, expires_at, reason)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (token_hash) DO NOTHING`,
      [jti, tokenHash, targetUserId, expiresAt, reason]
    );

    // Opportunistically delete old expired revocation entries
    query("DELETE FROM revoked_tokens WHERE expires_at < now() - INTERVAL '1 hour'").catch(() => {});
    return true;
  } catch (error) {
    console.error('[Token Revocation Error] Failed to blacklist token:', error.message);
    return false;
  }
};

/**
 * Check if a JWT token has been invalidated or logged out
 */
const isTokenRevoked = async (token) => {
  try {
    if (!token) return true;
    const tokenHash = hashToken(token);

    const result = await query(
      'SELECT id FROM revoked_tokens WHERE token_hash = $1 LIMIT 1',
      [tokenHash]
    );

    return result.rows.length > 0;
  } catch (error) {
    console.error('[Token Revocation Check Error]:', error.message);
    return false;
  }
};

module.exports = {
  hashToken,
  revokeToken,
  isTokenRevoked,
};
