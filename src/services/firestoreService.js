import { getFirestore, isFirebaseConfigured } from '../config/firebase.js';

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
    amount: data.amount,
    category: data.category,
    currency: data.currency || 'INR',
    date: data.date,
    notes: data.notes || '',
    source: 'voice_agent', // REQUIRED audit tag per Section 5.2
    confidence: data.confidence,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!isFirebaseConfigured()) {
    console.log(`[Firestore Mock CRUD] ${operation.toUpperCase()} at ${path}`, payload);
    return {
      success: true,
      mode: 'mock_firestore',
      operation,
      path,
      docId: `mock_doc_${Date.now()}`,
      data: payload
    };
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
        .limit(20)
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
    console.error(`❌ Firestore ${operation} failed:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

function getCollectionName(type) {
  if (type === 'income') return 'income';
  if (type === 'investment') return 'investments';
  return 'expenses';
}
