/**
 * In-Memory Session State Store for Multi-Turn Voice Conversations
 * Supports TTL cleanup and session context tracking.
 */

class SessionManager {
  constructor(ttlMinutes = 15) {
    this.sessions = new Map();
    this.ttlMs = ttlMinutes * 60 * 1000;
  }

  createSession(sessionId, initialContext = {}) {
    const session = {
      sessionId,
      context: { ...initialContext },
      turns: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId) {
    if (!sessionId) return null;
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Check expiry
    if (Date.now() - session.updatedAt > this.ttlMs) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  updateSession(sessionId, newContextData, utterance) {
    let session = this.getSession(sessionId);
    if (!session) {
      session = this.createSession(sessionId, newContextData);
    } else {
      session.context = { ...session.context, ...newContextData };
      session.updatedAt = Date.now();
    }

    if (utterance) {
      session.turns.push({
        timestamp: new Date().toISOString(),
        utterance
      });
    }

    return session;
  }

  clearSession(sessionId) {
    if (sessionId) {
      this.sessions.delete(sessionId);
    }
  }

  cleanupExpired() {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.updatedAt > this.ttlMs) {
        this.sessions.delete(id);
      }
    }
  }
}

export const sessionManager = new SessionManager();
