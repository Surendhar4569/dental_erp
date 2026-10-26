/**
 * Unguessable, Cryptographically Secure Booking Reference Generator
 *
 * Requirements:
 * - Generates human-friendly, high-entropy booking references for safe external patient lookup
 * - Format: 'BK-XXXX-XXXX-XXXX' (3 blocks of 4 alphanumeric characters)
 * - Safe against ID enumeration and scraping attacks on public confirmation URLs
 */

const crypto = require('crypto');

// 32-character unambiguous alphanumeric alphabet (excludes 0/O, 1/I)
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generates an unguessable booking reference
 * @returns {string} E.g., 'BK-8F3A-92E1-44B7'
 */
const generateBookingReference = () => {
  const bytes = crypto.randomBytes(12);
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `BK-${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
};

module.exports = {
  generateBookingReference,
};
