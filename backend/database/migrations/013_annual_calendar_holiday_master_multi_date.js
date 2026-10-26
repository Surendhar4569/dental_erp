/**
 * Migration 013: Annual Calendar, Holiday Master & Multi-Date Doctor Scheduling
 *
 * Implements:
 * 1. clinic_holidays: Centralized annual holiday calendar per clinic organization and branch
 *    with scope (clinic-wide, branch-specific, doctor-specific), categories, closure status,
 *    and uniqueness guards preventing duplicate active records in the same scope.
 * 2. doctor_date_schedules: Date-specific doctor schedules supporting multiple shifts,
 *    breaks, and special working overrides on holidays/off-days without altering
 *    recurring weekly schedules.
 * 3. doctor_date_schedule_sessions: Multiple morning/evening working sessions and break intervals
 *    per date-specific schedule.
 */

module.exports = {
  version: '013',
  name: '013_annual_calendar_holiday_master_multi_date',

  async up(client) {
    console.log('[Migration 013] Creating Holiday Master & Multi-Date Schedule tables...');

    // 1. clinic_holidays (Holiday Master)
    await client.query(`
      CREATE TABLE IF NOT EXISTS clinic_holidays (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
        doctor_id UUID REFERENCES users(id) ON DELETE CASCADE,
        holiday_date DATE NOT NULL,
        holiday_year INT NOT NULL,
        name VARCHAR(150) NOT NULL,
        category VARCHAR(50) NOT NULL CHECK (category IN ('national', 'state', 'festival', 'clinic_specific', 'optional', 'other')),
        description TEXT,
        is_closed BOOLEAN NOT NULL DEFAULT true,
        is_active BOOLEAN NOT NULL DEFAULT true,
        source VARCHAR(50) NOT NULL DEFAULT 'manual',
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uq_clinic_holiday_date_scope
      ON clinic_holidays (
        clinic_id,
        COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(doctor_id, '00000000-0000-0000-0000-000000000000'::uuid),
        holiday_date
      ) WHERE (is_active = true);

      CREATE INDEX IF NOT EXISTS idx_clinic_holidays_lookup
      ON clinic_holidays (clinic_id, holiday_year, is_active);

      CREATE INDEX IF NOT EXISTS idx_clinic_holidays_branch_date
      ON clinic_holidays (clinic_id, branch_id, holiday_date);
    `);

    // 2. doctor_date_schedules (Date-Specific Doctor Shifts & Overrides)
    await client.query(`
      CREATE TABLE IF NOT EXISTS doctor_date_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        schedule_date DATE NOT NULL,
        slot_duration_minutes INT NOT NULL DEFAULT 30 CHECK (slot_duration_minutes IN (15, 30, 45, 60)),
        buffer_minutes INT NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0),
        is_active BOOLEAN NOT NULL DEFAULT true,
        is_working_override BOOLEAN NOT NULL DEFAULT false,
        override_reason TEXT,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_doctor_branch_schedule_date UNIQUE (clinic_id, branch_id, doctor_id, schedule_date)
      );

      CREATE INDEX IF NOT EXISTS idx_doctor_date_schedules_lookup
      ON doctor_date_schedules (clinic_id, branch_id, doctor_id, schedule_date, is_active);
    `);

    // 3. doctor_date_schedule_sessions (Sessions & Breaks for Date Schedules)
    await client.query(`
      CREATE TABLE IF NOT EXISTS doctor_date_schedule_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date_schedule_id UUID NOT NULL REFERENCES doctor_date_schedules(id) ON DELETE CASCADE,
        session_name VARCHAR(50) NOT NULL DEFAULT 'Session',
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        session_order INT NOT NULL DEFAULT 1,
        is_break BOOLEAN NOT NULL DEFAULT false,
        break_reason VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_date_session_times CHECK (start_time < end_time)
      );

      CREATE INDEX IF NOT EXISTS idx_doctor_date_schedule_sessions_lookup
      ON doctor_date_schedule_sessions (date_schedule_id, is_break);
    `);

    console.log('[Migration 013] Holiday Master & Multi-Date Schedule tables created successfully.');
  },
};
