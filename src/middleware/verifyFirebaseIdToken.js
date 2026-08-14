import admin from 'firebase-admin';

export async function verifyFirebaseIdToken(req, res, next) {
  // Extract ID token from Authorization header, body, or x-id-token header
  const authHeader = req.headers.authorization || '';
  let idToken;
  if (authHeader.startsWith('Bearer ')) {
    idToken = authHeader.split(' ')[1];
  } else if (req.body && req.body.idToken) {
    idToken = req.body.idToken;
  } else if (req.headers['x-id-token']) {
    idToken = req.headers['x-id-token'];
  }

  if (!idToken) {
    return res.status(401).json({ success: false, message: 'Missing Firebase ID token' });
  }

  // Ensure Firebase Admin SDK is initialized
  if (!admin.apps || admin.apps.length === 0) {
    console.error('Firebase Admin SDK is not initialized - cannot verify ID token');
    return res.status(500).json({ success: false, message: 'Server Firebase not configured' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded;
    return next();
  } catch (err) {
    console.error('Firebase token verification failed:', err.message || err);
    return res.status(401).json({ success: false, message: 'Invalid or expired Firebase ID token' });
  }
}
