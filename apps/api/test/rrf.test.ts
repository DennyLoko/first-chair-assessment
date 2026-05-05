import { describe, it, expect } from 'vitest';
import { rrfFuse } from '../src/search/rrf.js';

describe('rrfFuse — normalized RRF math invariants', () => {
  const params = { k: 60, targetPool: 100 };

  it('(a) symmetric inputs produce equal contributions', () => {
    const scores = rrfFuse(
      [
        { pool: [{ id: 'x', rank: 1 }], poolSizeRaw: 100 },
        { pool: [{ id: 'x', rank: 1 }], poolSizeRaw: 100 },
      ],
      params
    );
    const scoreA = rrfFuse([{ pool: [{ id: 'x', rank: 1 }], poolSizeRaw: 100 }], params).get('x')!;
    const scoreB = rrfFuse([{ pool: [{ id: 'x', rank: 1 }], poolSizeRaw: 100 }], params).get('x')!;
    expect(scoreA).toBeCloseTo(scoreB, 10);
    expect(scores.get('x')).toBeCloseTo(scoreA * 2, 10);
  });

  it('(b) pool=100, rank=1, k=60, targetPool=100 → 1/61 ≈ 0.016393', () => {
    const scores = rrfFuse([{ pool: [{ id: 'a', rank: 1 }], poolSizeRaw: 100 }], params);
    const contrib = scores.get('a')!;
    expect(contrib).toBeCloseTo(1 / 61, 10);
  });

  it('(b) pool=200, rank=1, k=60, targetPool=100 → 1/60.5 ≈ 0.016529', () => {
    const scores = rrfFuse([{ pool: [{ id: 'a', rank: 1 }], poolSizeRaw: 200 }], params);
    const contrib = scores.get('a')!;
    expect(contrib).toBeCloseTo(1 / 60.5, 10);
  });

  it('(b) pool=200 contribution > pool=100 contribution (increases monotonically as poolSizeRaw grows)', () => {
    const s100 = rrfFuse([{ pool: [{ id: 'a', rank: 1 }], poolSizeRaw: 100 }], params).get('a')!;
    const s200 = rrfFuse([{ pool: [{ id: 'a', rank: 1 }], poolSizeRaw: 200 }], params).get('a')!;
    expect(s200).toBeGreaterThan(s100);
  });

  it('(c) k=0, normFactor=1 yields textbook RRF (1/rank)', () => {
    const scores = rrfFuse(
      [{ pool: [{ id: 'a', rank: 3 }], poolSizeRaw: 100 }],
      { k: 0, targetPool: 100 }
    );
    expect(scores.get('a')).toBeCloseTo(1 / 3, 10);
  });

  it('(d) empty pool contributes 0 without divide-by-zero', () => {
    const scores = rrfFuse([{ pool: [], poolSizeRaw: 0 }], params);
    expect(scores.size).toBe(0);
  });

  it('multiple documents ranked correctly', () => {
    const scores = rrfFuse(
      [
        { pool: [{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }], poolSizeRaw: 100 },
        { pool: [{ id: 'b', rank: 1 }, { id: 'c', rank: 2 }], poolSizeRaw: 100 },
      ],
      params
    );
    expect(scores.get('b')).toBeGreaterThan(scores.get('a')!);
    expect(scores.get('b')).toBeGreaterThan(scores.get('c')!);
  });
});
