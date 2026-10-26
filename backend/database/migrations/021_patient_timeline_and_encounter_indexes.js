/**
 * Migration 021: Patient History Timeline & Encounter Indexes
 *
 * Adds composite chronological indexes across patient-linked clinical, administrative,
 * and financial tables to accelerate the unified patient history timeline and visit-wise
 * record viewer queries.
 */

module.exports = {
  version: '021',
  name: '021_patient_timeline_and_encounter_indexes',

  async up(client) {
    console.log('[Migration 021] Adding composite indexes for Patient Timeline & History aggregation...');

    // 1. Patient visits timeline index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_patient_visits_patient_date 
      ON patient_visits (patient_id, visit_date DESC, created_at DESC);
    `);

    // 2. Appointments timeline index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_appointments_patient_date 
      ON appointments (patient_id, appointment_date DESC, start_time DESC);
    `);

    // 3. Clinical examinations timeline index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_clinical_examinations_patient_created 
      ON clinical_examinations (patient_id, created_at DESC);
    `);

    // 4. Pre-consultation vitals timeline index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_patient_visit_vitals_patient_recorded 
      ON patient_visit_vitals (patient_id, recorded_at DESC, created_at DESC);
    `);

    // 5. Patient dental findings timeline index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_patient_dental_findings_patient_created 
      ON patient_dental_findings (patient_id, created_at DESC);
    `);

    // 6. Treatment plans timeline index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_treatment_plans_patient_created 
      ON treatment_plans (patient_id, created_at DESC);
    `);

    // 7. Treatment consents timeline index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_treatment_consents_patient_created 
      ON treatment_consents (patient_id, created_at DESC);
    `);

    // 8. Prescriptions timeline index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_created 
      ON prescriptions (patient_id, prescription_date DESC, created_at DESC);
    `);

    // 9. Appointment payments timeline index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_appointment_payments_patient_created 
      ON appointment_payments (patient_id, created_at DESC);
    `);

    console.log('[Migration 021] Timeline & Encounter indexes created successfully.');
  },

  async down(client) {
    console.log('[Migration 021] Dropping timeline indexes...');
    await client.query('DROP INDEX IF EXISTS idx_patient_visits_patient_date;');
    await client.query('DROP INDEX IF EXISTS idx_appointments_patient_date;');
    await client.query('DROP INDEX IF EXISTS idx_clinical_examinations_patient_created;');
    await client.query('DROP INDEX IF EXISTS idx_patient_visit_vitals_patient_recorded;');
    await client.query('DROP INDEX IF EXISTS idx_patient_dental_findings_patient_created;');
    await client.query('DROP INDEX IF EXISTS idx_treatment_plans_patient_created;');
    await client.query('DROP INDEX IF EXISTS idx_treatment_consents_patient_created;');
    await client.query('DROP INDEX IF EXISTS idx_prescriptions_patient_created;');
    await client.query('DROP INDEX IF EXISTS idx_appointment_payments_patient_created;');
  },
};
