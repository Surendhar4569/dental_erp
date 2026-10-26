/**
 * Environment configuration validator for VoiceGate Dental Clinic ERP
 * Validates critical security settings at application boot.
 */
const validateEnvironment = () => {
  const isTest = process.env.NODE_ENV === 'test';

  if (isTest) {
    // Ensure test environment has a dedicated test secret if not set
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'test_jwt_secret_key_minimum_32_characters_for_unit_tests_2026';
    }
    return;
  }

  // Non-test environments (development, staging, production)
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret || typeof jwtSecret !== 'string' || jwtSecret.trim() === '') {
    throw new Error(
      'Fatal Security Error: JWT_SECRET environment variable is required but was not provided. Server startup aborted.'
    );
  }

  const insecureDefaults = ['fallback_secret', 'your_jwt_secret', 'secret', 'password', '123456'];
  if (insecureDefaults.includes(jwtSecret.trim().toLowerCase())) {
    throw new Error(
      'Fatal Security Error: Insecure default JWT_SECRET detected. You must provide a unique, cryptographically secure secret.'
    );
  }

  if (jwtSecret.trim().length < 32) {
    throw new Error(
      'Fatal Security Error: JWT_SECRET is too short. It must be at least 32 characters in length for HMAC-SHA256 security.'
    );
  }
};

module.exports = {
  validateEnvironment,
};
