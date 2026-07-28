import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';

import { connectDB } from './config/db.js';
import { saveContent, getContent, deleteExpiredContent } from './storage.js';
import { generateShortId, generateQRCode } from './utils.js';

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

// Endpoint: Generate dynamic QR code & save content
app.post('/api/create', upload.single('file'), async (req, res) => {
  try {
    const { type, content, expiryHours: expiryHoursRaw } = req.body;
    const file = req.file;

    // Validate type
    if (!type || !['text', 'image', 'video'].includes(type)) {
      return res.status(400).json({ error: 'Valid content type (text, image, or video) is required.' });
    }

    // Validate type content
    if (type === 'text' && (!content || content.trim() === '')) {
      return res.status(400).json({ error: 'Text content cannot be empty.' });
    }

    if ((type === 'image' || type === 'video') && !file) {
      return res.status(400).json({ error: `File upload is required for type "${type}".` });
    }

    // Double check that file mimetype matches type select
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
    let expiryHours = parseInt(expiryHoursRaw, 10);
    if (isNaN(expiryHours) || expiryHours <= 0) {
      expiryHours = 24; // Default to 24 hours
    }

    // Generate unique shortId (collision-proof)
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

    // Save record via Unified Storage layer
    const savedRecord = await saveContent({
      shortId,
      type,
      content,
      file,
      expiryHours
    });

    // Generate QR Code encoding frontend URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const qrUrl = `${frontendUrl}/view/${shortId}`;
    const qrCodeBase64 = await generateQRCode(qrUrl);

    res.status(201).json({
      success: true,
      shortId,
      expiresAt: savedRecord.expiresAt,
      qrCode: qrCodeBase64,
      viewUrl: qrUrl
    });

  } catch (error) {
    console.error('Error in /api/create:', error.message);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// Endpoint: Fetch QR content by shortId
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
      expiresAt: content.expiresAt
    });
  } catch (error) {
    console.error('Error in /api/content/:shortId:', error.message);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// Express file-size & multer error handling middleware
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
  // Proactively run cleanup on boot to clear anything that expired while the server was down
  try {
    await deleteExpiredContent();
  } catch (err) {
    console.error('Error running boot-time cleanup:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
  });
});
