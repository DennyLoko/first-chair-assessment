import crypto from 'node:crypto';
import type { SessionState, ProviderId } from '@first-chair/shared/types';

export type { ProviderId, SessionState };

const store = new Map<string, SessionState>();

const TTL_MS = 30 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of store.entries()) {
    if (now - session.lastSeenAt.getTime() > TTL_MS) {
      store.delete(id);
    }
  }
}, 60_000).unref();

export function generateSessionId(): string {
  return crypto.randomUUID();
}

export function getSession(id: string): SessionState | undefined {
  return store.get(id);
}

export function setSession(id: string, session: SessionState): void {
  store.set(id, session);
}

export function deleteSession(id: string): void {
  store.delete(id);
}

export function refreshSession(id: string): void {
  const session = store.get(id);
  if (session) {
    session.lastSeenAt = new Date();
  }
}
