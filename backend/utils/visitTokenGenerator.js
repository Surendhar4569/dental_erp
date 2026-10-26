/**
 * Concurrency-Safe Daily Branch Visit Token Generator
 *
 * Rules:
 * - Scoped per (clinic_id, branch_id, visit_date)
 * - First token of each clinic-local day is '001'
 * - Independent daily sequences for each branch location
 * - Automatically restarts on new calendar date without cron jobs or manual resets
 * - Timezone-aware date calculation from clinic/branch configuration
 * - Atomic PostgreSQL row-level locks prevent duplicate token issuance under concurrent requests
 * - Tokens are permanent encounter records and never reused, even if a visit is cancelled
 */

/**
 * Calculates current calendar date (YYYY-MM-DD) formatted according to the clinic's configured timezone.
 * @param {string} timezone - e.g. 'Asia/Kolkata'
 * @returns {string} ISO Date string 'YYYY-MM-DD'
 */
const getClinicLocalDate = (timezone = 'Asia/Kolkata') => {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
};

/**
 * Generates the next atomic, sequential visit token for a branch on a given date.
 * @param {import('pg').PoolClient} client - Active PostgreSQL client or transaction
 * @param {string} clinicId - UUID of clinic organization
 * @param {string} branchId - UUID of physical branch location
 * @param {string} visitDate - Calendar date 'YYYY-MM-DD'
 * @returns {Promise<{ tokenNumber: number, tokenDisplay: string, visitDate: string }>}
 */
const generateVisitToken = async (client, clinicId, branchId, visitDate) => {
  if (!clinicId || !branchId || !visitDate) {
    throw new Error('clinicId, branchId, and visitDate are required to generate a daily visit token.');
  }

  const queryText = `
    INSERT INTO daily_visit_counters (clinic_id, branch_id, visit_date, current_token, updated_at)
    VALUES ($1, $2, $3, 1, now())
    ON CONFLICT (clinic_id, branch_id, visit_date)
    DO UPDATE SET 
      current_token = daily_visit_counters.current_token + 1,
      updated_at = now()
    RETURNING current_token;
  `;

  const result = await client.query(queryText, [clinicId, branchId, visitDate]);
  const tokenNumber = parseInt(result.rows[0].current_token, 10);
  const tokenDisplay = String(tokenNumber).padStart(3, '0');

  return {
    tokenNumber,
    tokenDisplay,
    visitDate,
  };
};

module.exports = {
  getClinicLocalDate,
  generateVisitToken,
};
