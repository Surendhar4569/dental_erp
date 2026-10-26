require('dotenv').config();
const app = require('./app');
const { testConnection, initializeDatabase } = require('./config/database');

const PORT = parseInt(process.env.PORT, 10) || 5000;

/**
 * Bootstrap and start the backend server
 * Enforces sequential startup:
 * 1. Verify PostgreSQL connection
 * 2. Execute idempotent schema initialization
 * 3. Start Express HTTP listener only if step 1 & 2 pass
 */
const startServer = async () => {
  try {
    // Step 1: Verify PostgreSQL connection
    await testConnection();
    console.log('Database connection successful.');

    // Step 2: Initialize database schema & seed data
    await initializeDatabase();
    console.log('Database schema initialized successfully.');

    // Step 3: Start Express server
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('\n======================================================');
    console.error('[FATAL SERVER STARTUP ERROR]');
    console.error('The server could not start due to a database initialization failure.');
    console.error('Error Details:', error.message);
    if (error.code) {
      console.error('PostgreSQL Error Code:', error.code);
    }
    console.error('Please check:');
    console.error('1. Is the PostgreSQL service running on your local machine?');
    console.error('2. Has the database "dental_clinic_erp" been created?');
    console.error('3. Are DB_USER and DB_PASSWORD correct in backend/.env?');
    console.error('======================================================\n');
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]:', err.message);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]:', reason);
  process.exit(1);
});

// Start the server
startServer();
