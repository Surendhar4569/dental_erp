/**
 * Migration 020: Prescription & Medication Management
 *
 * Implements:
 * 1. prescriptions: Visit- and patient-anchored prescription header records with
 *    human-readable numbering (RX-10001+), versioning, status lifecycle (draft, signed, cancelled, amended),
 *    clinical indication, instructions, doctor digital sign-off, cancellation reason,
 *    and optional link to treatment plans.
 * 2. prescription_items: Multiple medication entries supporting free-text medicine names,
 *    dosage, form, route, frequency, duration, quantity, unit, food/timing directions,
 *    PRN flags, refills, and safety instructions without requiring a pharmacy inventory catalog.
 * 3. prescription_amendments: Append-only legal amendment trail capturing full immutable snapshots
 *    when a signed prescription is corrected, amended, or superseded.
 * 4. Seeds clinic_counters with counter_type = 'PRESCRIPTION' starting at 10001.
 */

module.exports = {
  version: '020',
  name: '020_prescription_and_medication_management',

  async up(client) {
    console.log('[Migration 020] Creating Prescription & Medication Management schema...');

    // 1. prescriptions: Main Prescription Header Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS prescriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        visit_id UUID REFERENCES patient_visits(id) ON DELETE SET NULL,
        examination_id UUID REFERENCES clinical_examinations(id) ON DELETE SET NULL,
        treatment_plan_id UUID REFERENCES treatment_plans(id) ON DELETE SET NULL,
        treatment_plan_item_id UUID REFERENCES treatment_plan_items(id) ON DELETE SET NULL,
        prescription_number VARCHAR(50) NOT NULL,
        prescription_date DATE NOT NULL DEFAULT CURRENT_DATE,
        prescribing_doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        status VARCHAR(30) NOT NULL DEFAULT 'draft' 
          CHECK (status IN ('draft', 'signed', 'cancelled', 'amended')),
        diagnosis TEXT,
        general_instructions TEXT,
        dietary_advice TEXT,
        signed_at TIMESTAMPTZ,
        signed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        cancellation_reason TEXT,
        cancelled_at TIMESTAMPTZ,
        cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
        is_amended BOOLEAN NOT NULL DEFAULT false,
        amended_from_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
        amendment_reason TEXT,
        version INT NOT NULL DEFAULT 1,
        allergy_acknowledgement JSONB,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_clinic_prescription_number UNIQUE (clinic_id, prescription_number)
      );

      CREATE INDEX IF NOT EXISTS idx_prescriptions_clinic_patient 
        ON prescriptions(clinic_id, patient_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_prescriptions_branch_status 
        ON prescriptions(clinic_id, branch_id, status);
      CREATE INDEX IF NOT EXISTS idx_prescriptions_visit 
        ON prescriptions(visit_id);
      CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor 
        ON prescriptions(prescribing_doctor_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_prescriptions_treatment_plan 
        ON prescriptions(treatment_plan_id);
    `);

    // 2. prescription_items: Medication Entries
    await client.query(`
      CREATE TABLE IF NOT EXISTS prescription_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        medicine_name VARCHAR(200) NOT NULL,
        generic_name VARCHAR(200),
        brand_name VARCHAR(200),
        dosage VARCHAR(100) NOT NULL,
        dosage_form VARCHAR(50) NOT NULL DEFAULT 'tablet' 
          CHECK (dosage_form IN ('tablet', 'capsule', 'syrup', 'suspension', 'liquid', 'mouthwash', 'gel', 'ointment', 'paste', 'drops', 'injection', 'inhaler', 'other')),
        route VARCHAR(50) NOT NULL DEFAULT 'oral' 
          CHECK (route IN ('oral', 'topical', 'sublingual', 'buccal', 'inhalation', 'dental_rinse', 'gingival_application', 'intramuscular', 'intravenous', 'subcutaneous', 'other')),
        frequency VARCHAR(100) NOT NULL,
        duration VARCHAR(50) NOT NULL,
        quantity INT NOT NULL DEFAULT 1 CHECK (quantity >= 1),
        quantity_unit VARCHAR(50) NOT NULL DEFAULT 'tablets',
        instructions TEXT,
        is_prn BOOLEAN NOT NULL DEFAULT false,
        prn_indication VARCHAR(200),
        start_date DATE,
        end_date DATE,
        refills_allowed INT NOT NULL DEFAULT 0 CHECK (refills_allowed >= 0),
        additional_notes TEXT,
        item_order INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_prescription_items_prescription 
        ON prescription_items(prescription_id, item_order);
      CREATE INDEX IF NOT EXISTS idx_prescription_items_clinic_patient 
        ON prescription_items(clinic_id, patient_id);
    `);

    // 3. prescription_amendments: Append-only History Trail for Signed Prescriptions
    await client.query(`
      CREATE TABLE IF NOT EXISTS prescription_amendments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        amendment_reason TEXT NOT NULL,
        previous_status VARCHAR(30) NOT NULL,
        snapshot_data JSONB NOT NULL,
        amended_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        amended_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_prescription_amendments_lookup 
        ON prescription_amendments(prescription_id, amended_at DESC);
    `);

    // 4. Seed clinic_counters with starting values for PRESCRIPTION (RX-10001+)
    await client.query(`
      INSERT INTO clinic_counters (clinic_id, counter_type, current_value, updated_at)
      SELECT id, 'PRESCRIPTION', 10001, now()
      FROM clinics
      ON CONFLICT (clinic_id, counter_type) DO NOTHING;
    `);

    console.log('[Migration 020] Prescription & Medication Management schema applied successfully.');
  },
};
