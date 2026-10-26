/**
 * Migration 009: Add session_order to doctor_schedule_sessions, notes to appointment_status_history, and extend payment_method
 */

module.exports = {
  version: '009',
  name: '009_align_sessions_and_history',

  async up(client) {
    console.log('[Migration 009] Adding session_order, notes, and extending payment_method...');

    await client.query(`
      ALTER TABLE doctor_schedule_sessions
        ADD COLUMN IF NOT EXISTS session_order INT DEFAULT 1;
    `);

    await client.query(`
      ALTER TABLE appointment_status_history
        ADD COLUMN IF NOT EXISTS notes TEXT;
    `);

    await client.query(`
      ALTER TABLE appointment_payments 
        DROP CONSTRAINT IF EXISTS appointment_payments_payment_method_check;
      ALTER TABLE appointment_payments 
        ADD CONSTRAINT appointment_payments_payment_method_check 
        CHECK (payment_method IN ('cash', 'upi', 'card', 'bank_transfer', 'insurance', 'other'));
    `);

    console.log('[Migration 009] Columns and constraints updated successfully.');
  },
};
