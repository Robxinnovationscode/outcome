import { getFirestore, isFirebaseConfigured } from '../config/firebase.js';

const COLLECTION = 'voice_embeddings';

// In-memory embedding cache for fallback / sandbox
const inMemoryEmbeddings = [];

export async function ingestEmbedding({ userId = 'default_user', sourceId = null, text = '', embedding = [] }) {
  if (!text || !embedding) {
    throw new Error('text and embedding required');
  }

  // Always store in inMemoryEmbeddings for fast local retrieval
  const memRecord = {
    id: `mem_emb_${Date.now()}`,
    userId,
    sourceId,
    text,
    embedding,
    createdAt: new Date()
  };
  inMemoryEmbeddings.unshift(memRecord);

  if (!isFirebaseConfigured()) {
    return { success: true, mode: 'in_memory_sandbox', id: memRecord.id };
  }

  try {
    const db = getFirestore();
    const doc = await db.collection(COLLECTION).add({
      userId,
      sourceId,
      text,
      embedding,
      createdAt: new Date()
    });
    return { success: true, id: doc.id };
  } catch (err) {
    console.warn('⚠️ Firestore vector ingest fallback:', err.message);
    return { success: true, mode: 'in_memory_fallback', id: memRecord.id };
  }
}

export async function queryTopK({ userId = 'default_user', queryEmbedding = [], k = 5, windowDays = 365 }) {
  function cosine(a, b) {
    let num = 0; let ad = 0; let bd = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      num += a[i] * b[i];
      ad += a[i] * a[i];
      bd += b[i] * b[i];
    }
    return num / (Math.sqrt(ad) * Math.sqrt(bd) + 1e-12);
  }

  let candidates = inMemoryEmbeddings.filter(e => e.userId === userId || e.userId === 'default_user');

  if (isFirebaseConfigured()) {
    try {
      const db = getFirestore();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - windowDays);

      const snapshot = await db.collection(COLLECTION)
        .where('userId', '==', userId)
        .where('createdAt', '>=', cutoff)
        .get();

      snapshot.forEach(doc => candidates.push({ id: doc.id, ...doc.data() }));
    } catch (e) {
      console.warn('⚠️ Firestore queryTopK fallback:', e.message);
    }
  }

  const scored = candidates.map(c => ({
    id: c.id,
    text: c.text,
    score: cosine(queryEmbedding, c.embedding || [])
  }));

  scored.sort((a, b) => b.score - a.score);
  return { success: true, results: scored.slice(0, k) };
}

export async function fetchAllForUser(userId = 'default_user') {
  let out = inMemoryEmbeddings.filter(e => e.userId === userId || e.userId === 'default_user');

  if (isFirebaseConfigured()) {
    try {
      const db = getFirestore();
      const snapshot = await db.collection(COLLECTION).where('userId', '==', userId).orderBy('createdAt', 'desc').get();
      snapshot.forEach(d => out.push({ id: d.id, ...d.data() }));
    } catch (e) {
      console.warn('⚠️ Firestore fetchAllForUser fallback:', e.message);
    }
  }
  return out;
}
