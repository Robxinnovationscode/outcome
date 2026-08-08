import { transcribeAudio } from '../services/sttService.js';
import { parseUtterance } from '../services/nluEngine.js';
import { sessionManager } from '../services/sessionManager.js';
import { executeFirestoreCRUD } from '../services/firestoreService.js';
import { CATEGORY_TAXONOMY, DEFAULT_CONFIDENCE_THRESHOLD } from '../config/constants.js';

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
