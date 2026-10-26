/**
 * Migration 014: Future-Ready Public Booking Architecture
 *
 * Implements:
 * 1. booking_reference: Unguessable, secure, unique reference token per appointment (BK-XXXX-XXXX-XXXX)
 *    enabling safe confirmation retrieval without enumerating sequential appointment numbers.
 * 2. booking_source: Distinguishes 'reception', 'walk_in', 'online_website', 'online_portal'.
 * 3. booking_metadata: Extensible JSONB payload for future online booking telemetry (client IP hash, user agent, referral tags).
 * 4. uq_doctor_clinic_active_slot: Clinic-wide partial unique index preventing concurrent double-booking
 *    of the same doctor across ANY branch in the clinic organization.
 */

module.exports = {
  version: '014',
  name: '014_future_public_booking_architecture',

  async up(client) {
    console.log('[Migration 014] Applying Future-Ready Public Booking Architecture schema enhancements...');

    // 1. Add booking_reference column to appointments
    await client.query(`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS booking_reference VARCHAR(64);
    `);

    // Deterministically backfill existing appointments with BK- + uppercase hex
    await client.query(`
      UPDATE appointments
      SET booking_reference = CONCAT(
        'BK-',
        UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 4)), '-',
        UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 5, 4)), '-',
        UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 9, 4))
      )
      WHERE booking_reference IS NULL;
    `);

    // Enforce DEFAULT, NOT NULL, and create UNIQUE INDEX on booking_reference
    await client.query(`
      ALTER TABLE appointments ALTER COLUMN booking_reference SET DEFAULT CONCAT(
        'BK-',
        UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 4)), '-',
        UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 5, 4)), '-',
        UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 9, 4))
      );
      ALTER TABLE appointments ALTER COLUMN booking_reference SET NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_booking_reference 
        ON appointments(booking_reference);
    `);

    // 2. Add booking_source & booking_metadata
    await client.query(`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS booking_source VARCHAR(30) NOT NULL DEFAULT 'reception',
        ADD COLUMN IF NOT EXISTS booking_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);

    // 3. Clinic-wide partial unique index preventing cross-branch simultaneous doctor double-booking
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_doctor_clinic_active_slot
        ON appointments (clinic_id, doctor_id, appointment_date, start_time)
        WHERE status NOT IN ('cancelled');
    `);

    console.log('[Migration 014] Successfully applied Future-Ready Public Booking Architecture schema enhancements.');
  },
};
