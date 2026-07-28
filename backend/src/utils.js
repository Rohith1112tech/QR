import QRCode from 'qrcode';

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
 * @returns {Promise<string>} base64 data URL
 */
export async function generateQRCode(text) {
  try {
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'H', // High error correction so it scans easily even if slightly distorted
      margin: 2,
      width: 400, // Good resolution for rendering/downloading
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
  } catch (error) {
    console.error('Error generating QR code:', error.message);
    throw error;
  }
}
