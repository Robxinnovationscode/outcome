import { getFirestore, isFirebaseConfigured } from '../config/firebase.js';

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
    inMemoryStore.users[userId] = {
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
export async function executeFirestoreCRUD(operation, data, userId = 'default_user') {
  const collectionName = getCollectionName(data.transaction_type);
  const path = `users/${userId}/${collectionName}`;

  const payload = {
    amount: typeof data.amount === 'number' ? data.amount : parseFloat(data.amount) || 0,
    category: data.category || 'Other',
    currency: data.currency || 'INR',
    date: data.date || new Date().toISOString().split('T')[0],
    notes: data.notes || '',
    source: 'voice_agent', // REQUIRED audit tag per Section 5.2
    confidence: data.confidence || 0.95,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!isFirebaseConfigured()) {
    const userStore = getOrCreateUserStore(userId);
    const storeCollection = userStore[collectionName] || [];

    if (operation === 'create') {
      const docId = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const newRecord = { id: docId, ...payload };
      storeCollection.unshift(newRecord);
      userStore[collectionName] = storeCollection;
      return {
        success: true,
        mode: 'in_memory_sandbox',
        operation: 'create',
        docId: docId,
        path: `${path}/${docId}`,
        data: newRecord
      };
    }

    if (operation === 'read') {
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
      if (data.docId) {
        targetIndex = storeCollection.findIndex(r => r.id === data.docId);
      } else if (data.category) {
        targetIndex = storeCollection.findIndex(r => r.category.toLowerCase() === data.category.toLowerCase());
      } else {
        targetIndex = 0; // Most recent
      }

      if (targetIndex === -1 || !storeCollection[targetIndex]) {
        return {
          success: false,
          error: `No matching ${data.category || collectionName} transaction found to update.`
        };
      }

      const existing = storeCollection[targetIndex];
      const updated = {
        ...existing,
        amount: data.amount !== undefined && !isNaN(data.amount) ? data.amount : existing.amount,
        category: data.category || existing.category,
        notes: data.notes || existing.notes,
        updatedAt: new Date().toISOString()
      };
      storeCollection[targetIndex] = updated;

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
      if (data.docId) {
        targetIndex = storeCollection.findIndex(r => r.id === data.docId);
      } else if (data.category) {
        targetIndex = storeCollection.findIndex(r => r.category.toLowerCase() === data.category.toLowerCase());
      } else {
        targetIndex = 0; // Most recent
      }

      if (targetIndex === -1 || !storeCollection[targetIndex]) {
        return {
          success: false,
          error: `No recent transaction found in ${collectionName} to delete.`
        };
      }

      const deletedItem = storeCollection.splice(targetIndex, 1)[0];
      return {
        success: true,
        mode: 'in_memory_sandbox',
        operation: 'delete',
        docId: deletedItem.id,
        deletedData: deletedItem
      };
    }
  }

  const db = getFirestore();

  try {
    if (operation === 'create') {
      const docRef = await db.collection(path).add({
        ...payload,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      return {
        success: true,
        mode: 'live_firestore',
        operation: 'create',
        docId: docRef.id,
        path: `${path}/${docRef.id}`,
        data: payload
      };
    }

    if (operation === 'read') {
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
      if (data.docId) {
        const docRef = db.collection(path).doc(data.docId);
        await docRef.update({
          amount: payload.amount,
          category: payload.category,
          notes: payload.notes,
          updatedAt: new Date()
        });
        return {
          success: true,
          mode: 'live_firestore',
          operation: 'update',
          docId: data.docId,
          updatedFields: payload
        };
      }

      // Find latest matching document to update
      const snapshot = await db.collection(path)
        .where('category', '==', data.category)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (snapshot.empty) {
        return {
          success: false,
          error: `No recent ${data.category} transaction found to update.`
        };
      }

      const docToUpdate = snapshot.docs[0];
      await docToUpdate.ref.update({
        amount: data.amount,
        notes: data.notes || docToUpdate.data().notes,
        updatedAt: new Date()
      });

      return {
        success: true,
        mode: 'live_firestore',
        operation: 'update',
        docId: docToUpdate.id,
        updatedFields: { amount: data.amount }
      };
    }

    if (operation === 'delete') {
      if (data.docId) {
        const docRef = db.collection(path).doc(data.docId);
        const docSnap = await docRef.get();
        const deletedData = docSnap.exists ? docSnap.data() : {};
        await docRef.delete();
        return {
          success: true,
          mode: 'live_firestore',
          operation: 'delete',
          docId: data.docId,
          deletedData
        };
      }

      // Delete most recent entry in collection
      const snapshot = await db.collection(path)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (snapshot.empty) {
        return {
          success: false,
          error: `No recent transaction found in ${collectionName} to delete.`
        };
      }

      const docToDelete = snapshot.docs[0];
      const deletedData = docToDelete.data();
      await docToDelete.ref.delete();

      return {
        success: true,
        mode: 'live_firestore',
        operation: 'delete',
        docId: docToDelete.id,
        deletedData
      };
    }
  } catch (error) {
    console.warn(`⚠️ Live Firestore ${operation} failed (${error.message}). Falling back to in-memory store.`);
    // Fallback to in-memory store so the user voice flow never crashes
    const userStore = getOrCreateUserStore(userId);
    const storeCollection = userStore[collectionName] || [];

    if (operation === 'create') {
      const docId = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const newRecord = { id: docId, ...payload };
      storeCollection.unshift(newRecord);
      userStore[collectionName] = storeCollection;
      return {
        success: true,
        mode: 'in_memory_fallback',
        operation: 'create',
        docId: docId,
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
        transaction_type: col === 'investments' ? 'investment' : (col === 'income' ? 'income' : 'expense')
      }));
      allRecords.push(...records);
    }
    allRecords.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
    return allRecords;
  }

  const db = getFirestore();
  try {
    for (const col of collections) {
      const path = `users/${userId}/${col}`;
      const snap = await db.collection(path).orderBy('date', 'desc').limit(25).get();
      snap.forEach(doc => {
        const data = doc.data();
        allRecords.push({
          id: doc.id,
          ...data,
          transaction_type: col === 'investments' ? 'investment' : (col === 'income' ? 'income' : 'expense'),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt
        });
      });
    }
    allRecords.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
    return allRecords;
  } catch (e) {
    console.warn('⚠️ Live Firestore read failed, returning in-memory cached records:', e.message);
    const userStore = getOrCreateUserStore(userId);
    for (const col of collections) {
      const records = (userStore[col] || []).map(r => ({
        ...r,
        transaction_type: col === 'investments' ? 'investment' : (col === 'income' ? 'income' : 'expense')
      }));
      allRecords.push(...records);
    }
    allRecords.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
    return allRecords;
  }
}

export function getCollectionName(type) {
  if (type === 'income') return 'income';
  if (type === 'investment') return 'investments';
  return 'expenses';
}

