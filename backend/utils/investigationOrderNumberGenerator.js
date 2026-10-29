/**
 * Concurrency-Safe Investigation Order Number Generator
 *
 * Requirements:
 * - Sequential Order Number starting at 10001 for each clinic organization
 * - Formatted as 'INV-10001', 'INV-10002', etc.
 * - Shared organization-wide sequence across all clinic branches
 * - Concurrency-safe under simultaneous transactions using atomic PostgreSQL row-level locks
 * - Allocated order numbers are permanent and audit-logged
 */

/**
 * Generates the next sequential investigation order number for a clinic within an active transaction client.
 * @param {import('pg').PoolClient} client - Active transactional PostgreSQL client
 * @param {string} clinicId - UUID of the clinic organization
 * @returns {Promise<string>} Investigation order number string (e.g. 'INV-10001')
 */
const generateInvestigationOrderNumber = async (client, clinicId) => {
  if (!clinicId) {
    throw new Error('clinicId is required to generate an investigation order number.');
  }

  // Atomically increment counter, starting from 10001
  const queryText = `
    INSERT INTO clinic_counters (clinic_id, counter_type, current_value, updated_at)
    VALUES ($1, 'INVESTIGATION_ORDER', 10001, now())
    ON CONFLICT (clinic_id, counter_type)
    DO UPDATE SET 
      current_value = GREATEST(clinic_counters.current_value, 10000) + 1,
      updated_at = now()
    RETURNING current_value;
  `;

  const result = await client.query(queryText, [clinicId]);
  const counter = result.rows[0].current_value;

  return `INV-${counter}`;
};

module.exports = {
  generateInvestigationOrderNumber,
};

