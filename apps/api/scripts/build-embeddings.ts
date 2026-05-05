import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { canonicalProductText } from '@first-chair/shared/canonical';

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), '../../..');

const MONGO_URI = process.env.MONGO_URI ?? 'mongodb+srv://catalog-readonly:onfly2024@catalog.sontifs.mongodb.net/catalog';
const PROVIDER_API_KEY = process.env.PROVIDER_API_KEY ?? '';
const EMBED_PROVIDER_ID = process.env.EMBED_PROVIDER_ID ?? 'openai';
const EMBED_MODEL_ID = process.env.EMBED_MODEL_ID ?? 'text-embedding-3-small';

if (!PROVIDER_API_KEY) {
  console.error('PROVIDER_API_KEY not set. See README "Build-time vs runtime keys" section.');
  process.exit(1);
}

console.log(`Using provider=${EMBED_PROVIDER_ID} model=${EMBED_MODEL_ID} key=...${PROVIDER_API_KEY.slice(-4)}`);

const EMBED_DIMS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
  'text-embedding-004': 768,
};

const dimensions = EMBED_DIMS[EMBED_MODEL_ID];
if (!dimensions) {
  console.error(`Unknown EMBED_MODEL_ID="${EMBED_MODEL_ID}". Add it to the EMBED_DIMS map.`);
  process.exit(1);
}

async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  if (EMBED_PROVIDER_ID === 'openai') {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: PROVIDER_API_KEY });
    const response = await client.embeddings.create({
      model: EMBED_MODEL_ID,
      input: texts,
    });
    return response.data.map((item) => new Float32Array(item.embedding));
  }
  throw new Error(`Unsupported EMBED_PROVIDER_ID="${EMBED_PROVIDER_ID}" for build script. Use openai.`);
}

async function main() {
  const client = new MongoClient(MONGO_URI, {
    maxPoolSize: 2,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();
  console.log('Connected to MongoDB.');

  const db = client.db();
  const products = await db.collection('products').find({}).toArray();
  console.log(`Fetched ${products.length} products.`);

  const entries: Array<{ productId: string; contentHash: string }> = [];
  const allVectors: Float32Array[] = [];

  const BATCH_SIZE = 100;
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const texts = batch.map((p) => {
      const { text, hash } = canonicalProductText(
        {
          title: p.title,
          description: p.description,
          category: p.category,
          type: p.type,
          price: p.price,
          width: p.width,
          height: p.height,
          depth: p.depth,
        },
        EMBED_MODEL_ID
      );
      entries.push({ productId: String(p._id), contentHash: hash });
      return text;
    });

    console.log(`Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(products.length / BATCH_SIZE)}...`);
    const vectors = await embedBatch(texts);
    allVectors.push(...vectors);
  }

  const flatVectors = new Float32Array(products.length * dimensions);
  for (let i = 0; i < allVectors.length; i++) {
    flatVectors.set(allVectors[i], i * dimensions);
  }

  const outDir = join(ROOT, 'data/embeddings/v1');
  mkdirSync(outDir, { recursive: true });

  const binPath = join(outDir, 'vectors.bin');
  writeFileSync(binPath, Buffer.from(flatVectors.buffer));
  console.log(`Written ${binPath} (${flatVectors.buffer.byteLength} bytes)`);

  const manifest = {
    snapshotAt: new Date().toISOString(),
    embedModelId: EMBED_MODEL_ID,
    embedModelVersion: new Date().toISOString().slice(0, 7),
    dimensions,
    count: products.length,
    hashAlgo: 'sha256',
    rowOrder: 'manifest.entries index ↔ vectors.bin row index',
    entries,
  };

  const manifestPath = join(outDir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Written ${manifestPath}`);

  await client.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
