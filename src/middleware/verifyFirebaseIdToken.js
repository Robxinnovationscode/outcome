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

  // If no token is provided, assign default/sandbox user identity
  if (!idToken) {
    req.user = { uid: req.body?.userId || 'sandbox_user', isGuest: true };
    return next();
  }

  // Ensure Firebase Admin SDK is initialized
  if (!admin.apps || admin.apps.length === 0) {
    req.user = { uid: req.body?.userId || 'sandbox_user', isGuest: true };
    return next();
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded;
    return next();
  } catch (err) {
    console.warn('Firebase token verification warning:', err.message);
    // Allow fallback with provided userId or sandbox identity
    req.user = { uid: req.body?.userId || 'sandbox_user', isGuest: true };
    return next();
  }
}

