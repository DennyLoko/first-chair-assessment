import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { getParams, setParams } from '../config/params.js';
import { runEval, getLastEvalResult } from '../eval/runner.js';
import { createProvider } from '../providers/index.js';
import { embeddingsArtifact } from '../data/embeddings.js';
import { runSearch } from '../search/pipeline.js';
import type { ProviderId } from '@first-chair/shared/types';
import type { Fixture } from '@first-chair/shared/schemas';

// admin.ts is at apps/api/src/routes/ — 4 levels up = project root
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../../');

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Config endpoints — no session required (admin login at UI level is sufficient).
  app.get('/admin/params', async (_req, reply) => {
    return reply.send(getParams());
  });

  app.put('/admin/params', async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    try {
      const updated = setParams(body as Parameters<typeof setParams>[0]);
      return reply.send(updated);
    } catch (err: unknown) {
      return reply.code(400).send({ error: 'invalid_params', detail: String(err) });
    }
  });

  app.get('/admin/capabilities', async (_req, reply) => {
    const matrix = [
      { providerId: 'openai', vision_extract: true, text_embed: true, rerank: true, chat_text: true, embedDim: 1536 },
      { providerId: 'anthropic', vision_extract: true, text_embed: false, rerank: true, chat_text: true, embedDim: null },
      { providerId: 'google', vision_extract: true, text_embed: true, rerank: true, chat_text: true, embedDim: 768 },
    ];
    return reply.send({ providers: matrix });
  });

  app.get('/admin/eval', async (_req, reply) => {
    const result = getLastEvalResult();
    if (!result) return reply.code(404).send({ error: 'no_eval_result', detail: 'Run eval first via POST /admin/eval.' });
    return reply.send(result);
  });

  // Eval — accepts judgeApiKey + judgeProviderId in body so the admin can supply
  // a key without a full search session. Uses the search session (if present) for
  // the vision/embed/rerank pipeline; falls back to judgeApiKey for all roles when
  // no session is active.
  // Eval accepts keys in the body — no session required.
  app.post('/admin/eval', async (req, reply) => {
      const body = req.body as {
        judgeApiKey?: string;
        judgeProviderId?: string;
        searchApiKey?: string;
        searchProviderId?: string;
      };

      // Resolve judge provider — body takes precedence over session roles.
      const judgeProviderId = (body.judgeProviderId ?? req.session?.roles?.judgeProviderId ?? 'openai') as ProviderId;
      const judgeKey = body.judgeApiKey ?? req.session?.keys?.[judgeProviderId]?.apiKey;

      if (!judgeKey) {
        return reply.code(412).send({
          error: 'judge_key_required',
          hint: 'Provide judgeApiKey in the request body or configure a session with a judge key.',
        });
      }

      if (!embeddingsArtifact) {
        return reply.code(503).send({ error: 'embeddings_not_ready' });
      }

      // Resolve search providers — body searchApiKey overrides session.
      const session = req.session;
      const searchProviderId = (body.searchProviderId ?? session?.roles?.visionProviderId ?? 'openai') as ProviderId;
      // Fall back to judgeApiKey for search when no dedicated searchApiKey is supplied.
      const searchKey = body.searchApiKey ?? session?.keys?.[searchProviderId]?.apiKey ?? judgeKey;

      const judgeProvider = createProvider(judgeProviderId, judgeKey);
      const searchProvider = createProvider(searchProviderId, searchKey);
      const params = getParams();

      const searchFn = async (fixture: Fixture) => {
        const imageData = fixture.queryImage.localPath
          ? await import('node:fs/promises').then((fs) => fs.readFile(join(PROJECT_ROOT, fixture.queryImage.localPath!)))
          : Buffer.alloc(0);
        const start = Date.now();
        const result = await runSearch(
          { visionProvider: searchProvider, embedProvider: searchProvider, rerankProvider: searchProvider },
          imageData,
          'image/jpeg',
          fixture.userQuery ?? undefined,
          params,
          embeddingsArtifact!
        );
        return { resultIds: result.results.map((r) => r.productId), latencyMs: Date.now() - start };
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
