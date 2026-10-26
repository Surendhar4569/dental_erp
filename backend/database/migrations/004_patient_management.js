/**
 * Migration 004: Patient Management & Clinical Medical Profiles
 * Creates:
 * 1. clinic_counters — Concurrency-safe atomic counter for clinic-scoped patient numbers.
 * 2. patients — Master patient demographic records with clinic tenant isolation and branch registration.
 * 3. patient_medical_records — Separated medical history, allergies, medications, and clinical alert flags.
 */
module.exports = {
  version: '004',
  name: '004_patient_management',

  async up(client) {
    console.log('[Migration 004] Executing Patient Management schema changes...');

    // 1. Clinic sequence/counter table for safe concurrency
    await client.query(`
      CREATE TABLE IF NOT EXISTS clinic_counters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        counter_type VARCHAR(50) NOT NULL,
        current_value BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_clinic_counter UNIQUE (clinic_id, counter_type)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_clinic_counters_lookup ON clinic_counters(clinic_id, counter_type);
    `);

    // 2. Patient Master table
    await client.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        patient_number VARCHAR(50) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100),
        date_of_birth DATE,
        gender VARCHAR(20) NOT NULL DEFAULT 'unspecified',
        phone VARCHAR(30) NOT NULL,
        email VARCHAR(254),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        postal_code VARCHAR(20),
        emergency_contact_name VARCHAR(100),
        emergency_contact_phone VARCHAR(30),
        emergency_contact_relation VARCHAR(50),
        registration_date DATE NOT NULL DEFAULT CURRENT_DATE,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_clinic_patient_number UNIQUE (clinic_id, patient_number),
        CONSTRAINT chk_patient_gender CHECK (gender IN ('male', 'female', 'other', 'unspecified')),
        CONSTRAINT chk_patient_status CHECK (status IN ('active', 'inactive', 'archived'))
      );
    `);

    // Indexes for high-performance patient search and filtering
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_patients_clinic_id ON patients(clinic_id);
      CREATE INDEX IF NOT EXISTS idx_patients_branch_id ON patients(branch_id);
      CREATE INDEX IF NOT EXISTS idx_patients_patient_number ON patients(clinic_id, patient_number);
      CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(clinic_id, phone);
      CREATE INDEX IF NOT EXISTS idx_patients_names ON patients(clinic_id, first_name, last_name);
      CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(clinic_id, status);
      CREATE INDEX IF NOT EXISTS idx_patients_reg_date ON patients(clinic_id, registration_date DESC);
    `);

    // 3. Patient Medical Records (Separated for clinical governance and privacy)
    await client.query(`
      CREATE TABLE IF NOT EXISTS patient_medical_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE UNIQUE,
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        allergies TEXT,
        medical_conditions TEXT,
        current_medications TEXT,
        medical_history TEXT,
        dental_treatment_notes TEXT,
        has_medical_alerts BOOLEAN NOT NULL DEFAULT false,
        medical_alert_details VARCHAR(255),
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_patient_medical_patient ON patient_medical_records(patient_id);
      CREATE INDEX IF NOT EXISTS idx_patient_medical_clinic ON patient_medical_records(clinic_id);
      CREATE INDEX IF NOT EXISTS idx_patient_medical_alerts ON patient_medical_records(clinic_id, has_medical_alerts);
    `);

    console.log('[Migration 004] Patient Management schema migration applied successfully.');
  },
};
