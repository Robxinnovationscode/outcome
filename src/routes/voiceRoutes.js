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

// Use memory storage for zero filesystem dependency (works on Vercel serverless + local)
const upload = multer({
  storage: multer.memoryStorage(),
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
