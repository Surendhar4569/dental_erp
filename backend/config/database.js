const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Create PostgreSQL connection pool using environment variables
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'dental_clinic_erp',
  user: process.env.DB_USER || 'postgres',
  password: String(process.env.DB_PASSWORD || ''),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Pool error handling to prevent process crash on idle client errors
pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error]: Unexpected idle client error:', err.message);
});

/**
 * Reusable query function using parameterized SQL
 * @param {string} text - SQL statement with placeholders ($1, $2, etc.)
 * @param {Array} params - Array of parameter values
 */
const query = async (text, params = []) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development' && duration > 100) {
      console.log(`[SQL Slow Query] (${duration}ms):`, text.slice(0, 80));
    }
    return result;
  } catch (error) {
    console.error('[SQL Error]:', error.message);
    throw error;
  }
};

/**
 * Test the database connection
 * Returns database status and current server timestamp
 */
const testConnection = async () => {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT NOW() AS server_time, current_database() AS db_name;');
    return {
      connected: true,
      database: res.rows[0].db_name,
      serverTime: res.rows[0].server_time,
    };
  } finally {
    client.release();
  }
};

const { runMigrations } = require('../database/migrationRunner');

/**
 * Initialize database schema idempotently
 * 1. Reads backend/database/schema.sql and runs it
 * 2. Executes versioned migrations from backend/database/migrations
 */
const initializeDatabase = async () => {
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at path: ${schemaPath}`);
  }

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Database Initialization Failed]:', error.message);
    throw error;
  } finally {
    client.release();
  }

  // Step 2: Run versioned migrations safely
  try {
    const applied = await runMigrations(pool);
    if (applied.length > 0) {
      console.log(`[Database Migrations] Applied ${applied.length} migration(s):`, applied.join(', '));
    } else {
      console.log('[Database Migrations] All migrations are already up to date.');
    }
    return true;
  } catch (migrationError) {
    console.error('[Database Migration Step Failed]:', migrationError.message);
    throw migrationError;
  }
};

module.exports = {
  pool,
  query,
  testConnection,
  initializeDatabase,
};
