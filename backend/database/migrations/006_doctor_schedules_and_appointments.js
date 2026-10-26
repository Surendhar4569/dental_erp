/**
 * Migration 006: Doctor Schedules, Sessions, Exceptions, and Appointments
 *
 * Implements:
 * 1. doctor_schedules: Recurring weekly working configurations per doctor and branch
 * 2. doctor_schedule_sessions: Multiple sessions (morning/evening) and break intervals per schedule
 * 3. doctor_schedule_exceptions: Date-specific leaves, holidays, blocked ranges, and custom hours
 * 4. doctor_branch_fees: Configurable consultation fees per doctor, branch, and consultation type
 * 5. appointments: Master appointment records with immutable appointment number, lifecycle status, and fee snapshot
 * 6. uq_doctor_active_slot: Partial unique index preventing double-booking active slots
 * 7. appointment_status_history: Auditable state machine transitions
 * 8. Alter patient_visits to add optional appointment_id link
 */

module.exports = {
  version: '006',
  name: '006_doctor_schedules_and_appointments',

  async up(client) {
    console.log('[Migration 006] Executing Doctor Schedules & Appointments schema changes...');

    // 1. doctor_schedules
    await client.query(`
      CREATE TABLE IF NOT EXISTS doctor_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        default_duration_minutes INT NOT NULL DEFAULT 30 CHECK (default_duration_minutes > 0),
        slot_interval_minutes INT NOT NULL DEFAULT 15 CHECK (slot_interval_minutes > 0),
        buffer_before_minutes INT NOT NULL DEFAULT 0 CHECK (buffer_before_minutes >= 0),
        buffer_after_minutes INT NOT NULL DEFAULT 0 CHECK (buffer_after_minutes >= 0),
        is_active BOOLEAN NOT NULL DEFAULT true,
        effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
        effective_to DATE,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_doctor_branch_day UNIQUE (clinic_id, branch_id, doctor_id, day_of_week, effective_from)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doctor_schedules_lookup 
        ON doctor_schedules(clinic_id, branch_id, doctor_id, day_of_week, is_active);
    `);

    // 2. doctor_schedule_sessions
    await client.query(`
      CREATE TABLE IF NOT EXISTS doctor_schedule_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        schedule_id UUID NOT NULL REFERENCES doctor_schedules(id) ON DELETE CASCADE,
        session_name VARCHAR(50) NOT NULL DEFAULT 'Regular',
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        is_break BOOLEAN NOT NULL DEFAULT false,
        break_reason VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_session_times CHECK (start_time < end_time)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doctor_schedule_sessions_sched 
        ON doctor_schedule_sessions(schedule_id, is_break);
    `);

    // 3. doctor_schedule_exceptions
    await client.query(`
      CREATE TABLE IF NOT EXISTS doctor_schedule_exceptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        exception_date DATE NOT NULL,
        exception_type VARCHAR(30) NOT NULL CHECK (exception_type IN ('leave', 'holiday', 'blocked', 'custom_hours')),
        start_time TIME,
        end_time TIME,
        reason TEXT NOT NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doctor_schedule_exceptions_lookup 
        ON doctor_schedule_exceptions(clinic_id, branch_id, doctor_id, exception_date);
    `);

    // 4. doctor_branch_fees
    await client.query(`
      CREATE TABLE IF NOT EXISTS doctor_branch_fees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        consultation_type VARCHAR(50) NOT NULL DEFAULT 'consultation',
        fee_amount NUMERIC(10,2) NOT NULL DEFAULT 500.00 CHECK (fee_amount >= 0),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_doctor_branch_fee_type UNIQUE (clinic_id, branch_id, doctor_id, consultation_type)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doctor_branch_fees_lookup 
        ON doctor_branch_fees(clinic_id, branch_id, doctor_id, consultation_type);
    `);

    // 5. appointments
    await client.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        appointment_number VARCHAR(50) NOT NULL,
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        appointment_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        duration_minutes INT NOT NULL DEFAULT 30,
        appointment_type VARCHAR(50) NOT NULL DEFAULT 'consultation',
        status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
        booking_channel VARCHAR(30) NOT NULL DEFAULT 'reception',
        visit_id UUID REFERENCES patient_visits(id) ON DELETE SET NULL,
        reason TEXT,
        notes TEXT,
        cancellation_reason TEXT,
        rescheduled_from_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
        fee_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        final_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_clinic_appointment_number UNIQUE (clinic_id, appointment_number),
        CONSTRAINT chk_appointment_times CHECK (start_time < end_time),
        CONSTRAINT chk_appointment_status CHECK (status IN ('scheduled', 'confirmed', 'checked_in', 'in_consultation', 'completed', 'cancelled', 'no_show')),
        CONSTRAINT chk_appointment_channel CHECK (booking_channel IN ('reception', 'walk_in', 'website', 'portal', 'phone')),
        CONSTRAINT chk_appointment_payment_status CHECK (payment_status IN ('pending', 'partial', 'paid', 'refunded'))
      );
    `);

    // Partial unique index preventing double-booking active slots concurrently
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_doctor_active_slot 
        ON appointments (clinic_id, branch_id, doctor_id, appointment_date, start_time) 
        WHERE status NOT IN ('cancelled');
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_appointments_lookup 
        ON appointments(clinic_id, branch_id, appointment_date, status);
      CREATE INDEX IF NOT EXISTS idx_appointments_patient 
        ON appointments(patient_id, appointment_date DESC);
      CREATE INDEX IF NOT EXISTS idx_appointments_doctor 
        ON appointments(doctor_id, appointment_date DESC);
    `);

    // 6. appointment_status_history
    await client.query(`
      CREATE TABLE IF NOT EXISTS appointment_status_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
        from_status VARCHAR(30),
        to_status VARCHAR(30) NOT NULL,
        reason TEXT,
        changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_appointment_status_history_appt 
        ON appointment_status_history(appointment_id, created_at ASC);
    `);

    // 7. Add appointment_id column to patient_visits
    await client.query(`
      ALTER TABLE patient_visits 
        ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_patient_visits_appointment_id 
        ON patient_visits(appointment_id);
    `);

    console.log('[Migration 006] Successfully applied Doctor Schedules and Appointments schema changes.');
  },
};
