import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createFirestoreRestClient } from './firestoreClient.js';

dotenv.config();

let db = null;
let isInitialized = false;

export const initializeFirebase = () => {
  if (isInitialized && db) return db;
  if (admin.apps && admin.apps.length > 0) {
    db = admin.firestore();
    isInitialized = true;
    return db;
  }

  try {
    // 1. Try Service Account JSON file path from ENV or root if valid
    const keyPath = process.env.FIREBASE_KEY_PATH || path.join(process.cwd(), 'google-services.json');
    if (fs.existsSync(keyPath)) {
      try {
        const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        if (serviceAccount.private_key && serviceAccount.project_id === (process.env.FIREBASE_PROJECT_ID || 'ligthson-93799')) {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
          });
          db = admin.firestore();
          isInitialized = true;
          console.log(`✅ Firebase Admin SDK initialized via key file: ${keyPath}`);
          return db;
        }
      } catch (err) {
        console.warn('Admin key parse warning:', err.message);
      }
    }

    // 2. Direct Application Firebase Config (matching mobile app ligthson-93799)
    const projectId = process.env.FIREBASE_PROJECT_ID || 'ligthson-93799';
    const apiKey = process.env.FIREBASE_API_KEY || 'AIzaSyDDP2HdqDJ1jpay63UOY3E8dtrb3EUFxG4';

    if (projectId && apiKey) {
      db = createFirestoreRestClient({ projectId, apiKey });
      isInitialized = true;
      console.log(`✅ Firebase Firestore connected directly to application project: ${projectId}`);
      return db;
    }

    console.log('⚠️ Firebase credentials not configured. Running in Mock/Dry-Run mode.');
    return null;
  } catch (error) {
    console.error('❌ Firebase initialization error:', error.message);
    return null;
  }
};

export const getFirestore = () => {
  if (!isInitialized) {
    return initializeFirebase();
  }
  return db;
};

export const isFirebaseConfigured = () => {
  if (!isInitialized) {
    initializeFirebase();
  }
  return isInitialized && db !== null;
};

