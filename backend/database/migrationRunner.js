const fs = require('fs');
const path = require('path');

/**
 * Migration Runner for PostgreSQL
 * Ensures versioned, repeatable, and transactional database migrations.
 * Records applied migrations in schema_migrations table to prevent duplicate execution.
 */
const runMigrations = async (pool) => {
  const client = await pool.connect();

  try {
    // 1. Ensure schema_migrations registry table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 2. Discover all migration files in migrations directory
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      return [];
    }

    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.js'))
      .sort();

    const appliedMigrations = [];

    for (const file of migrationFiles) {
      const migrationPath = path.join(migrationsDir, file);
      const migration = require(migrationPath);
      const migrationName = migration.name || file.replace(/\.js$/, '');

      // Check if this migration has already been executed
      const checkRes = await client.query(
        'SELECT id, name, applied_at FROM schema_migrations WHERE name = $1',
        [migrationName]
      );

      if (checkRes.rows.length === 0) {
        console.log(`[Migration Runner] Applying migration: ${migrationName}...`);
        
        try {
          await client.query('BEGIN');
          await migration.up(client);
          await client.query(
            'INSERT INTO schema_migrations (name) VALUES ($1)',
            [migrationName]
          );
          await client.query('COMMIT');
          console.log(`[Migration Runner] Successfully applied: ${migrationName}`);
          appliedMigrations.push(migrationName);
        } catch (migrationError) {
          await client.query('ROLLBACK');
          console.error(`[Migration Runner] Migration failed: ${migrationName}`, migrationError);
          throw new Error(`Database migration failed at "${migrationName}": ${migrationError.message}`);
        }
      }
    }

    return appliedMigrations;
  } finally {
    client.release();
  }
};

module.exports = {
  runMigrations,
};
