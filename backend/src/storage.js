import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Content from './models/Content.js';
import { uploadBuffer, deleteFromCloudinary, isCloudinaryConfigured } from './config/cloudinary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCAL_DB_PATH = path.join(__dirname, '..', 'database.json');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Ensure uploads directory exists for fallback mode
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Helper to check if MongoDB is active
function isMongoActive() {
  return mongoose.connection.readyState === 1;
}

// --- LOCAL JSON DATABASE HELPERS ---
async function readLocalDB() {
  try {
    if (!fs.existsSync(LOCAL_DB_PATH)) {
      return [];
    }
    const data = await fs.promises.readFile(LOCAL_DB_PATH, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (error) {
    console.error('Error reading local JSON DB:', error.message);
    return [];
  }
}

async function writeLocalDB(data) {
  try {
    await fs.promises.writeFile(LOCAL_DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing to local JSON DB:', error.message);
  }
}

// --- UNIFIED STORAGE INTERFACE ---

/**
 * Saves text or media content
 * @param {object} params
 * @param {string} params.shortId
 * @param {string} params.type - 'text' | 'image' | 'video'
 * @param {string} [params.content] - Text content (if type === 'text')
 * @param {object} [params.file] - Multer file object (if type === 'image' or 'video')
 * @param {number} params.expiryHours - 1 | 24 | 168 (7 days)
 * @returns {Promise<object>} Saved document/record info
 */
export async function saveContent({ shortId, type, content, file, expiryHours }) {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + expiryHours * 60 * 60 * 1000);

  let mediaUrl = null;
  let cloudinaryPublicId = null;
  let localFilePath = null;

  if (type === 'image' || type === 'video') {
    if (!file) {
      throw new Error(`File is required for content type: ${type}`);
    }

    if (isCloudinaryConfigured) {
      // Upload to Cloudinary
      try {
        console.log(`📤 Uploading file to Cloudinary...`);
        const result = await uploadBuffer(file.buffer, file.mimetype);
        mediaUrl = result.secure_url;
        cloudinaryPublicId = result.public_id;
      } catch (error) {
        console.error('Cloudinary upload failed, checking local fallback options:', error.message);
        throw error;
      }
    } else {
      // Fallback: save to local uploads directory
      const cleanFilename = `${shortId}-${Date.now()}${path.extname(file.originalname)}`;
      const destPath = path.join(UPLOADS_DIR, cleanFilename);
      await fs.promises.writeFile(destPath, file.buffer);
      localFilePath = destPath;
      mediaUrl = `/uploads/${cleanFilename}`;
      console.log(`💾 Saved file locally to: ${destPath}`);
    }
  }

  const recordData = {
    shortId,
    type,
    content: type === 'text' ? content : undefined,
    mediaUrl: mediaUrl || undefined,
    cloudinaryPublicId: cloudinaryPublicId || undefined,
    localFilePath: localFilePath || undefined,
    createdAt,
    expiresAt
  };

  if (isMongoActive()) {
    // Mongo save
    const newContent = new Content(recordData);
    await newContent.save();
    return newContent.toObject();
  } else {
    // Local JSON save
    const db = await readLocalDB();
    db.push(recordData);
    await writeLocalDB(db);
    return recordData;
  }
}

/**
 * Retrieves content by shortId, filtering out expired ones
 * @param {string} shortId
 * @returns {Promise<object|null>}
 */
export async function getContent(shortId) {
  const now = new Date();

  if (isMongoActive()) {
    const record = await Content.findOne({ shortId });
    if (!record) return null;
    
    // Check if expired
    if (record.expiresAt < now) {
      return null;
    }
    return record.toObject();
  } else {
    const db = await readLocalDB();
    const record = db.find(item => item.shortId === shortId);
    if (!record) return null;

    // Convert dates from JSON strings
    const expiresAt = new Date(record.expiresAt);
    if (expiresAt < now) {
      return null;
    }
    return record;
  }
}

/**
 * Deletes all expired content records and their associated files (Cloudinary & Local)
 * @returns {Promise<number>} Number of deleted entries
 */
export async function deleteExpiredContent() {
  const now = new Date();
  let deletedCount = 0;

  if (isMongoActive()) {
    // Find all expired records
    const expiredRecords = await Content.find({ expiresAt: { $lt: now } });
    
    for (const record of expiredRecords) {
      // Delete Cloudinary asset if present
      if (record.cloudinaryPublicId) {
        try {
          await deleteFromCloudinary(record.cloudinaryPublicId, record.type);
        } catch (err) {
          console.error(`Failed to clean Cloudinary asset for ${record.shortId}:`, err.message);
        }
      }
      // Delete local file if present (just in case)
      if (record.localFilePath && fs.existsSync(record.localFilePath)) {
        try {
          await fs.promises.unlink(record.localFilePath);
          console.log(`🗑️ Deleted local expired file: ${record.localFilePath}`);
        } catch (err) {
          console.error(`Failed to delete local file for ${record.shortId}:`, err.message);
        }
      }
      
      await Content.deleteOne({ _id: record._id });
      deletedCount++;
    }
  } else {
    const db = await readLocalDB();
    const activeRecords = [];
    const expiredRecords = [];

    for (const record of db) {
      if (new Date(record.expiresAt) < now) {
        expiredRecords.push(record);
      } else {
        activeRecords.push(record);
      }
    }

    // Process deletions
    for (const record of expiredRecords) {
      if (record.cloudinaryPublicId) {
        try {
          await deleteFromCloudinary(record.cloudinaryPublicId, record.type);
        } catch (err) {
          console.error(`Failed to clean Cloudinary asset for ${record.shortId}:`, err.message);
        }
      }
      if (record.localFilePath && fs.existsSync(record.localFilePath)) {
        try {
          await fs.promises.unlink(record.localFilePath);
          console.log(`🗑️ Deleted local expired file: ${record.localFilePath}`);
        } catch (err) {
          console.error(`Failed to delete local file for ${record.shortId}:`, err.message);
        }
      }
      deletedCount++;
    }

    if (expiredRecords.length > 0) {
      await writeLocalDB(activeRecords);
    }
  }

  if (deletedCount > 0) {
    console.log(`🧹 Cron cleanup: Removed ${deletedCount} expired items.`);
  }
  return deletedCount;
}
