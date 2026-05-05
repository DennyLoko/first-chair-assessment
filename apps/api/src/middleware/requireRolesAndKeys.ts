import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ProviderId } from '@first-chair/shared/types';

export async function requireRolesAndKeys(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { session } = req;
  const { roles } = session;

  const visionProviderId = roles.visionProviderId;
  const embedProviderId = roles.embedProviderId;
  const rerankProviderId = roles.rerankProviderId;

  if (!visionProviderId || !embedProviderId || !rerankProviderId) {
    reply.code(412).send({ error: 'session_not_provisioned', missing: ['roles'] });
    return;
  }

  const requiredProviders: ProviderId[] = [visionProviderId, embedProviderId, rerankProviderId];
  const missing = requiredProviders.filter((pid) => !session.keys[pid]);

  if (missing.length > 0) {
    reply.code(412).send({ error: 'session_not_provisioned', missing });
    return;
  }
}
