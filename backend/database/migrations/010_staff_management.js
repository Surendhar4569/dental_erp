/**
 * Migration 010: Staff Management & Staff-to-Doctor Architecture
 *
 * Implements:
 * 1. staff: Dedicated staff/employee entity decoupled from login credentials
 * 2. staff_branches: Multi-branch mapping for all clinic staff
 * 3. Backfills existing clinic users into staff and staff_branches
 * 4. Initializes clinic_counters with counter_type = 'STAFF' (STF-10001+)
 */

module.exports = {
  version: '010',
  name: '010_staff_management',

  async up(client) {
    console.log('[Migration 010] Executing Staff Management schema creation...');

    // 1. Create staff table
    await client.query(`
      CREATE TABLE IF NOT EXISTS staff (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        primary_branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
        staff_number VARCHAR(50) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100),
        gender VARCHAR(20),
        date_of_birth DATE,
        phone VARCHAR(30) NOT NULL,
        email VARCHAR(254),
        address TEXT,
        staff_category VARCHAR(50) NOT NULL,
        designation VARCHAR(100),
        department VARCHAR(100),
        specialization VARCHAR(100),
        license_number VARCHAR(100),
        joining_date DATE NOT NULL DEFAULT CURRENT_DATE,
        employment_status VARCHAR(30) NOT NULL DEFAULT 'active' 
          CHECK (employment_status IN ('active', 'probation', 'on_leave', 'terminated')),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_clinic_staff_number UNIQUE (clinic_id, staff_number)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_staff_clinic_branch 
        ON staff(clinic_id, primary_branch_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_staff_category 
        ON staff(clinic_id, staff_category, is_active);
      CREATE INDEX IF NOT EXISTS idx_staff_user_id 
        ON staff(user_id);
    `);

    // 2. Create staff_branches table
    await client.query(`
      CREATE TABLE IF NOT EXISTS staff_branches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        is_default BOOLEAN NOT NULL DEFAULT false,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_staff_branch UNIQUE (staff_id, branch_id)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_staff_branches_lookup 
        ON staff_branches(staff_id, branch_id);
      CREATE INDEX IF NOT EXISTS idx_staff_branches_branch 
        ON staff_branches(branch_id);
    `);

    // 3. Backfill existing clinic users into staff
    await client.query(`
      DO $$
      DECLARE
        user_rec RECORD;
        curr_clinic UUID := NULL;
        seq_num BIGINT := 10000;
        new_staff_id UUID;
        cat_val VARCHAR(50);
        desig_val VARCHAR(100);
        default_branch UUID;
      BEGIN
        FOR user_rec IN 
          SELECT u.id, u.clinic_id, u.first_name, u.last_name, u.email, u.phone,
                 u.specialization, u.license_number, u.is_active, u.created_at,
                 r.name AS role_name, r.display_name AS role_display
          FROM users u
          JOIN roles r ON u.role_id = r.id
          WHERE u.clinic_id IS NOT NULL 
            AND r.name != 'superadmin'
            AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.user_id = u.id)
          ORDER BY u.clinic_id, u.created_at ASC
        LOOP
          IF curr_clinic IS NULL OR curr_clinic <> user_rec.clinic_id THEN
            curr_clinic := user_rec.clinic_id;
            SELECT COALESCE(MAX(SUBSTRING(staff_number FROM 5)::bigint), 10000)
            INTO seq_num
            FROM staff
            WHERE clinic_id = curr_clinic AND staff_number ~ '^STF-[0-9]+$';
          END IF;

          seq_num := seq_num + 1;

          -- Map role to staff category & designation
          IF user_rec.role_name IN ('dentist', 'specialist') THEN
            cat_val := user_rec.role_name;
            desig_val := user_rec.role_display;
          ELSIF user_rec.role_name = 'admin' THEN
            cat_val := 'manager';
            desig_val := 'Clinic Administrator';
          ELSIF user_rec.role_name = 'receptionist' THEN
            cat_val := 'receptionist';
            desig_val := 'Receptionist';
          ELSIF user_rec.role_name = 'assistant' THEN
            cat_val := 'assistant';
            desig_val := 'Dental Assistant';
          ELSIF user_rec.role_name = 'billing' THEN
            cat_val := 'billing';
            desig_val := 'Billing Staff';
          ELSIF user_rec.role_name = 'radiologist' THEN
            cat_val := 'technician';
            desig_val := 'Dental Radiologist';
          ELSIF user_rec.role_name = 'inventory' THEN
            cat_val := 'manager';
            desig_val := 'Inventory Manager';
          ELSE
            cat_val := 'other';
            desig_val := user_rec.role_display;
          END IF;

          -- Fetch primary branch from user_branches
          SELECT branch_id INTO default_branch
          FROM user_branches
          WHERE user_id = user_rec.id
          ORDER BY is_default DESC, assigned_at ASC
          LIMIT 1;

          INSERT INTO staff (
            clinic_id, primary_branch_id, staff_number, first_name, last_name,
            phone, email, staff_category, designation, specialization, license_number,
            user_id, is_active, created_at, updated_at
          ) VALUES (
            user_rec.clinic_id, default_branch, 'STF-' || seq_num, user_rec.first_name, user_rec.last_name,
            COALESCE(user_rec.phone, '9999999999'), user_rec.email, cat_val, desig_val, user_rec.specialization, user_rec.license_number,
            user_rec.id, user_rec.is_active, user_rec.created_at, now()
          ) RETURNING id INTO new_staff_id;

          -- Assign branches to staff_branches based on user_branches
          INSERT INTO staff_branches (staff_id, branch_id, is_default, assigned_at)
          SELECT new_staff_id, ub.branch_id, ub.is_default, ub.assigned_at
          FROM user_branches ub
          WHERE ub.user_id = user_rec.id
          ON CONFLICT (staff_id, branch_id) DO NOTHING;

          -- Update clinic_counters
          INSERT INTO clinic_counters (clinic_id, counter_type, current_value, updated_at)
          VALUES (user_rec.clinic_id, 'STAFF', seq_num, now())
          ON CONFLICT (clinic_id, counter_type)
          DO UPDATE SET 
            current_value = GREATEST(clinic_counters.current_value, EXCLUDED.current_value),
            updated_at = now();

        END LOOP;
      END $$;
    `);

    console.log('[Migration 010] Staff Management schema and backfill applied successfully.');
  },

  async down(client) {
    console.log('[Migration 010] Reverting Staff Management schema...');
    await client.query('DROP TABLE IF EXISTS staff_branches CASCADE;');
    await client.query('DROP TABLE IF EXISTS staff CASCADE CASCADE;');
  },
};
