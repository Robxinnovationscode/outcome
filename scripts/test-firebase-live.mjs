import dotenv from 'dotenv';
import { initializeFirebase, isFirebaseConfigured, getFirestore } from '../src/config/firebase.js';

dotenv.config();

const db = initializeFirebase();
console.log('Firebase Configured:', isFirebaseConfigured());
if (db) {
  try {
    const testDoc = await db.collection('system_health').doc('ping').get();
    console.log('Firestore Ping Success! Exists:', testDoc.exists);
  } catch (err) {
    console.error('Firestore Ping Error:', err.message);
  }
}
