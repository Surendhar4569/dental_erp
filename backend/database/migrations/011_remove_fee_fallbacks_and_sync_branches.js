/**
 * Migration 011: Remove Hardcoded Fee Defaults and Synchronize Branch Assignments
 *
 * Implements:
 * 1. doctor_branch_fees: Drops DEFAULT 500.00 / 300.00 / 800.00 constraints to prevent silent fallback
 * 2. Synchronizes any discrepancies between staff_branches and user_branches
 */

module.exports = {
  version: '011',
  name: '011_remove_fee_fallbacks_and_sync_branches',

  async up(client) {
    console.log('[Migration 011] Executing fee defaults removal and branch sync...');

    // 1. Remove database-level defaults on doctor_branch_fees
    await client.query(`
      ALTER TABLE doctor_branch_fees
        ALTER COLUMN consultation_fee DROP DEFAULT,
        ALTER COLUMN followup_fee DROP DEFAULT,
        ALTER COLUMN emergency_fee DROP DEFAULT;
    `);

    // Also drop default and not-null constraint on legacy fee_amount column if present
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'doctor_branch_fees' AND column_name = 'fee_amount'
        ) THEN
          ALTER TABLE doctor_branch_fees ALTER COLUMN fee_amount DROP DEFAULT;
          ALTER TABLE doctor_branch_fees ALTER COLUMN fee_amount DROP NOT NULL;
        END IF;
      END $$;
    `);

    // 2. Synchronize user_branches to staff_branches
    await client.query(`
      INSERT INTO staff_branches (staff_id, branch_id, is_default, assigned_at)
      SELECT s.id, ub.branch_id, ub.is_default, ub.assigned_at
      FROM users u
      JOIN staff s ON s.user_id = u.id
      JOIN user_branches ub ON ub.user_id = u.id
      ON CONFLICT (staff_id, branch_id) DO NOTHING;
    `);

    // 3. Synchronize staff_branches to user_branches
    await client.query(`
      INSERT INTO user_branches (user_id, branch_id, is_default, assigned_at)
      SELECT s.user_id, sb.branch_id, sb.is_default, sb.assigned_at
      FROM staff s
      JOIN staff_branches sb ON sb.staff_id = s.id
      WHERE s.user_id IS NOT NULL
      ON CONFLICT (user_id, branch_id) DO NOTHING;
    `);

    console.log('[Migration 011] Successfully removed hardcoded fee defaults and synchronized branch assignments.');
  },
};
