import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDBPool } from './config/db.js';
import { uploadBuffer, deleteFromCloudinary, isCloudinaryConfigured } from './config/cloudinary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCAL_DB_PATH = path.join(__dirname, '..', 'database.json');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Ensure uploads directory exists for fallback mode
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Helper to check if PG connection pool is active
function isPGActive() {
  const pool = getDBPool();
  return pool !== null;
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
 * @returns {Promise<object>} Saved document/record info (mapped to camelCase)
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

  if (isPGActive()) {
    // PostgreSQL Save
    const pool = getDBPool();
    const query = `
      INSERT INTO contents (short_id, type, content, media_url, cloudinary_public_id, local_file_path, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [
      shortId,
      type,
      type === 'text' ? content : null,
      mediaUrl,
      cloudinaryPublicId,
      localFilePath,
      expiresAt
    ];
    
    const res = await pool.query(query, values);
    const row = res.rows[0];
    
    return {
      shortId: row.short_id,
      type: row.type,
      content: row.content,
      mediaUrl: row.media_url,
      createdAt: row.created_at,
      expiresAt: row.expires_at
    };
  } else {
    // Local JSON save fallback
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

  if (isPGActive()) {
    // PostgreSQL Fetch
    const pool = getDBPool();
    const query = `
      SELECT * FROM contents 
      WHERE short_id = $1 AND expires_at > NOW()
    `;
    const res = await pool.query(query, [shortId]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    
    return {
      shortId: row.short_id,
      type: row.type,
      content: row.content,
      mediaUrl: row.media_url,
      cloudinaryPublicId: row.cloudinary_public_id,
      localFilePath: row.local_file_path,
      createdAt: row.created_at,
      expiresAt: row.expires_at
    };
  } else {
    // Local JSON Fetch
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

  if (isPGActive()) {
    // PostgreSQL expired records fetch and delete
    const pool = getDBPool();
    const selectQuery = `
      SELECT * FROM contents 
      WHERE expires_at < $1
    `;
    const res = await pool.query(selectQuery, [now]);
    const expiredRecords = res.rows;

    for (const row of expiredRecords) {
      // Delete Cloudinary asset if present
      if (row.cloudinary_public_id) {
        try {
          await deleteFromCloudinary(row.cloudinary_public_id, row.type);
        } catch (err) {
          console.error(`Failed to clean Cloudinary asset for ${row.short_id}:`, err.message);
        }
      }
      // Delete local file if present
      if (row.local_file_path && fs.existsSync(row.local_file_path)) {
        try {
          await fs.promises.unlink(row.local_file_path);
          console.log(`🗑️ Deleted local expired file: ${row.local_file_path}`);
        } catch (err) {
          console.error(`Failed to delete local file for ${row.short_id}:`, err.message);
        }
      }
      
      // Delete record from DB
      await pool.query('DELETE FROM contents WHERE short_id = $1', [row.short_id]);
      deletedCount++;
    }
  } else {
    // Local JSON DB expired clean fallback
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
