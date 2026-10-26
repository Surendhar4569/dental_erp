# VoiceGate Dental Clinic ERP — Database Backup & Disaster Recovery Runbook

**Module:** Phase 1.7 Operational Readiness  
**Target Database:** PostgreSQL 16+ / 18+  
**Target Environment:** Local Development, Staging, and Production Healthcare Deployments  
**Classification:** Confidential & Operational Standard

---

## 1. Safety Principles & Warning

> [!CAUTION]
> **NEVER AUTOMATICALLY RESTORE OVER AN ACTIVE DATABASE**
> Restoring a database backup replaces existing tables and schema data. Executing a restore against the active development or production database (`dental_clinic_erp`) will irreversibly overwrite recent patient records, dental charts, invoices, and audit logs created after the backup timestamp.
>
> **Standard Operating Procedure:** Always restore into a separate, isolated target database (e.g., `dental_clinic_erp_test_restore`) to verify data integrity before promoting or migrating records.

---

## 2. Backup Architecture & Tooling

The VoiceGate Dental Clinic ERP uses native PostgreSQL tools (`pg_dump` and `psql`) to perform non-blocking, consistent transactional backups:

- **Script:** [`backend/scripts/backupDatabase.js`](file:///e:/DentalERP/dental-clinic-erp/backend/scripts/backupDatabase.js) (`npm run db:backup`)
- **Format:** Clean SQL dump with `--clean --if-exists --no-owner --no-privileges`
- **Security:** Database password is supplied via the `PGPASSWORD` process environment variable. Passwords are **never** logged to stdout, written into files, or committed to git.
- **Storage Location:** `backend/backups/` (Strictly excluded in [`.gitignore`](file:///e:/DentalERP/dental-clinic-erp/.gitignore)).
- **Integrity Sidecar:** Every backup generates a companion `<backup_file>.meta.json` file recording the database name, timestamp, byte size, PostgreSQL version, and cryptographic **SHA-256 hash**.

### Creating a Manual Backup
```bash
cd backend
npm run db:backup
```
*Generated output:*
```
[Backup Engine] Using: pg_dump (PostgreSQL) 18.1
[Backup Engine] Backing up database "dental_clinic_erp" to: backend/backups/backup_dental_clinic_erp_2026-10-19T05-00-00.sql...
[Backup Engine] Backup completed successfully.
  File:   backend/backups/backup_dental_clinic_erp_2026-10-19T05-00-00.sql
  Size:   159.56 KB
  SHA256: 7f162b7dd1fe38371a0f4432d4b9b71c706f8ecff8a0be1efa54eeea42d645be
```

---

## 3. Restoration Runbook

### Step 3.1: Verification Restore (Standard Safe Procedure)
Before touching production or active environments, always restore into an isolated verification database:

1. **Create an isolated database:**
   ```bash
   # From PowerShell or Bash
   psql -U postgres -h localhost -c "CREATE DATABASE dental_clinic_erp_test_restore;"
   ```
2. **Execute the restore script targeting the test database:**
   ```bash
   cd backend
   node scripts/restoreDatabase.js backups/<your_backup_file>.sql dental_clinic_erp_test_restore
   ```
3. **Verify table counts and sample rows:**
   ```sql
   psql -U postgres -d dental_clinic_erp_test_restore -c "SELECT COUNT(*) FROM clinics; SELECT COUNT(*) FROM branches; SELECT COUNT(*) FROM users;"
   ```
4. **Drop the test database once verification is complete:**
   ```bash
   psql -U postgres -h localhost -c "DROP DATABASE dental_clinic_erp_test_restore;"
   ```

### Step 3.2: Disaster Recovery Overwrite (Emergency Only)
If the primary database is corrupt and must be restored:

1. **Stop the backend server process:**
   ```bash
   # Stop server to terminate active connection pools
   npm stop
   ```
2. **Execute restore with the explicit safety override:**
   ```bash
   node scripts/restoreDatabase.js backups/<your_backup_file>.sql dental_clinic_erp --confirm-active-overwrite
   ```
3. **Verify database migrations are up to date:**
   ```bash
   npm run test
   ```
4. **Restart the backend server:**
   ```bash
   npm start
   ```

---

## 4. Automated Verification Test

The repository includes an end-to-end automated backup and restore validation harness:

```bash
cd backend
npm run db:verify-backup
```
*Harness Workflow:*
1. Generates a fresh `pg_dump` of the live primary database with SHA-256 calculation.
2. Creates an ephemeral isolated database `dental_erp_test_restore_<timestamp>`.
3. Restores the dump file into the ephemeral database using `psql`.
4. Performs row-by-row count comparisons across `clinics`, `branches`, `users`, `user_branches`, `subscription_plans`, `audit_logs`, `revoked_tokens`, and `schema_migrations`.
5. Drops the ephemeral database and deletes the test dump file upon completion.

---

## 5. Backup Frequency & Retention Policy (Healthcare Standard)

For compliance with clinical data protection guidelines (HIPAA / GDPR / NABH / DISHA), the following backup schedule is mandated:

| Tier | Frequency | Retention Window | Storage Medium |
| :--- | :--- | :--- | :--- |
| **Hourly Differential / WAL** | Every 1 hour | 48 hours | Hot Local Disk & Private Cloud Storage |
| **Daily Full Backup** | Daily at 01:00 AM | 30 days | AES-256 Encrypted Cloud Object Storage (S3 / GCS) |
| **Weekly Snapshot** | Sundays at 02:00 AM | 12 weeks | Geographically Replicated Cloud Archive |
| **Monthly Archive** | 1st of every month | 7 years (Statutory retention for medical charts) | Immutable Cloud Vault (WORM / S3 Glacier Vault Lock) |

---

## 6. Critical Limitations of Local-Only Backups

> [!WARNING]
> Storing backups solely on the local server disk is **NOT** a disaster recovery solution.

1. **Hardware Failure:** If the host machine's drive suffers catastrophic hardware failure, both the database and the local backups are lost simultaneously.
2. **Ransomware / Host Compromise:** Malicious software compromising the operating system can delete or encrypt both the running database and local backup files.
3. **Offsite Cloud Requirement:** In production, backups generated by `backupDatabase.js` must be synchronized immediately to an encrypted, offsite bucket (AWS S3, Google Cloud Storage, or Azure Blob) with lifecycle rules and Object Lock enabled.
4. **Test Periodicity:** Backups must be tested via `npm run db:verify-backup` at least weekly to ensure dumps do not encounter schema or corruption issues.

---

## 7. Session Protection Architecture Reference

| Mechanism | Trigger | Server State | Client State | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **User Logout** | User clicks "Sign Out" | Token hash recorded in `revoked_tokens` table with reason `USER_LOGOUT`. Future requests rejected (HTTP 401). | `dental_erp_token` and `dental_erp_user` removed from `localStorage`. Redirected to `/login`. | Explicit session termination. |
| **Inactivity Timeout** | 15 minutes of zero keyboard/mouse interaction in operatory | Frontend triggers `POST /api/auth/logout` with reason `INACTIVITY_TIMEOUT`. Token is blacklisted in DB. | Toast notification displayed, local auth state wiped, redirected to `/login`. | Protect unattended clinical terminals from unauthorized physical access. |
| **JWT Expiration** | 24 hours elapsed since token issuance | `jwt.verify()` fails with `TokenExpiredError` (HTTP 401). | Axios interceptor catches 401, dispatches `auth:unauthorized`, and redirects to login. | Cryptographic boundary preventing indefinite token reuse if client never logs out. |
