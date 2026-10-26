/**
 * Concurrency-Safe Appointment Number Generator
 *
 * Requirements:
 * - Sequential Appointment Number starting at 10001 for each clinic organization
 * - Formatted as 'APT-10001', 'APT-10002', etc.
 * - Shared organization-wide sequence across all clinic branches
 * - Concurrency-safe under simultaneous bookings using atomic PostgreSQL row-level locks
 * - Allocated appointment numbers are permanent and never reused
 */

/**
 * Generates the next sequential appointment number for a clinic within an active transaction client.
 * @param {import('pg').PoolClient} client - Active transactional PostgreSQL client
 * @param {string} clinicId - UUID of the clinic organization
 * @returns {Promise<string>} Appointment number string (e.g. 'APT-10001')
 */
const generateAppointmentNumber = async (client, clinicId) => {
  if (!clinicId) {
    throw new Error('clinicId is required to generate an appointment number.');
  }

  // Atomically increment counter, starting from 10001
  const queryText = `
    INSERT INTO clinic_counters (clinic_id, counter_type, current_value, updated_at)
    VALUES ($1, 'APPOINTMENT', 10001, now())
    ON CONFLICT (clinic_id, counter_type)
    DO UPDATE SET 
      current_value = GREATEST(clinic_counters.current_value, 10000) + 1,
      updated_at = now()
    RETURNING current_value;
  `;

  const result = await client.query(queryText, [clinicId]);
  const counter = result.rows[0].current_value;

  return `APT-${counter}`;
};

module.exports = {
  generateAppointmentNumber,
};
