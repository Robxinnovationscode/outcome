import { AccessToken } from 'livekit-server-sdk';

const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.warn('LiveKit token service is running without LIVEKIT_API_KEY or LIVEKIT_API_SECRET.');
}

export function createParticipantToken({ identity, roomName, metadata = {} }) {
  if (!identity) {
    throw new Error('LiveKit participant identity is required');
  }

  if (!roomName) {
    throw new Error('LiveKit roomName is required');
  }

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: String(identity),
    ttl: '1h',
    metadata: JSON.stringify(metadata)
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true
  });

  return token.toJwt();
}

export function getLiveKitUrl() {
  return LIVEKIT_URL;
}
