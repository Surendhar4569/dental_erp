/**
 * Migration 008: Align Phase 2.2 Schema Columns and Constraints
 *
 * Extends:
 * 1. doctor_schedules: Adds slot_duration_minutes, buffer_minutes, and standard unique constraint
 * 2. doctor_branch_fees: Adds multi-tier fee matrix columns (consultation_fee, followup_fee, emergency_fee) with nullable overrides
 * 3. appointments: Adds consultation_fee, amount_paid, chief_complaint
 * 4. appointment_payments: Adds transaction_reference, reprint_count, and allows nullable patient_id
 */

module.exports = {
  version: '008',
  name: '008_align_phase2_2_schema',

  async up(client) {
    console.log('[Migration 008] Executing Phase 2.2 schema alignment...');

    // 1. doctor_schedules
    await client.query(`
      ALTER TABLE doctor_schedules
        ADD COLUMN IF NOT EXISTS slot_duration_minutes INT DEFAULT 30,
        ADD COLUMN IF NOT EXISTS buffer_minutes INT DEFAULT 0;
    `);

    await client.query(`
      ALTER TABLE doctor_schedules DROP CONSTRAINT IF EXISTS uq_doctor_branch_day;
      ALTER TABLE doctor_schedules DROP CONSTRAINT IF EXISTS uq_doctor_branch_day_simple;
      ALTER TABLE doctor_schedules ADD CONSTRAINT uq_doctor_branch_day_simple 
        UNIQUE (clinic_id, branch_id, doctor_id, day_of_week);
    `);

    // 2. doctor_branch_fees
    await client.query(`
      ALTER TABLE doctor_branch_fees
        ADD COLUMN IF NOT EXISTS consultation_fee NUMERIC(10,2) DEFAULT 500.00,
        ADD COLUMN IF NOT EXISTS followup_fee NUMERIC(10,2) DEFAULT 300.00,
        ADD COLUMN IF NOT EXISTS emergency_fee NUMERIC(10,2) DEFAULT 800.00;
    `);

    await client.query(`
      ALTER TABLE doctor_branch_fees ALTER COLUMN branch_id DROP NOT NULL;
      ALTER TABLE doctor_branch_fees ALTER COLUMN doctor_id DROP NOT NULL;
    `);

    await client.query(`
      ALTER TABLE doctor_branch_fees DROP CONSTRAINT IF EXISTS uq_doctor_branch_fee_type;
      DROP INDEX IF EXISTS uq_doctor_branch_fees_lookup;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_doctor_branch_fees_lookup 
        ON doctor_branch_fees (
          clinic_id,
          COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
          COALESCE(doctor_id, '00000000-0000-0000-0000-000000000000'::uuid)
        );
    `);

    // 3. appointments
    await client.query(`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS consultation_fee NUMERIC(10,2) DEFAULT 0.00,
        ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10,2) DEFAULT 0.00,
        ADD COLUMN IF NOT EXISTS chief_complaint TEXT;
    `);

    // 4. appointment_payments
    await client.query(`
      ALTER TABLE appointment_payments
        ADD COLUMN IF NOT EXISTS transaction_reference VARCHAR(100),
        ADD COLUMN IF NOT EXISTS reprint_count INT DEFAULT 0;
    `);

    await client.query(`
      ALTER TABLE appointment_payments ALTER COLUMN patient_id DROP NOT NULL;
    `);

    console.log('[Migration 008] Phase 2.2 schema alignment applied successfully.');
  },
};
