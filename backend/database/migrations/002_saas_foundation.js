/**
 * Migration 002: SaaS Foundation & Multi-Tenant Organization Management
 * Creates subscription_plans table, alters clinics table with subscription columns,
 * adds is_platform_admin to users table, and seeds default subscription tiers and superadmin role.
 */
module.exports = {
  version: '002',
  name: '002_saas_foundation',

  async up(client) {
    console.log('[Migration 002] Executing SaaS foundation schema changes...');

    // 1. Create subscription_plans table
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plan_code VARCHAR(50) UNIQUE NOT NULL,
        plan_name VARCHAR(100) NOT NULL,
        description TEXT,
        max_branches INT NOT NULL DEFAULT 1,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_subscription_plans_code ON subscription_plans(plan_code);
      CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active);
    `);

    // 2. Seed standard subscription plans (idempotent)
    await client.query(`
      INSERT INTO subscription_plans (plan_code, plan_name, description, max_branches, is_active)
      VALUES 
        ('STARTER', 'Starter Practice', 'Solo practitioner clinic with a single physical location.', 1, true),
        ('PROFESSIONAL', 'Professional Group', 'Growing multi-chair practice supporting up to 3 branch locations.', 3, true),
        ('ENTERPRISE', 'Enterprise Health Network', 'Full regional clinic network supporting up to 10 branch locations.', 10, true),
        ('UNLIMITED', 'Unlimited Corporate Chain', 'Large corporate hospital chain with unlimited branch provisioning.', 999, true)
      ON CONFLICT (plan_code) DO NOTHING;
    `);

    // 3. Alter clinics table with subscription columns
    await client.query(`
      ALTER TABLE clinics
        ADD COLUMN IF NOT EXISTS subscription_plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(30) NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ DEFAULT now(),
        ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS max_branches_override INT;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_clinics_subscription_plan_id ON clinics(subscription_plan_id);
      CREATE INDEX IF NOT EXISTS idx_clinics_subscription_status ON clinics(subscription_status);
    `);

    // 4. Assign default ENTERPRISE plan to existing clinics if they don't have a plan assigned
    await client.query(`
      UPDATE clinics
      SET subscription_plan_id = (SELECT id FROM subscription_plans WHERE plan_code = 'ENTERPRISE' LIMIT 1),
          subscription_status = 'active',
          subscription_started_at = COALESCE(subscription_started_at, now())
      WHERE subscription_plan_id IS NULL;
    `);

    // 5. Alter users table to support platform administrator flag
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_is_platform_admin ON users(is_platform_admin);
    `);

    // 6. Ensure superadmin role exists in roles table
    await client.query(`
      INSERT INTO roles (name, display_name, description)
      VALUES (
        'superadmin',
        'VoiceGate Platform Super Administrator',
        'VoiceGate platform governance, clinic organization provisioning, subscription oversight, and tenant administration'
      )
      ON CONFLICT (name) DO NOTHING;
    `);

    console.log('[Migration 002] SaaS foundation schema changes completed successfully.');
  },
};
