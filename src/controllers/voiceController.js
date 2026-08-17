import { transcribeAudio } from '../services/sttService.js';
import { parseUtterance } from '../services/nluEngine.js';
import { sessionManager } from '../services/sessionManager.js';
import { executeFirestoreCRUD, fetchAllTransactions } from '../services/firestoreService.js';
import { createParticipantToken, getLiveKitUrl } from '../services/livekitTokenService.js';
import { CATEGORY_TAXONOMY, DEFAULT_CONFIDENCE_THRESHOLD } from '../config/constants.js';
import { ingestTextForRag, queryRag, summarizeFullHistory, callLLM } from '../services/ragService.js';

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

    if (!rawTranscript) {
      const friendlyHelp = sttResult.error || "I couldn't catch that clearly. Please try speaking again or type your expense!";
      return res.status(200).json({
        requires_clarification: true,
        missing_fields: ['amount', 'category'],
        raw_transcript: null,
        stt_provider: sttResult.stt_provider,
        confirmation_spoken: friendlyHelp,
        follow_up_question: friendlyHelp
      });
    }

    // 2. NLU Entity Extraction
    const parsedData = await parseUtterance(rawTranscript, { customTaxonomy });

    // 3. Handle Model A vs Model B
    let dbResult = null;
    let confirmationMessage = generateConfirmationText(parsedData);

    if (parsedData.missing_fields && parsedData.missing_fields.length > 0) {
      confirmationMessage = generateFollowUpQuestion(parsedData);
    } else if (model.toUpperCase() === 'B' || autoCommit) {
      dbResult = await executeFirestoreCRUD('create', parsedData, userId);
      // Ingest into RAG
      try {
        await ingestTextForRag({
          userId,
          text: `${parsedData.transaction_type} of ₹${parsedData.amount} for ${parsedData.category} on ${parsedData.date}. Notes: ${parsedData.notes}`
        });
      } catch (e) {
        // ignore rag error
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
      try {
        await ingestTextForRag({
          userId,
          text: `${parsedData.transaction_type} of ₹${parsedData.amount} for ${parsedData.category} on ${parsedData.date}. Notes: ${parsedData.notes}`
        });
      } catch (e) {
        // ignore rag error
      }
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

    const transactions = await fetchAllTransactions(userId);
    const totalExpenses = transactions.filter(t => t.transaction_type === 'expense').reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalIncome = transactions.filter(t => t.transaction_type === 'income').reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalInvestments = transactions.filter(t => t.transaction_type === 'investment').reduce((sum, t) => sum + (t.amount || 0), 0);

    // RAG analysis
    let ragResult = null;
    try {
      ragResult = await queryRag({ userId, query: queryText, k: 5 });
    } catch (e) {
      // ignore
    }

    return res.status(200).json({
      query: queryText,
      answer: `Found ${transactions.length} total records. Total Expenses: ₹${totalExpenses.toLocaleString('en-IN')}, Income: ₹${totalIncome.toLocaleString('en-IN')}, Investments: ₹${totalInvestments.toLocaleString('en-IN')}.`,
      summary: ragResult?.summary || null,
      records: transactions
    });
  } catch (error) {
    return res.status(500).json({ error: 'Query failed', details: error.message });
  }
}

/**
 * Controller 6: List All Transactions
 */
export async function listAllTransactions(req, res) {
  try {
    const userId = req.query.userId || req.user?.uid || 'default_user';
    const records = await fetchAllTransactions(userId);
    return res.status(200).json({
      success: true,
      count: records.length,
      transactions: records
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Controller: Direct Create Transaction
 */
export async function createTransactionDirect(req, res) {
  try {
    const userId = req.body.userId || req.user?.uid || 'default_user';
    const result = await executeFirestoreCRUD('create', req.body, userId);
    return res.status(200).json({ success: true, result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Controller: Direct Update Transaction
 */
export async function updateTransactionDirect(req, res) {
  try {
    const { type, id } = req.params;
    const userId = req.body.userId || req.user?.uid || 'default_user';
    const result = await executeFirestoreCRUD('update', { transaction_type: type, docId: id, ...req.body }, userId);
    return res.status(200).json({ success: true, result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Controller: Direct Delete Transaction
 */
export async function deleteTransactionDirect(req, res) {
  try {
    const { type, id } = req.params;
    const userId = req.query.userId || req.body?.userId || req.user?.uid || 'default_user';
    const result = await executeFirestoreCRUD('delete', { transaction_type: type, docId: id }, userId);
    return res.status(200).json({ success: true, result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Controller: Category Taxonomy Metadata
 */
export function getCategories(req, res) {
  return res.status(200).json({
    taxonomy: CATEGORY_TAXONOMY
  });
}

/**
 * Controller: LiveKit Participant Token Generation
 */
export async function createVoiceToken(req, res) {
  try {
    const { userId, roomName } = req.body || {};
    const identity = userId || req.user?.uid || `user_${Date.now()}`;
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
      participant_token: participantToken,
      userId: String(identity)
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

/**
 * Controller: Conversational Agent Endpoint (Handles live voice / text conversation with LiveKit, NLU, RAG, and multi-action CRUD)
 */
export async function conversationalAgent(req, res) {
  try {
    const { text, userId = 'default_user', sessionId } = req.body;
    if (!text || text.trim() === '') {
      return res.status(400).json({ success: false, error: 'text is required' });
    }

    const lower = text.toLowerCase().trim();

    // Detect User Intent: DELETE, UPDATE, QUERY/READ, RAG_SUMMARY, or CREATE
    const isDelete = /\b(delete|remove|cancel|discard|erase|hatao|mitado)\b/i.test(lower);
    const isUpdate = /\b(update|change|modify|correct|badlo|set)\b/i.test(lower);
    const isQuery = /\b(what|how much|total|show|list|summary|spending|expenses|tell me|kitna|dekhao|kya)\b/i.test(lower);
    const isSummary = /\b(summary|overview|health|report|analysis|advice)\b/i.test(lower);

    let action_performed = 'create';
    let spokenResponse = '';
    let dbResult = null;
    let ragResult = null;
    let parsedData = null;

    // 1. Intent: DELETE
    if (isDelete) {
      action_performed = 'delete';
      parsedData = await parseUtterance(text, {});
      dbResult = await executeFirestoreCRUD('delete', parsedData, userId);
      if (dbResult.success) {
        spokenResponse = `Deleted your most recent ${parsedData.category !== 'Other' ? parsedData.category : parsedData.transaction_type} transaction.`;
      } else {
        spokenResponse = dbResult.error || `Could not find any transaction to delete.`;
      }
    }
    // 2. Intent: UPDATE
    else if (isUpdate) {
      action_performed = 'update';
      parsedData = await parseUtterance(text, {});
      dbResult = await executeFirestoreCRUD('update', parsedData, userId);
      if (dbResult.success) {
        spokenResponse = `Updated your ${parsedData.category} transaction to ₹${parsedData.amount}.`;
      } else {
        spokenResponse = dbResult.error || `Could not find transaction to update.`;
      }
    }
    // 3. Intent: QUERY / RAG SUMMARY
    else if (isSummary || (isQuery && !/\b(spent|paid|bought|received|credited|invested)\b/i.test(lower))) {
      action_performed = 'query';
      const allTx = await fetchAllTransactions(userId);
      const totalExp = allTx.filter(t => t.transaction_type === 'expense').reduce((acc, t) => acc + (t.amount || 0), 0);
      const totalInc = allTx.filter(t => t.transaction_type === 'income').reduce((acc, t) => acc + (t.amount || 0), 0);
      const totalInv = allTx.filter(t => t.transaction_type === 'investment').reduce((acc, t) => acc + (t.amount || 0), 0);

      try {
        ragResult = await queryRag({ userId, query: text, k: 4 });
      } catch (e) {
        // ignore
      }

      if (isSummary) {
        spokenResponse = `Here is your financial summary: You have ₹${totalInc.toLocaleString('en-IN')} income, ₹${totalExp.toLocaleString('en-IN')} expenses, and ₹${totalInv.toLocaleString('en-IN')} investments.`;
      } else {
        spokenResponse = `You have ${allTx.length} total records logged. Total expenses are ₹${totalExp.toLocaleString('en-IN')} and income is ₹${totalInc.toLocaleString('en-IN')}.`;
      }
    }
    // 4. Intent: CREATE (Default financial transaction parsing & logging)
    else {
      action_performed = 'create';
      parsedData = await parseUtterance(text, {});

      // Missing critical fields -> Ask clarification
      if (parsedData.missing_fields && parsedData.missing_fields.length > 0) {
        const followUp = generateFollowUpQuestion(parsedData);
        return res.status(200).json({
          success: true,
          action_performed: 'clarification_needed',
          requires_clarification: true,
          missing_fields: parsedData.missing_fields,
          spokenResponse: followUp,
          follow_up_question: followUp,
          parsedData
        });
      }

      // Guard: if NLU couldn't reliably parse key fields, ask for clarification
      // rather than silently logging a garbage "Other / ₹0" record.
      if (!parsedData.amount || parsedData.amount <= 0 || !parsedData.category || parsedData.category === 'Other') {
        const followUp = generateFollowUpQuestion(parsedData);
        return res.status(200).json({
          success: true,
          action_performed: 'clarification_needed',
          requires_clarification: true,
          missing_fields: parsedData.missing_fields,
          spokenResponse: followUp,
          follow_up_question: followUp,
          parsedData
        });
      }

      // Execute CRUD Create in Model B
      dbResult = await executeFirestoreCRUD('create', parsedData, userId);

      // Ingest into RAG vector store
      try {
        await ingestTextForRag({
          userId,
          text: `${parsedData.transaction_type} of ₹${parsedData.amount} for ${parsedData.category} on ${parsedData.date}. Notes: ${parsedData.notes}`
        });
      } catch (e) {
        // ignore
      }

      spokenResponse = `Got it! Recorded ${parsedData.transaction_type.toUpperCase()} of ₹${parsedData.amount} for ${parsedData.category} on ${parsedData.date}.`;
    }

    // Refresh all transactions list
    const updatedTransactions = await fetchAllTransactions(userId);

    return res.status(200).json({
      success: true,
      action_performed,
      spokenResponse,
      confirmation_spoken: spokenResponse,
      parsedData,
      dbResult,
      ragResult,
      transactions: updatedTransactions
    });
  } catch (error) {
    console.error('Conversational agent error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

/** Agent pipeline endpoints */
export async function agentProcessText(req, res) {
  return conversationalAgent(req, res);
}

export async function agentProcessAudio(req, res) {
  try {
    const file = req.file;
    const { audioBase64, userId = 'default_user' } = req.body;
    if (!file && !audioBase64) return res.status(400).json({ success: false, message: 'audio required' });

    const stt = await transcribeAudio({ file, audioBase64 });

    // If STT returned null (no provider configured or silent audio), respond gracefully
    if (!stt.transcript) {
      return res.status(200).json({
        success: true,
        action_performed: 'clarification_needed',
        requires_clarification: true,
        spokenResponse: stt.error || 'Sorry, I could not hear you clearly. Please try speaking again.',
        follow_up_question: stt.error || 'No speech detected. Please speak and try again.',
        stt_provider: stt.stt_provider
      });
    }

    req.body.text = stt.transcript;
    req.body.userId = userId;
    return conversationalAgent(req, res);
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
    livekit_enabled: true,
    rag_enabled: true,
    nlu_enabled: true,
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
        firebase: firebaseReady ? 'Firebase Admin SDK initialized' : 'Firebase not initialized (using in-memory persistence sandbox)'
      }
    });
  } catch (err) {
    console.error('Diag error:', err.message || err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Helpers
function generateConfirmationText(data) {
  const typeStr = (data.transaction_type || 'expense').toUpperCase();
  const amtStr = `₹${data.amount}`;
  const catStr = data.category || 'General';
  return `Got it! Recorded ${typeStr} of ${amtStr} for ${catStr}.`;
}

function generateFollowUpQuestion(data) {
  const missing = data.missing_fields || [];
  if (missing.includes('amount') && missing.includes('category')) {
    return `Sure! How much did you spend, and what was it for?`;
  }
  if (missing.includes('amount')) {
    const catName = (data.category && data.category !== 'Other' && data.category !== 'General') ? `for ${data.category}` : '';
    return `How much was spent${catName ? ' ' + catName : ''}?`;
  }
  if (missing.includes('category')) {
    return `Got ₹${data.amount}. What category should I log this under?`;
  }
  return `Could you please clarify the details of this transaction?`;
}


