/**
 * Concurrency-Safe Permanent Patient ID Generator
 *
 * Requirements:
 * - Permanent Patient ID starting at 100001 for each clinic organization
 * - Digits only (no prefixes, hyphens, or letters)
 * - Shared organization-wide sequence across all clinic branches
 * - Concurrency-safe under simultaneous registrations using atomic PostgreSQL row-level locks
 * - Allocated IDs are permanent and never reused
 */

/**
 * Generates the next sequential, permanent numeric Patient ID for a clinic within an active transaction client.
 * @param {import('pg').PoolClient} client - Active transactional PostgreSQL client
 * @param {string} clinicId - UUID of the clinic organization
 * @returns {Promise<string>} Permanent numeric Patient ID (e.g. '100001')
 */
const generatePatientNumber = async (client, clinicId) => {
  if (!clinicId) {
    throw new Error('clinicId is required to generate a scoped patient number.');
  }

  // Atomically increment counter, starting from 100001
  const queryText = `
    INSERT INTO clinic_counters (clinic_id, counter_type, current_value, updated_at)
    VALUES ($1, 'PATIENT', 100001, now())
    ON CONFLICT (clinic_id, counter_type)
    DO UPDATE SET 
      current_value = GREATEST(clinic_counters.current_value, 100000) + 1,
      updated_at = now()
    RETURNING current_value;
  `;

  const result = await client.query(queryText, [clinicId]);
  const counter = result.rows[0].current_value;

  // Return digits only as a string (e.g. '100001')
  return String(counter);
};

module.exports = {
  generatePatientNumber,
};
