/**
 * Concurrency-Safe Staff Number Generator
 *
 * Requirements:
 * - Sequential Staff Number starting at STF-10001 for each clinic organization
 * - Concurrency-safe under simultaneous creation using PostgreSQL row-level locks
 * - Allocated staff numbers are permanent and unique per clinic organization
 */

/**
 * Generates the next sequential staff number for a clinic within an active transactional client or pool.
 * @param {import('pg').PoolClient | import('pg').Pool} client - PostgreSQL client or pool
 * @param {string} clinicId - UUID of the clinic organization
 * @returns {Promise<string>} Staff number string (e.g. 'STF-10001')
 */
const generateStaffNumber = async (client, clinicId) => {
  if (!clinicId) {
    throw new Error('clinicId is required to generate a staff number.');
  }

  const queryText = `
    INSERT INTO clinic_counters (clinic_id, counter_type, current_value, updated_at)
    VALUES ($1, 'STAFF', 10001, now())
    ON CONFLICT (clinic_id, counter_type)
    DO UPDATE SET 
      current_value = GREATEST(clinic_counters.current_value, 10000) + 1,
      updated_at = now()
    RETURNING current_value;
  `;

  const result = await client.query(queryText, [clinicId]);
  const counter = result.rows[0].current_value;

  return `STF-${counter}`;
};

module.exports = {
  generateStaffNumber,
};
