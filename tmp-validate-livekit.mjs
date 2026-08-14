import { createParticipantToken } from './src/services/livekitTokenService.js';

// Provide dev keys if not set in environment (safe for local testing only)
process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'secret';

try {
  const token = createParticipantToken({
    identity: 'test-user',
    roomName: 'finance-test',
    metadata: { userId: 'test-user' }
  });

  console.log('token generated:', token.slice(0, 40) + '...');
} catch (err) {
  console.error('Token generation failed:', err);
  process.exit(1);
}
