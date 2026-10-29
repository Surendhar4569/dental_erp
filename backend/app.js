const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const branchRoutes = require('./routes/branchRoutes');
const platformRoutes = require('./routes/platformRoutes');
const patientRoutes = require('./routes/patientRoutes');
const visitRoutes = require('./routes/visitRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const staffRoutes = require('./routes/staffRoutes');
const holidayRoutes = require('./routes/holidayRoutes');
const clinicalRoutes = require('./routes/clinicalRoutes');
const investigationRoutes = require('./routes/investigationRoutes');
const errorHandler = require('./middleware/errorHandler');

const helmet = require('helmet');
const { validateEnvironment } = require('./config/envValidation');
const { generalApiLimiter } = require('./middleware/rateLimiter');

// Validate critical security environment variables on initialization
validateEnvironment();

const app = express();

// Trust reverse proxy if running behind one (e.g. Nginx, Cloudflare, AWS ALB)
if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// Security: HTTP Security Headers via Helmet
// Content-Security-Policy is disabled on the JSON REST API to prevent CORS/fetch interference with SPA clients;
// Cross-Origin-Resource-Policy is set to 'cross-origin' to permit frontend asset consumption.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Middleware: Enable CORS for frontend requests
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(
  cors({
    origin: [frontendUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Branch-ID', 'x-branch-id'],
  })
);

// Middleware: Parse incoming JSON payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware: HTTP request logger
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Global API rate limiting to mitigate abusive traffic
app.use('/api', generalApiLimiter);

// API Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/platform', platformRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/clinical', clinicalRoutes);
app.use('/api/investigations', investigationRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Dental Clinic ERP API Server',
    version: '1.0.0',
    documentation: '/api/health for system status',
  });
});

// 404 Route Handler for undefined endpoints
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global Centralized Error Handler
app.use(errorHandler);

module.exports = app;
