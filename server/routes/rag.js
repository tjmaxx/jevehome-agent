import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import {
  createDocument, getDocuments, getDocument, deleteDocument
} from '../db/index.js';
import { processDocument } from '../services/rag.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.pdf', '.txt', '.md'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${ext} not supported. Allowed: ${allowedTypes.join(', ')}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

const router = express.Router();

// List all documents
router.get('/documents', (req, res) => {
  try {
    const documents = getDocuments();
    res.json({ documents });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single document
router.get('/documents/:id', (req, res) => {
  try {
    const doc = getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload document
router.post('/documents', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const docId = uuidv4();
    const doc = createDocument(
      docId,
      req.file.filename,
      req.file.originalname,
      req.file.mimetype,
      req.file.size
    );

    // Process asynchronously
    processDocument(docId, req.file.path, req.file.mimetype)
      .catch(err => console.error(`[RAG] Async processing failed for ${docId}:`, err));

    res.status(201).json(doc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete document
router.delete('/documents/:id', (req, res) => {
  try {
    const doc = getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    // Delete uploaded file
    const filePath = path.join(UPLOADS_DIR, doc.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    deleteDocument(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Multer error handling
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

export default router;
