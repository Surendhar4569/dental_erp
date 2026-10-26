const { testConnection } = require('../config/database');

/**
 * Health check handler
 * GET /api/health
 */
const getHealthStatus = async (req, res) => {
  try {
    const dbStatus = await testConnection();

    res.status(200).json({
      success: true,
      service: 'Dental Clinic ERP API',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: 'connected',
        name: dbStatus.database,
        timestamp: dbStatus.serverTime,
      },
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      service: 'Dental Clinic ERP API',
      status: 'degraded',
      timestamp: new Date().toISOString(),
      database: {
        status: 'disconnected',
        error: error.message,
      },
    });
  }
};

module.exports = {
  getHealthStatus,
};
