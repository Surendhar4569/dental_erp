const express = require('express');
const router = express.Router();
const { login, getCurrentUser, logout, getRoles } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

const { authLoginLimiter } = require('../middleware/rateLimiter');

// Public route: User Login with brute-force rate limiting
router.post('/login', authLoginLimiter, login);

// Public route: Get System Roles (useful for UI select inputs)
router.get('/roles', getRoles);

// Protected routes (Requires valid JWT Bearer token)
router.get('/me', authenticateToken, getCurrentUser);
router.post('/logout', authenticateToken, logout);

module.exports = router;
