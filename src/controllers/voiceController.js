import { transcribeAudio } from '../services/sttService.js';
import { parseUtterance } from '../services/nluEngine.js';
import { sessionManager } from '../services/sessionManager.js';
import { executeFirestoreCRUD, fetchAllTransactions, registerSseClient, getFirestoreMode } from '../services/firestoreService.js';
import { createParticipantToken, getLiveKitUrl } from '../services/livekitTokenService.js';
import { CATEGORY_TAXONOMY, CATEGORY_SUBITEMS, CATEGORY_SYNONYMS, DEFAULT_CONFIDENCE_THRESHOLD } from '../config/constants.js';
import { ingestTextForRag, queryRag, summarizeFullHistory, callLLM, removeEmbeddingBySourceId } from '../services/ragService.js';
import { detectLanguage, generateLocalizedSpokenResponse, generateLocalizedFollowUp } from '../services/languageService.js';

/**
 * Controller: Server-Sent Events — live ledger refresh stream
 * Clients subscribe once; any CRUD event auto-pushes a refresh signal.
 */
export function ledgerEventsStream(req, res) {
  registerSseClient(res);
  // Send an initial connected event so the client knows the stream is ready
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);
}

/**
 * Controller 1: Process Audio Input (Multipart file or Base64 string)
 */
export async function processAudio(req, res) {
  try {
    const file = req.file;
    const { audioBase64, userId = 'default_user', model = 'B', autoCommit = true, customTaxonomy, language } = req.body;

    if (!file && !audioBase64) {
      return res.status(400).json({
        error: 'Audio input required. Upload a file field named "audio" or pass "audioBase64" string.'
      });
    }

    // 1. Speech-to-Text Transcription
    const sttResult = await transcribeAudio({ file, audioBase64 });
    const rawTranscript = sttResult.transcript;

    const detectedLang = (language && language !== 'auto') ? language : detectLanguage(rawTranscript || '');

    if (!rawTranscript) {
      const friendlyHelp = sttResult.error || (
        detectedLang === 'ta-IN'
          ? "குரல் சரியாக கேட்கவில்லை. மீண்டும் பேசவும் அல்லது உள்ளிடவும்!"
          : (detectedLang === 'hi-IN'
              ? "आपकी आवाज़ स्पष्ट नहीं सुनाई दी। कृपया दोबारा बोलें!"
              : "I couldn't catch that clearly. Please try speaking again or type your expense!")
      );
      return res.status(200).json({
        requires_clarification: true,
        missing_fields: ['amount', 'category'],
        raw_transcript: null,
        detected_language: detectedLang,
        stt_provider: sttResult.stt_provider,
        spokenResponse: friendlyHelp,
        confirmation_spoken: friendlyHelp,
        follow_up_question: friendlyHelp
      });
    }

    // 2. NLU Entity Extraction
    const parsedData = await parseUtterance(rawTranscript, { customTaxonomy });

    // 3. Handle Model A vs Model B
    let dbResult = null;
    let confirmationMessage = '';

    if (parsedData.missing_fields && parsedData.missing_fields.length > 0) {
      confirmationMessage = generateLocalizedFollowUp(parsedData, detectedLang);
    } else {
      confirmationMessage = generateLocalizedSpokenResponse({
        action: 'create',
        parsedData,
        lang: detectedLang
      });

      if (model.toUpperCase() === 'B' || autoCommit) {
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
    }

    return res.status(200).json({
      success: true,
      raw_transcript: rawTranscript,
      stt_provider: sttResult.stt_provider,
      detected_language: detectedLang,
      spokenResponse: confirmationMessage,
      confirmation_spoken: confirmationMessage,
      follow_up_question: confirmationMessage,
      parsedData,
      ...parsedData,
      model_used: model.toUpperCase(),
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

    const qLower = queryText.toLowerCase();
    let matchedCategory = null;
    for (const [type, catMap] of Object.entries(CATEGORY_SYNONYMS)) {
      for (const [catName, synonyms] of Object.entries(catMap)) {
        if (qLower.includes(catName.toLowerCase()) || synonyms.some(s => qLower.includes(s.toLowerCase()))) {
          matchedCategory = catName;
          break;
        }
      }
      if (matchedCategory) break;
    }

    let answer = `Found ${transactions.length} total records. Total Expenses: ₹${totalExpenses.toLocaleString('en-IN')}, Income: ₹${totalIncome.toLocaleString('en-IN')}, Investments: ₹${totalInvestments.toLocaleString('en-IN')}.`;
    if (matchedCategory) {
      const cLow = matchedCategory.toLowerCase();
      const filtered = transactions.filter(t =>
        (t.category || '').toLowerCase() === cLow ||
        (t.subType || '').toLowerCase() === cLow ||
        (t.notes || '').toLowerCase().includes(cLow)
      );
      const catTotal = filtered.reduce((sum, t) => sum + (t.amount || 0), 0);
      answer = `You have spent ₹${catTotal.toLocaleString('en-IN')} across ${filtered.length} transactions for ${matchedCategory}. Total overall expenses: ₹${totalExpenses.toLocaleString('en-IN')}.`;
    }

    // RAG analysis
    let ragResult = null;
    try {
      ragResult = await queryRag({ userId, query: queryText, k: 5 });
    } catch (e) {
      // ignore
    }

    return res.status(200).json({
      query: queryText,
      answer,
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
    const amount = parseFloat(req.body.amount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: 'A valid positive amount is required.' });
    }

    const result = await executeFirestoreCRUD('create', req.body, userId);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || 'Failed to create transaction' });
    }

    // Ingest into RAG vector store for instant retrieval
    try {
      await ingestTextForRag({
        userId,
        sourceId: result.docId,
        text: `${req.body.transaction_type || 'expense'} of ₹${amount} for ${req.body.category || 'General'} on ${req.body.date || new Date().toISOString().split('T')[0]}. Notes: ${req.body.notes || ''}`
      });
    } catch (_) {}

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
    if (!result.success) {
      return res.status(404).json({ success: false, error: result.error || 'Transaction not found or update failed' });
    }

    // Sync RAG embedding
    try {
      await removeEmbeddingBySourceId(id);
      if (req.body.amount) {
        await ingestTextForRag({
          userId,
          sourceId: id,
          text: `${req.body.transaction_type || type} of ₹${req.body.amount} for ${req.body.category || 'General'} on ${req.body.date || new Date().toISOString().split('T')[0]}. Notes: ${req.body.notes || ''}`
        });
      }
    } catch (_) {}

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
    if (!result.success) {
      return res.status(404).json({ success: false, error: result.error || 'Transaction not found or delete failed' });
    }

    // Remove from RAG
    try {
      await removeEmbeddingBySourceId(id);
    } catch (_) {}

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
    taxonomy: CATEGORY_TAXONOMY,
    subitems: CATEGORY_SUBITEMS
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

    // Auto-detect or use user-selected language (Tamil, Hindi, English, or mixed)
    const detectedLang = (req.body.language && req.body.language !== 'auto') ? req.body.language : detectLanguage(text);
    const lower = text.toLowerCase().trim();

    // Detect User Intent: DELETE, UPDATE, QUERY/READ, RAG_SUMMARY, or CREATE
    const isDelete = /\b(delete|remove|cancel|discard|erase|hatao|mitado|azhi|azhithuvidu|vendaam)\b/i.test(lower);
    const isUpdate = /\b(update|change|modify|correct|badlo|set|maathu|maathividu)\b/i.test(lower);
    const isQuery = /\b(what|how much|total|show|list|summary|spending|expenses|tell me|kitna|dekhao|kya|evvalavu|evlo|sollinga|kaatu)\b/i.test(lower);
    const isSummary = /\b(summary|overview|health|report|analysis|advice|motham|mothatham)\b/i.test(lower);

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
      if (dbResult && dbResult.success) {
        if (dbResult.docId) {
          try { await removeEmbeddingBySourceId(dbResult.docId); } catch (_) {}
        }
        spokenResponse = generateLocalizedSpokenResponse({
          action: 'delete',
          parsedData: dbResult.deletedData || parsedData,
          lang: detectedLang
        });
      } else {
        spokenResponse = dbResult?.error || (
          detectedLang === 'ta-IN' ? "நீக்க வேண்டிய பரிவர்த்தனை எதுவும் கிடைக்கவில்லை." :
          (detectedLang === 'hi-IN' ? "हटाने के लिए कोई लेनदेन नहीं मिला।" : "No transaction found to delete.")
        );
      }
    }
    // 2. Intent: UPDATE
    else if (isUpdate) {
      action_performed = 'update';
      parsedData = await parseUtterance(text, {});
      dbResult = await executeFirestoreCRUD('update', parsedData, userId);
      if (dbResult && dbResult.success) {
        const docId = dbResult.docId;
        if (docId) {
          try {
            await removeEmbeddingBySourceId(docId);
            const updated = dbResult.updatedFields || parsedData;
            await ingestTextForRag({
              userId,
              sourceId: docId,
              text: `${updated.transaction_type || 'expense'} of ₹${updated.amount} for ${updated.category || 'General'} on ${updated.date || new Date().toISOString().split('T')[0]}. Notes: ${updated.notes || ''}`
            });
          } catch (_) {}
        }
        spokenResponse = generateLocalizedSpokenResponse({
          action: 'update',
          parsedData: dbResult.updatedFields || parsedData,
          lang: detectedLang
        });
      } else {
        spokenResponse = dbResult?.error || (
          detectedLang === 'ta-IN' ? "மாற்ற வேண்டிய பரிவர்த்தனை எதுவும் கிடைக்கவில்லை." :
          (detectedLang === 'hi-IN' ? "अपडेट करने के लिए कोई लेनदेन नहीं मिला।" : "No transaction found to update.")
        );
      }
    }
    // 3. Intent: QUERY / RAG SUMMARY
    else if (isSummary || (isQuery && !/\b(spent|paid|bought|received|credited|invested|kuduthen|vanginen|diya|mila)\b/i.test(lower))) {
      action_performed = 'query';
      const allTx = await fetchAllTransactions(userId);
      const totalExp = allTx.filter(t => t.transaction_type === 'expense').reduce((acc, t) => acc + (t.amount || 0), 0);
      const totalInc = allTx.filter(t => t.transaction_type === 'income').reduce((acc, t) => acc + (t.amount || 0), 0);
      const totalInv = allTx.filter(t => t.transaction_type === 'investment').reduce((acc, t) => acc + (t.amount || 0), 0);

      // Check if query is targeting a specific category
      let matchedCategory = null;
      for (const [type, catMap] of Object.entries(CATEGORY_SYNONYMS)) {
        for (const [catName, synonyms] of Object.entries(catMap)) {
          if (lower.includes(catName.toLowerCase()) || synonyms.some(s => lower.includes(s.toLowerCase()))) {
            matchedCategory = catName;
            break;
          }
        }
        if (matchedCategory) break;
      }

      if (matchedCategory) {
        const cLow = matchedCategory.toLowerCase();
        const catFiltered = allTx.filter(t =>
          (t.category || '').toLowerCase() === cLow ||
          (t.subType || '').toLowerCase() === cLow ||
          (t.notes || '').toLowerCase().includes(cLow)
        );
        const catTotal = catFiltered.reduce((acc, t) => acc + (t.amount || 0), 0);
        if (detectedLang === 'ta-IN') {
          spokenResponse = `${matchedCategory}-ல் நீங்கள் மொத்தம் ₹${catTotal.toLocaleString('en-IN')} (${catFiltered.length} பரிவர்த்தனைகள்) செலவு செய்துள்ளீர்கள்.`;
        } else if (detectedLang === 'hi-IN') {
          spokenResponse = `${matchedCategory} पर आपने कुल ₹${catTotal.toLocaleString('en-IN')} (${catFiltered.length} लेनदेन) खर्च किए हैं।`;
        } else {
          spokenResponse = `You have spent ₹${catTotal.toLocaleString('en-IN')} across ${catFiltered.length} transactions on ${matchedCategory}. Total overall expenses: ₹${totalExp.toLocaleString('en-IN')}.`;
        }
      } else {
        spokenResponse = generateLocalizedSpokenResponse({
          action: 'query',
          parsedData: {},
          lang: detectedLang,
          totalExp,
          totalInc,
          totalInv,
          allCount: allTx.length
        });
      }

      try {
        ragResult = await queryRag({ userId, query: text, k: 4 });
      } catch (e) {
        // ignore
      }
    }
    // 4. Intent: CREATE (Default financial transaction parsing & logging)
    else {
      action_performed = 'create';
      parsedData = await parseUtterance(text, {});

      // Missing critical fields -> Ask clarification in detected language
      if (parsedData.missing_fields && parsedData.missing_fields.length > 0) {
        const followUp = generateLocalizedFollowUp(parsedData, detectedLang);
        return res.status(200).json({
          success: true,
          action_performed: 'clarification_needed',
          requires_clarification: true,
          detected_language: detectedLang,
          missing_fields: parsedData.missing_fields,
          spokenResponse: followUp,
          follow_up_question: followUp,
          parsedData
        });
      }

      // Guard: if NLU couldn't reliably parse key fields, ask for clarification
      if (!parsedData.amount || parsedData.amount <= 0 || !parsedData.category || parsedData.category === 'Other') {
        const followUp = generateLocalizedFollowUp(parsedData, detectedLang);
        return res.status(200).json({
          success: true,
          action_performed: 'clarification_needed',
          requires_clarification: true,
          detected_language: detectedLang,
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
          sourceId: dbResult?.docId || null,
          text: `${parsedData.transaction_type} of ₹${parsedData.amount} for ${parsedData.category} on ${parsedData.date}. Notes: ${parsedData.notes}`
        });
      } catch (e) {
        // ignore
      }

      spokenResponse = generateLocalizedSpokenResponse({
        action: 'create',
        parsedData,
        lang: detectedLang
      });
    }

    // Refresh all transactions list
    const updatedTransactions = await fetchAllTransactions(userId);

    return res.status(200).json({
      success: true,
      action_performed,
      detected_language: detectedLang,
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
  const firestoreMode = getFirestoreMode();
  return res.status(200).json({
    status: 'online',
    service: 'LigthsON Voice-Enabled Transaction Agent API',
    version: '1.1.0',
    timestamp: new Date().toISOString(),
    supported_models: ['Model A (Voice/NLU JSON)', 'Model B (Voice/NLU + Direct Firestore CRUD)'],
    firestore_mode: firestoreMode,
    livekit_enabled: true,
    rag_enabled: true,
    nlu_enabled: true,
    llm_enabled: Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY),
    stt_provider: process.env.OPENAI_API_KEY ? 'OpenAI Whisper' : (process.env.GROQ_API_KEY ? 'Groq Whisper' : 'Gemini Flash STT')
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
function generateConfirmationText(data, lang = 'en-IN') {
  return generateLocalizedSpokenResponse({ action: 'create', parsedData: data, lang });
}

function generateFollowUpQuestion(data, lang = 'en-IN') {
  return generateLocalizedFollowUp(data, lang);
}


