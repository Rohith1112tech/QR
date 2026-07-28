import { v2 as cloudinary } from 'cloudinary';

const isConfigured = 
  process.env.CLOUDINARY_CLOUD_NAME && 
  process.env.CLOUDINARY_API_KEY && 
  process.env.CLOUDINARY_API_SECRET;

if (isConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('✅ Cloudinary Configured Successfully');
} else {
  console.warn('\x1b[33m%s\x1b[0m', '⚠️ WARNING: Cloudinary credentials are missing.');
  console.warn('\x1b[33m%s\x1b[0m', '   Running in LOCAL MEDIA STORAGE fallback mode (saving to /uploads).');
}

/**
 * Uploads a file buffer to Cloudinary
 * @param {Buffer} buffer - File buffer from Multer
 * @param {string} mimeType - The mime type of the file (e.g. 'image/png', 'video/mp4')
 * @returns {Promise<{ secure_url: string, public_id: string }>}
 */
export async function uploadBuffer(buffer, mimeType) {
  if (!isConfigured) {
    throw new Error('Cloudinary is not configured. Falling back to local file storage.');
  }

  const resourceType = mimeType.startsWith('video/') ? 'video' : 'image';

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'qr_generator_media',
        resource_type: resourceType,
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );
    uploadStream.end(buffer);
  });
}

/**
 * Deletes a file from Cloudinary by public ID
 * @param {string} publicId - Cloudinary public ID
 * @param {string} type - 'image' or 'video'
 * @returns {Promise<any>}
 */
export async function deleteFromCloudinary(publicId, type) {
  if (!isConfigured || !publicId) return null;
  const resourceType = type === 'video' ? 'video' : 'image';
  
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(
      publicId,
      { resource_type: resourceType },
      (error, result) => {
        if (error) {
          console.error(`❌ Error deleting from Cloudinary (${publicId}):`, error.message);
          return reject(error);
        }
        console.log(`🗑️ Deleted from Cloudinary (${publicId}):`, result);
        resolve(result);
      }
    );
  });
}

export { isConfigured as isCloudinaryConfigured };
