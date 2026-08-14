import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

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
    // 1. Try Environment Variable (Base64 or JSON string)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      let serviceAccount;
      try {
        const raw = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf8');
        serviceAccount = JSON.parse(raw);
      } catch (e) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      db = admin.firestore();
      isInitialized = true;
      console.log('✅ Firebase Admin SDK initialized via env variable');
      return db;
    }

    // 2. Try Service Account JSON file path from ENV or root
    const keyPath = process.env.FIREBASE_KEY_PATH || path.join(process.cwd(), 'google-services.json');
    if (fs.existsSync(keyPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      
      // Check if it's a valid admin service account JSON (has private_key)
      if (serviceAccount.private_key) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        isInitialized = true;
        console.log(`✅ Firebase Admin SDK initialized via key file: ${keyPath}`);
        return db;
      }
    }

    console.log('⚠️ Firebase credentials not configured. Model B direct CRUD will run in Mock/Dry-Run mode.');
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
  return isInitialized && db !== null;
};
