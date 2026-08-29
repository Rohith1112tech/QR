import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'qr-secret-key-12345';

/**
 * Generates a random url-safe alphanumeric short ID
 * @param {number} length - length of the ID (default 6)
 * @returns {string}
 */
export function generateShortId(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charsLength = chars.length;
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * charsLength));
  }
  return result;
}

/**
 * Generates a base64 QR code data URL encoding the given text
 * @param {string} text - text/URL to encode
 * @param {object} [options] - color and styling options
 * @returns {Promise<string>} base64 data URL
 */
export async function generateQRCode(text, options = {}) {
  try {
    const qrOptions = {
      errorCorrectionLevel: 'H',
      margin: options.margin !== undefined ? options.margin : 2,
      width: 400,
      color: {
        dark: options.fgColor || '#000000',
        light: options.bgColor || '#ffffff'
      }
    };
    return await QRCode.toDataURL(text, qrOptions);
  } catch (error) {
    console.error('Error generating QR code:', error.message);
    throw error;
  }
}

// --- PASSWORD & JWT HELPERS ---

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// --- USER AGENT PARSING ---

export function parseUserAgent(ua) {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'Desktop' };
  
  let browser = 'Unknown';
  let os = 'Unknown';
  let device = 'Desktop';

  // Device detection
  if (/mobile/i.test(ua)) {
    device = 'Mobile';
  } else if (/tablet|ipad|playbook|silk/i.test(ua)) {
    device = 'Tablet';
  }

  // OS detection
  if (/windows/i.test(ua)) {
    os = 'Windows';
  } else if (/macintosh|mac os x/i.test(ua)) {
    os = 'macOS';
  } else if (/android/i.test(ua)) {
    os = 'Android';
    device = 'Mobile';
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    os = 'iOS';
    if (/ipad/i.test(ua)) device = 'Tablet';
    else device = 'Mobile';
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
  }

  // Browser detection
  if (/chrome|crios/i.test(ua) && !/edge|edg/i.test(ua) && !/opr|opera/i.test(ua)) {
    browser = 'Chrome';
  } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
    browser = 'Safari';
  } else if (/firefox|fxios/i.test(ua)) {
    browser = 'Firefox';
  } else if (/edge|edg/i.test(ua)) {
    browser = 'Edge';
  } else if (/opr|opera/i.test(ua)) {
    browser = 'Opera';
  }

  return { browser, os, device };
}

// --- GEOLOCATION RESOLVER ---

const MOCK_LOCATIONS = [
  { country: 'United States', city: 'New York' },
  { country: 'United States', city: 'San Francisco' },
  { country: 'United Kingdom', city: 'London' },
  { country: 'Germany', city: 'Berlin' },
  { country: 'India', city: 'Bangalore' },
  { country: 'India', city: 'Mumbai' },
  { country: 'Japan', city: 'Tokyo' },
  { country: 'Canada', city: 'Toronto' },
  { country: 'Australia', city: 'Sydney' },
  { country: 'France', city: 'Paris' }
];

export function resolveIpLocation(ip) {
  // Returns a random mock location for testing analytics beautifully.
  const randomIndex = Math.floor(Math.random() * MOCK_LOCATIONS.length);
  return MOCK_LOCATIONS[randomIndex];
}
