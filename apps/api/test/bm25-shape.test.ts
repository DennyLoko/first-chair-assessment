import { describe, it, expect, beforeAll } from 'vitest';
import { buildBm25Index, searchBm25 } from '../src/data/bm25Index.js';

// This test uses the REAL wink-bm25-text-search library (not mocked) to guard
// against the tuple-vs-object mismatch: the library returns [docId, score]
// tuples, not {ref, score} objects. A regression here would silently produce
// results with undefined IDs and inflated RRF scores.

const PRODUCTS = [
  { _id: { toString: () => '000000000000000000000001' }, title: 'Leather Office Chair', description: 'Executive chair with lumbar support', category: 'chair', type: 'office', price: 499, width: 65, height: 110, depth: 70 },
  { _id: { toString: () => '000000000000000000000002' }, title: 'Walnut Coffee Table', description: 'Mid-century modern coffee table', category: 'table', type: 'coffee', price: 299, width: 120, height: 45, depth: 60 },
  { _id: { toString: () => '000000000000000000000003' }, title: 'Grey Fabric Sofa', description: 'Three-seater fabric sofa', category: 'sofa', type: 'sectional', price: 899, width: 220, height: 85, depth: 90 },
];

// Inject the products via the buildBm25Index function by mocking streamAllProducts
import { vi } from 'vitest';

vi.mock('../src/data/mongo.js', () => ({
  streamAllProducts: vi.fn(async (onDoc: (doc: unknown) => void) => {
    for (const p of PRODUCTS) onDoc(p);
  }),
  connectMongo: vi.fn(),
  fetchProductsByIds: vi.fn(),
  fetchAllProducts: vi.fn(),
}));

beforeAll(async () => {
  await buildBm25Index('text-embedding-3-small');
});

describe('searchBm25 — real library shape contract', () => {
  it('returns objects with {id: string, score: number}, NOT [id, score] tuples', () => {
    const hits = searchBm25('leather chair', 5);
    expect(hits.length).toBeGreaterThan(0);

    for (const hit of hits) {
      // Must have id as string property (not a tuple index 0)
      expect(typeof hit.id).toBe('string');
      expect(hit.id.length).toBeGreaterThan(0);

      // Must have score as number property (not a tuple index 1)
      expect(typeof hit.score).toBe('number');
      expect(isFinite(hit.score)).toBe(true);

      // Must NOT be a raw tuple — arrays would have .length but no .id
      expect(Array.isArray(hit)).toBe(false);

      // The specific regression: h.ref must NOT be the ID (old buggy interface)
      expect((hit as unknown as Record<string, unknown>).ref).toBeUndefined();
    }
  });

  it('top result for "leather chair" has ID matching indexed product', () => {
    const hits = searchBm25('leather chair office', 3);
    expect(hits.length).toBeGreaterThan(0);
    const validIds = PRODUCTS.map((p) => p._id.toString());
    expect(validIds).toContain(hits[0].id);
  });

  it('scores are positive finite numbers and results are sorted descending', () => {
    const hits = searchBm25('sofa fabric', 5);
    for (const hit of hits) {
      // wink-bm25-text-search uses TF-IDF scoring — scores can exceed 1
      expect(hit.score).toBeGreaterThan(0);
      expect(isFinite(hit.score)).toBe(true);
    }
    for (let i = 0; i < hits.length - 1; i++) {
      expect(hits[i].score).toBeGreaterThanOrEqual(hits[i + 1].score);
    }
  });

  it('no result has an empty-string ID', () => {
    const hits = searchBm25('sofa table chair', 10);
    for (const hit of hits) {
      expect(hit.id).not.toBe('');
    }
  });
});
