const bcrypt = require('bcryptjs');
const { pool, query, initializeDatabase } = require('../config/database');
require('dotenv').config();

/**
 * Bootstrap VoiceGate Platform Super Administrator
 * 
 * Usage:
 *   SUPERADMIN_EMAIL="superadmin@voicegate.com" SUPERADMIN_PASSWORD="YourSecurePassword" npm run bootstrap:superadmin
 * 
 * Secure bootstrap script:
 * - Obtains credentials strictly from environment variables or secure defaults for local development.
 * - Hashes passwords with bcrypt (10 rounds).
 * - Assigns role 'superadmin' and sets is_platform_admin = true.
 * - Leaves clinic_id as NULL to enforce platform-level independence from clinic tenants.
 * - Never logs raw passwords or credentials.
 */
const bootstrapSuperAdmin = async () => {
  console.log('[VoiceGate Bootstrap] Initializing database and verifying migrations...');
  await initializeDatabase();

  const isProduction = process.env.NODE_ENV === 'production';
  const email = (process.env.SUPERADMIN_EMAIL || (!isProduction ? 'superadmin@voicegate.com' : '')).trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD || (!isProduction ? 'SuperAdmin@VoiceGate2026' : '');
  const firstName = process.env.SUPERADMIN_FIRST_NAME || 'VoiceGate';
  const lastName = process.env.SUPERADMIN_LAST_NAME || 'Platform Admin';

  if (!email || !password) {
    console.error('[VoiceGate Bootstrap Error] SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD must be explicitly provided in production.');
    process.exit(1);
  }

  if (isProduction && (password === 'SuperAdmin@VoiceGate2026' || password.toLowerCase().includes('voicegate'))) {
    console.error('[VoiceGate Bootstrap Error] Default bootstrap password is not permitted in production. Please provide a strong, unique SUPERADMIN_PASSWORD.');
    process.exit(1);
  }

  if (password.length < 12) {
    console.error('[VoiceGate Bootstrap Error] Password must be at least 12 characters in length for Platform Super Admin accounts.');
    process.exit(1);
  }

  try {
    // 1. Fetch superadmin role ID
    const roleRes = await query("SELECT id FROM roles WHERE name = 'superadmin'");
    if (roleRes.rows.length === 0) {
      console.error("[VoiceGate Bootstrap Error] Role 'superadmin' not found in database.");
      process.exit(1);
    }
    const superadminRoleId = roleRes.rows[0].id;

    // 2. Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // 3. Check if user already exists
    const existingUser = await query('SELECT id, is_platform_admin FROM users WHERE LOWER(email) = $1', [email]);

    let userId;

    if (existingUser.rows.length > 0) {
      userId = existingUser.rows[0].id;
      await query(
        `UPDATE users
         SET role_id = $1,
             password_hash = $2,
             first_name = $3,
             last_name = $4,
             is_platform_admin = true,
             is_active = true,
             updated_at = now()
         WHERE id = $5`,
        [superadminRoleId, passwordHash, firstName, lastName, userId]
      );
      console.log(`[VoiceGate Bootstrap] Existing user '${email}' has been promoted and updated to Platform Super Administrator.`);
    } else {
      const insertRes = await query(
        `INSERT INTO users (
           role_id, email, password_hash, first_name, last_name,
           is_platform_admin, is_active, clinic_id
         ) VALUES (
           $1, $2, $3, $4, $5,
           true, true, NULL
         ) RETURNING id`,
        [superadminRoleId, email, passwordHash, firstName, lastName]
      );
      userId = insertRes.rows[0].id;
      console.log(`[VoiceGate Bootstrap] Platform Super Administrator '${email}' successfully provisioned.`);
    }

    // 4. Record audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId,
        'PLATFORM_SUPERADMIN_BOOTSTRAP',
        'users',
        userId,
        '127.0.0.1',
        JSON.stringify({ email, action: 'SUPERADMIN_INITIALIZED' }),
      ]
    );

    console.log('[VoiceGate Bootstrap] Setup completed safely. Audit trail recorded.');
    process.exit(0);
  } catch (error) {
    console.error('[VoiceGate Bootstrap Error]:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

bootstrapSuperAdmin();
