import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import voiceRoutes from './routes/voiceRoutes.js';
import { initializeFirebase } from './config/firebase.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Firebase Admin (if credentials available)
initializeFirebase();

// Global Middlewares
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Serve Public Static Files (Interactive Web Sandbox & Docs)
app.use(express.static(path.join(__dirname, '../public')));

// Mount API Routes
app.use('/api/voice', voiceRoutes);
app.use('/api', voiceRoutes); // Backup mount for convenience

// Root Health / Info endpoint fallback if static index is requested as API
app.get('/api-info', (req, res) => {
  res.json({
    service: 'LigthsON Voice-Enabled Transaction Agent API',
    status: 'online',
    version: '1.0.0',
    documentation: '/API_DOCUMENTATION.md',
    endpoints: {
      health: 'GET /api/voice/health',
      categories: 'GET /api/voice/categories',
      processAudio: 'POST /api/voice/process-audio',
      processText: 'POST /api/voice/process-text',
      parse: 'POST /api/voice/parse',
      confirmCommit: 'POST /api/voice/confirm-commit',
      query: 'POST /api/voice/query'
    }
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`
========================================================================
🚀 Voice-Enabled Transaction Agent API Server is RUNNING!
📡 Listening on: http://localhost:${PORT}
🌐 Interactive Sandbox & Tester: http://localhost:${PORT}
📄 Health Check Endpoint: http://localhost:${PORT}/api/voice/health
========================================================================
  `);
});

export default app;
