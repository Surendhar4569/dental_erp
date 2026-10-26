/**
 * Migration 019: Treatment Planning & Consent Management
 *
 * Implements:
 * 1. dental_procedures: Simple, reusable procedure master catalog (preventive, restorative, endodontic, oral surgery, prosthodontic, etc.)
 * 2. treatment_plans: Patient- and encounter-linked plans with human-readable numbering (TP-10001+), versioning, estimated total cost, and lifecycle states.
 * 3. treatment_plan_items: Procedure items linked to tooth (FDI), surfaces, optional odontogram findings, priority, session, sequence, unit & total cost.
 * 4. treatment_plan_versions: Auditable immutable snapshots when presented/approved plans are meaningfully modified.
 * 5. treatment_consents: Consent records with risks, alternatives, patient/guardian acknowledgement, and agreed item scope snapshots.
 * 6. treatment_consent_events: Append-only consent audit trail (obtained, declined, withdrawn, amended, renewed).
 */

module.exports = {
  version: '019',
  name: '019_treatment_planning_and_consent',

  async up(client) {
    console.log('[Migration 019] Creating Treatment Planning & Consent Management schema...');

    // 1. dental_procedures: Standard procedure catalog
    await client.query(`
      CREATE TABLE IF NOT EXISTS dental_procedures (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
        code VARCHAR(50) NOT NULL,
        name VARCHAR(150) NOT NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'general'
          CHECK (category IN ('preventive', 'restorative', 'endodontic', 'periodontic', 'prosthodontic', 'oral_surgery', 'orthodontic', 'cosmetic', 'diagnostic', 'general')),
        description TEXT,
        default_estimated_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (default_estimated_cost >= 0),
        estimated_duration_minutes INT DEFAULT 30,
        requires_tooth BOOLEAN NOT NULL DEFAULT true,
        display_order INT NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_procedure_clinic_code UNIQUE (clinic_id, code)
      );

      CREATE INDEX IF NOT EXISTS idx_dental_procedures_lookup 
        ON dental_procedures(clinic_id, is_active, display_order);
    `);

    // 2. Seed initial dental procedures (clinic_id IS NULL for system defaults)
    await client.query(`
      INSERT INTO dental_procedures 
        (clinic_id, code, name, category, description, default_estimated_cost, estimated_duration_minutes, requires_tooth, display_order, is_active)
      VALUES
        (NULL, 'DIAG_EXAM', 'Comprehensive Oral Examination', 'diagnostic', 'Complete diagnostic evaluation of oral cavity, teeth, and soft tissues', 500.00, 30, false, 10, true),
        (NULL, 'PREV_SCALE', 'Scaling & Polishing (Prophylaxis)', 'preventive', 'Full mouth ultrasonic scaling and paste polishing for plaque and calculus removal', 1200.00, 45, false, 20, true),
        (NULL, 'PREV_DEEP_SRP', 'Root Planing & Subgingival Curettage', 'periodontic', 'Deep periodontal debridement and root smoothing per quadrant', 2500.00, 45, false, 30, true),
        (NULL, 'PREV_FLUOR', 'Topical Fluoride Application', 'preventive', 'Application of high-concentration topical fluoride varnish for caries prevention', 800.00, 15, false, 40, true),
        (NULL, 'REST_COMP_1S', 'Composite Resin Restoration (1 Surface)', 'restorative', 'Direct tooth-colored composite resin filling on a single surface', 1500.00, 30, true, 50, true),
        (NULL, 'REST_COMP_MS', 'Composite Resin Restoration (Multi-Surface)', 'restorative', 'Direct tooth-colored composite resin filling involving 2 or more surfaces (MOD/DO/MO)', 2200.00, 45, true, 60, true),
        (NULL, 'REST_AMAL', 'Dental Amalgam Restoration', 'restorative', 'Direct silver amalgam metallic posterior restoration', 1200.00, 30, true, 70, true),
        (NULL, 'REST_GIC', 'Glass Ionomer Cement (GIC) Restoration', 'restorative', 'Biocompatible fluoride-releasing glass ionomer cement restoration', 1000.00, 30, true, 80, true),
        (NULL, 'ENDO_RCT_ANT', 'Root Canal Treatment (Anterior Tooth)', 'endodontic', 'Biomechanical preparation and obturation of single-canal anterior tooth', 4500.00, 60, true, 90, true),
        (NULL, 'ENDO_RCT_PREM', 'Root Canal Treatment (Premolar Tooth)', 'endodontic', 'Biomechanical preparation and obturation of premolar tooth', 5500.00, 60, true, 100, true),
        (NULL, 'ENDO_RCT_MOL', 'Root Canal Treatment (Molar Tooth)', 'endodontic', 'Biomechanical preparation and obturation of multi-canal molar tooth', 7000.00, 75, true, 110, true),
        (NULL, 'PROS_POST_CORE', 'Post & Core Build-Up', 'restorative', 'Prefabricated fiber post and composite core reconstruction following endodontic therapy', 2500.00, 45, true, 120, true),
        (NULL, 'PROS_CRN_PFM', 'Porcelain Fused to Metal (PFM) Crown', 'prosthodontic', 'Full coronal coverage crown with ceramic veneered over metal alloy substructure', 6500.00, 45, true, 130, true),
        (NULL, 'PROS_CRN_ZIR', 'All-Ceramic Zirconia Crown', 'prosthodontic', 'High-strength monolithic CAD/CAM zirconia full contour crown', 11000.00, 45, true, 140, true),
        (NULL, 'SURG_EXT_SIMP', 'Routine Dental Extraction', 'oral_surgery', 'Non-surgical forceps extraction of erupted tooth under local anesthesia', 1200.00, 30, true, 150, true),
        (NULL, 'SURG_EXT_SURG', 'Surgical Extraction / Impaction Removal', 'oral_surgery', 'Surgical tooth removal with mucoperiosteal flap, bone guttering, or tooth sectioning', 4500.00, 60, true, 160, true),
        (NULL, 'SURG_IMP_SING', 'Endosseous Dental Implant Fixture', 'oral_surgery', 'Surgical placement of titanium endosseous fixture into alveolar bone', 32000.00, 90, true, 170, true),
        (NULL, 'ORTHO_CONSULT', 'Orthodontic Assessment & Study Models', 'orthodontic', 'Comprehensive malocclusion analysis, photographic records, and orthodontic planning', 1500.00, 45, false, 180, true)
      ON CONFLICT (clinic_id, code) DO NOTHING;
    `);

    // 3. treatment_plans: Treatment Plan Header Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS treatment_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        plan_number VARCHAR(50) NOT NULL,
        plan_title VARCHAR(200) NOT NULL DEFAULT 'Comprehensive Treatment Plan',
        originating_visit_id UUID REFERENCES patient_visits(id) ON DELETE SET NULL,
        originating_examination_id UUID REFERENCES clinical_examinations(id) ON DELETE SET NULL,
        created_by_doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        status VARCHAR(30) NOT NULL DEFAULT 'draft' 
          CHECK (status IN ('draft', 'presented', 'approved', 'in_progress', 'completed', 'deferred', 'cancelled')),
        total_estimated_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (total_estimated_cost >= 0),
        clinical_notes TEXT,
        treatment_summary TEXT,
        planned_start_date DATE,
        review_date DATE,
        presented_at TIMESTAMPTZ,
        presented_by UUID REFERENCES users(id) ON DELETE SET NULL,
        approved_at TIMESTAMPTZ,
        approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
        version INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_clinic_plan_number UNIQUE (clinic_id, plan_number)
      );

      CREATE INDEX IF NOT EXISTS idx_treatment_plans_clinic_patient 
        ON treatment_plans(clinic_id, patient_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_treatment_plans_branch_status 
        ON treatment_plans(clinic_id, branch_id, status);
      CREATE INDEX IF NOT EXISTS idx_treatment_plans_visit 
        ON treatment_plans(originating_visit_id);
    `);

    // 4. treatment_plan_items: Procedure items linked to teeth & findings
    await client.query(`
      CREATE TABLE IF NOT EXISTS treatment_plan_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        treatment_plan_id UUID NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        tooth_number INT,
        surface VARCHAR(20),
        finding_id UUID REFERENCES patient_dental_findings(id) ON DELETE SET NULL,
        condition_code VARCHAR(50),
        procedure_id UUID REFERENCES dental_procedures(id) ON DELETE RESTRICT,
        procedure_name VARCHAR(200) NOT NULL,
        procedure_code VARCHAR(50),
        category VARCHAR(50) NOT NULL DEFAULT 'general'
          CHECK (category IN ('preventive', 'restorative', 'endodontic', 'periodontic', 'prosthodontic', 'oral_surgery', 'orthodontic', 'cosmetic', 'diagnostic', 'general')),
        priority VARCHAR(20) NOT NULL DEFAULT 'medium' 
          CHECK (priority IN ('immediate', 'high', 'medium', 'low', 'urgent', 'routine')),
        quantity INT NOT NULL DEFAULT 1 CHECK (quantity >= 1),
        unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (unit_cost >= 0),
        total_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (total_cost >= 0),
        session_order INT NOT NULL DEFAULT 1,
        sequence_order INT NOT NULL DEFAULT 10,
        status VARCHAR(30) NOT NULL DEFAULT 'proposed' 
          CHECK (status IN ('proposed', 'approved', 'in_progress', 'completed', 'deferred', 'cancelled')),
        treating_doctor_id UUID REFERENCES users(id) ON DELETE SET NULL,
        completed_at TIMESTAMPTZ,
        completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        completion_visit_id UUID REFERENCES patient_visits(id) ON DELETE SET NULL,
        clinical_notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_plan_items_plan 
        ON treatment_plan_items(treatment_plan_id, session_order, sequence_order);
      CREATE INDEX IF NOT EXISTS idx_plan_items_patient_tooth 
        ON treatment_plan_items(patient_id, tooth_number);
      CREATE INDEX IF NOT EXISTS idx_plan_items_status 
        ON treatment_plan_items(clinic_id, status);
      CREATE INDEX IF NOT EXISTS idx_plan_items_finding 
        ON treatment_plan_items(finding_id);
    `);

    // 5. treatment_plan_versions: Version audit history when plans change
    await client.query(`
      CREATE TABLE IF NOT EXISTS treatment_plan_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        treatment_plan_id UUID NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        version_number INT NOT NULL,
        change_reason TEXT NOT NULL,
        plan_snapshot JSONB NOT NULL,
        total_estimated_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        status VARCHAR(30) NOT NULL,
        changed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_plan_version UNIQUE (treatment_plan_id, version_number)
      );

      CREATE INDEX IF NOT EXISTS idx_plan_versions_lookup 
        ON treatment_plan_versions(treatment_plan_id, version_number DESC);
    `);

    // 6. treatment_consents: Consent records
    await client.query(`
      CREATE TABLE IF NOT EXISTS treatment_consents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        consent_number VARCHAR(50) NOT NULL,
        treatment_plan_id UUID NOT NULL REFERENCES treatment_plans(id) ON DELETE RESTRICT,
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        visit_id UUID REFERENCES patient_visits(id) ON DELETE SET NULL,
        consent_status VARCHAR(30) NOT NULL DEFAULT 'pending' 
          CHECK (consent_status IN ('pending', 'obtained', 'declined', 'withdrawn')),
        procedure_summary TEXT NOT NULL,
        material_risks_discussed TEXT NOT NULL,
        alternatives_discussed TEXT NOT NULL,
        acknowledgement_method VARCHAR(50) NOT NULL DEFAULT 'in_person_verbal_witnessed' 
          CHECK (acknowledgement_method IN ('in_person_verbal_witnessed', 'signed_paper_on_file', 'digital_acknowledgement_patient', 'digital_acknowledgement_guardian')),
        patient_name_acknowledged VARCHAR(150) NOT NULL,
        is_guardian_consent BOOLEAN NOT NULL DEFAULT false,
        guardian_name VARCHAR(150),
        guardian_relationship VARCHAR(50),
        witness_name VARCHAR(150),
        witness_role VARCHAR(50),
        recorded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        obtained_at TIMESTAMPTZ,
        declined_at TIMESTAMPTZ,
        withdrawn_at TIMESTAMPTZ,
        decline_reason TEXT,
        withdrawal_reason TEXT,
        agreed_items_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
        plan_version_at_consent INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_clinic_consent_number UNIQUE (clinic_id, consent_number)
      );

      CREATE INDEX IF NOT EXISTS idx_treatment_consents_plan 
        ON treatment_consents(treatment_plan_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_treatment_consents_patient 
        ON treatment_consents(patient_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_treatment_consents_status 
        ON treatment_consents(clinic_id, consent_status);
    `);

    // 7. treatment_consent_events: Append-only consent event audit trail
    await client.query(`
      CREATE TABLE IF NOT EXISTS treatment_consent_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        consent_id UUID NOT NULL REFERENCES treatment_consents(id) ON DELETE CASCADE,
        treatment_plan_id UUID NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL 
          CHECK (event_type IN ('created', 'presented', 'obtained', 'declined', 'withdrawn', 'amended', 'renewed_requested')),
        event_notes TEXT,
        previous_status VARCHAR(30),
        new_status VARCHAR(30),
        event_snapshot JSONB,
        performed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_consent_events_consent 
        ON treatment_consent_events(consent_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_consent_events_plan 
        ON treatment_consent_events(treatment_plan_id, created_at ASC);
    `);

    // 8. Seed clinic_counters with starting values for TREATMENT_PLAN & TREATMENT_CONSENT
    await client.query(`
      INSERT INTO clinic_counters (clinic_id, counter_type, current_value, updated_at)
      SELECT c.id, 'TREATMENT_PLAN', 10000, now()
      FROM clinics c
      ON CONFLICT (clinic_id, counter_type) DO NOTHING;

      INSERT INTO clinic_counters (clinic_id, counter_type, current_value, updated_at)
      SELECT c.id, 'TREATMENT_CONSENT', 10000, now()
      FROM clinics c
      ON CONFLICT (clinic_id, counter_type) DO NOTHING;
    `);

    console.log('[Migration 019] Treatment Planning & Consent schema applied successfully.');
  },

  async down(client) {
    console.log('[Migration 019] Reverting Treatment Planning & Consent schema...');
    await client.query(`DROP TABLE IF EXISTS treatment_consent_events CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS treatment_consents CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS treatment_plan_versions CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS treatment_plan_items CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS treatment_plans CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS dental_procedures CASCADE;`);
  },
};
