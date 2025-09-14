import QRCode from 'qrcode';

/**
 * Generate QR code as base64 data URL
 * @param {string} data - Data to encode in QR code
 * @param {object} options - QR code options
 * @returns {Promise<string>} Base64 data URL of the QR code
 */
export async function generateQRCode(data, options = {}) {
  try {
    const defaultOptions = {
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 200,
      ...options
    };

    // Generate QR code as data URL (base64)
    const qrDataUrl = await QRCode.toDataURL(data, defaultOptions);
    return qrDataUrl;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw new Error(`Failed to generate QR code: ${error.message}`);
  }
}

/**
 * Generate QR code as buffer
 * @param {string} data - Data to encode in QR code
 * @param {object} options - QR code options
 * @returns {Promise<Buffer>} PNG buffer of the QR code
 */
export async function generateQRCodeBuffer(data, options = {}) {
  try {
    const defaultOptions = {
      type: 'png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 200,
      ...options
    };

    // Generate QR code as buffer
    const qrBuffer = await QRCode.toBuffer(data, defaultOptions);
    return qrBuffer;
  } catch (error) {
    console.error('Error generating QR code buffer:', error);
    throw new Error(`Failed to generate QR code buffer: ${error.message}`);
  }
}

/**
 * Generate QR code as SVG string
 * @param {string} data - Data to encode in QR code
 * @param {object} options - QR code options
 * @returns {Promise<string>} SVG string of the QR code
 */
export async function generateQRCodeSVG(data, options = {}) {
  try {
    const defaultOptions = {
      type: 'svg',
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 200,
      ...options
    };

    // Generate QR code as SVG
    const qrSvg = await QRCode.toString(data, defaultOptions);
    return qrSvg;
  } catch (error) {
    console.error('Error generating QR code SVG:', error);
    throw new Error(`Failed to generate QR code SVG: ${error.message}`);
  }
}
