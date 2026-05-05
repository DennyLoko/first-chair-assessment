import type { FastifyInstance } from 'fastify';
import { isDegraded } from '../data/embeddings.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health/ready', async (_req, reply) => {
    if (isDegraded) {
      return reply.code(503).send({
        status: 'degraded',
        reason: 'Embedding artifact missing or corrupt. Run: npm run build:embeddings',
      });
    }
    return reply.code(200).send({ status: 'ok' });
  });
}
