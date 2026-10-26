/**
 * Migration 012: Doctor Calendar Schedules, Cross-Branch Concurrency Guard, and Dental Chairs
 *
 * Implements:
 * 1. Partial unique index on appointments (clinic_id, doctor_id, appointment_date, start_time)
 *    to prevent cross-branch double-booking of a doctor at the database level.
 * 2. Minimal optional dental_chairs table per branch.
 * 3. Optional chair_id reference on appointments.
 */

module.exports = {
  version: '012',
  name: '012_stage4_doctor_calendar_schedules',

  async up(client) {
    console.log('[Migration 012] Applying doctor calendar schedule & resource enhancements...');

    // 1. Cross-branch doctor appointment uniqueness guard
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_doctor_clinic_active_slot 
      ON appointments (clinic_id, doctor_id, appointment_date, start_time) 
      WHERE (status <> 'cancelled');
    `);

    // 2. Minimal Dental Chairs table (branch-scoped)
    await client.query(`
      CREATE TABLE IF NOT EXISTS dental_chairs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        chair_number VARCHAR(50) NOT NULL,
        chair_name VARCHAR(100) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_branch_chair_number UNIQUE (clinic_id, branch_id, chair_number)
      );

      CREATE INDEX IF NOT EXISTS idx_chairs_branch 
      ON dental_chairs (clinic_id, branch_id, is_active);
    `);

    // 3. Optional chair_id on appointments table
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'appointments' AND column_name = 'chair_id'
        ) THEN
          ALTER TABLE appointments 
          ADD COLUMN chair_id UUID REFERENCES dental_chairs(id) ON DELETE SET NULL;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_appointments_chair 
      ON appointments (clinic_id, branch_id, chair_id, appointment_date, start_time) 
      WHERE chair_id IS NOT NULL AND (status <> 'cancelled');
    `);

    console.log('[Migration 012] Successfully applied cross-branch uniqueness guard and dental chair resources.');
  },
};
