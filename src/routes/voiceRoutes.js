import express from 'express';
import multer from 'multer';
import {
  processAudio,
  processText,
  parseOnly,
  confirmCommit,
  querySpending,
  getCategories,
  getHealth,
  createVoiceToken,
  getDiag,
  ragIngest,
  ragQuery,
  ragFullSummary,
  agentProcessAudio,
  agentProcessText
} from '../controllers/voiceController.js';
import { verifyFirebaseIdToken } from '../middleware/verifyFirebaseIdToken.js';

const router = express.Router();

// Use memory storage for zero filesystem dependency (works on Vercel serverless + local)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max audio file size
});

// REST API Endpoints
router.get('/health', getHealth);
router.get('/categories', getCategories);
router.get('/diag', getDiag);
// Protect token issuance so only authenticated users can request LiveKit tokens
router.post('/token', verifyFirebaseIdToken, createVoiceToken);

router.post('/process-audio', upload.single('audio'), processAudio);
router.post('/process-text', processText);
router.post('/parse', parseOnly);
router.post('/confirm-commit', confirmCommit);
router.post('/query', querySpending);
// RAG endpoints
router.post('/rag/ingest', ragIngest);
router.post('/rag/query', ragQuery);
router.post('/rag/summary', ragFullSummary);

// Agent endpoints (orchestrated STT -> NLU -> LLM -> optional TTS)
router.post('/agent/process-audio', upload.single('audio'), agentProcessAudio);
router.post('/agent/process-text', agentProcessText);

export default router;
