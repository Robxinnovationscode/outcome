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
  agentProcessText,
  conversationalAgent,
  listAllTransactions,
  createTransactionDirect,
  updateTransactionDirect,
  deleteTransactionDirect
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
// Protect token issuance so authenticated users can request LiveKit tokens (with sandbox fallback)
router.post('/token', verifyFirebaseIdToken, createVoiceToken);

// Direct Transaction CRUD Endpoints (Live Firestore / In-memory sync)
router.get('/transactions', listAllTransactions);
router.post('/transactions', createTransactionDirect);
router.put('/transactions/:type/:id', updateTransactionDirect);
router.delete('/transactions/:type/:id', deleteTransactionDirect);

// Core Processing Endpoints
router.post('/process-audio', upload.single('audio'), processAudio);
router.post('/process-text', processText);
router.post('/parse', parseOnly);
router.post('/confirm-commit', confirmCommit);
router.post('/query', querySpending);

// RAG Endpoints
router.post('/rag/ingest', ragIngest);
router.post('/rag/query', ragQuery);
router.post('/rag/summary', ragFullSummary);

// Conversational Agent Endpoints (LiveKit + NLU + RAG + Firestore CRUD)
router.post('/agent/conversation', conversationalAgent);
router.post('/agent/process-audio', upload.single('audio'), agentProcessAudio);
router.post('/agent/process-text', agentProcessText);

export default router;
