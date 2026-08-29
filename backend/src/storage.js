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
const DEFAULT_DB = {
  users: [],
  workspaces: [],
  workspace_members: [],
  folders: [],
  contents: [],
  scans: []
};

async function readLocalDB() {
  try {
    if (!fs.existsSync(LOCAL_DB_PATH)) {
      return { ...DEFAULT_DB };
    }
    const data = await fs.promises.readFile(LOCAL_DB_PATH, 'utf-8');
    const parsed = JSON.parse(data || '{}');
    if (Array.isArray(parsed)) {
      // Migrate old array format
      return {
        ...DEFAULT_DB,
        contents: parsed
      };
    }
    return {
      users: parsed.users || [],
      workspaces: parsed.workspaces || [],
      workspace_members: parsed.workspace_members || [],
      folders: parsed.folders || [],
      contents: parsed.contents || [],
      scans: parsed.scans || []
    };
  } catch (error) {
    console.error('Error reading local JSON DB:', error.message);
    return { ...DEFAULT_DB };
  }
}

async function writeLocalDB(data) {
  try {
    await fs.promises.writeFile(LOCAL_DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing to local JSON DB:', error.message);
  }
}

// --- USER OPERATIONS ---

export async function saveUser({ id, email, passwordHash, name, plan = 'free' }) {
  if (isPGActive()) {
    const pool = getDBPool();
    const query = `
      INSERT INTO users (id, email, password_hash, name, plan)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const res = await pool.query(query, [id, email, passwordHash, name, plan]);
    return res.rows[0];
  } else {
    const db = await readLocalDB();
    const user = { id, email, password_hash: passwordHash, name, plan, created_at: new Date() };
    db.users.push(user);
    await writeLocalDB(db);
    return user;
  }
}

export async function getUserByEmail(email) {
  if (isPGActive()) {
    const pool = getDBPool();
    const res = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return res.rows[0] || null;
  } else {
    const db = await readLocalDB();
    return db.users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  }
}

export async function getUserById(id) {
  if (isPGActive()) {
    const pool = getDBPool();
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0] || null;
  } else {
    const db = await readLocalDB();
    return db.users.find(u => u.id === id) || null;
  }
}

export async function updateUserPlan(userId, plan) {
  if (isPGActive()) {
    const pool = getDBPool();
    const res = await pool.query('UPDATE users SET plan = $1 WHERE id = $2 RETURNING *', [plan, userId]);
    return res.rows[0];
  } else {
    const db = await readLocalDB();
    const idx = db.users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      db.users[idx].plan = plan;
      await writeLocalDB(db);
      return db.users[idx];
    }
    return null;
  }
}

// --- WORKSPACE OPERATIONS ---

export async function createWorkspace({ id, name, ownerId }) {
  if (isPGActive()) {
    const pool = getDBPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO workspaces (id, name, owner_id) VALUES ($1, $2, $3)',
        [id, name, ownerId]
      );
      await client.query(
        'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)',
        [id, ownerId, 'owner']
      );
      await client.query('COMMIT');
      return { id, name, ownerId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    const db = await readLocalDB();
    const ws = { id, name, owner_id: ownerId, created_at: new Date() };
    const member = { workspace_id: id, user_id: ownerId, role: 'owner', created_at: new Date() };
    db.workspaces.push(ws);
    db.workspace_members.push(member);
    await writeLocalDB(db);
    return ws;
  }
}

export async function addWorkspaceMember({ workspaceId, userId, role = 'editor' }) {
  if (isPGActive()) {
    const pool = getDBPool();
    const query = `
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = $3
      RETURNING *
    `;
    const res = await pool.query(query, [workspaceId, userId, role]);
    return res.rows[0];
  } else {
    const db = await readLocalDB();
    const idx = db.workspace_members.findIndex(m => m.workspace_id === workspaceId && m.user_id === userId);
    const member = { workspace_id: workspaceId, user_id: userId, role, created_at: new Date() };
    if (idx !== -1) {
      db.workspace_members[idx] = member;
    } else {
      db.workspace_members.push(member);
    }
    await writeLocalDB(db);
    return member;
  }
}

export async function getWorkspaceMembers(workspaceId) {
  if (isPGActive()) {
    const pool = getDBPool();
    const query = `
      SELECT m.workspace_id, m.user_id, m.role, u.name, u.email
      FROM workspace_members m
      JOIN users u ON m.user_id = u.id
      WHERE m.workspace_id = $1
    `;
    const res = await pool.query(query, [workspaceId]);
    return res.rows;
  } else {
    const db = await readLocalDB();
    const members = db.workspace_members.filter(m => m.workspace_id === workspaceId);
    return members.map(m => {
      const u = db.users.find(user => user.id === m.user_id) || {};
      return {
        workspace_id: m.workspace_id,
        user_id: m.user_id,
        role: m.role,
        name: u.name || 'Unknown',
        email: u.email || 'unknown@domain.com'
      };
    });
  }
}

export async function deleteWorkspaceMember(workspaceId, userId) {
  if (isPGActive()) {
    const pool = getDBPool();
    await pool.query('DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [workspaceId, userId]);
    return true;
  } else {
    const db = await readLocalDB();
    db.workspace_members = db.workspace_members.filter(m => !(m.workspace_id === workspaceId && m.user_id === userId));
    await writeLocalDB(db);
    return true;
  }
}

// --- FOLDERS OPERATIONS ---

export async function getFolders(workspaceId) {
  if (isPGActive()) {
    const pool = getDBPool();
    const res = await pool.query('SELECT * FROM folders WHERE workspace_id = $1 ORDER BY name ASC', [workspaceId]);
    return res.rows;
  } else {
    const db = await readLocalDB();
    return db.folders.filter(f => f.workspace_id === workspaceId).sort((a,b) => a.name.localeCompare(b.name));
  }
}

export async function createFolder({ id, name, workspaceId }) {
  if (isPGActive()) {
    const pool = getDBPool();
    const query = 'INSERT INTO folders (id, name, workspace_id) VALUES ($1, $2, $3) RETURNING *';
    const res = await pool.query(query, [id, name, workspaceId]);
    return res.rows[0];
  } else {
    const db = await readLocalDB();
    const folder = { id, name, workspace_id: workspaceId, created_at: new Date() };
    db.folders.push(folder);
    await writeLocalDB(db);
    return folder;
  }
}

export async function updateFolder(id, name) {
  if (isPGActive()) {
    const pool = getDBPool();
    const res = await pool.query('UPDATE folders SET name = $1 WHERE id = $2 RETURNING *', [name, id]);
    return res.rows[0];
  } else {
    const db = await readLocalDB();
    const idx = db.folders.findIndex(f => f.id === id);
    if (idx !== -1) {
      db.folders[idx].name = name;
      await writeLocalDB(db);
      return db.folders[idx];
    }
    return null;
  }
}

export async function deleteFolder(id) {
  if (isPGActive()) {
    const pool = getDBPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Set QR codes in this folder to null folder
      await client.query('UPDATE contents SET folder_id = NULL WHERE folder_id = $1', [id]);
      await client.query('DELETE FROM folders WHERE id = $1', [id]);
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    const db = await readLocalDB();
    db.contents.forEach(qr => {
      if (qr.folderId === id) qr.folderId = null;
    });
    db.folders = db.folders.filter(f => f.id !== id);
    await writeLocalDB(db);
    return true;
  }
}

// --- CONTENT (QR CODE) OPERATIONS ---

export async function saveContent({
  shortId,
  type,
  content,
  file,
  expiryHours,
  workspaceId = null,
  folderId = null,
  name = null,
  createdBy = null,
  qrDesign = null
}) {
  const createdAt = new Date();
  
  // Parse and calculate expiration
  let expiresAt;
  if (expiryHours === 876000 || expiryHours === 'never') {
    expiresAt = new Date(createdAt.getTime() + 100 * 365 * 24 * 60 * 60 * 1000); // 100 years
  } else {
    expiresAt = new Date(createdAt.getTime() + expiryHours * 60 * 60 * 1000);
  }

  let mediaUrl = null;
  let cloudinaryPublicId = null;
  let localFilePath = null;

  if (type === 'image' || type === 'video') {
    if (!file) {
      throw new Error(`File is required for content type: ${type}`);
    }

    if (isCloudinaryConfigured) {
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
      const cleanFilename = `${shortId}-${Date.now()}${path.extname(file.originalname)}`;
      const destPath = path.join(UPLOADS_DIR, cleanFilename);
      await fs.promises.writeFile(destPath, file.buffer);
      localFilePath = destPath;
      mediaUrl = `/uploads/${cleanFilename}`;
      console.log(`💾 Saved file locally to: ${destPath}`);
    }
  }

  const qrDesignStr = qrDesign ? JSON.stringify(qrDesign) : null;

  if (isPGActive()) {
    const pool = getDBPool();
    const query = `
      INSERT INTO contents (short_id, type, content, media_url, cloudinary_public_id, local_file_path, expires_at, workspace_id, folder_id, name, created_by, qr_design)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    const values = [
      shortId,
      type,
      (type === 'text' || type === 'url') ? content : null,
      mediaUrl,
      cloudinaryPublicId,
      localFilePath,
      expiresAt,
      workspaceId,
      folderId,
      name,
      createdBy,
      qrDesignStr
    ];
    
    const res = await pool.query(query, values);
    const row = res.rows[0];
    
    return {
      shortId: row.short_id,
      type: row.type,
      content: row.content,
      mediaUrl: row.media_url,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      workspaceId: row.workspace_id,
      folderId: row.folder_id,
      name: row.name,
      createdBy: row.created_by,
      qrDesign: row.qr_design ? JSON.parse(row.qr_design) : null
    };
  } else {
    const recordData = {
      shortId,
      type,
      content: (type === 'text' || type === 'url') ? content : undefined,
      mediaUrl: mediaUrl || undefined,
      cloudinaryPublicId: cloudinaryPublicId || undefined,
      localFilePath: localFilePath || undefined,
      createdAt,
      expiresAt,
      workspaceId: workspaceId || undefined,
      folderId: folderId || undefined,
      name: name || undefined,
      createdBy: createdBy || undefined,
      qrDesign: qrDesign || undefined
    };
    
    const db = await readLocalDB();
    db.contents.push(recordData);
    await writeLocalDB(db);
    return recordData;
  }
}

export async function getContent(shortId) {
  const now = new Date();

  if (isPGActive()) {
    const pool = getDBPool();
    const query = `
      SELECT c.*, u.plan as creator_plan
      FROM contents c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.short_id = $1 AND c.expires_at > NOW()
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
      expiresAt: row.expires_at,
      workspaceId: row.workspace_id,
      folderId: row.folder_id,
      name: row.name,
      createdBy: row.created_by,
      qrDesign: row.qr_design ? JSON.parse(row.qr_design) : null,
      creatorPlan: row.creator_plan || 'free'
    };
  } else {
    const db = await readLocalDB();
    const record = db.contents.find(item => item.shortId === shortId);
    if (!record) return null;

    const expiresAt = new Date(record.expiresAt);
    if (expiresAt < now) {
      return null;
    }
    
    const creator = db.users.find(u => u.id === record.createdBy) || {};
    return {
      ...record,
      creatorPlan: creator.plan || 'free'
    };
  }
}

export async function getMyQRs(workspaceId, folderId = null) {
  if (isPGActive()) {
    const pool = getDBPool();
    let query = `
      SELECT c.*, COALESCE((SELECT COUNT(*) FROM scans s WHERE s.short_id = c.short_id), 0)::int as scans_count
      FROM contents c
      WHERE c.workspace_id = $1
    `;
    const params = [workspaceId];

    if (folderId) {
      query += ` AND c.folder_id = $2`;
      params.push(folderId);
    }
    
    query += ` ORDER BY c.created_at DESC`;
    const res = await pool.query(query, params);
    return res.rows.map(row => ({
      shortId: row.short_id,
      type: row.type,
      content: row.content,
      mediaUrl: row.media_url,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      workspaceId: row.workspace_id,
      folderId: row.folder_id,
      name: row.name,
      createdBy: row.created_by,
      qrDesign: row.qr_design ? JSON.parse(row.qr_design) : null,
      scansCount: row.scans_count
    }));
  } else {
    const db = await readLocalDB();
    let qrs = db.contents.filter(item => item.workspaceId === workspaceId);
    
    if (folderId) {
      qrs = qrs.filter(item => item.folderId === folderId);
    }

    return qrs.map(qr => {
      const scansCount = db.scans.filter(s => s.short_id === qr.shortId).length;
      return {
        ...qr,
        scansCount
      };
    }).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

export async function updateContent(shortId, updates) {
  const { name, content, folderId, expiryHours } = updates;
  const now = new Date();

  if (isPGActive()) {
    const pool = getDBPool();
    let query = `UPDATE contents SET `;
    const setFields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) {
      setFields.push(`name = $${idx++}`);
      values.push(name);
    }
    if (content !== undefined) {
      setFields.push(`content = $${idx++}`);
      values.push(content);
    }
    if (folderId !== undefined) {
      setFields.push(`folder_id = $${idx++}`);
      values.push(folderId);
    }
    if (expiryHours !== undefined) {
      let expiresAt;
      if (expiryHours === 876000 || expiryHours === 'never') {
        expiresAt = new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000);
      } else {
        expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1000);
      }
      setFields.push(`expires_at = $${idx++}`);
      values.push(expiresAt);
    }

    if (setFields.length === 0) return null;

    query += setFields.join(', ');
    query += ` WHERE short_id = $${idx} RETURNING *`;
    values.push(shortId);

    const res = await pool.query(query, values);
    return res.rows[0];
  } else {
    const db = await readLocalDB();
    const idx = db.contents.findIndex(c => c.shortId === shortId);
    if (idx !== -1) {
      if (name !== undefined) db.contents[idx].name = name;
      if (content !== undefined) db.contents[idx].content = content;
      if (folderId !== undefined) db.contents[idx].folderId = folderId;
      if (expiryHours !== undefined) {
        if (expiryHours === 876000 || expiryHours === 'never') {
          db.contents[idx].expiresAt = new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000);
        } else {
          db.contents[idx].expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1000);
        }
      }
      await writeLocalDB(db);
      return db.contents[idx];
    }
    return null;
  }
}

export async function deleteContent(shortId) {
  let deletedCount = 0;
  
  if (isPGActive()) {
    const pool = getDBPool();
    const selectQuery = 'SELECT * FROM contents WHERE short_id = $1';
    const res = await pool.query(selectQuery, [shortId]);
    const row = res.rows[0];

    if (row) {
      if (row.cloudinary_public_id) {
        try {
          await deleteFromCloudinary(row.cloudinary_public_id, row.type);
        } catch (err) {
          console.error(`Failed to clean Cloudinary asset for ${row.short_id}:`, err.message);
        }
      }
      if (row.local_file_path && fs.existsSync(row.local_file_path)) {
        try {
          await fs.promises.unlink(row.local_file_path);
        } catch (err) {
          console.error(`Failed to delete local file for ${row.short_id}:`, err.message);
        }
      }
      await pool.query('DELETE FROM contents WHERE short_id = $1', [shortId]);
      deletedCount++;
    }
  } else {
    const db = await readLocalDB();
    const recordIdx = db.contents.findIndex(item => item.shortId === shortId);
    if (recordIdx !== -1) {
      const record = db.contents[recordIdx];
      if (record.cloudinaryPublicId) {
        try {
          await deleteFromCloudinary(record.cloudinaryPublicId, record.type);
        } catch (err) {
          console.error(`Failed to clean Cloudinary for ${record.shortId}:`, err.message);
        }
      }
      if (record.localFilePath && fs.existsSync(record.localFilePath)) {
        try {
          await fs.promises.unlink(record.localFilePath);
        } catch (err) {
          console.error(`Failed to delete local file:`, err.message);
        }
      }
      db.contents.splice(recordIdx, 1);
      // Clean associated scans too
      db.scans = db.scans.filter(s => s.short_id !== shortId);
      await writeLocalDB(db);
      deletedCount++;
    }
  }
  return deletedCount;
}

export async function deleteExpiredContent() {
  const now = new Date();
  let deletedCount = 0;

  if (isPGActive()) {
    const pool = getDBPool();
    const selectQuery = 'SELECT * FROM contents WHERE expires_at < $1';
    const res = await pool.query(selectQuery, [now]);
    const expiredRecords = res.rows;

    for (const row of expiredRecords) {
      if (row.cloudinary_public_id) {
        try {
          await deleteFromCloudinary(row.cloudinary_public_id, row.type);
        } catch (err) {
          console.error(`Failed to clean Cloudinary for ${row.short_id}:`, err.message);
        }
      }
      if (row.local_file_path && fs.existsSync(row.local_file_path)) {
        try {
          await fs.promises.unlink(row.local_file_path);
        } catch (err) {
          console.error(`Failed to delete local file for ${row.short_id}:`, err.message);
        }
      }
      await pool.query('DELETE FROM contents WHERE short_id = $1', [row.short_id]);
      deletedCount++;
    }
  } else {
    const db = await readLocalDB();
    const activeRecords = [];
    const expiredRecords = [];

    for (const record of db.contents) {
      if (new Date(record.expiresAt) < now) {
        expiredRecords.push(record);
      } else {
        activeRecords.push(record);
      }
    }

    for (const record of expiredRecords) {
      if (record.cloudinaryPublicId) {
        try {
          await deleteFromCloudinary(record.cloudinaryPublicId, record.type);
        } catch (err) {
          console.error(`Failed to clean Cloudinary for ${record.shortId}:`, err.message);
        }
      }
      if (record.localFilePath && fs.existsSync(record.localFilePath)) {
        try {
          await fs.promises.unlink(record.localFilePath);
        } catch (err) {
          console.error(`Failed to delete local file:`, err.message);
        }
      }
      deletedCount++;
    }

    if (expiredRecords.length > 0) {
      db.contents = activeRecords;
      // Clean associated scans for expired QRs
      const expiredIds = expiredRecords.map(r => r.shortId);
      db.scans = db.scans.filter(s => !expiredIds.includes(s.short_id));
      await writeLocalDB(db);
    }
  }
  return deletedCount;
}

// --- SCAN OPERATIONS ---

export async function saveScan({ id, shortId, browser, os, device, ip, country, city }) {
  if (isPGActive()) {
    const pool = getDBPool();
    const query = `
      INSERT INTO scans (id, short_id, browser, os, device, ip, country, city)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const res = await pool.query(query, [id, shortId, browser, os, device, ip, country, city]);
    return res.rows[0];
  } else {
    const db = await readLocalDB();
    const scan = { id, short_id: shortId, scanned_at: new Date(), browser, os, device, ip, country, city };
    db.scans.push(scan);
    await writeLocalDB(db);
    return scan;
  }
}

// --- ANALYTICS OPERATIONS ---

export async function getQRAnalytics(shortId) {
  if (isPGActive()) {
    const pool = getDBPool();
    
    // Aggregated metrics
    const totalScansQuery = `SELECT COUNT(*)::int as total FROM scans WHERE short_id = $1`;
    const deviceQuery = `SELECT device as name, COUNT(*)::int as value FROM scans WHERE short_id = $1 GROUP BY device`;
    const browserQuery = `SELECT browser as name, COUNT(*)::int as value FROM scans WHERE short_id = $1 GROUP BY browser`;
    const osQuery = `SELECT os as name, COUNT(*)::int as value FROM scans WHERE short_id = $1 GROUP BY os`;
    const countryQuery = `SELECT country as name, COUNT(*)::int as value FROM scans WHERE short_id = $1 GROUP BY country ORDER BY value DESC LIMIT 5`;
    const timelineQuery = `
      SELECT TO_CHAR(scanned_at, 'YYYY-MM-DD') as date, COUNT(*)::int as value 
      FROM scans 
      WHERE short_id = $1 AND scanned_at > NOW() - INTERVAL '30 days'
      GROUP BY date 
      ORDER BY date ASC
    `;

    const [total, device, browser, os, country, timeline] = await Promise.all([
      pool.query(totalScansQuery, [shortId]),
      pool.query(deviceQuery, [shortId]),
      pool.query(browserQuery, [shortId]),
      pool.query(osQuery, [shortId]),
      pool.query(countryQuery, [shortId]),
      pool.query(timelineQuery, [shortId])
    ]);

    return {
      totalScans: total.rows[0]?.total || 0,
      devices: device.rows,
      browsers: browser.rows,
      operatingSystems: os.rows,
      countries: country.rows,
      scansTimeline: timeline.rows
    };
  } else {
    const db = await readLocalDB();
    const qrScans = db.scans.filter(s => s.short_id === shortId);
    
    return compileLocalAnalytics(qrScans);
  }
}

export async function getWorkspaceAnalytics(workspaceId) {
  if (isPGActive()) {
    const pool = getDBPool();

    // Fetch total QRs, total scans in workspace
    const summaryQuery = `
      SELECT 
        (SELECT COUNT(*)::int FROM contents WHERE workspace_id = $1) as total_qrs,
        (SELECT COUNT(*)::int FROM scans s JOIN contents c ON s.short_id = c.short_id WHERE c.workspace_id = $1) as total_scans
    `;
    
    const deviceQuery = `
      SELECT s.device as name, COUNT(*)::int as value 
      FROM scans s JOIN contents c ON s.short_id = c.short_id 
      WHERE c.workspace_id = $1 GROUP BY s.device
    `;
    const browserQuery = `
      SELECT s.browser as name, COUNT(*)::int as value 
      FROM scans s JOIN contents c ON s.short_id = c.short_id 
      WHERE c.workspace_id = $1 GROUP BY s.browser
    `;
    const osQuery = `
      SELECT s.os as name, COUNT(*)::int as value 
      FROM scans s JOIN contents c ON s.short_id = c.short_id 
      WHERE c.workspace_id = $1 GROUP BY s.os
    `;
    const countryQuery = `
      SELECT s.country as name, COUNT(*)::int as value 
      FROM scans s JOIN contents c ON s.short_id = c.short_id 
      WHERE c.workspace_id = $1 GROUP BY s.country ORDER BY value DESC LIMIT 5
    `;
    const timelineQuery = `
      SELECT TO_CHAR(s.scanned_at, 'YYYY-MM-DD') as date, COUNT(*)::int as value 
      FROM scans s JOIN contents c ON s.short_id = c.short_id 
      WHERE c.workspace_id = $1 AND s.scanned_at > NOW() - INTERVAL '30 days'
      GROUP BY date 
      ORDER BY date ASC
    `;

    const [summary, device, browser, os, country, timeline] = await Promise.all([
      pool.query(summaryQuery, [workspaceId]),
      pool.query(deviceQuery, [workspaceId]),
      pool.query(browserQuery, [workspaceId]),
      pool.query(osQuery, [workspaceId]),
      pool.query(countryQuery, [workspaceId]),
      pool.query(timelineQuery, [workspaceId])
    ]);

    return {
      totalQRs: summary.rows[0]?.total_qrs || 0,
      totalScans: summary.rows[0]?.total_scans || 0,
      devices: device.rows,
      browsers: browser.rows,
      operatingSystems: os.rows,
      countries: country.rows,
      scansTimeline: timeline.rows
    };
  } else {
    const db = await readLocalDB();
    const qrIds = db.contents.filter(c => c.workspaceId === workspaceId).map(c => c.shortId);
    const wsScans = db.scans.filter(s => qrIds.includes(s.short_id));

    const analytics = compileLocalAnalytics(wsScans);
    return {
      totalQRs: qrIds.length,
      totalScans: wsScans.length,
      ...analytics
    };
  }
}

// Local analytics helper logic
function compileLocalAnalytics(scansList) {
  const devicesMap = {};
  const browsersMap = {};
  const osMap = {};
  const countriesMap = {};
  const timelineMap = {};

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  scansList.forEach(s => {
    // Basic aggregation
    devicesMap[s.device] = (devicesMap[s.device] || 0) + 1;
    browsersMap[s.browser] = (browsersMap[s.browser] || 0) + 1;
    osMap[s.os] = (osMap[s.os] || 0) + 1;
    countriesMap[s.country] = (countriesMap[s.country] || 0) + 1;

    // Timeline aggregation within 30 days
    const scanDate = new Date(s.scanned_at);
    if (scanDate >= thirtyDaysAgo) {
      const dateStr = scanDate.toISOString().split('T')[0];
      timelineMap[dateStr] = (timelineMap[dateStr] || 0) + 1;
    }
  });

  const toArray = (map) => Object.entries(map).map(([name, value]) => ({ name, value }));

  const timelineSorted = Object.entries(timelineMap)
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const countriesSorted = toArray(countriesMap)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return {
    totalScans: scansList.length,
    devices: toArray(devicesMap),
    browsers: toArray(browsersMap),
    operatingSystems: toArray(osMap),
    countries: countriesSorted,
    scansTimeline: timelineSorted
  };
}
