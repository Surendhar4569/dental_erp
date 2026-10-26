/**
 * Migration 003: Server-Side Token Revocation & Session Blacklist
 * Creates revoked_tokens table to invalidate tokens upon logout or administrative revocation.
 * Uses SHA-256 hash indexing for O(1) token lookup without storing raw tokens in database.
 */
module.exports = {
  version: '003',
  name: '003_token_revocation',

  async up(client) {
    console.log('[Migration 003] Executing server-side token revocation schema changes...');

    // 1. Create revoked_tokens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS revoked_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token_jti VARCHAR(255),
        token_hash VARCHAR(64) UNIQUE NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        reason VARCHAR(100) NOT NULL DEFAULT 'USER_LOGOUT'
      );
    `);

    // 2. High-performance index on token_hash for millisecond lookup
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_revoked_tokens_hash ON revoked_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at ON revoked_tokens(expires_at);
      CREATE INDEX IF NOT EXISTS idx_revoked_tokens_user_id ON revoked_tokens(user_id);
    `);

    console.log('[Migration 003] Token revocation schema migration applied successfully.');
  },
};
