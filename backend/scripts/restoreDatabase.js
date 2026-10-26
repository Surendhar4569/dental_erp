const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { locatePgTool } = require('./backupDatabase');

/**
 * Execute safe database restore with protection against accidental overwrites
 */
const runRestore = ({
  backupFilePath,
  targetDatabase,
  allowActiveDatabaseOverwrite = false,
}) => {
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const activeDbName = process.env.DB_NAME || 'dental_clinic_erp';
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || '';

  if (!backupFilePath || !fs.existsSync(backupFilePath)) {
    throw new Error(`Backup file not found at path: ${backupFilePath}`);
  }

  if (!targetDatabase || typeof targetDatabase !== 'string' || targetDatabase.trim() === '') {
    throw new Error('Target database name must be explicitly provided. Restores are never run without an explicit target.');
  }

  // Safety Gate: Refuse to restore over the active database unless explicitly forced
  if (targetDatabase.trim().toLowerCase() === activeDbName.toLowerCase()) {
    if (!allowActiveDatabaseOverwrite) {
      throw new Error(
        `SAFETY GUARD TRIGGERED: Refusing to restore over the active development database "${activeDbName}". ` +
        `To restore into an isolated verification database, specify a target such as "${activeDbName}_restore_test". ` +
        `If you genuinely intend to overwrite the primary database, you must supply allowActiveDatabaseOverwrite: true.`
      );
    }
    console.warn(`\n[WARNING]: Restoring over ACTIVE database "${activeDbName}". Existing records will be overwritten!\n`);
  }

  const psqlPath = locatePgTool('psql');
  const versionCheck = spawnSync(psqlPath, ['--version'], { encoding: 'utf8' });
  if (versionCheck.error) {
    throw new Error(`psql utility not found: ${versionCheck.error.message}`);
  }

  console.log(`[Restore Engine] Using: ${versionCheck.stdout.trim()}`);
  console.log(`[Restore Engine] Restoring backup "${path.basename(backupFilePath)}" into database "${targetDatabase}"...`);

  // Verify SHA256 checksum if sidecar metadata exists
  const metaPath = `${backupFilePath}.meta.json`;
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      const fileBuffer = fs.readFileSync(backupFilePath);
      const actualHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      if (meta.sha256 && meta.sha256 !== actualHash) {
        throw new Error(`Integrity Check Failed: Backup SHA-256 mismatch!\nExpected: ${meta.sha256}\nActual:   ${actualHash}`);
      }
      console.log(`[Restore Engine] SHA-256 integrity verified (${actualHash.slice(0, 16)}...)`);
    } catch (err) {
      if (err.message.includes('Integrity Check Failed')) throw err;
      console.warn('[Restore Engine] Warning: Could not verify sidecar metadata:', err.message);
    }
  }

  // Execute restore via psql
  const args = [
    '--host', host,
    '--port', port,
    '--username', user,
    '--dbname', targetDatabase,
    '--file', backupFilePath,
    '--quiet',
  ];

  const result = spawnSync(psqlPath, args, {
    env: {
      ...process.env,
      PGPASSWORD: String(password),
    },
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const errorDetails = result.stderr || result.error?.message || 'Unknown psql restore failure';
    throw new Error(`Database restore failed with exit code ${result.status}: ${errorDetails}`);
  }

  console.log(`[Restore Engine] Successfully restored backup into database "${targetDatabase}".`);
  return {
    success: true,
    targetDatabase,
    backupFile: path.basename(backupFilePath),
  };
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const backupFile = args[0];
  const targetDb = args[1];
  const forceOverwrite = args.includes('--confirm-active-overwrite');

  if (!backupFile || !targetDb) {
    console.error('Usage: node restoreDatabase.js <path_to_backup.sql> <target_database_name> [--confirm-active-overwrite]');
    console.error('Example (Safe test restore): node restoreDatabase.js backups/backup.sql dental_clinic_erp_test');
    process.exit(1);
  }

  try {
    runRestore({
      backupFilePath: backupFile,
      targetDatabase: targetDb,
      allowActiveDatabaseOverwrite: forceOverwrite,
    });
  } catch (error) {
    console.error('\n[FATAL RESTORE ERROR]:', error.message);
    process.exit(1);
  }
}

module.exports = {
  runRestore,
};
