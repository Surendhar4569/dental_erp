/**
 * Migration 016: Clinical Examination & Case Notes
 *
 * Implements:
 * 1. clinical_examinations: Visit-anchored clinical case notes, vital signs, diagnosis,
 *    separate internal clinical notes vs patient-facing summary, follow-up instructions,
 *    digital doctor sign-off, signature hash, and patient release gate.
 * 2. clinical_examination_amendments: Append-only legal amendment trail for signed/locked notes.
 * 3. PostgreSQL immutability trigger: Blocks direct mutation or deletion of signed/locked records.
 */

module.exports = {
  version: '016',
  name: '016_clinical_examinations_and_case_notes',

  async up(client) {
    console.log('[Migration 016] Creating Clinical Examinations and Case Notes tables...');

    // 1. Create clinical_examinations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS clinical_examinations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        visit_id UUID NOT NULL REFERENCES patient_visits(id) ON DELETE RESTRICT,
        appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
        doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        chief_complaint TEXT,
        vital_signs JSONB NOT NULL DEFAULT '{}'::jsonb,
        examination_notes TEXT,
        diagnosis TEXT,
        diagnosis_icd10 VARCHAR(50),
        patient_facing_summary TEXT,
        follow_up_instructions TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'signed', 'locked')),
        signed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        signed_at TIMESTAMPTZ,
        signature_hash VARCHAR(64),
        locked_at TIMESTAMPTZ,
        locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
        is_released_to_patient BOOLEAN NOT NULL DEFAULT false,
        released_at TIMESTAMPTZ,
        released_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_clinic_visit_examination UNIQUE (clinic_id, visit_id)
      );
    `);

    // Indexes for high-performance retrieval and isolation
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_clinical_examinations_lookup 
        ON clinical_examinations(clinic_id, branch_id, visit_id);
      CREATE INDEX IF NOT EXISTS idx_clinical_examinations_patient 
        ON clinical_examinations(clinic_id, patient_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_clinical_examinations_doctor 
        ON clinical_examinations(doctor_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_clinical_examinations_status 
        ON clinical_examinations(clinic_id, status);
      CREATE INDEX IF NOT EXISTS idx_clinical_examinations_release 
        ON clinical_examinations(clinic_id, patient_id, is_released_to_patient);
    `);

    // 2. Create clinical_examination_amendments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS clinical_examination_amendments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        examination_id UUID NOT NULL REFERENCES clinical_examinations(id) ON DELETE RESTRICT,
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        visit_id UUID NOT NULL REFERENCES patient_visits(id) ON DELETE RESTRICT,
        amendment_reason TEXT NOT NULL,
        addendum_notes TEXT NOT NULL,
        amended_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        amended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        previous_signature_hash VARCHAR(64) NOT NULL,
        new_signature_hash VARCHAR(64) NOT NULL,
        is_released_to_patient BOOLEAN NOT NULL DEFAULT false,
        released_at TIMESTAMPTZ,
        released_by UUID REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_clinical_amendments_exam 
        ON clinical_examination_amendments(examination_id, amended_at ASC);
      CREATE INDEX IF NOT EXISTS idx_clinical_amendments_patient 
        ON clinical_examination_amendments(patient_id, amended_at DESC);
    `);

    // 3. PostgreSQL Trigger: Database-level Immutability Guard
    // Prevents direct mutation or deletion of signed or locked clinical records.
    await client.query(`
      CREATE OR REPLACE FUNCTION fn_guard_clinical_examination_immutability()
      RETURNS TRIGGER AS $$
      BEGIN
        -- If operation is DELETE on a signed or locked record, reject
        IF TG_OP = 'DELETE' THEN
          IF OLD.status IN ('signed', 'locked') THEN
            RAISE EXCEPTION 'Cannot delete signed or locked clinical examination records.'
              USING ERRCODE = '23505';
          END IF;
          RETURN OLD;
        END IF;

        -- If operation is UPDATE
        IF TG_OP = 'UPDATE' THEN
          -- Allow status change from signed to locked (locking action)
          -- and allow updating patient release status (is_released_to_patient, released_at, released_by)
          -- ONLY IF core clinical content is unmodified
          IF OLD.status IN ('signed', 'locked') THEN
            -- Check if any clinical content has been modified
            IF (OLD.chief_complaint IS DISTINCT FROM NEW.chief_complaint) OR
               (OLD.vital_signs IS DISTINCT FROM NEW.vital_signs) OR
               (OLD.examination_notes IS DISTINCT FROM NEW.examination_notes) OR
               (OLD.diagnosis IS DISTINCT FROM NEW.diagnosis) OR
               (OLD.diagnosis_icd10 IS DISTINCT FROM NEW.diagnosis_icd10) OR
               (OLD.patient_facing_summary IS DISTINCT FROM NEW.patient_facing_summary) OR
               (OLD.follow_up_instructions IS DISTINCT FROM NEW.follow_up_instructions) OR
               (OLD.doctor_id IS DISTINCT FROM NEW.doctor_id) OR
               (OLD.patient_id IS DISTINCT FROM NEW.patient_id) OR
               (OLD.visit_id IS DISTINCT FROM NEW.visit_id) OR
               (OLD.signature_hash IS DISTINCT FROM NEW.signature_hash) OR
               (OLD.signed_at IS DISTINCT FROM NEW.signed_at) OR
               (OLD.signed_by IS DISTINCT FROM NEW.signed_by) THEN
              RAISE EXCEPTION 'Cannot modify clinical content of signed or locked examination records. Please add an amendment addendum instead.'
                USING ERRCODE = '22000';
            END IF;

            -- Prevent reverting status from signed/locked back to draft
            IF NEW.status = 'draft' THEN
              RAISE EXCEPTION 'Cannot revert signed or locked examination record back to draft.'
                USING ERRCODE = '22000';
            END IF;

            -- Prevent unlocking a locked record
            IF OLD.status = 'locked' AND NEW.status <> 'locked' THEN
              RAISE EXCEPTION 'Cannot unlock a locked examination record.'
                USING ERRCODE = '22000';
            END IF;
          END IF;

          NEW.updated_at = now();
          RETURN NEW;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_guard_clinical_examination_immutability ON clinical_examinations;
      CREATE TRIGGER trg_guard_clinical_examination_immutability
        BEFORE UPDATE OR DELETE ON clinical_examinations
        FOR EACH ROW
        EXECUTE FUNCTION fn_guard_clinical_examination_immutability();
    `);

    console.log('[Migration 016] Clinical Examinations schema and immutability trigger successfully applied.');
  },

  async down(client) {
    await client.query('DROP TRIGGER IF EXISTS trg_guard_clinical_examination_immutability ON clinical_examinations;');
    await client.query('DROP FUNCTION IF EXISTS fn_guard_clinical_examination_immutability;');
    await client.query('DROP TABLE IF EXISTS clinical_examination_amendments CASCADE;');
    await client.query('DROP TABLE IF EXISTS clinical_examinations CASCADE;');
  },
};
