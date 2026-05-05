import type { FastifyInstance } from 'fastify';
import { sessionMiddleware } from '../middleware/session.js';
import { rateLimitMiddleware } from '../middleware/rateLimit.js';
import { requireRolesAndKeys } from '../middleware/requireRolesAndKeys.js';
import { createProvider } from '../providers/index.js';
import { runSearch } from '../search/pipeline.js';
import { getParams } from '../config/params.js';
import { embeddingsArtifact } from '../data/embeddings.js';
import type { ProviderId } from '@first-chair/shared/types';

const ACCEPTED_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AcceptedMime = (typeof ACCEPTED_MIMES)[number];

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/search',
    {
      preHandler: [sessionMiddleware, rateLimitMiddleware, requireRolesAndKeys],
    },
    async (req, reply) => {
      const session = req.session;
      const roles = session.roles;

      let imageBytes: Buffer | null = null;
      let imageMime: AcceptedMime | null = null;
      let userQuery: string | undefined;

      try {
        const parts = req.parts();
        for await (const part of parts) {
          if (part.type === 'file' && part.fieldname === 'image') {
            const mime = part.mimetype;
            if (!(ACCEPTED_MIMES as readonly string[]).includes(mime)) {
              return reply.code(415).send({
                error: 'unsupported_mime',
                accepted: [...ACCEPTED_MIMES],
                received: mime,
              });
            }
            imageMime = mime as AcceptedMime;
            const chunks: Buffer[] = [];
            let totalBytes = 0;
            for await (const chunk of part.file) {
              totalBytes += chunk.length;
              chunks.push(chunk);
            }
            if (part.file.truncated) {
              return reply.code(413).send({
                error: 'image_too_large',
                limitMb: 10,
                observedBytes: totalBytes,
              });
            }
            imageBytes = Buffer.concat(chunks);
          } else if (part.type === 'field' && part.fieldname === 'query') {
            userQuery = part.value as string;
          }
        }
      } catch (err: unknown) {
        const e = err as { statusCode?: number; message?: string };
        if (e?.statusCode === 413) {
          return reply.code(413).send({
            error: 'image_too_large',
            limitMb: 10,
            observedBytes: 0,
          });
        }
        return reply.code(400).send({ error: 'multipart_error', detail: String(err) });
      }

      if (!imageBytes || !imageMime) {
        return reply.code(400).send({ error: 'missing_image', detail: 'Provide an image field in multipart body.' });
      }

      if (!embeddingsArtifact) {
        return reply.code(503).send({ error: 'embeddings_not_ready', detail: 'Run npm run build:embeddings first.' });
      }

      const visionKey = session.keys[roles.visionProviderId as ProviderId]?.apiKey;
      const embedKey = session.keys[roles.embedProviderId as ProviderId]?.apiKey;
      const rerankKey = session.keys[roles.rerankProviderId as ProviderId]?.apiKey;

      const visionProvider = createProvider(roles.visionProviderId as ProviderId, visionKey!);
      const embedProvider = createProvider(roles.embedProviderId as ProviderId, embedKey!);
      const rerankProvider = createProvider(roles.rerankProviderId as ProviderId, rerankKey!);

      const params = getParams();
      const result = await runSearch(
        { visionProvider, embedProvider, rerankProvider },
        imageBytes,
        imageMime,
        userQuery,
        params,
        embeddingsArtifact
      );

      return reply.send(result);
    }
  );
}
