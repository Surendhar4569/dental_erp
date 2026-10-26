/**
 * Migration 015: Optional dental chair assignment on doctor_date_schedules
 */

module.exports = {
  name: '015_add_chair_to_doctor_date_schedules',
  up: async (client) => {
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'doctor_date_schedules' AND column_name = 'chair_id'
        ) THEN
          ALTER TABLE doctor_date_schedules 
          ADD COLUMN chair_id UUID REFERENCES dental_chairs(id) ON DELETE SET NULL;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_doctor_date_schedules_chair 
      ON doctor_date_schedules (clinic_id, branch_id, chair_id, schedule_date) 
      WHERE chair_id IS NOT NULL;
    `);
    console.log('[Migration 015] Added optional chair_id to doctor_date_schedules.');
  },
};
