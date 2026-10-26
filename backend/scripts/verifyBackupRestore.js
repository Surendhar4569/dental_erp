const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { runBackup } = require('./backupDatabase');
const { runRestore } = require('./restoreDatabase');

/**
 * End-to-end Automated Verification of PostgreSQL Backup and Restoration
 */
const verifyBackupAndRestore = async () => {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT, 10) || 5432;
  const primaryDb = process.env.DB_NAME || 'dental_clinic_erp';
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || '';

  const isolatedTestDb = `dental_erp_test_restore_${Date.now().toString().slice(-6)}`;

  console.log('================================================================');
  console.log('VoiceGate Dental ERP - Automated Backup & Restore Verification');
  console.log(`Primary Database:  ${primaryDb}`);
  console.log(`Test Verification: ${isolatedTestDb}`);
  console.log('================================================================\n');

  // Step 1: Connect to postgres server maintenance DB
  const maintenanceClient = new Client({
    host,
    port,
    database: 'postgres',
    user,
    password,
  });
  await maintenanceClient.connect();

  let testBackupPath = null;

  try {
    // Step 2: Create authentic pg_dump backup
    console.log('[Step 1/5] Creating authentic pg_dump backup of primary database...');
    const { backupFilePath, metadata } = runBackup(`verify_test_${Date.now()}.sql`);
    testBackupPath = backupFilePath;
    console.log(`  SHA-256 Checksum: ${metadata.sha256}`);
    console.log(`  Backup Size:      ${metadata.sizeKb}`);

    // Step 3: Create temporary isolated test database
    console.log(`\n[Step 2/5] Creating isolated test database "${isolatedTestDb}"...`);
    await maintenanceClient.query(`CREATE DATABASE "${isolatedTestDb}"`);

    // Step 4: Restore backup into isolated test database
    console.log(`\n[Step 3/5] Restoring backup dump into isolated test database...`);
    runRestore({
      backupFilePath,
      targetDatabase: isolatedTestDb,
    });

    // Step 5: Connect to restored database and verify data integrity
    console.log(`\n[Step 4/5] Verifying restored schema and data integrity...`);
    const restoredClient = new Client({
      host,
      port,
      database: isolatedTestDb,
      user,
      password,
    });
    await restoredClient.connect();

    const primaryClient = new Client({
      host,
      port,
      database: primaryDb,
      user,
      password,
    });
    await primaryClient.connect();

    const tablesToVerify = [
      'clinics',
      'branches',
      'users',
      'user_branches',
      'subscription_plans',
      'audit_logs',
      'revoked_tokens',
      'clinic_counters',
      'patients',
      'patient_medical_records',
      'daily_visit_counters',
      'patient_visits',
      'schema_migrations',
    ];

    const verificationResults = [];

    for (const table of tablesToVerify) {
      const primaryCountRes = await primaryClient.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
      const restoredCountRes = await restoredClient.query(`SELECT COUNT(*)::int AS count FROM ${table}`);

      const primaryCount = primaryCountRes.rows[0].count;
      const restoredCount = restoredCountRes.rows[0].count;

      if (primaryCount !== restoredCount) {
        throw new Error(
          `Integrity verification failed for table "${table}": Primary has ${primaryCount} rows, but Restored has ${restoredCount} rows.`
        );
      }

      verificationResults.push({
        table,
        rows: restoredCount,
        status: 'VERIFIED_MATCH',
      });
      console.log(`  Table [${table.padEnd(20)}]: ${restoredCount} rows (EXACT MATCH)`);
    }

    await primaryClient.end();
    await restoredClient.end();

    console.log('\n[Step 5/5] All tables and row counts verified with 100% parity.');

    return {
      success: true,
      backupFile: path.basename(backupFilePath),
      metadata,
      verifiedTables: verificationResults,
    };
  } finally {
    // Teardown: Drop isolated test database and clean up test dump file
    try {
      console.log(`\n[Cleanup] Dropping test database "${isolatedTestDb}"...`);
      await maintenanceClient.query(`DROP DATABASE IF EXISTS "${isolatedTestDb}" WITH (FORCE)`);
    } catch (cleanupErr) {
      console.warn('[Cleanup Warning] Failed to drop test database:', cleanupErr.message);
    }
    await maintenanceClient.end();

    if (testBackupPath && fs.existsSync(testBackupPath)) {
      try {
        fs.unlinkSync(testBackupPath);
        if (fs.existsSync(`${testBackupPath}.meta.json`)) {
          fs.unlinkSync(`${testBackupPath}.meta.json`);
        }
        console.log('[Cleanup] Removed temporary test backup files.');
      } catch {}
    }
  }
};

if (require.main === module) {
  verifyBackupAndRestore()
    .then(() => {
      console.log('\n================================================================');
      console.log('SUCCESS: Automated Backup and Restore Verification PASSED.');
      console.log('================================================================\n');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n================================================================');
      console.error('FAILURE: Backup and Restore Verification FAILED:', err.message);
      console.error('================================================================\n');
      process.exit(1);
    });
}

module.exports = {
  verifyBackupAndRestore,
};
