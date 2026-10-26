const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

/**
 * Locate pg_dump executable on Windows or Linux
 */
const locatePgTool = (toolName) => {
  // 1. Check PG_BIN_PATH environment variable
  if (process.env.PG_BIN_PATH) {
    const candidate = path.join(process.env.PG_BIN_PATH, process.platform === 'win32' ? `${toolName}.exe` : toolName);
    if (fs.existsSync(candidate)) return candidate;
  }

  // 2. Common Windows PostgreSQL installation paths
  if (process.platform === 'win32') {
    const commonWinPaths = [
      `C:\\Program Files\\PostgreSQL\\18\\bin\\${toolName}.exe`,
      `C:\\Program Files\\PostgreSQL\\17\\bin\\${toolName}.exe`,
      `C:\\Program Files\\PostgreSQL\\16\\bin\\${toolName}.exe`,
      `C:\\Program Files\\PostgreSQL\\15\\bin\\${toolName}.exe`,
    ];
    for (const p of commonWinPaths) {
      if (fs.existsSync(p)) return p;
    }
  }

  // 3. Fallback to toolName from PATH
  return toolName;
};

/**
 * Execute automated database backup
 */
const runBackup = (targetFileName = null) => {
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const database = process.env.DB_NAME || 'dental_clinic_erp';
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || '';

  const pgDumpPath = locatePgTool('pg_dump');

  // Verify pg_dump is reachable
  const versionCheck = spawnSync(pgDumpPath, ['--version'], { encoding: 'utf8' });
  if (versionCheck.error) {
    throw new Error(`pg_dump utility not found. Please ensure PostgreSQL tools are installed or set PG_BIN_PATH. Details: ${versionCheck.error.message}`);
  }

  const pgVersion = versionCheck.stdout.trim();
  console.log(`[Backup Engine] Using: ${pgVersion} (${pgDumpPath})`);

  // Target directory
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = targetFileName || `backup_${database}_${timestamp}.sql`;
  const backupFilePath = path.join(backupDir, fileName);

  console.log(`[Backup Engine] Backing up database "${database}" to: ${backupFilePath}...`);

  const args = [
    '--host', host,
    '--port', port,
    '--username', user,
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--file', backupFilePath,
    database,
  ];

  const result = spawnSync(pgDumpPath, args, {
    env: {
      ...process.env,
      PGPASSWORD: String(password),
    },
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const errorDetails = result.stderr || result.error?.message || 'Unknown pg_dump execution failure';
    throw new Error(`Database backup failed with exit code ${result.status}: ${errorDetails}`);
  }

  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Expected backup file not created at: ${backupFilePath}`);
  }

  // Compute SHA-256 checksum and file stats
  const fileBuffer = fs.readFileSync(backupFilePath);
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const stats = fs.statSync(backupFilePath);
  const sizeKb = (stats.size / 1024).toFixed(2);

  // Write metadata sidecar JSON
  const metaPath = `${backupFilePath}.meta.json`;
  const metadata = {
    database,
    backupFile: path.basename(backupFilePath),
    createdAt: new Date().toISOString(),
    sizeBytes: stats.size,
    sizeKb: `${sizeKb} KB`,
    sha256: hash,
    pgVersion,
  };
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');

  console.log(`[Backup Engine] Backup completed successfully.`);
  console.log(`  File:   ${backupFilePath}`);
  console.log(`  Size:   ${sizeKb} KB`);
  console.log(`  SHA256: ${hash}`);

  return {
    backupFilePath,
    metadata,
  };
};

if (require.main === module) {
  try {
    runBackup();
  } catch (error) {
    console.error('\n[FATAL BACKUP ERROR]:', error.message);
    process.exit(1);
  }
}

module.exports = {
  runBackup,
  locatePgTool,
};
