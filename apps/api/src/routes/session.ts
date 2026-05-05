import type { FastifyInstance } from 'fastify';
import { generateSessionId, getSession, setSession, deleteSession } from '../session/store.js';
import { createProvider } from '../providers/index.js';
import { EmbedModelMismatchError, MissingCapabilityError } from '../providers/types.js';
import { manifest } from '../data/embeddings.js';
import type { SessionState, ProviderId, SessionRoles } from '@first-chair/shared/types';

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/session/key', async (req, reply) => {
    const body = req.body as { providerId: ProviderId; apiKey: string };
    const { providerId, apiKey } = body;

    if (!providerId || !apiKey) {
      return reply.code(400).send({ error: 'missing_fields', required: ['providerId', 'apiKey'] });
    }

    const provider = createProvider(providerId, apiKey);

    if (provider.capabilities.has('text_embed') && manifest) {
      const providerDim = provider.textEmbedDimensions();
      if (providerDim !== null && providerDim !== manifest.dimensions) {
        return reply.code(409).send({
          error: 'embed_model_mismatch',
          providerId,
          providerEmbedModel: provider.textEmbedModelId(),
          providerDim,
          manifestEmbedModel: manifest.embedModelId,
          manifestDim: manifest.dimensions,
          rebuildHint: `EMBED_MODEL_ID=${provider.textEmbedModelId()} npm run build:embeddings`,
        });
      }
    }

    const existingSessionId = (req.headers['x-session-id'] as string | undefined);
    let sessionId: string;
    let session: SessionState;

    if (existingSessionId) {
      const existing = getSession(existingSessionId);
      if (existing) {
        sessionId = existingSessionId;
        session = existing;
      } else {
        sessionId = generateSessionId();
        session = {
          keys: {},
          roles: {},
          createdAt: new Date(),
          lastSeenAt: new Date(),
        };
      }
    } else {
      sessionId = generateSessionId();
      session = {
        keys: {},
        roles: {},
        createdAt: new Date(),
        lastSeenAt: new Date(),
      };
    }

    session.keys[providerId] = { apiKey, lastSeenAt: new Date() };
    session.lastSeenAt = new Date();

    // Default: if roles are empty, assign all roles to this provider
    if (!session.roles.visionProviderId && !session.roles.embedProviderId) {
      session.roles = {
        visionProviderId: providerId,
        embedProviderId: providerId,
        rerankProviderId: providerId,
        judgeProviderId: providerId,
      };
    }

    setSession(sessionId, session);

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    return reply.send({
      sessionId,
      expiresAt,
      capabilities: Object.fromEntries(
        Array.from(provider.capabilities).map((c) => [c, true])
      ),
      embedDim: provider.textEmbedDimensions(),
    });
  });

  app.post('/session/roles', async (req, reply) => {
    const sessionId = req.headers['x-session-id'] as string | undefined;
    if (!sessionId) {
      return reply.code(401).send({ error: 'session_required' });
    }
    const session = getSession(sessionId);
    if (!session) {
      return reply.code(401).send({ error: 'session_required' });
    }

    const body = req.body as Partial<SessionRoles>;
    const { visionProviderId, embedProviderId, rerankProviderId, judgeProviderId } = body;

    const rolesProviders = [visionProviderId, embedProviderId, rerankProviderId, judgeProviderId].filter(Boolean) as ProviderId[];
    for (const pid of rolesProviders) {
      if (!session.keys[pid]) {
        return reply.code(400).send({ error: 'provider_key_missing', providerId: pid });
      }
    }

    if (embedProviderId && manifest) {
      const key = session.keys[embedProviderId]?.apiKey;
      if (key) {
        const provider = createProvider(embedProviderId, key);
        if (!provider.capabilities.has('text_embed')) {
          const err = new MissingCapabilityError('text_embed', embedProviderId);
          return reply.code(400).send({ error: 'missing_capability', message: err.message });
        }
        const providerDim = provider.textEmbedDimensions();
        if (providerDim !== null && providerDim !== manifest.dimensions) {
          return reply.code(409).send({
            error: 'embed_model_mismatch',
            providerId: embedProviderId,
            providerEmbedModel: provider.textEmbedModelId(),
            providerDim,
            manifestEmbedModel: manifest.embedModelId,
            manifestDim: manifest.dimensions,
            rebuildHint: `EMBED_MODEL_ID=${provider.textEmbedModelId()} npm run build:embeddings`,
          });
        }
      }
    }

    session.roles = {
      visionProviderId: visionProviderId ?? session.roles.visionProviderId!,
      embedProviderId: embedProviderId ?? session.roles.embedProviderId!,
      rerankProviderId: rerankProviderId ?? session.roles.rerankProviderId!,
      judgeProviderId: judgeProviderId ?? session.roles.judgeProviderId!,
    };
    session.lastSeenAt = new Date();

    return reply.send({ ok: true, roles: session.roles });
  });

  app.delete('/session/key', async (req, reply) => {
    const sessionId = req.headers['x-session-id'] as string | undefined;
    if (!sessionId) {
      return reply.code(401).send({ error: 'session_required' });
    }

    const body = (req.body ?? {}) as { providerId?: ProviderId };
    if (body.providerId) {
      const session = getSession(sessionId);
      if (session) {
        delete session.keys[body.providerId];
        session.lastSeenAt = new Date();
      }
    } else {
      deleteSession(sessionId);
    }

    return reply.send({ ok: true });
  });
}
