import { getFirestore, isFirebaseConfigured } from '../config/firebase.js';

const COLLECTION = 'voice_embeddings';

export async function ingestEmbedding({ userId = 'default_user', sourceId = null, text = '', embedding = [] }) {
  if (!text || !embedding) {
    throw new Error('text and embedding required');
  }

  if (!isFirebaseConfigured()) {
    console.log('[VectorStore Mock] ingest', { userId, sourceId, text: text.slice(0, 120) });
    return { success: true, mode: 'mock', id: `mock_${Date.now()}` };
  }

  const db = getFirestore();
  const doc = await db.collection(COLLECTION).add({
    userId,
    sourceId,
    text,
    embedding,
    createdAt: new Date()
  });

  return { success: true, id: doc.id };
}

export async function queryTopK({ userId = 'default_user', queryEmbedding = [], k = 5, windowDays = 365 }) {
  // Simple Firestore scan of recent embeddings and in-memory cosine similarity
  if (!isFirebaseConfigured()) {
    console.log('[VectorStore Mock] queryTopK');
    return { success: true, results: [] };
  }

  const db = getFirestore();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  const snapshot = await db.collection(COLLECTION)
    .where('userId', '==', userId)
    .where('createdAt', '>=', cutoff)
    .get();

  const candidates = [];
  snapshot.forEach(doc => candidates.push({ id: doc.id, ...doc.data() }));

  // compute cosine similarity
  function cosine(a, b) {
    let num = 0; let ad = 0; let bd = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      num += a[i] * b[i];
      ad += a[i] * a[i];
      bd += b[i] * b[i];
    }
    return num / (Math.sqrt(ad) * Math.sqrt(bd) + 1e-12);
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
  if (!isFirebaseConfigured()) return [];
  const db = getFirestore();
  const snapshot = await db.collection(COLLECTION).where('userId', '==', userId).orderBy('createdAt', 'desc').get();
  const out = [];
  snapshot.forEach(d => out.push({ id: d.id, ...d.data() }));
  return out;
}
