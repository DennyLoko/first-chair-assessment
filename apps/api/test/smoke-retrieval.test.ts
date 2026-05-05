import { describe, it, expect, vi, beforeAll } from 'vitest';
import { runSearch } from '../src/search/pipeline.js';
import type { LLMProvider } from '../src/providers/types.js';
import type { EmbeddingsArtifact, Manifest } from '../src/data/embeddings.js';
import type { AdminParams } from '@first-chair/shared';
import { canonicalProductText } from '@first-chair/shared/canonical';

const MODEL_ID = 'text-embedding-3-small';
const DIM = 8;

const PRODUCTS = [
  { _id: '000000000000000000000001', title: 'Leather Office Chair', description: 'Executive chair with lumbar support', category: 'chair', type: 'office', price: 499, width: 65, height: 110, depth: 70 },
  { _id: '000000000000000000000002', title: 'Walnut Coffee Table', description: 'Mid-century modern coffee table', category: 'table', type: 'coffee', price: 299, width: 120, height: 45, depth: 60 },
  { _id: '000000000000000000000003', title: 'Grey Sofa', description: 'Three-seater fabric sofa', category: 'sofa', type: 'sectional', price: 899, width: 220, height: 85, depth: 90 },
  { _id: '000000000000000000000004', title: 'Wooden Bookshelf', description: 'Five-tier solid oak bookshelf', category: 'storage', type: 'bookshelf', price: 199, width: 80, height: 180, depth: 30 },
  { _id: '000000000000000000000005', title: 'Floor Lamp', description: 'Minimalist arc floor lamp', category: 'lamp', type: 'floor', price: 149, width: 30, height: 160, depth: 30 },
];

function randomVec(dim: number): Float32Array {
  const v = new Float32Array(dim);
  let mag = 0;
  for (let i = 0; i < dim; i++) { v[i] = Math.random() - 0.5; mag += v[i] * v[i]; }
  mag = Math.sqrt(mag);
  for (let i = 0; i < dim; i++) v[i] /= mag;
  return v;
}

vi.mock('../src/data/mongo.js', () => ({
  fetchProductsByIds: vi.fn(async (ids: string[]) =>
    PRODUCTS.filter((p) => ids.includes(p._id)).map((p) => ({ ...p, _id: { toString: () => p._id } }))
  ),
}));

vi.mock('../src/search/extractor.js', () => ({
  extractVlmJson: vi.fn(async () => ({
    category: 'chair',
    type: 'office chair',
    materials: ['leather'],
    palette: ['black'],
    features: ['lumbar support', 'adjustable height'],
    caption: 'A leather office chair with lumbar support',
  })),
}));

vi.mock('../src/search/lexical.js', () => ({
  lexicalSearch: vi.fn((_query: string, topN: number) => {
    const hits = PRODUCTS.slice(0, topN).map((p, i) => ({ id: p._id, rank: i + 1 }));
    return { hits, poolSize: hits.length };
  }),
}));

const productVecs = new Map<string, Float32Array>();
let flatVectors: Float32Array;
let artifact: EmbeddingsArtifact;

beforeAll(() => {
  const entries: Manifest['entries'] = [];
  const allVecs: Float32Array[] = [];

  for (const p of PRODUCTS) {
    const vec = randomVec(DIM);
    productVecs.set(p._id, vec);
    const { hash } = canonicalProductText({ title: p.title, description: p.description, category: p.category, type: p.type, price: p.price, width: p.width, height: p.height, depth: p.depth }, MODEL_ID);
    entries.push({ productId: p._id, contentHash: hash });
    allVecs.push(vec);
  }

  flatVectors = new Float32Array(PRODUCTS.length * DIM);
  for (let i = 0; i < allVecs.length; i++) flatVectors.set(allVecs[i], i * DIM);

  const entryIndex = new Map(entries.map((e, i) => [e.productId, i]));

  artifact = {
    vectors: flatVectors,
    manifest: {
      snapshotAt: new Date().toISOString(),
      embedModelId: MODEL_ID,
      dimensions: DIM,
      count: PRODUCTS.length,
      hashAlgo: 'sha256',
      rowOrder: 'test',
      entries,
    },
    entryIndex,
  };
});

const mockVisionProvider: LLMProvider = {
  id: 'openai',
  capabilities: new Set(['vision_extract', 'text_embed', 'rerank', 'chat_text']),
  textEmbedDimensions: () => DIM,
  textEmbedModelId: () => MODEL_ID,
  visionExtract: vi.fn(),
  textEmbed: vi.fn(),
  rerank: vi.fn(),
  chatText: vi.fn(),
};

const mockEmbedProvider: LLMProvider = {
  id: 'openai',
  capabilities: new Set(['vision_extract', 'text_embed', 'rerank', 'chat_text']),
  textEmbedDimensions: () => DIM,
  textEmbedModelId: () => MODEL_ID,
  textEmbed: vi.fn(async (_texts: string[]) => [randomVec(DIM)]),
  visionExtract: vi.fn(),
  rerank: vi.fn(),
  chatText: vi.fn(),
};

const mockRerankProvider: LLMProvider = {
  id: 'openai',
  capabilities: new Set(['vision_extract', 'text_embed', 'rerank', 'chat_text']),
  textEmbedDimensions: () => DIM,
  textEmbedModelId: () => MODEL_ID,
  rerank: vi.fn(async (_query: string, docs: string[]) => docs.map((_, i) => i)),
  textEmbed: vi.fn(),
  visionExtract: vi.fn(),
  chatText: vi.fn(),
};

const params: AdminParams = {
  top_k_final: 3,
  dense_top_n: 5,
  lexical_top_n: 5,
  rrf_k: 60,
  rrf_target_pool: 100,
  rerank_enabled: false,
  rerank_top_n: 5,
  vlm_temperature: 0,
  vlm_max_features: 8,
  soft_filter_weight: 0.15,
  hard_filter_dim_tolerance_pct: 30,
  rate_limit_per_minute: 60,
};

const QUERIES = [
  { label: 'leather office chair', bytes: new Uint8Array([0xff, 0xd8, 0xff]) },
  { label: 'coffee table', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
  { label: 'grey sofa', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) },
  { label: 'bookshelf', bytes: new Uint8Array([0xff, 0xd8, 0xff]) },
  { label: 'floor lamp', bytes: new Uint8Array([0xff, 0xd8, 0xff]) },
];

describe('smoke-retrieval — pipeline invariants', () => {
  for (const query of QUERIES) {
    it(`query: "${query.label}" — result length, schema, score monotonicity`, async () => {
      const result = await runSearch(
        { visionProvider: mockVisionProvider, embedProvider: mockEmbedProvider, rerankProvider: mockRerankProvider },
        Buffer.from(query.bytes),
        'image/jpeg',
        query.label,
        params,
        artifact
      );

      expect(result.results.length).toBeGreaterThanOrEqual(1);
      expect(result.results.length).toBeLessThanOrEqual(params.top_k_final);

      for (const item of result.results) {
        expect(typeof item.productId).toBe('string');
        expect(item.productId.length).toBeGreaterThan(0);
        expect(typeof item.rrfScore).toBe('number');
        expect(isFinite(item.rrfScore)).toBe(true);
      }

      for (let i = 0; i < result.results.length - 1; i++) {
        expect(result.results[i].rrfScore).toBeGreaterThanOrEqual(result.results[i + 1].rrfScore);
      }
    });
  }

  it('leather office chair query returns at least one chair in top results', async () => {
    const result = await runSearch(
      { visionProvider: mockVisionProvider, embedProvider: mockEmbedProvider, rerankProvider: mockRerankProvider },
      Buffer.from([0xff, 0xd8, 0xff]),
      'image/jpeg',
      'leather office chair',
      { ...params, top_k_final: 5 },
      artifact
    );

    const categories = result.results.map((r) => {
      const p = PRODUCTS.find((p) => p._id === r.productId);
      return p?.category ?? '';
    });
    expect(categories.some((c) => /chair/i.test(c))).toBe(true);
  });
});
