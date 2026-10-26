/**
 * Migration 017: Pre-Consultation Vitals & Triage
 *
 * Implements:
 * 1. patient_visit_vitals: Pre-consultation vitals and triage assessment captured by
 *    authorized dental assistants, nurses, or clinicians prior to dentist consultation.
 * 2. Links directly to authoritative patient_visits encounter.
 * 3. Captures blood pressure, pulse, temperature, SpO2, respiratory rate, height/weight/BMI,
 *    triage priority (routine/priority/urgent), triage notes, recorded_by, and recorded_at timestamp.
 */

module.exports = {
  version: '017',
  name: '017_pre_consultation_vitals_and_triage',

  async up(client) {
    console.log('[Migration 017] Creating Pre-Consultation Vitals & Triage tables...');

    // 1. Create patient_visit_vitals table
    await client.query(`
      CREATE TABLE IF NOT EXISTS patient_visit_vitals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        visit_id UUID NOT NULL REFERENCES patient_visits(id) ON DELETE RESTRICT,
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
        blood_pressure VARCHAR(20),
        pulse_bpm INTEGER,
        temperature_f NUMERIC(4, 1),
        spo2_percent INTEGER,
        respiratory_rate INTEGER,
        weight_kg NUMERIC(5, 2),
        height_cm NUMERIC(5, 2),
        bmi NUMERIC(4, 1),
        triage_priority VARCHAR(20) NOT NULL DEFAULT 'routine' CHECK (triage_priority IN ('routine', 'priority', 'urgent')),
        triage_notes TEXT,
        recorded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 2. High-performance lookup indexes with strict tenant & branch scoping
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_patient_visit_vitals_visit 
        ON patient_visit_vitals(clinic_id, branch_id, visit_id);
      CREATE INDEX IF NOT EXISTS idx_patient_visit_vitals_patient 
        ON patient_visit_vitals(clinic_id, patient_id, recorded_at DESC);
      CREATE INDEX IF NOT EXISTS idx_patient_visit_vitals_recorded_by 
        ON patient_visit_vitals(recorded_by);
    `);

    console.log('[Migration 017] Pre-Consultation Vitals & Triage table created successfully.');
  },

  async down(client) {
    console.log('[Migration 017] Reverting Pre-Consultation Vitals & Triage table...');
    await client.query(`DROP TABLE IF EXISTS patient_visit_vitals CASCADE;`);
  },
};
