import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { connectMongo } from './data/mongo.js';
import { loadEmbeddings, manifest } from './data/embeddings.js';
import { buildBm25Index } from './data/bm25Index.js';
import { sessionRoutes } from './routes/session.js';
import { searchRoutes } from './routes/search.js';
import { adminRoutes } from './routes/admin.js';
import { healthRoutes } from './routes/health.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = Fastify({
  logger: {
    level: 'info',
    redact: [
      'apiKey',
      'Authorization',
      'x-api-key',
      'req.headers.x-session-id',
      '*.apiKey',
    ],
  },
});

await app.register(cors, { origin: true });

await app.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 10,
  },
  attachFieldsToBody: false,
});

let mongoConnected = false;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    await connectMongo();
    mongoConnected = true;
    app.log.info('MongoDB connected');
    break;
  } catch (err) {
    app.log.warn({ attempt, err }, 'MongoDB connection attempt failed');
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}
if (!mongoConnected) {
  app.log.error('MongoDB connection failed after 3 attempts');
  process.exit(1);
}

try {
  await loadEmbeddings();
  app.log.info('Embeddings loaded');
} catch {
  app.log.warn('Embeddings artifact missing or corrupt — running in degraded mode (dense leg disabled)');
}

try {
  const embedModelId = manifest?.embedModelId ?? 'text-embedding-3-small';
  await buildBm25Index(embedModelId);
  app.log.info('BM25 index built');
} catch (err) {
  app.log.warn({ err }, 'BM25 index build failed');
}

await app.register(healthRoutes);
await app.register(sessionRoutes);
await app.register(searchRoutes);
await app.register(adminRoutes);

await app.listen({ port: PORT, host: HOST });
app.log.info(`Server ready on port ${PORT}`);
