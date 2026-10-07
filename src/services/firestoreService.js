import { getFirestore, isFirebaseConfigured } from '../config/firebase.js';

// ── Server-Sent Events (SSE) — notify connected browser tabs after any CRUD ──
const sseClients = new Set();

export function registerSseClient(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering
  res.flushHeaders();
  // Heartbeat every 25s to keep connection alive through proxies
  const heartbeat = setInterval(() => res.write(':heartbeat\n\n'), 25000);
  sseClients.add(res);
  res.on('close', () => { clearInterval(heartbeat); sseClients.delete(res); });
}

export function broadcastCrudEvent(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try { client.write(payload); } catch (_) { sseClients.delete(client); }
  }
}

/**
 * Returns the current Firestore mode for the health endpoint.
 */
export function getFirestoreMode() {
  return isFirebaseConfigured() ? 'live_firestore' : 'in_memory_sandbox';
}

// In-memory ledger cache for development / sandbox / fallback mode
const inMemoryStore = {
  users: {
    default_user: {
      transactions: [],
      goals: [],
      expenses: [
        {
          id: 'exp_seed_1',
          amount: 540,
          category: 'Groceries',
          currency: 'INR',
          date: new Date().toISOString().split('T')[0],
          notes: 'Organic vegetables and milk',
          source: 'voice_agent',
          confidence: 0.95,
          createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
          updatedAt: new Date(Date.now() - 3600000 * 4).toISOString()
        },
        {
          id: 'exp_seed_2',
          amount: 1200,
          category: 'Dining Out',
          currency: 'INR',
          date: new Date().toISOString().split('T')[0],
          notes: 'Dinner at restaurant with friends',
          source: 'voice_agent',
          confidence: 0.92,
          createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
          updatedAt: new Date(Date.now() - 3600000 * 12).toISOString()
        }
      ],
      income: [
        {
          id: 'inc_seed_1',
          amount: 65000,
          category: 'Salary',
          currency: 'INR',
          date: new Date().toISOString().split('T')[0],
          notes: 'Monthly salary credited',
          source: 'voice_agent',
          confidence: 0.98,
          createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
          updatedAt: new Date(Date.now() - 86400000 * 3).toISOString()
        }
      ],
      investments: [
        {
          id: 'inv_seed_1',
          amount: 5000,
          category: 'Mutual Funds',
          currency: 'INR',
          date: new Date().toISOString().split('T')[0],
          notes: 'Nifty 50 Index Fund SIP',
          source: 'voice_agent',
          confidence: 0.96,
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          updatedAt: new Date(Date.now() - 86400000 * 2).toISOString()
        }
      ]
    }
  }
};

function getOrCreateUserStore(userId) {
  if (!inMemoryStore.users[userId]) {
    inMemoryStore.users[userId] = {
      transactions: [],
      goals: [],
      expenses: [],
      income: [],
      investments: []
    };
  }
  return inMemoryStore.users[userId];
}

/**
 * Execute Firestore CRUD operations for Model B integration
 * Collections:
 * - users/{userId}/income
 * - users/{userId}/expenses
 * - users/{userId}/investments
 */
export function normalizeSubType(type, category, notes = '') {
  const normType = (type || '').toLowerCase();
  const text = `${category || ''} ${notes || ''}`.toLowerCase();

  if (normType === 'income') {
    if (category === 'Passive' || category === 'Active') return category;
    if (/\b(passive|dividend|dividends|interest|rental|rent received|capital gains|chit|seetu|business profit|store sale)\b/i.test(text)) {
      return 'Passive';
    }
    return 'Active';
  }

  if (normType === 'expense') {
    if (category === 'Mandatory' || category === 'Discretionary' || category === 'Essential') {
      return category;
    }
    if (/\b(mandatory|emi|loan|insurance|lic|tax|taxes|ppf|vpf|epf|tuition fee)\b/i.test(text)) {
      return 'Mandatory';
    }
    if (/\b(discretionary|dining|restaurant|food dining|entertainment|movie|cinema|shopping|luxury|travel|trip|gift|gifts|party|fun|clothes|dress)\b/i.test(text)) {
      return 'Discretionary';
    }
    return 'Essential';
  }

  return category || 'Other';
}

/**
 * Execute Firestore CRUD operations for Model B integration
 * Collections:
 * - users/{userId}/income
 * - users/{userId}/expenses
 * - users/{userId}/investments
 */
export async function executeFirestoreCRUD(operation, data, userId = 'default_user') {
  const entityType = String(data.entityType || data.entity_type || data.recordType || '').toLowerCase();
  const isGoal = entityType === 'goal' || entityType === 'goals';
  const transactionType = String(data.transaction_type || data.type || '').toLowerCase();
  const isInvestment = transactionType === 'investment' || entityType === 'investment' || entityType === 'investments';
  const collectionName = isGoal ? 'goals' : (isInvestment ? 'investments' : 'transactions');
  const path = `users/${userId}/${collectionName}`;
  const recordId = data.docId || data.recordId || data.record_id || data.documentId ||
    data.transactionId || data.transaction_id || data.investmentId || data.investment_id ||
    data.targetId || data.target_id || data.id || (isGoal ? data.goalId || data.goal_id : null);
  const now = new Date();
  const amount = data.amount === undefined || data.amount === null ? undefined : Number(data.amount);
  if (!['create', 'read', 'update', 'delete'].includes(operation)) {
    return { success: false, error: `Unsupported CRUD operation: ${operation}` };
  }
  if (!isGoal && !isInvestment && operation !== 'read' && !['expense', 'income', 'investment'].includes(transactionType)) {
    return { success: false, error: 'transaction_type must be expense, income, or investment.' };
  }
  if (operation !== 'read' && !userId) {
    return { success: false, error: 'A user ID is required for this operation.' };
  }
  if ((operation === 'update' || operation === 'delete') && !recordId) {
    return { success: false, error: `${operation} requires an exact record ID; refusing to guess a record.` };
  }
  if (operation === 'create' && (isGoal
    ? !(data.name || data.goalName || data.goal_name || data.customName)
    : (!Number.isFinite(amount) || amount <= 0 || !transactionType))) {
    return { success: false, error: 'Create requires a goal name or a positive amount and transaction type.' };
  }

  const subtype = normalizeSubType(transactionType, data.category, data.notes);
  const rawPayload = isGoal
    ? {
        name: data.name || data.goalName || data.goal_name || data.customName,
        goalName: data.goalName || data.goal_name || data.customName || data.name,
        customName: data.customName || data.name || data.goalName || data.goal_name,
        description: data.description || '',
        presentCost: data.presentCost === undefined ? amount : Number(data.presentCost),
        years: data.years === undefined ? undefined : Number(data.years),
        inflation: data.inflation === undefined ? undefined : Number(data.inflation),
        returnRate: data.returnRate === undefined ? undefined : Number(data.returnRate),
        currentSip: data.currentSip === undefined ? undefined : Number(data.currentSip),
        investmentType: data.investmentType || 'SIP/MF',
        entityType: 'goal',
        updatedAt: now.toISOString()
      }
    : isInvestment
      ? {
          name: data.name || data.notes || data.companyName || data.company_name || data.investmentType || data.category || 'Investment',
          amount,
          currentAmount: data.currentAmount === undefined ? amount : Number(data.currentAmount),
          investmentType: data.investmentType || data.investment_type || data.assetType || data.category || 'Other',
          goalId: data.goalId || data.goal_id || null,
          goalName: data.goalName || data.goal_name || null,
          companyName: data.companyName || data.company_name || data.company || null,
          symbol: data.symbol || data.stockSymbol || null,
          category: data.category || data.investmentType || 'Investment',
          date: data.date || now.toISOString().slice(0, 10),
          notes: data.notes || '',
          interestRate: data.interestRate === undefined ? undefined : Number(data.interestRate),
          maturityDate: data.maturityDate,
          startDate: data.startDate,
          duration: data.duration === undefined ? undefined : Number(data.duration),
          monthlyDeposit: data.monthlyDeposit === undefined ? undefined : Number(data.monthlyDeposit),
          units: data.units === undefined ? undefined : Number(data.units),
          schemeCode: data.schemeCode,
          description: data.description,
          source: 'voice_agent',
          confidence: Number.isFinite(Number(data.confidence)) ? Number(data.confidence) : 0.95,
          updatedAt: now.toISOString()
        }
      : {
          name: data.name || (data.notes ? data.notes.slice(0, 30) : data.category || 'Transaction'),
          amount,
          type: transactionType === 'income' ? 'Income' : 'Expense',
          subType: subtype,
          category: data.category || 'General',
          method: data.method || 'Voice Agent',
          currency: data.currency || 'INR',
          date: data.date || now.toISOString().slice(0, 10),
          notes: data.notes || '',
          source: 'voice_agent',
          confidence: Number.isFinite(Number(data.confidence)) ? Number(data.confidence) : 0.95,
          updatedAt: now.toISOString()
        };
  const payload = Object.fromEntries(Object.entries(rawPayload).filter(([, value]) => value !== undefined));

  if (!isFirebaseConfigured()) {
    const userStore = getOrCreateUserStore(userId);
    const storeCollection = userStore[collectionName] || (userStore[collectionName] = []);

    if (operation === 'create') {
      if (data.requestId) {
        const prior = storeCollection.find(record => record.requestId === data.requestId);
        if (prior) return { success: true, mode: 'in_memory_sandbox', operation, docId: prior.id, duplicate_prevented: true, data: prior };
      }
      const docId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const newRecord = {
        id: docId,
        ...payload,
        requestId: data.requestId || undefined,
        transaction_type: transactionType || (isGoal ? 'goal' : undefined),
        createdAt: now.toISOString()
      };
      storeCollection.unshift(newRecord);
      userStore[collectionName] = storeCollection;
      let ledgerRecord = newRecord;
      if (isInvestment) {
        ledgerRecord = {
          id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: newRecord.name || newRecord.notes || newRecord.investmentType,
          amount: newRecord.amount,
          type: 'Investment',
          subType: newRecord.investmentType,
          category: newRecord.category,
          date: newRecord.date,
          notes: newRecord.notes,
          source: 'voice_agent',
          investmentDocId: docId,
          requestId: data.requestId || undefined,
          transaction_type: 'investment',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        };
        userStore.transactions.unshift(ledgerRecord);
      } else if (!isGoal && collectionName !== 'transactions') {
        ledgerRecord = { ...newRecord, transaction_type: transactionType };
        userStore.transactions.unshift(ledgerRecord);
      } else if (!isGoal) {
        ledgerRecord = { ...newRecord, transaction_type: transactionType };
      }
      broadcastCrudEvent({ type: 'create', userId, collectionName, docId, record: newRecord });
      return {
        success: true,
        mode: 'in_memory_sandbox',
        operation: 'create',
        docId: docId,
        mainTxId: isGoal ? null : ledgerRecord.id,
        path: `${path}/${docId}`,
        data: newRecord
      };
    }

    if (operation === 'read') {
      const records = isGoal
        ? storeCollection
        : isInvestment
          ? storeCollection
          : userStore.transactions;
      return {
        success: true,
        mode: 'in_memory_sandbox',
        operation: 'read',
        count: records.length,
        records
      };
    }

    const targetIndex = storeCollection.findIndex(record => record.id === recordId);
    if (targetIndex < 0) {
      return { success: false, mode: 'in_memory_sandbox', operation, error: `Record ${recordId} was not found in ${collectionName}.` };
    }
    const existing = storeCollection[targetIndex];
    if (operation === 'update') {
      const changes = {};
      if (amount !== undefined) changes[isGoal ? 'presentCost' : 'amount'] = amount;
      for (const field of ['name', 'category', 'subType', 'date', 'notes', 'method', 'currentAmount', 'investmentType', 'goalId', 'goalName', 'companyName', 'symbol', 'description', 'presentCost', 'years', 'inflation', 'returnRate', 'currentSip']) {
        if (data[field] !== undefined) changes[field] = data[field];
      }
      if (isGoal && !changes.name) {
        changes.name = data.goalName || data.goal_name || data.customName;
      }
      if (isGoal && changes.name) changes.goalName = changes.name;
      Object.assign(existing, changes, { updatedAt: now.toISOString() });
      if (isInvestment) {
        userStore.transactions.forEach(tx => {
          if (tx.investmentDocId === recordId) Object.assign(tx, { amount: changes.amount ?? tx.amount, name: changes.name ?? tx.name, notes: changes.notes ?? tx.notes, updatedAt: now.toISOString() });
        });
      }
      broadcastCrudEvent({ type: 'update', userId, collectionName, docId: recordId });
      return { success: true, mode: 'in_memory_sandbox', operation, docId: recordId, updatedFields: existing };
    }

    if (isGoal && userStore.investments.some(investment => investment.goalId === recordId)) {
      return {
        success: false,
        mode: 'in_memory_sandbox',
        operation,
        error: 'This goal has linked investments. Reassign or remove them before deleting the goal.'
      };
    }
    storeCollection.splice(targetIndex, 1);
    if (isInvestment) {
      userStore.transactions = userStore.transactions.filter(tx => tx.investmentDocId !== recordId);
    }
    broadcastCrudEvent({ type: 'delete', userId, collectionName, docId: recordId });
    return { success: true, mode: 'in_memory_sandbox', operation, docId: recordId, deletedData: existing };
  }

  const db = getFirestore();

  try {
    if (operation === 'create') {
      if (data.requestId) {
        const existing = await db.collection(path).where('requestId', '==', data.requestId).limit(1).get();
        if (!existing.empty) {
          const prior = existing.docs[0];
          return { success: true, mode: 'live_firestore', operation, docId: prior.id, duplicate_prevented: true, data: prior.data() };
        }
      }

      const docRef = await db.collection(path).add({
        ...payload,
        requestId: data.requestId || undefined,
        transaction_type: transactionType || (isGoal ? 'goal' : undefined),
        createdAt: now,
        updatedAt: now
      });
      let mainTxId = null;
      if (isInvestment) {
        const ledgerRef = await db.collection(`users/${userId}/transactions`).add({
          name: payload.name || payload.notes || payload.investmentType,
          amount: payload.amount,
          type: 'Investment',
          subType: payload.investmentType,
          category: payload.category,
          date: payload.date,
          notes: payload.notes || '',
          source: 'voice_agent',
          confidence: payload.confidence,
          investmentDocId: docRef.id,
          requestId: data.requestId || undefined,
          createdAt: now,
          updatedAt: now
        });
        mainTxId = ledgerRef.id;
        await db.collection(path).doc(docRef.id).update({ ledgerTransactionId: mainTxId });
      } else if (!isGoal) {
        mainTxId = docRef.id;
      }

      broadcastCrudEvent({ type: 'create', userId, collectionName, docId: docRef.id, mainTxId });
      return {
        success: true,
        mode: 'live_firestore',
        operation: 'create',
        docId: docRef.id,
        mainTxId: mainTxId,
        path: `${path}/${docRef.id}`,
        data: payload
      };
    }

    if (operation === 'read') {
      const snapshot = await db.collection(path).get();

      const records = [];
      snapshot.forEach(doc => records.push({ id: doc.id, ...doc.data() }));
      records.sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));

      return {
        success: true,
        mode: 'live_firestore',
        operation: 'read',
        count: records.length,
        records
      };
    }

    if (operation === 'update') {
      const allowedFields = isGoal
        ? ['name', 'customName', 'description', 'presentCost', 'years', 'inflation', 'returnRate', 'currentSip', 'investmentType', 'goalAge', 'childCurrentAge', 'currentAge', 'goalName']
        : isInvestment
          ? ['name', 'amount', 'currentAmount', 'category', 'investmentType', 'goalId', 'goalName', 'companyName', 'symbol', 'date', 'notes', 'interestRate', 'maturityDate', 'description', 'units', 'schemeCode']
          : ['name', 'amount', 'category', 'subType', 'date', 'notes', 'method'];
      const changes = {};
      for (const field of allowedFields) {
        if (isGoal && field === 'presentCost') {
          if (data.presentCost !== undefined || amount !== undefined) changes.presentCost = Number(data.presentCost ?? amount);
        } else if (isGoal && field === 'goalName') {
          if (data.goalName || data.goal_name) changes.name = data.goalName || data.goal_name;
        } else if (field === 'amount') {
          if (amount !== undefined) changes.amount = amount;
        } else if (data[field] !== undefined) {
          changes[field] = data[field];
        }
      }
      if (isGoal && changes.name) changes.goalName = changes.name;
      if (Object.keys(changes).length === 0) {
        return { success: false, mode: 'live_firestore', operation, error: 'No editable fields were provided.' };
      }
      changes.updatedAt = now;

      const recordRef = db.collection(path).doc(recordId);
      const recordSnapshot = await recordRef.get();
      if (!recordSnapshot.exists) {
        return { success: false, mode: 'live_firestore', operation, error: `Record ${recordId} was not found in ${collectionName}.` };
      }
      const existing = recordSnapshot.data();
      await recordRef.update(changes);

      if (isInvestment) {
        const ledger = await db.collection(`users/${userId}/transactions`)
          .where('investmentDocId', '==', recordId).get();
        for (const ledgerDoc of ledger.docs) {
          const ledgerChanges = { updatedAt: now };
          if (changes.amount !== undefined) ledgerChanges.amount = changes.amount;
          if (changes.name !== undefined) ledgerChanges.name = changes.name;
          if (changes.category !== undefined) ledgerChanges.category = changes.category;
          if (changes.notes !== undefined) ledgerChanges.notes = changes.notes;
          await ledgerDoc.ref.update(ledgerChanges);
        }
      }

      broadcastCrudEvent({ type: 'update', userId, collectionName, docId: recordId });
      return { success: true, mode: 'live_firestore', operation, docId: recordId, updatedFields: { ...existing, ...changes } };
    }

    if (operation === 'delete') {
      const recordRef = db.collection(path).doc(recordId);
      const recordSnapshot = await recordRef.get();
      if (!recordSnapshot.exists) {
        return { success: false, mode: 'live_firestore', operation, error: `Record ${recordId} was not found in ${collectionName}.` };
      }
      const deletedData = recordSnapshot.data();

      if (isGoal) {
        const linkedInvestments = await db.collection(`users/${userId}/investments`)
          .where('goalId', '==', recordId).get();
        if (!linkedInvestments.empty) {
          return { success: false, mode: 'live_firestore', operation, error: 'This goal has linked investments. Reassign or remove them before deleting the goal.' };
        }
      }

      if (isInvestment) {
        const ledger = await db.collection(`users/${userId}/transactions`)
          .where('investmentDocId', '==', recordId).get();
        for (const ledgerDoc of ledger.docs) await ledgerDoc.ref.delete();
      }
      await recordRef.delete();

      broadcastCrudEvent({ type: 'delete', userId, collectionName, docId: recordId });
      return { success: true, mode: 'live_firestore', operation, docId: recordId, deletedData };
    }
  } catch (error) {
    console.error(`Live Firestore ${operation} failed in ${path}:`, error);
    return { success: false, mode: 'live_firestore', operation, error: error.message || 'Firestore operation failed.' };
  }
}

/**
 * Fetch all transactions across income, expenses, investments for a user
 */
export async function fetchAllTransactions(userId = 'default_user') {
  const collections = ['expenses', 'income', 'investments'];
  let allRecords = [];

  if (!isFirebaseConfigured()) {
    const userStore = getOrCreateUserStore(userId);
    allRecords.push(...(userStore.transactions || []));
    for (const col of collections) {
      const records = (userStore[col] || [])
        .filter(record => col !== 'investments' ||
          !(userStore.transactions || []).some(transaction => transaction.investmentDocId === record.id))
        .map(r => ({
        ...r,
        transaction_type: col === 'investments' ? 'investment' : (col === 'income' ? 'income' : 'expense')
      }));
      allRecords.push(...records);
    }
    allRecords.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
    return allRecords;
  }

  const db = getFirestore();
  try {
    const seenIds = new Set();
    // 1. Read from main mobile collection: users/{userId}/transactions
    try {
      const mainSnap = await db.collection(`users/${userId}/transactions`).orderBy('date', 'desc').limit(50).get();
      mainSnap.forEach(doc => {
        const data = doc.data();
        seenIds.add(doc.id);
        if (data.subCollectionDocId) seenIds.add(data.subCollectionDocId);
        if (data.investmentDocId) seenIds.add(data.investmentDocId);
        const rawType = (data.type || '').toLowerCase();
        const txType = rawType === 'income' ? 'income' : (rawType === 'investment' ? 'investment' : 'expense');
        allRecords.push({
          id: doc.id,
          amount: typeof data.amount === 'number' ? data.amount : parseFloat(data.amount) || 0,
          category: data.category || data.name || data.subType || 'General',
          transaction_type: txType,
          date: data.date || new Date().toISOString().split('T')[0],
          notes: data.notes || '',
          source: data.source || 'mobile_app',
          confidence: data.confidence || 1.0,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt
        });
      });
    } catch (mErr) {
      throw mErr;
    }

    // 2. Also read from subcollections for backward compatibility
    for (const col of collections) {
      const path = `users/${userId}/${col}`;
      const snap = await db.collection(path).get();
      snap.forEach(doc => {
        if (!seenIds.has(doc.id)) {
          seenIds.add(doc.id);
          const data = doc.data();
          allRecords.push({
            id: doc.id,
            ...data,
            transaction_type: col === 'investments' ? 'investment' : (col === 'income' ? 'income' : 'expense'),
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt
          });
        }
      });
    }
    allRecords.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
    return allRecords;
  } catch (e) {
    console.error(`Live Firestore read failed for user ${userId}:`, e);
    throw e;
  }
}

export function getCollectionName(type) {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'income') return 'transactions';
  if (normalized === 'investment') return 'investments';
  if (normalized === 'expense') return 'transactions';
  if (normalized === 'goal' || normalized === 'goals') return 'goals';
  throw new Error(`Unsupported record type: ${type}`);
}
