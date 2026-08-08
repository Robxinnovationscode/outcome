import express from 'express';
import multer from 'multer';
import {
  processAudio,
  processText,
  parseOnly,
  confirmCommit,
  querySpending,
  getCategories,
  getHealth
} from '../controllers/voiceController.js';

const router = express.Router();

// Multer memory storage for incoming audio streams / files
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.TMP_DIR || './uploads'),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`)
});

// Create uploads directory if not exists
import fs from 'fs';
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads', { recursive: true });
}

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max audio file size
});

// REST API Endpoints
router.get('/health', getHealth);
router.get('/categories', getCategories);

router.post('/process-audio', upload.single('audio'), processAudio);
router.post('/process-text', processText);
router.post('/parse', parseOnly);
router.post('/confirm-commit', confirmCommit);
router.post('/query', querySpending);

export default router;
