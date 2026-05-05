import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SessionState } from '@first-chair/shared/types';
import { getSession, refreshSession } from '../session/store.js';

declare module 'fastify' {
  interface FastifyRequest {
    session: SessionState;
    sessionId: string;
  }
}

export async function sessionMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const id = req.headers['x-session-id'] as string | undefined;
  if (!id) {
    reply.code(401).send({ error: 'session_required' });
    return;
  }
  const session = getSession(id);
  if (!session) {
    reply.code(401).send({ error: 'session_required' });
    return;
  }
  refreshSession(id);
  req.session = session;
  req.sessionId = id;
}
