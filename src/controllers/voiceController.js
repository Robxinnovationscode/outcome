import { transcribeAudio } from '../services/sttService.js';
import { parseUtterance } from '../services/nluEngine.js';
import { sessionManager } from '../services/sessionManager.js';
import { executeFirestoreCRUD } from '../services/firestoreService.js';
import { createParticipantToken, getLiveKitUrl } from '../services/livekitTokenService.js';
import { CATEGORY_TAXONOMY, DEFAULT_CONFIDENCE_THRESHOLD } from '../config/constants.js';
import { ingestTextForRag, queryRag, summarizeFullHistory } from '../services/ragService.js';

/**
 * Controller 1: Process Audio Input (Multipart file or Base64 string)
 */
export async function processAudio(req, res) {
  try {
    const file = req.file;
    const { audioBase64, userId = 'default_user', model = 'A', autoCommit = false, customTaxonomy } = req.body;

    if (!file && !audioBase64) {
      return res.status(400).json({
        error: 'Audio input required. Upload a file field named "audio" or pass "audioBase64" string.'
      });
    }

    // 1. Speech-to-Text Transcription
    const sttResult = await transcribeAudio({ file, audioBase64 });
    const rawTranscript = sttResult.transcript;

    // 2. NLU Entity Extraction
    const parsedData = await parseUtterance(rawTranscript, { customTaxonomy });

    // 3. Handle Model A vs Model B
    let dbResult = null;
    let confirmationMessage = generateConfirmationText(parsedData);

    if (model.toUpperCase() === 'B' || autoCommit) {
      if (parsedData.missing_fields && parsedData.missing_fields.length > 0) {
        confirmationMessage = `Parsed transcript: "${rawTranscript}". Missing required info: ${parsedData.missing_fields.join(', ')}. Please clarify before writing.`;
      } else {
        dbResult = await executeFirestoreCRUD('create', parsedData, userId);
      }
    }

    return res.status(200).json({
      raw_transcript: rawTranscript,
      stt_provider: sttResult.stt_provider,
      ...parsedData,
      model_used: model.toUpperCase(),
      confirmation_spoken: confirmationMessage,
      db_execution: dbResult
    });
  } catch (error) {
    console.error('Error in processAudio:', error);
    return res.status(500).json({ error: 'Internal server error processing audio', details: error.message });
  }
}

/**
 * Controller 2: Process Text Utterance (Single sentence or Multi-turn session)
 */
export async function processText(req, res) {
  try {
    const {
      text,
      sessionId,
      userId = 'default_user',
      model = 'A',
      autoCommit = false,
      customTaxonomy
    } = req.body;

    if (!text || text.trim() === '') {
      return res.status(400).json({ error: 'Text utterance string is required.' });
    }

    // 1. Retrieve or Initialize Session Context
    let currentSession = null;
    let existingContext = {};
    if (sessionId) {
      currentSession = sessionManager.getSession(sessionId);
      if (currentSession) existingContext = currentSession.context;
    }

    // 2. Parse Utterance with NLU Engine
    const parsedData = await parseUtterance(text, {
      customTaxonomy,
      sessionContext: existingContext
    });

    const activeSessionId = sessionId || `sess_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // 3. Check for Conversational Fallback / Follow-up Questions (Section 4.2)
    if (parsedData.missing_fields && parsedData.missing_fields.length > 0) {
      // Save current partial state to session
      sessionManager.updateSession(activeSessionId, parsedData, text);

      const followUpQuestion = generateFollowUpQuestion(parsedData);
      return res.status(200).json({
        sessionId: activeSessionId,
        requires_clarification: true,
        missing_fields: parsedData.missing_fields,
        raw_transcript: text,
        partial_parsed: parsedData,
        follow_up_question: followUpQuestion,
        confirmation_spoken: followUpQuestion
      });
    }

    // 4. Complete Transaction Formed
    sessionManager.clearSession(activeSessionId);
    const confirmationText = generateConfirmationText(parsedData);

    let dbResult = null;
    if (model.toUpperCase() === 'B' || autoCommit) {
      dbResult = await executeFirestoreCRUD('create', parsedData, userId);
    }

    return res.status(200).json({
      sessionId: activeSessionId,
      requires_clarification: false,
      raw_transcript: text,
      ...parsedData,
      model_used: model.toUpperCase(),
      confirmation_spoken: confirmationText,
      db_execution: dbResult
    });
  } catch (error) {
    console.error('Error in processText:', error);
    return res.status(500).json({ error: 'Internal server error processing text', details: error.message });
  }
}

/**
 * Controller 3: Model A Standard JSON Parse Endpoint
 */
export async function parseOnly(req, res) {
  try {
    const { text, customTaxonomy } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Field "text" is required for parse endpoint.' });
    }

    const parsedData = await parseUtterance(text, { customTaxonomy });

    return res.status(200).json({
      raw_transcript: text,
      ...parsedData
    });
  } catch (error) {
    return res.status(500).json({ error: 'Parse failed', details: error.message });
  }
}

/**
 * Controller 4: 2-Step Confirmation & Commit Endpoint (Section 4.4)
 */
export async function confirmCommit(req, res) {
  try {
    const { parsedData, userId = 'default_user', operation = 'create' } = req.body;
    if (!parsedData || !parsedData.transaction_type || !parsedData.amount) {
      return res.status(400).json({ error: 'Valid parsedData object with transaction_type and amount is required.' });
    }

    const result = await executeFirestoreCRUD(operation, parsedData, userId);
    return res.status(200).json({
      committed: true,
      operation,
      confirmation_message: `Successfully ${operation}d ${parsedData.transaction_type} of ₹${parsedData.amount} for ${parsedData.category}.`,
      db_execution: result
    });
  } catch (error) {
    return res.status(500).json({ error: 'Commit failed', details: error.message });
  }
}

/**
 * Controller 5: Natural Language Query / Read (Section 4.6 Stretch Goal)
 */
export async function querySpending(req, res) {
  try {
    const { queryText, userId = 'default_user' } = req.body;
    if (!queryText) {
      return res.status(400).json({ error: 'queryText is required.' });
    }

    // Read records from firestore
    const dbResult = await executeFirestoreCRUD('read', { transaction_type: 'expense' }, userId);

    return res.status(200).json({
      query: queryText,
      answer: `Found ${dbResult.count || 0} recent transactions matching your request. Total expenses recorded: ₹${dbResult.records ? dbResult.records.reduce((acc, r) => acc + (r.amount || 0), 0) : 0}.`,
      records: dbResult.records || []
    });
  } catch (error) {
    return res.status(500).json({ error: 'Query failed', details: error.message });
  }
}

/**
 * Controller 6: Category Taxonomy Metadata
 */
export function getCategories(req, res) {
  return res.status(200).json({
    taxonomy: CATEGORY_TAXONOMY
  });
}

export async function createVoiceToken(req, res) {
  try {
    const { userId, roomName } = req.body;
    const identity = userId || req.user?.uid;

    if (!identity) {
      return res.status(400).json({
        success: false,
        message: 'userId is required for token generation'
      });
    }

    const targetRoom = roomName || `finance-${identity}`;
    const participantToken = await createParticipantToken({
      identity: String(identity),
      roomName: targetRoom,
      metadata: {
        userId: String(identity),
        source: 'personal-finance-app'
      }
    });

    return res.status(200).json({
      success: true,
      server_url: getLiveKitUrl(),
      room_name: targetRoom,
      participant_token: participantToken
    });
  } catch (error) {
    console.error('LiveKit token generation failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to generate LiveKit token',
      details: error.message
    });
  }
}

/** RAG Endpoints */
export async function ragIngest(req, res) {
  try {
    const { userId = 'default_user', sourceId = null, text } = req.body;
    if (!text) return res.status(400).json({ success: false, message: 'text required' });
    const result = await ingestTextForRag({ userId, sourceId, text });
    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error('RAG ingest failed:', err.message || err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function ragQuery(req, res) {
  try {
    const { userId = 'default_user', query = '', k = 4 } = req.body;
    if (!query) return res.status(400).json({ success: false, message: 'query required' });
    const out = await queryRag({ userId, query, k });
    return res.status(200).json({ success: true, ...out });
  } catch (err) {
    console.error('RAG query failed:', err.message || err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function ragFullSummary(req, res) {
  try {
    const { userId = 'default_user' } = req.body;
    const out = await summarizeFullHistory({ userId });
    return res.status(200).json({ success: true, ...out });
  } catch (err) {
    console.error('RAG full summary failed:', err.message || err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

/** Agent pipeline endpoints (STT -> NLU -> LLM -> optional TTS)
 * These endpoints orchestrate the flow and return text responses; TTS is stubbed unless TTS provider configured.
 */
export async function agentProcessText(req, res) {
  try {
    const { text, userId = 'default_user', model = 'A', autoCommit = false } = req.body;
    if (!text) return res.status(400).json({ success: false, message: 'text required' });

    const parsed = await parseUtterance(text, {});
    // if missing, ask follow-up
    if (parsed.missing_fields && parsed.missing_fields.length > 0) {
      return res.status(200).json({ success: true, requires_clarification: true, missing_fields: parsed.missing_fields, follow_up: generateFollowUpQuestion(parsed) });
    }

    let dbResult = null;
    if (model.toUpperCase() === 'B' || autoCommit) {
      dbResult = await executeFirestoreCRUD('create', parsed, userId);
    }

    // LLM-generated assistant reply
    let assistantReply = `Recorded ${parsed.transaction_type} of ₹${parsed.amount} for ${parsed.category} on ${parsed.date}.`;
    try {
      const { callLLM } = await import('../services/ragService.js');
      // fallback prompt
      const p = `You are assistant. Briefly confirm: ${JSON.stringify(parsed)}`;
      assistantReply = (await callLLM(p, 200)) || assistantReply;
    } catch (e) {
      // ignore
    }

    return res.status(200).json({ success: true, parsed, dbResult, assistantReply });
  } catch (err) {
    console.error('Agent text process failed:', err.message || err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function agentProcessAudio(req, res) {
  try {
    const file = req.file;
    const { audioBase64, userId = 'default_user', model = 'A', autoCommit = false } = req.body;
    if (!file && !audioBase64) return res.status(400).json({ success: false, message: 'audio required' });

    const stt = await transcribeAudio({ file, audioBase64 });
    // reuse agentProcessText logic
    req.body.text = stt.transcript;
    return agentProcessText(req, res);
  } catch (err) {
    console.error('Agent audio process failed:', err.message || err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Controller 7: Health & System Status Check
 */
export function getHealth(req, res) {
  return res.status(200).json({
    status: 'online',
    service: 'LigthsON Voice-Enabled Transaction Agent API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    supported_models: ['Model A (Voice/NLU JSON)', 'Model B (Voice/NLU + Direct Firestore CRUD)'],
    llm_enabled: Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY),
    stt_provider: process.env.OPENAI_API_KEY ? 'OpenAI Whisper' : (process.env.GROQ_API_KEY ? 'Groq Whisper' : 'Built-in Fallback Decoder')
  });
}

/**
 * Controller 8: Diagnostic endpoint reporting Firebase and LiveKit readiness
 */
export async function getDiag(req, res) {
  try {
    const { isFirebaseConfigured } = await import('../config/firebase.js');
    const { getLiveKitUrl } = await import('../services/livekitTokenService.js');

    const firebaseReady = isFirebaseConfigured();
    const livekitUrl = getLiveKitUrl();
    const livekitConfigured = Boolean(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && livekitUrl);

    return res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      firebase: {
        configured: firebaseReady
      },
      livekit: {
        url: livekitUrl || null,
        configured: livekitConfigured
      },
      notes: {
        firebase: firebaseReady ? 'Firebase Admin SDK initialized' : 'Firebase not initialized (check FIREBASE_KEY_PATH or FIREBASE_SERVICE_ACCOUNT_KEY)'
      }
    });
  } catch (err) {
    console.error('Diag error:', err.message || err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Helpers
function generateConfirmationText(data) {
  const typeStr = data.transaction_type.toUpperCase();
  const amtStr = `₹${data.amount}`;
  const catStr = data.category;
  return `Got it! Recorded ${typeStr} of ${amtStr} for ${catStr} on ${data.date}.`;
}

function generateFollowUpQuestion(data) {
  const missing = data.missing_fields || [];
  if (missing.includes('amount') && missing.includes('category')) {
    return `Sure! How much was the transaction, and what category was it for?`;
  }
  if (missing.includes('amount')) {
    return `How much was spent for ${data.category || 'this transaction'}?`;
  }
  if (missing.includes('category')) {
    return `Got ₹${data.amount}. What category should I log this under?`;
  }
  return `Could you please clarify the details of this transaction?`;
}
