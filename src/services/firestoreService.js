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
    // Clone seed data for fresh user sessions so they immediately have a working sandbox ledger
    const defaultData = inMemoryStore.users.default_user || { expenses: [], income: [], investments: [] };
    inMemoryStore.users[userId] = {
      expenses: defaultData.expenses.map(r => ({ ...r, id: `exp_${userId}_${Math.random().toString(36).substr(2, 6)}` })),
      income: defaultData.income.map(r => ({ ...r, id: `inc_${userId}_${Math.random().toString(36).substr(2, 6)}` })),
      investments: defaultData.investments.map(r => ({ ...r, id: `inv_${userId}_${Math.random().toString(36).substr(2, 6)}` }))
    };
  }
  return inMemoryStore.users[userId];
}

/**
 * Normalize financial sub-type classifications
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
 */
export async function executeFirestoreCRUD(operation, data, userId = 'default_user') {
  const collectionName = getCollectionName(data.transaction_type);
  const path = `users/${userId}/${collectionName}`;

  const standardizedSubType = normalizeSubType(data.transaction_type, data.category, data.notes);
  // Preserve user-specified category (e.g. Groceries, Dinner, Salary) while capturing taxonomy subType
  const userCategory = (data.category && data.category !== 'Other' && data.category !== 'General')
    ? data.category
    : (data.category || standardizedSubType);

  const payload = {
    amount: typeof data.amount === 'number' ? data.amount : parseFloat(data.amount) || 0,
    category: userCategory,
    subType: standardizedSubType,
    currency: data.currency || 'INR',
    date: data.date || new Date().toISOString().split('T')[0],
    notes: data.notes || '',
    source: 'voice_agent',
    confidence: data.confidence || 0.95,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // ──────────────── In-Memory Sandbox / Fallback Mode ────────────────
  if (!isFirebaseConfigured()) {
    const userStore = getOrCreateUserStore(userId);
    const storeCollection = userStore[collectionName] || [];

    if (operation === 'create') {
      const docId = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const newRecord = { id: docId, ...payload, transaction_type: data.transaction_type || 'expense' };
      storeCollection.unshift(newRecord);
      userStore[collectionName] = storeCollection;
      broadcastCrudEvent({ type: 'create', userId, collectionName, docId, record: newRecord });
      return {
        success: true,
        mode: 'in_memory_sandbox',
        operation: 'create',
        docId,
        path: `${path}/${docId}`,
        data: newRecord
      };
    }

    if (operation === 'read') {
      if (data.docId) {
        let found = storeCollection.find(r => r.id === data.docId);
        if (!found) {
          for (const col of ['expenses', 'income', 'investments']) {
            found = (userStore[col] || []).find(r => r.id === data.docId);
            if (found) break;
          }
        }
        return {
          success: Boolean(found),
          mode: 'in_memory_sandbox',
          operation: 'read',
          record: found || null
        };
      }
      return {
        success: true,
        mode: 'in_memory_sandbox',
        operation: 'read',
        count: storeCollection.length,
        records: storeCollection
      };
    }

    if (operation === 'update') {
      let targetIndex = -1;
      let targetColName = collectionName;
      let targetArray = storeCollection;

      if (data.docId) {
        targetIndex = storeCollection.findIndex(r => r.id === data.docId);
        if (targetIndex === -1) {
          for (const col of ['expenses', 'income', 'investments']) {
            const idx = (userStore[col] || []).findIndex(r => r.id === data.docId);
            if (idx !== -1) {
              targetIndex = idx;
              targetColName = col;
              targetArray = userStore[col];
              break;
            }
          }
        }
      } else if (data.category && data.category !== 'Other' && data.category !== 'General') {
        const catLower = data.category.toLowerCase();
        targetIndex = storeCollection.findIndex(r =>
          (r.category || '').toLowerCase() === catLower ||
          (r.notes || '').toLowerCase().includes(catLower)
        );
      } else if (data.amount && !isNaN(Number(data.amount))) {
        targetIndex = storeCollection.findIndex(r => Number(r.amount) === Number(data.amount));
      } else {
        targetIndex = 0; // Most recent
      }

      if (targetIndex === -1 || !targetArray[targetIndex]) {
        return {
          success: false,
          error: `No matching ${data.category || collectionName} transaction found to update.`
        };
      }

      const existing = targetArray[targetIndex];
      const newType = data.transaction_type ? data.transaction_type.toLowerCase() : existing.transaction_type;
      const newColName = getCollectionName(newType);

      const updated = {
        ...existing,
        amount: (data.amount !== undefined && data.amount !== null && !isNaN(Number(data.amount))) ? Number(data.amount) : existing.amount,
        category: (data.category && data.category !== 'Other' && data.category !== 'General') ? data.category : (data.category || existing.category),
        subType: standardizedSubType || existing.subType || existing.category,
        date: data.date || existing.date,
        notes: data.notes !== undefined ? data.notes : existing.notes,
        transaction_type: newType,
        updatedAt: new Date().toISOString()
      };

      if (newColName !== targetColName) {
        // Moved across collections
        targetArray.splice(targetIndex, 1);
        if (!userStore[newColName]) userStore[newColName] = [];
        userStore[newColName].unshift(updated);
      } else {
        targetArray[targetIndex] = updated;
      }

      broadcastCrudEvent({ type: 'update', userId, collectionName: newColName, docId: existing.id, record: updated });
      return {
        success: true,
        mode: 'in_memory_sandbox',
        operation: 'update',
        docId: existing.id,
        updatedFields: updated
      };
    }

    if (operation === 'delete') {
      let targetIndex = -1;
      let targetColName = collectionName;
      let targetArray = storeCollection;

      if (data.docId) {
        targetIndex = storeCollection.findIndex(r => r.id === data.docId);
        if (targetIndex === -1) {
          for (const col of ['expenses', 'income', 'investments']) {
            const idx = (userStore[col] || []).findIndex(r => r.id === data.docId);
            if (idx !== -1) {
              targetIndex = idx;
              targetColName = col;
              targetArray = userStore[col];
              break;
            }
          }
        }
      } else if (data.category && data.category !== 'Other' && data.category !== 'General') {
        const catLower = data.category.toLowerCase();
        targetIndex = storeCollection.findIndex(r =>
          (r.category || '').toLowerCase() === catLower ||
          (r.notes || '').toLowerCase().includes(catLower)
        );
      } else if (data.amount && !isNaN(Number(data.amount))) {
        targetIndex = storeCollection.findIndex(r => Number(r.amount) === Number(data.amount));
      } else {
        targetIndex = 0; // Most recent
      }

      if (targetIndex === -1 || !targetArray[targetIndex]) {
        return {
          success: false,
          error: `No recent transaction found in ${collectionName} to delete.`
        };
      }

      const deletedItem = targetArray.splice(targetIndex, 1)[0];
      broadcastCrudEvent({ type: 'delete', userId, collectionName: targetColName, docId: deletedItem.id });
      return {
        success: true,
        mode: 'in_memory_sandbox',
        operation: 'delete',
        docId: deletedItem.id,
        deletedData: deletedItem
      };
    }
  }

  // ──────────────── Live Firestore Mode ────────────────
  const db = getFirestore();

  try {
    if (operation === 'create') {
      const mainTxPath = `users/${userId}/transactions`;
      const txType = data.transaction_type === 'income' ? 'Income' : (data.transaction_type === 'investment' ? 'Investment' : 'Expense');

      // Duplicate prevention check BEFORE writing anything to avoid orphaned documents
      try {
        const recentDocs = await db.collection(mainTxPath)
          .where('date', '==', payload.date)
          .where('amount', '==', payload.amount)
          .get();

        let isDuplicate = false;
        let existingMainId = null;
        const nowMs = Date.now();
        recentDocs.forEach(d => {
          const itemData = d.data();
          const createdMs = itemData.createdAt?.toDate ? itemData.createdAt.toDate().getTime() : (itemData.createdAt ? new Date(itemData.createdAt).getTime() : 0);
          if (nowMs - createdMs < 8000 && itemData.type === txType) {
            isDuplicate = true;
            existingMainId = d.id;
          }
        });

        if (isDuplicate) {
          console.log(`⚠️ Prevented duplicate transaction creation for ${payload.date} ₹${payload.amount}`);
          return {
            success: true,
            mode: 'live_firestore',
            operation: 'create',
            docId: existingMainId,
            mainTxId: existingMainId,
            data: payload,
            duplicate_prevented: true
          };
        }
      } catch (dupErr) {
        console.warn('Duplicate check warning:', dupErr.message);
      }

      // 1. Add to subcollection
      const docRef = await db.collection(path).add({
        ...payload,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // 2. Dual-write to primary mobile app collection: users/{userId}/transactions
      let mainTxId = null;
      try {
        const mainTxRef = await db.collection(mainTxPath).add({
          name: data.notes ? (data.notes.length > 30 ? data.notes.slice(0, 30) + '...' : data.notes) : payload.category,
          amount: payload.amount,
          type: txType,
          subType: payload.subType || payload.category,
          category: payload.category,
          date: payload.date,
          notes: payload.notes || '',
          source: 'voice_agent',
          confidence: payload.confidence,
          subCollectionDocId: docRef.id,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        mainTxId = mainTxRef.id;
      } catch (mainErr) {
        console.warn('⚠️ Could not dual-write to users/{userId}/transactions:', mainErr.message);
      }

      broadcastCrudEvent({ type: 'create', userId, collectionName, docId: docRef.id, mainTxId, record: payload });
      return {
        success: true,
        mode: 'live_firestore',
        operation: 'create',
        docId: docRef.id,
        mainTxId,
        path: `${path}/${docRef.id}`,
        data: payload
      };
    }

    if (operation === 'read') {
      if (data.docId) {
        // Try reading from transactions first, then subcollection
        try {
          const mainSnap = await db.collection(`users/${userId}/transactions`).doc(data.docId).get();
          if (mainSnap.exists) {
            return { success: true, mode: 'live_firestore', operation: 'read', record: { id: mainSnap.id, ...mainSnap.data() } };
          }
        } catch (_) {}

        try {
          const subSnap = await db.collection(path).doc(data.docId).get();
          if (subSnap.exists) {
            return { success: true, mode: 'live_firestore', operation: 'read', record: { id: subSnap.id, ...subSnap.data() } };
          }
        } catch (_) {}

        return { success: false, mode: 'live_firestore', operation: 'read', record: null };
      }

      const snapshot = await db.collection(path)
        .orderBy('date', 'desc')
        .limit(25)
        .get();

      const records = [];
      snapshot.forEach(doc => records.push({ id: doc.id, ...doc.data() }));

      return {
        success: true,
        mode: 'live_firestore',
        operation: 'read',
        count: records.length,
        records
      };
    }

    if (operation === 'update') {
      const updateData = {
        updatedAt: new Date()
      };
      if (data.amount !== undefined && data.amount !== null && !isNaN(parseFloat(data.amount))) {
        updateData.amount = parseFloat(data.amount);
      }
      if (data.category && data.category !== 'Other') {
        updateData.category = userCategory;
        updateData.subType = standardizedSubType;
      }
      if (data.date) {
        updateData.date = data.date;
      }
      if (data.notes !== undefined) {
        updateData.notes = data.notes;
      }
      if (data.transaction_type) {
        const rawT = data.transaction_type.toLowerCase();
        updateData.type = rawT === 'income' ? 'Income' : (rawT === 'investment' ? 'Investment' : 'Expense');
      }

      let updatedAny = false;

      if (data.docId) {
        let subDocId = null;

        // 1. Check primary mobile collection users/{userId}/transactions
        try {
          const mainTxRef = db.collection(`users/${userId}/transactions`).doc(data.docId);
          const mainSnap = await mainTxRef.get();
          if (mainSnap.exists) {
            const mData = mainSnap.data();
            subDocId = mData.subCollectionDocId;
            const mainUpdate = { ...updateData };
            if (updateData.category || updateData.notes) {
              mainUpdate.name = data.notes ? (data.notes.length > 30 ? data.notes.slice(0, 30) + '...' : data.notes) : (updateData.category || mData.category);
            }
            await mainTxRef.update(mainUpdate);
            updatedAny = true;
          }
        } catch (_) {}

        // 2. Also check if docId was a subCollectionDocId in transactions
        try {
          const mainTwins = await db.collection(`users/${userId}/transactions`)
            .where('subCollectionDocId', '==', data.docId)
            .get();
          if (!mainTwins.empty) {
            for (const d of mainTwins.docs) {
              const mData = d.data();
              const mainUpdate = { ...updateData };
              if (updateData.category || updateData.notes) {
                mainUpdate.name = data.notes ? (data.notes.length > 30 ? data.notes.slice(0, 30) + '...' : data.notes) : (updateData.category || mData.category);
              }
              await d.ref.update(mainUpdate);
              updatedAny = true;
            }
          }
        } catch (_) {}

        // 3. Update in subcollections
        const targetSubId = subDocId || data.docId;
        const subCollectionsToCheck = ['expenses', 'income', 'investments'];
        for (const col of subCollectionsToCheck) {
          try {
            const subRef = db.collection(`users/${userId}/${col}`).doc(targetSubId);
            const subSnap = await subRef.get();
            if (subSnap.exists) {
              const subUpdate = { ...updateData };
              delete subUpdate.type;
              await subRef.update(subUpdate);
              updatedAny = true;
            }
          } catch (_) {}
        }

        if (!updatedAny) {
          return {
            success: false,
            error: `No transaction with ID ${data.docId} found to update.`
          };
        }

        broadcastCrudEvent({ type: 'update', userId, collectionName, docId: data.docId, updatedFields: updateData });
        return {
          success: true,
          mode: 'live_firestore',
          operation: 'update',
          docId: data.docId,
          updatedFields: updateData
        };
      }

      // Voice / Natural language update without docId
      // Avoid composite query requiring index: fetch recent documents and find target in memory
      let targetDoc = null;
      let targetCollection = collectionName;

      try {
        const snap = await db.collection(path).limit(20).get();
        const candidateDocs = [];
        snap.forEach(d => candidateDocs.push({ id: d.id, ref: d.ref, ...d.data() }));
        candidateDocs.sort((a, b) => (new Date(b.date || b.createdAt || 0).getTime() || 0) - (new Date(a.date || a.createdAt || 0).getTime() || 0));

        if (data.category && data.category !== 'Other' && data.category !== 'General') {
          const cLow = data.category.toLowerCase();
          targetDoc = candidateDocs.find(d =>
            (d.category || '').toLowerCase() === cLow ||
            (d.subType || '').toLowerCase() === cLow ||
            (d.notes || '').toLowerCase().includes(cLow)
          );
        } else {
          targetDoc = candidateDocs[0];
        }
      } catch (_) {}

      if (!targetDoc) {
        return {
          success: false,
          error: `No recent ${data.category || collectionName} transaction found to update.`
        };
      }

      // Update subcollection doc
      try {
        const subUpdate = { ...updateData };
        delete subUpdate.type;
        await targetDoc.ref.update(subUpdate);
      } catch (_) {}

      // Update matching primary transactions doc
      try {
        const mainTwins = await db.collection(`users/${userId}/transactions`)
          .where('subCollectionDocId', '==', targetDoc.id)
          .get();
        for (const d of (mainTwins.docs || [])) {
          await d.ref.update(updateData);
        }
      } catch (_) {}

      broadcastCrudEvent({ type: 'update', userId, collectionName, docId: targetDoc.id, updatedFields: updateData });
      return {
        success: true,
        mode: 'live_firestore',
        operation: 'update',
        docId: targetDoc.id,
        updatedFields: updateData
      };
    }

    if (operation === 'delete') {
      let deletedAny = false;
      let deletedData = {};

      if (data.docId) {
        let subDocId = null;

        // 1. Delete from primary collection users/{userId}/transactions
        try {
          const mainTxRef = db.collection(`users/${userId}/transactions`).doc(data.docId);
          const mainSnap = await mainTxRef.get();
          if (mainSnap.exists) {
            deletedData = mainSnap.data();
            subDocId = deletedData.subCollectionDocId;
            await mainTxRef.delete();
            deletedAny = true;
          }
        } catch (_) {}

        // 2. Also delete any twins in transactions linked to subCollectionDocId
        try {
          const mainTwins = await db.collection(`users/${userId}/transactions`)
            .where('subCollectionDocId', '==', data.docId)
            .get();
          if (!mainTwins.empty) {
            for (const d of (mainTwins.docs || [])) {
              if (!deletedData.amount) deletedData = d.data();
              await d.ref.delete();
              deletedAny = true;
            }
          }
        } catch (_) {}

        // 3. Delete from subcollections
        const targetSubId = subDocId || data.docId;
        const subCollectionsToCheck = ['expenses', 'income', 'investments'];
        for (const col of subCollectionsToCheck) {
          try {
            const subRef = db.collection(`users/${userId}/${col}`).doc(targetSubId);
            const subSnap = await subRef.get();
            if (subSnap.exists) {
              if (!deletedData.amount) deletedData = subSnap.data();
              await subRef.delete();
              deletedAny = true;
            }
          } catch (_) {}
        }

        if (!deletedAny) {
          return {
            success: false,
            error: `No transaction with ID ${data.docId} found to delete.`
          };
        }

        broadcastCrudEvent({ type: 'delete', userId, collectionName, docId: data.docId, deletedData });
        return {
          success: true,
          mode: 'live_firestore',
          operation: 'delete',
          docId: data.docId,
          deletedData
        };
      }

      // Voice / Natural language delete without docId
      let targetDoc = null;
      try {
        const snap = await db.collection(path).limit(20).get();
        const candidateDocs = [];
        snap.forEach(d => candidateDocs.push({ id: d.id, ref: d.ref, ...d.data() }));
        candidateDocs.sort((a, b) => (new Date(b.date || b.createdAt || 0).getTime() || 0) - (new Date(a.date || a.createdAt || 0).getTime() || 0));

        if (data.category && data.category !== 'Other' && data.category !== 'General') {
          const cLow = data.category.toLowerCase();
          targetDoc = candidateDocs.find(d =>
            (d.category || '').toLowerCase() === cLow ||
            (d.subType || '').toLowerCase() === cLow ||
            (d.notes || '').toLowerCase().includes(cLow)
          );
        } else if (data.amount && !isNaN(Number(data.amount))) {
          targetDoc = candidateDocs.find(d => Number(d.amount) === Number(data.amount));
        } else {
          targetDoc = candidateDocs[0];
        }
      } catch (_) {}

      if (!targetDoc) {
        return {
          success: false,
          error: `No recent transaction found in ${collectionName} to delete.`
        };
      }

      deletedData = targetDoc;
      // Delete from subcollection
      try { await targetDoc.ref.delete(); } catch (_) {}

      // Delete from primary transactions collection
      try {
        const mainTwins = await db.collection(`users/${userId}/transactions`)
          .where('subCollectionDocId', '==', targetDoc.id)
          .get();
        for (const d of (mainTwins.docs || [])) {
          await d.ref.delete();
        }
      } catch (_) {}

      broadcastCrudEvent({ type: 'delete', userId, collectionName, docId: targetDoc.id, deletedData });
      return {
        success: true,
        mode: 'live_firestore',
        operation: 'delete',
        docId: targetDoc.id,
        deletedData
      };
    }
  } catch (error) {
    console.warn(`⚠️ Live Firestore ${operation} failed (${error.message}). Falling back to in-memory store.`);
    const userStore = getOrCreateUserStore(userId);
    const storeCollection = userStore[collectionName] || [];

    if (operation === 'create') {
      const docId = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const newRecord = { id: docId, ...payload, transaction_type: data.transaction_type || 'expense' };
      storeCollection.unshift(newRecord);
      userStore[collectionName] = storeCollection;
      return {
        success: true,
        mode: 'in_memory_fallback',
        operation: 'create',
        docId,
        path: `${path}/${docId}`,
        data: newRecord
      };
    }

    return {
      success: false,
      error: error.message
    };
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
    for (const col of collections) {
      const records = (userStore[col] || []).map(r => ({
        ...r,
        transaction_type: r.transaction_type || (col === 'investments' ? 'investment' : (col === 'income' ? 'income' : 'expense'))
      }));
      allRecords.push(...records);
    }
    allRecords.sort((a, b) => (new Date(b.date || b.createdAt || 0).getTime() || 0) - (new Date(a.date || a.createdAt || 0).getTime() || 0));
    return allRecords;
  }

  const db = getFirestore();
  try {
    const seenIds = new Set();
    const seenSubIds = new Set();

    // 1. Read from primary mobile collection: users/{userId}/transactions
    try {
      const mainSnap = await db.collection(`users/${userId}/transactions`).orderBy('date', 'desc').limit(50).get();
      mainSnap.forEach(doc => {
        const data = doc.data();
        seenIds.add(doc.id);
        if (data.subCollectionDocId) seenSubIds.add(data.subCollectionDocId);
        const rawType = (data.type || '').toLowerCase();
        const txType = rawType === 'income' ? 'income' : (rawType === 'investment' ? 'investment' : 'expense');
        allRecords.push({
          id: doc.id,
          subCollectionDocId: data.subCollectionDocId || null,
          amount: typeof data.amount === 'number' ? data.amount : parseFloat(data.amount) || 0,
          category: data.category || data.name || data.subType || 'General',
          subType: data.subType || data.category || 'General',
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
      console.warn('⚠️ Could not query users/{userId}/transactions:', mErr.message);
    }

    // 2. Also read from subcollections for backward compatibility
    for (const col of collections) {
      const path = `users/${userId}/${col}`;
      try {
        const snap = await db.collection(path).orderBy('date', 'desc').limit(25).get();
        snap.forEach(doc => {
          if (!seenIds.has(doc.id) && !seenSubIds.has(doc.id)) {
            seenIds.add(doc.id);
            const data = doc.data();
            allRecords.push({
              id: doc.id,
              ...data,
              amount: typeof data.amount === 'number' ? data.amount : parseFloat(data.amount) || 0,
              category: data.category || 'General',
              transaction_type: col === 'investments' ? 'investment' : (col === 'income' ? 'income' : 'expense'),
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
              updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt
            });
          }
        });
      } catch (_) {}
    }

    allRecords.sort((a, b) => (new Date(b.date || b.createdAt || 0).getTime() || 0) - (new Date(a.date || a.createdAt || 0).getTime() || 0));
    return allRecords;
  } catch (e) {
    console.warn('⚠️ Live Firestore read failed, returning in-memory cached records:', e.message);
    const userStore = getOrCreateUserStore(userId);
    for (const col of collections) {
      const records = (userStore[col] || []).map(r => ({
        ...r,
        transaction_type: r.transaction_type || (col === 'investments' ? 'investment' : (col === 'income' ? 'income' : 'expense'))
      }));
      allRecords.push(...records);
    }
    allRecords.sort((a, b) => (new Date(b.date || b.createdAt || 0).getTime() || 0) - (new Date(a.date || a.createdAt || 0).getTime() || 0));
    return allRecords;
  }
}

export function getCollectionName(type) {
  const t = (type || '').toLowerCase();
  if (t === 'income') return 'income';
  if (t === 'investment' || t === 'investments') return 'investments';
  return 'expenses';
}

