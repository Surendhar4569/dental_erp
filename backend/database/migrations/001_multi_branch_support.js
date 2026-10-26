/**
 * Migration 001: Multi-Branch Management Support
 * Creates branches and user_branches tables, indexes, constraints,
 * adds branch_id to audit_logs, and idempotently migrates existing clinics and users.
 */
module.exports = {
  version: '001',
  name: '001_multi_branch_support',
  
  async up(client) {
    console.log('[Migration 001] Executing multi-branch schema and data migration...');

    // 1. Create branches table
    await client.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_code VARCHAR(50) NOT NULL,
        branch_name VARCHAR(200) NOT NULL,
        address_line1 TEXT,
        address_line2 TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        postal_code VARCHAR(20),
        country VARCHAR(100) DEFAULT 'India',
        phone VARCHAR(30),
        email VARCHAR(254),
        timezone VARCHAR(60) NOT NULL DEFAULT 'Asia/Kolkata',
        is_active BOOLEAN NOT NULL DEFAULT true,
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_clinic_branch_code UNIQUE (clinic_id, branch_code)
      );
    `);

    // 2. Create indexes for branches
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_branches_clinic_id ON branches(clinic_id);
      CREATE INDEX IF NOT EXISTS idx_branches_branch_code ON branches(branch_code);
      CREATE INDEX IF NOT EXISTS idx_branches_is_active ON branches(is_active);
      CREATE INDEX IF NOT EXISTS idx_branches_is_default ON branches(is_default);
    `);

    // 3. Create user_branches junction table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_branches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        is_default BOOLEAN NOT NULL DEFAULT false,
        assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_user_branch UNIQUE (user_id, branch_id)
      );
    `);

    // 4. Create indexes for user_branches
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_branches_user_id ON user_branches(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_branches_branch_id ON user_branches(branch_id);
    `);

    // 5. Add branch_id to audit_logs if not present
    await client.query(`
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_id ON audit_logs(branch_id);
    `);

    // 6. Safe Data Migration for Existing Clinics
    // Query all existing clinics
    const clinicsRes = await client.query(`
      SELECT id, code, name, phone, email, address, timezone FROM clinics
    `);

    for (const clinic of clinicsRes.rows) {
      // Check if this clinic already has a default branch
      let branchId;
      const existingBranchRes = await client.query(
        `SELECT id, is_default FROM branches WHERE clinic_id = $1 ORDER BY is_default DESC, created_at ASC LIMIT 1`,
        [clinic.id]
      );

      if (existingBranchRes.rows.length === 0) {
        // Create initial default branch for existing clinic
        const branchCode = 'MAIN-01';
        const branchName = clinic.name ? `${clinic.name} - Main Branch` : 'Main Headquarters Branch';
        
        const insertBranchRes = await client.query(
          `INSERT INTO branches (
            clinic_id, branch_code, branch_name, address_line1,
            city, state, postal_code, country, phone, email,
            timezone, is_active, is_default
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8, $9, $10,
            $11, true, true
          ) RETURNING id`,
          [
            clinic.id,
            branchCode,
            branchName,
            clinic.address || '101 Medical Enclave, Healthcare Boulevard',
            'Metro City',
            'State Central',
            '400001',
            'India',
            clinic.phone || '+91 98765 43210',
            clinic.email || 'contact@dentalcare-apex.com',
            clinic.timezone || 'Asia/Kolkata',
          ]
        );
        branchId = insertBranchRes.rows[0].id;
        console.log(`[Migration 001] Created default branch ${branchCode} for clinic: ${clinic.name} (${clinic.id})`);
      } else {
        branchId = existingBranchRes.rows[0].id;
      }

      // Assign all existing users of this clinic to the default branch if they don't have assignments
      const usersRes = await client.query(
        `SELECT id FROM users WHERE clinic_id = $1`,
        [clinic.id]
      );

      for (const user of usersRes.rows) {
        const checkMapping = await client.query(
          `SELECT id FROM user_branches WHERE user_id = $1 AND branch_id = $2`,
          [user.id, branchId]
        );

        if (checkMapping.rows.length === 0) {
          await client.query(
            `INSERT INTO user_branches (user_id, branch_id, is_default)
             VALUES ($1, $2, true)
             ON CONFLICT (user_id, branch_id) DO NOTHING`,
            [user.id, branchId]
          );
          console.log(`[Migration 001] Assigned user ${user.id} to branch ${branchId}`);
        }
      }
    }

    console.log('[Migration 001] Completed multi-branch schema and data migration successfully.');
  },
};
