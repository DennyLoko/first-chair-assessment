import type { FastifyInstance } from 'fastify';
import { getParams, setParams } from '../config/params.js';
import { sessionMiddleware } from '../middleware/session.js';
import { rateLimitMiddleware } from '../middleware/rateLimit.js';
import { runEval, getLastEvalResult } from '../eval/runner.js';
import { createProvider } from '../providers/index.js';
import { embeddingsArtifact } from '../data/embeddings.js';
import { runSearch } from '../search/pipeline.js';
import type { ProviderId } from '@first-chair/shared/types';
import type { Fixture } from '@first-chair/shared/schemas';

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/admin/params',
    { preHandler: [sessionMiddleware, rateLimitMiddleware] },
    async (_req, reply) => {
      return reply.send(getParams());
    }
  );

  app.put(
    '/admin/params',
    { preHandler: [sessionMiddleware, rateLimitMiddleware] },
    async (req, reply) => {
      const body = req.body as Record<string, unknown>;
      try {
        const updated = setParams(body as Parameters<typeof setParams>[0]);
        return reply.send(updated);
      } catch (err: unknown) {
        return reply.code(400).send({ error: 'invalid_params', detail: String(err) });
      }
    }
  );

  app.get(
    '/admin/capabilities',
    { preHandler: [sessionMiddleware, rateLimitMiddleware] },
    async (_req, reply) => {
      const matrix = [
        { providerId: 'openai', vision_extract: true, text_embed: true, rerank: true, chat_text: true, embedDim: 1536 },
        { providerId: 'anthropic', vision_extract: true, text_embed: false, rerank: true, chat_text: true, embedDim: null },
        { providerId: 'google', vision_extract: true, text_embed: true, rerank: true, chat_text: true, embedDim: 768 },
      ];
      return reply.send({ providers: matrix });
    }
  );

  app.get(
    '/admin/eval',
    { preHandler: [sessionMiddleware, rateLimitMiddleware] },
    async (_req, reply) => {
      const result = getLastEvalResult();
      if (!result) return reply.code(404).send({ error: 'no_eval_result', detail: 'Run eval first via POST /admin/eval.' });
      return reply.send(result);
    }
  );

  app.post(
    '/admin/eval',
    { preHandler: [sessionMiddleware, rateLimitMiddleware] },
    async (req, reply) => {
      const session = req.session;
      const roles = session.roles;

      const judgeProviderId = roles.judgeProviderId as ProviderId | undefined;
      const rerankProviderId = roles.rerankProviderId as ProviderId | undefined;

      if (!judgeProviderId || judgeProviderId === rerankProviderId) {
        return reply.code(412).send({
          error: 'judge_independence_required',
          rerankProviderId,
          hint: 'Add a second-vendor key under Admin → Providers and assign it to the judge role.',
        });
      }

      const judgeKey = session.keys[judgeProviderId]?.apiKey;
      if (!judgeKey) {
        return reply.code(412).send({
          error: 'judge_independence_required',
          rerankProviderId,
          hint: 'Add a second-vendor key under Admin → Providers and assign it to the judge role.',
        });
      }

      if (!embeddingsArtifact) {
        return reply.code(503).send({ error: 'embeddings_not_ready' });
      }

      const judgeProvider = createProvider(judgeProviderId, judgeKey);
      const params = getParams();

      const visionKey = session.keys[roles.visionProviderId as ProviderId]?.apiKey;
      const embedKey = session.keys[roles.embedProviderId as ProviderId]?.apiKey;
      const rerankKey = session.keys[rerankProviderId as ProviderId]?.apiKey;

      if (!visionKey || !embedKey || !rerankKey) {
        return reply.code(412).send({ error: 'session_not_provisioned', missing: ['keys'] });
      }

      const visionProvider = createProvider(roles.visionProviderId as ProviderId, visionKey);
      const embedProvider = createProvider(roles.embedProviderId as ProviderId, embedKey);
      const rerankProvider = createProvider(rerankProviderId as ProviderId, rerankKey);

      const searchFn = async (fixture: Fixture) => {
        const imageData = fixture.queryImage.localPath
          ? await import('node:fs/promises').then((fs) => fs.readFile(fixture.queryImage.localPath!))
          : Buffer.alloc(0);
        const start = Date.now();
        const result = await runSearch(
          { visionProvider, embedProvider, rerankProvider },
          imageData,
          'image/jpeg',
          fixture.userQuery ?? undefined,
          params,
          embeddingsArtifact!
        );
        return {
          resultIds: result.results.map((r) => r.productId),
          latencyMs: Date.now() - start,
        };
      };

      try {
        const evalResult = await runEval(judgeProvider, searchFn);
        return reply.send(evalResult);
      } catch (err: unknown) {
        return reply.code(500).send({ error: 'eval_failed', detail: String(err) });
      }
    }
  );
}
