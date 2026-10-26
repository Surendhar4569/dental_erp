/**
 * Migration 018: Interactive Dental Charting (Odontogram)
 *
 * Implements:
 * 1. dental_conditions: Master condition catalog (caries, restoration, crown, RCT, missing, implant, etc.)
 *    with surface vs tooth-level applicability, dentition compatibility, category, color, symbol, and display order.
 * 2. patient_dental_findings: Visit-anchored tooth- and surface-level findings tied to authoritative patient_visits.
 * 3. patient_dental_baselines: Living patient dental status/baseline across all teeth and surfaces.
 * 4. patient_dental_chart_amendments: Append-only legal amendment audit trail for signed/locked charts.
 * 5. PostgreSQL Immutability Trigger: Database-level guard preventing unauthorized modification of finalized visit chart findings.
 */

module.exports = {
  version: '018',
  name: '018_interactive_dental_charting_odontogram',

  async up(client) {
    console.log('[Migration 018] Creating Interactive Dental Charting tables...');

    // 1. dental_conditions: Master dental condition catalog
    await client.query(`
      CREATE TABLE IF NOT EXISTS dental_conditions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
        code VARCHAR(50) NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'pathology' 
          CHECK (category IN ('pathology', 'restorative', 'endodontic', 'periodontal', 'prosthodontic', 'surgical', 'general')),
        description TEXT,
        applies_to_surfaces BOOLEAN NOT NULL DEFAULT false,
        applies_to_entire_tooth BOOLEAN NOT NULL DEFAULT true,
        dentition_type VARCHAR(20) NOT NULL DEFAULT 'both' 
          CHECK (dentition_type IN ('permanent', 'primary', 'both')),
        color_hex VARCHAR(20) NOT NULL DEFAULT '#E11D48',
        badge_symbol VARCHAR(10) NOT NULL DEFAULT '●',
        severity_level VARCHAR(20) DEFAULT 'routine' 
          CHECK (severity_level IN ('routine', 'moderate', 'severe', 'critical')),
        display_order INT NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_condition_clinic_code UNIQUE (clinic_id, code)
      );

      CREATE INDEX IF NOT EXISTS idx_dental_conditions_lookup 
        ON dental_conditions(clinic_id, is_active, display_order);
    `);

    // 2. Seed initial dental conditions (clinic_id IS NULL for system defaults)
    await client.query(`
      INSERT INTO dental_conditions 
        (clinic_id, code, display_name, category, description, applies_to_surfaces, applies_to_entire_tooth, dentition_type, color_hex, badge_symbol, severity_level, display_order, is_active)
      VALUES
        (NULL, 'healthy', 'Intact / Healthy', 'general', 'Intact, normal tooth structure with no observed pathology', false, true, 'both', '#10B981', '✓', 'routine', 10, true),
        (NULL, 'caries', 'Dental Caries / Decay', 'pathology', 'Active carious lesion or cavitation on tooth structure or surface', true, true, 'both', '#EF4444', 'C', 'moderate', 20, true),
        (NULL, 'restoration', 'Existing Restoration', 'restorative', 'Existing restorative material (filling) present', true, true, 'both', '#3B82F6', 'R', 'routine', 30, true),
        (NULL, 'composite', 'Composite Resin', 'restorative', 'Tooth-colored composite restoration', true, true, 'both', '#06B6D4', 'CR', 'routine', 40, true),
        (NULL, 'amalgam', 'Amalgam Restoration', 'restorative', 'Silver amalgam metallic restoration', true, true, 'both', '#64748B', 'AM', 'routine', 50, true),
        (NULL, 'missing', 'Missing Tooth', 'surgical', 'Congenitally absent or previously extracted tooth', false, true, 'both', '#94A3B8', '✕', 'routine', 60, true),
        (NULL, 'crown', 'Full Coverage Crown', 'prosthodontic', 'Full artificial coronal coverage (ceramic/metal/PFM)', false, true, 'both', '#F59E0B', 'CRN', 'routine', 70, true),
        (NULL, 'root_canal', 'Root Canal Treated (RCT)', 'endodontic', 'Completed endodontic obturation/therapy', false, true, 'both', '#8B5CF6', 'RCT', 'routine', 80, true),
        (NULL, 'implant', 'Dental Implant', 'surgical', 'Endosseous dental fixture/implant supporting prosthesis', false, true, 'permanent', '#14B8A6', 'IMP', 'routine', 90, true),
        (NULL, 'fracture', 'Tooth / Cusp Fracture', 'pathology', 'Fractured crown, enamel cusp, or tooth structure', true, true, 'both', '#F97316', 'FX', 'severe', 100, true),
        (NULL, 'mobility', 'Tooth Mobility', 'periodontal', 'Pathological tooth mobility (Grade I, II, or III)', false, true, 'both', '#EC4899', 'MOB', 'moderate', 110, true),
        (NULL, 'periapical_lesion', 'Periapical Lesion / Abscess', 'endodontic', 'Radiolucency or periapical infection/abscess at root apex', false, true, 'both', '#DC2626', 'PA', 'severe', 120, true),
        (NULL, 'impacted', 'Impacted / Unerupted', 'general', 'Unerupted or partially impacted tooth structure', false, true, 'permanent', '#A855F7', 'IMP', 'routine', 130, true),
        (NULL, 'retained_root', 'Retained Root', 'surgical', 'Retained root tip requiring surgical extraction or evaluation', false, true, 'both', '#78716C', 'RT', 'moderate', 140, true),
        (NULL, 'attrition_erosion', 'Wear / Attrition / Erosion', 'general', 'Pathological non-carious loss of hard tooth tissue', true, true, 'both', '#D97706', 'WEAR', 'routine', 150, true),
        (NULL, 'calculus_plaque', 'Calculus / Periodontal Pocket', 'periodontal', 'Significant localized calculus deposition or pocket depth', true, true, 'both', '#CA8A04', 'CAL', 'routine', 160, true)
      ON CONFLICT (clinic_id, code) DO NOTHING;
    `);

    // 3. patient_dental_findings: Visit-anchored tooth & surface clinical findings
    await client.query(`
      CREATE TABLE IF NOT EXISTS patient_dental_findings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        visit_id UUID NOT NULL REFERENCES patient_visits(id) ON DELETE RESTRICT,
        examination_id UUID REFERENCES clinical_examinations(id) ON DELETE SET NULL,
        tooth_number INT NOT NULL,
        surface VARCHAR(20),
        condition_id UUID NOT NULL REFERENCES dental_conditions(id) ON DELETE RESTRICT,
        condition_code VARCHAR(50) NOT NULL,
        condition_name VARCHAR(100) NOT NULL,
        finding_type VARCHAR(30) NOT NULL DEFAULT 'observed_finding' 
          CHECK (finding_type IN ('observed_finding', 'pre_existing', 'diagnosed', 'restored_treated')),
        severity VARCHAR(20) DEFAULT 'routine' 
          CHECK (severity IN ('routine', 'moderate', 'severe', 'critical')),
        is_existing_condition BOOLEAN NOT NULL DEFAULT false,
        notes TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'active' 
          CHECK (status IN ('active', 'resolved', 'amended', 'superseded', 'cancelled')),
        created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_dental_findings_visit 
        ON patient_dental_findings(clinic_id, branch_id, visit_id);
      CREATE INDEX IF NOT EXISTS idx_dental_findings_patient_tooth 
        ON patient_dental_findings(clinic_id, patient_id, tooth_number);
      CREATE INDEX IF NOT EXISTS idx_dental_findings_exam 
        ON patient_dental_findings(examination_id);
      CREATE INDEX IF NOT EXISTS idx_dental_findings_status 
        ON patient_dental_findings(clinic_id, status);
    `);

    // 4. patient_dental_baselines: Patient's current living dental chart state
    await client.query(`
      CREATE TABLE IF NOT EXISTS patient_dental_baselines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        tooth_number INT NOT NULL,
        surface VARCHAR(20) NOT NULL DEFAULT '',
        condition_id UUID NOT NULL REFERENCES dental_conditions(id) ON DELETE RESTRICT,
        condition_code VARCHAR(50) NOT NULL,
        last_visit_id UUID REFERENCES patient_visits(id) ON DELETE SET NULL,
        last_finding_id UUID REFERENCES patient_dental_findings(id) ON DELETE SET NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active' 
          CHECK (status IN ('active', 'resolved', 'watch', 'treated')),
        notes TEXT,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_patient_tooth_surface_condition UNIQUE (patient_id, tooth_number, surface, condition_id)
      );

      CREATE INDEX IF NOT EXISTS idx_dental_baselines_patient 
        ON patient_dental_baselines(clinic_id, patient_id, tooth_number);
    `);

    // 5. patient_dental_chart_amendments: Legal amendment audit trail for signed visit charts
    await client.query(`
      CREATE TABLE IF NOT EXISTS patient_dental_chart_amendments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        visit_id UUID NOT NULL REFERENCES patient_visits(id) ON DELETE RESTRICT,
        examination_id UUID REFERENCES clinical_examinations(id) ON DELETE SET NULL,
        finding_id UUID REFERENCES patient_dental_findings(id) ON DELETE SET NULL,
        amendment_reason TEXT NOT NULL,
        action VARCHAR(30) NOT NULL CHECK (action IN ('added', 'modified', 'superseded', 'cancelled')),
        previous_state JSONB,
        new_state JSONB,
        amended_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        amended_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_dental_amendments_visit 
        ON patient_dental_chart_amendments(visit_id, amended_at ASC);
      CREATE INDEX IF NOT EXISTS idx_dental_amendments_patient 
        ON patient_dental_chart_amendments(patient_id, amended_at DESC);
    `);

    // 6. PostgreSQL Trigger: Database-level Immutability Guard for signed clinical examinations
    await client.query(`
      CREATE OR REPLACE FUNCTION fn_guard_patient_dental_findings_immutability()
      RETURNS TRIGGER AS $$
      DECLARE
        v_exam_status VARCHAR(20);
      BEGIN
        IF TG_OP = 'DELETE' THEN
          SELECT status INTO v_exam_status 
          FROM clinical_examinations 
          WHERE id = OLD.examination_id OR (visit_id = OLD.visit_id AND clinic_id = OLD.clinic_id);

          IF v_exam_status IN ('signed', 'locked') THEN
            RAISE EXCEPTION 'Cannot delete dental chart findings from a signed or locked visit encounter. Please record an amendment instead.'
              USING ERRCODE = '22000';
          END IF;
          RETURN OLD;
        END IF;

        IF TG_OP = 'UPDATE' THEN
          SELECT status INTO v_exam_status 
          FROM clinical_examinations 
          WHERE id = OLD.examination_id OR (visit_id = OLD.visit_id AND clinic_id = OLD.clinic_id);

          IF v_exam_status IN ('signed', 'locked') THEN
            -- Allow status change to 'amended' or 'superseded' when an authorized amendment is logged
            IF (OLD.tooth_number IS DISTINCT FROM NEW.tooth_number) OR
               (OLD.surface IS DISTINCT FROM NEW.surface) OR
               (OLD.condition_id IS DISTINCT FROM NEW.condition_id) OR
               (OLD.patient_id IS DISTINCT FROM NEW.patient_id) OR
               (OLD.visit_id IS DISTINCT FROM NEW.visit_id) THEN
              RAISE EXCEPTION 'Cannot modify core dental finding details of a signed or locked visit encounter. Please record an amendment instead.'
                USING ERRCODE = '22000';
            END IF;
          END IF;
          RETURN NEW;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_guard_patient_dental_findings_immutability ON patient_dental_findings;
      CREATE TRIGGER trg_guard_patient_dental_findings_immutability
      BEFORE UPDATE OR DELETE ON patient_dental_findings
      FOR EACH ROW EXECUTE FUNCTION fn_guard_patient_dental_findings_immutability();
    `);

    console.log('[Migration 018] Interactive Dental Charting tables and triggers created successfully.');
  },

  async down(client) {
    console.log('[Migration 018] Reverting Interactive Dental Charting tables...');
    await client.query(`DROP TRIGGER IF EXISTS trg_guard_patient_dental_findings_immutability ON patient_dental_findings;`);
    await client.query(`DROP FUNCTION IF EXISTS fn_guard_patient_dental_findings_immutability();`);
    await client.query(`DROP TABLE IF EXISTS patient_dental_chart_amendments CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS patient_dental_baselines CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS patient_dental_findings CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS dental_conditions CASCADE;`);
  },
};
