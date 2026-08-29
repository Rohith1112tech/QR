import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';

import { connectDB } from './config/db.js';
import { 
  saveUser, 
  getUserByEmail, 
  getUserById, 
  updateUserPlan,
  createWorkspace,
  addWorkspaceMember,
  getWorkspaceMembers,
  deleteWorkspaceMember,
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  saveContent, 
  getContent, 
  getMyQRs,
  updateContent,
  deleteContent,
  deleteExpiredContent,
  saveScan,
  getQRAnalytics,
  getWorkspaceAnalytics
} from './storage.js';
import { 
  generateShortId, 
  generateQRCode, 
  hashPassword, 
  comparePassword, 
  generateToken,
  parseUserAgent,
  resolveIpLocation
} from './utils.js';
import { requireAuth, optionalAuth } from './middleware/auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

const app = express();
const PORT = process.env.PORT || 5000;

// Setup CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Serve uploads folder statically for fallback mode
app.use('/uploads', express.static(UPLOADS_DIR));

// Configure Multer for in-memory file uploads with validation
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    // Image formats
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',
    // Video formats
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/ogg'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file format. Only common images and videos are supported.'), false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024 // 25 MB limit
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'QR Content Generator Backend is running' });
});

// --- AUTHENTICATION ENDPOINTS ---

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists.' });
    }

    const userId = `u_${generateShortId(8)}`;
    const workspaceId = `ws_${userId}`;
    const passwordHash = hashPassword(password);

    const user = await saveUser({ id: userId, email, passwordHash, name });
    await createWorkspace({ id: workspaceId, name: `${name}'s Workspace`, ownerId: userId });

    const token = generateToken(user);

    res.status(201).json({
      success: true,
      token,
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await getUserByEmail(email);
    if (!user || !comparePassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan }
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/api/users/plan', requireAuth, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!plan || !['free', 'premium'].includes(plan)) {
      return res.status(400).json({ error: 'Valid plan (free or premium) is required.' });
    }

    const updated = await updateUserPlan(req.user.id, plan);
    res.json({
      success: true,
      user: { id: updated.id, email: updated.email, name: updated.name, plan: updated.plan }
    });
  } catch (error) {
    console.error('Plan update error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- WORKSPACE ENDPOINTS ---

app.get('/api/workspaces/members', requireAuth, async (req, res) => {
  try {
    const members = await getWorkspaceMembers(req.workspaceId);
    res.json({ success: true, members });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/workspaces/invite', requireAuth, async (req, res) => {
  try {
    const { email, role = 'editor' } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Member email is required.' });
    }

    const targetUser = await getUserByEmail(email);
    if (!targetUser) {
      return res.status(404).json({ error: 'User with this email is not registered yet.' });
    }

    const member = await addWorkspaceMember({
      workspaceId: req.workspaceId,
      userId: targetUser.id,
      role
    });

    res.json({
      success: true,
      member: {
        workspace_id: member.workspace_id,
        user_id: member.user_id,
        role: member.role,
        name: targetUser.name,
        email: targetUser.email
      }
    });
  } catch (error) {
    console.error('Invite error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.delete('/api/workspaces/members/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot remove yourself from your own workspace.' });
    }

    await deleteWorkspaceMember(req.workspaceId, userId);
    res.json({ success: true, message: 'Member removed successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- FOLDER ENDPOINTS ---

app.get('/api/folders', requireAuth, async (req, res) => {
  try {
    const folders = await getFolders(req.workspaceId);
    res.json({ success: true, folders });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/folders', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Folder name is required.' });
    }

    const id = `f_${generateShortId(8)}`;
    const folder = await createFolder({ id, name, workspaceId: req.workspaceId });
    res.status(201).json({ success: true, folder });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/api/folders/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Folder name is required.' });
    }

    const updated = await updateFolder(id, name);
    res.json({ success: true, folder: updated });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.delete('/api/folders/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await deleteFolder(id);
    res.json({ success: true, message: 'Folder deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- QR CONTENT ENDPOINTS ---

// Endpoint: Generate dynamic QR code & save content
app.post('/api/create', optionalAuth, upload.single('file'), async (req, res) => {
  try {
    const { type, content, expiryHours: expiryHoursRaw, folderId, name, qrDesign } = req.body;
    const file = req.file;

    // Validate type
    if (!type || !['text', 'image', 'video', 'url'].includes(type)) {
      return res.status(400).json({ error: 'Valid content type (text, image, video, or url) is required.' });
    }

    // Validate content/file based on type
    if (type === 'text' && (!content || content.trim() === '')) {
      return res.status(400).json({ error: 'Text content cannot be empty.' });
    }
    if (type === 'url' && (!content || content.trim() === '')) {
      return res.status(400).json({ error: 'URL content cannot be empty.' });
    }
    if ((type === 'image' || type === 'video') && !file) {
      return res.status(400).json({ error: `File upload is required for type "${type}".` });
    }

    // Double check file format
    if (file) {
      const isVideo = file.mimetype.startsWith('video/');
      const isImage = file.mimetype.startsWith('image/');
      
      if (type === 'image' && !isImage) {
        return res.status(400).json({ error: 'Uploaded file is not a valid image.' });
      }
      if (type === 'video' && !isVideo) {
        return res.status(400).json({ error: 'Uploaded file is not a valid video.' });
      }
    }

    // Parse and validate expiryHours
    let expiryHours;
    if (!expiryHoursRaw || expiryHoursRaw === 'never') {
      expiryHours = 876000; // 100 years (effectively never)
    } else {
      expiryHours = parseInt(expiryHoursRaw, 10);
      if (isNaN(expiryHours) || expiryHours <= 0) {
        expiryHours = 876000;
      }
    }

    // Generate unique shortId
    let shortId;
    let attempts = 0;
    while (attempts < 10) {
      shortId = generateShortId(6);
      const existing = await getContent(shortId);
      if (!existing) break;
      attempts++;
    }

    if (attempts >= 10) {
      return res.status(500).json({ error: 'Failed to generate a unique short ID. Please try again.' });
    }

    let parsedDesign = null;
    if (qrDesign) {
      try {
        parsedDesign = typeof qrDesign === 'string' ? JSON.parse(qrDesign) : qrDesign;
      } catch (e) {
        console.error('Failed to parse qrDesign:', e);
      }
    }

    // Save record
    const savedRecord = await saveContent({
      shortId,
      type,
      content,
      file,
      expiryHours,
      workspaceId: req.workspaceId || null,
      folderId: folderId || null,
      name: name || `QR Campaign ${shortId}`,
      createdBy: req.user ? req.user.id : null,
      qrDesign: parsedDesign
    });

    // Generate QR Code encoding the tracking scan redirect URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const trackingUrl = `${frontendUrl}/r/${shortId}`;
    const qrCodeBase64 = await generateQRCode(trackingUrl, parsedDesign || {});

    res.status(201).json({
      success: true,
      shortId,
      expiresAt: savedRecord.expiresAt,
      qrCode: qrCodeBase64,
      viewUrl: trackingUrl
    });

  } catch (error) {
    console.error('Error in /api/create:', error.message);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// Endpoint: Fetch my QR codes
app.get('/api/my-qrs', requireAuth, async (req, res) => {
  try {
    const { folderId } = req.query;
    const qrs = await getMyQRs(req.workspaceId, folderId || null);
    res.json({ success: true, qrs });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint: Update dynamic QR content
app.put('/api/qr/:shortId', requireAuth, async (req, res) => {
  try {
    const { shortId } = req.params;
    const { name, content, folderId, expiryHours } = req.body;

    const existing = await getContent(shortId);
    if (!existing) {
      return res.status(404).json({ error: 'QR Code not found.' });
    }

    // Verify workspace ownership
    if (existing.workspaceId !== req.workspaceId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const updated = await updateContent(shortId, { name, content, folderId, expiryHours });
    res.json({ success: true, qr: updated });
  } catch (error) {
    console.error('Error updating content:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint: Delete QR Code
app.delete('/api/qr/:shortId', requireAuth, async (req, res) => {
  try {
    const { shortId } = req.params;
    const existing = await getContent(shortId);
    if (!existing) {
      return res.status(404).json({ error: 'QR Code not found.' });
    }

    // Verify ownership
    if (existing.workspaceId !== req.workspaceId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    await deleteContent(shortId);
    res.json({ success: true, message: 'QR Code deleted successfully.' });
  } catch (error) {
    console.error('Error deleting content:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint: Fetch QR content by shortId (for viewer)
app.get('/api/content/:shortId', async (req, res) => {
  try {
    const { shortId } = req.params;
    const content = await getContent(shortId);
    
    if (!content) {
      return res.status(404).json({ error: 'Content has expired or does not exist.' });
    }
    
    res.json({
      success: true,
      type: content.type,
      content: content.content,
      mediaUrl: content.mediaUrl,
      createdAt: content.createdAt,
      expiresAt: content.expiresAt,
      creatorPlan: content.creatorPlan
    });
  } catch (error) {
    console.error('Error in /api/content/:shortId:', error.message);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// --- SCANS & ANALYTICS ENDPOINTS ---

// Endpoint: Record scan and return details
app.post('/api/scan/:shortId', async (req, res) => {
  try {
    const { shortId } = req.params;
    const content = await getContent(shortId);

    if (!content) {
      return res.status(404).json({ error: 'Invalid or expired QR code.' });
    }

    // Scan tracking parser
    const ua = req.headers['user-agent'] || '';
    const { browser, os, device } = parseUserAgent(ua);
    
    const ip = req.headers['x-forwarded-for'] || req.ip || '127.0.0.1';
    const { country, city } = resolveIpLocation(ip);

    const scanId = `sc_${generateShortId(8)}`;
    await saveScan({
      id: scanId,
      shortId,
      browser,
      os,
      device,
      ip,
      country,
      city
    });

    res.json({
      success: true,
      type: content.type,
      content: content.content,
      isPremium: content.creatorPlan === 'premium',
      shortId
    });
  } catch (error) {
    console.error('Scan tracking error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint: Fetch single QR analytics
app.get('/api/qr/:shortId/analytics', requireAuth, async (req, res) => {
  try {
    const { shortId } = req.params;
    const content = await getContent(shortId);

    if (!content) {
      return res.status(404).json({ error: 'QR Code not found.' });
    }

    if (content.workspaceId !== req.workspaceId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const analytics = await getQRAnalytics(shortId);
    res.json({ success: true, analytics });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint: Fetch workspace-wide analytics
app.get('/api/analytics', requireAuth, async (req, res) => {
  try {
    const analytics = await getWorkspaceAnalytics(req.workspaceId);
    res.json({ success: true, analytics });
  } catch (error) {
    console.error('Workspace analytics error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- ERROR HANDLING & CLEANUP ---

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large. Maximum size allowed is 25MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

// Setup scheduled cleanup job running every hour
cron.schedule('0 * * * *', async () => {
  console.log('⏰ Running hourly expired content cleanup job...');
  try {
    const count = await deleteExpiredContent();
    if (count > 0) {
      console.log(`🧹 Cleanup job: Deleted ${count} expired entries.`);
    }
  } catch (error) {
    console.error('❌ Error during cleanup job:', error.message);
  }
});

// Initialize DB and Start Server
connectDB().then(async () => {
  try {
    await deleteExpiredContent();
  } catch (err) {
    console.error('Error running boot-time cleanup:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
  });
});
