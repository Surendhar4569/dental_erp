const rateLimit = require('express-rate-limit');

/**
 * Standard JSON response handler for rate limiting violations
 */
const rateLimitHandler = (message) => (req, res /*, next, options */) => {
  res.status(429).json({
    success: false,
    message: message || 'Too many requests. Please slow down and try again later.',
  });
};

/**
 * General API Rate Limiter
 * Applied across all API routes to mitigate general DoS/scraping.
 */
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' || !process.env.NODE_ENV ? 5000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many requests from this client. Please wait before retrying.'),
  skip: (req) => {
    // Skip in test environment unless explicitly testing rate limits
    return process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit'];
  },
});

/**
 * Authentication & Login Rate Limiter
 * Protects credential endpoints against brute-force and credential-stuffing attacks.
 */
const authLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: (req) => {
    if (req.headers['x-test-rate-limit']) return 5;
    if (process.env.AUTH_RATE_LIMIT_MAX) return parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10);
    if (process.env.NODE_ENV === 'production') return 10;
    // Development / Local environment: generous limit so development and testing are not blocked
    return 1000;
  },
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many login attempts from this network. For security reasons, please wait 15 minutes before trying again.'),
  skip: (req) => {
    // In test environment, skip unless explicitly testing rate limits
    return process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit'];
  },
});

module.exports = {
  generalApiLimiter,
  authLoginLimiter,
};
