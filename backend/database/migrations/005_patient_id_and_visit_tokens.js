/**
 * Migration 005: Permanent Patient ID (Numeric Sequence) and Daily Branch Visit Tokens
 *
 * Capabilities:
 * 1. Converts patient_number to a permanent, clinic-organization-scoped numeric sequence starting at 100001.
 * 2. Preserves legacy patient identifiers in legacy_patient_number for historical search and audit continuity.
 * 3. Enforces digits-only constraint on patient_number.
 * 4. Seeds/aligns clinic_counters to guarantee subsequent registrations continue from the max allocated ID.
 * 5. Creates daily_visit_counters for concurrency-safe daily visit tokens (001, 002...) scoped per branch and date.
 * 6. Creates patient_visits table to record all clinical encounters with branch-scoped visit tokens.
 */
module.exports = {
  version: '005',
  name: '005_patient_id_and_visit_tokens',

  async up(client) {
    console.log('[Migration 005] Executing Patient ID and Daily Visit Token schema enhancements...');

    // 1. Add legacy_patient_number column to patients
    await client.query(`
      ALTER TABLE patients 
        ADD COLUMN IF NOT EXISTS legacy_patient_number VARCHAR(50);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_patients_legacy_number ON patients(clinic_id, legacy_patient_number);
    `);

    // 2. Deterministic migration of existing patient records to pure numeric sequence starting at 100001
    await client.query(`
      DO $$
      DECLARE
        rec RECORD;
        curr_clinic UUID := NULL;
        seq_val BIGINT := 100000;
      BEGIN
        FOR rec IN 
          SELECT id, clinic_id, patient_number 
          FROM patients 
          ORDER BY clinic_id, created_at ASC
        LOOP
          IF curr_clinic IS NULL OR curr_clinic <> rec.clinic_id THEN
            curr_clinic := rec.clinic_id;
            seq_val := 100000;
          END IF;

          seq_val := seq_val + 1;

          UPDATE patients 
          SET 
            legacy_patient_number = COALESCE(legacy_patient_number, patient_number),
            patient_number = seq_val::text
          WHERE id = rec.id;
        END LOOP;
      END $$;
    `);

    // 3. Enforce digits-only constraint on patient_number
    await client.query(`
      ALTER TABLE patients DROP CONSTRAINT IF EXISTS chk_patient_number_digits;
      ALTER TABLE patients ADD CONSTRAINT chk_patient_number_digits CHECK (patient_number ~ '^[0-9]+$');
    `);

    // 4. Align clinic_counters so future registrations start after the highest assigned ID
    await client.query(`
      INSERT INTO clinic_counters (clinic_id, counter_type, current_value, updated_at)
      SELECT 
        c.id, 
        'PATIENT', 
        COALESCE(
          (SELECT MAX(patient_number::bigint) FROM patients WHERE clinic_id = c.id),
          100000
        ),
        now()
      FROM clinics c
      ON CONFLICT (clinic_id, counter_type)
      DO UPDATE SET 
        current_value = GREATEST(
          clinic_counters.current_value,
          COALESCE((SELECT MAX(patient_number::bigint) FROM patients WHERE clinic_id = EXCLUDED.clinic_id), 100000)
        ),
        updated_at = now();
    `);

    // 5. Create daily_visit_counters table for daily branch token sequences
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_visit_counters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        visit_date DATE NOT NULL,
        current_token INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_daily_branch_visit_counter UNIQUE (clinic_id, branch_id, visit_date)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_visit_counters_lookup ON daily_visit_counters(clinic_id, branch_id, visit_date);
    `);

    // 6. Create patient_visits table
    await client.query(`
      CREATE TABLE IF NOT EXISTS patient_visits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        visit_date DATE NOT NULL,
        token_number INT NOT NULL,
        token_display VARCHAR(10) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'queued',
        visit_type VARCHAR(50) NOT NULL DEFAULT 'consultation',
        reason_for_visit TEXT,
        doctor_id UUID REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_branch_date_token UNIQUE (clinic_id, branch_id, visit_date, token_number),
        CONSTRAINT chk_visit_status CHECK (status IN ('queued', 'in_progress', 'completed', 'cancelled'))
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_patient_visits_patient ON patient_visits(patient_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_patient_visits_branch_date ON patient_visits(branch_id, visit_date);
      CREATE INDEX IF NOT EXISTS idx_patient_visits_clinic_status ON patient_visits(clinic_id, status);
    `);

    console.log('[Migration 005] Successfully applied Patient ID and Daily Visit Token schema changes.');
  },
};
