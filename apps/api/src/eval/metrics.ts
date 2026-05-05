export interface EvalMetrics {
  hitAt1: number;
  hitAt3: number;
  hitAt5: number;
  hitAt8: number;
  mrr: number;
  judgeScoreMean: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  fixtureCount: number;
  staleCount: number;
}

export function computeHitAtK(results: string[], expected: Set<string>, k: number): number {
  const topK = results.slice(0, k);
  return topK.some((id) => expected.has(id)) ? 1 : 0;
}

export function computeMrr(results: string[], expected: Set<string>): number {
  for (let i = 0; i < results.length; i++) {
    if (expected.has(results[i])) return 1 / (i + 1);
  }
  return 0;
}

export function computePercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function aggregateMetrics(
  fixtureResults: Array<{
    resultIds: string[];
    expectedIds: string[];
    judgeScores: number[];
    latencyMs: number;
    stale: boolean;
  }>
): EvalMetrics {
  const fresh = fixtureResults.filter((r) => !r.stale);
  const staleCount = fixtureResults.length - fresh.length;

  if (fresh.length === 0) {
    return { hitAt1: 0, hitAt3: 0, hitAt5: 0, hitAt8: 0, mrr: 0, judgeScoreMean: 0, latencyP50Ms: 0, latencyP95Ms: 0, fixtureCount: 0, staleCount };
  }

  const hits1: number[] = [];
  const hits3: number[] = [];
  const hits5: number[] = [];
  const hits8: number[] = [];
  const mrrs: number[] = [];
  const judgeScores: number[] = [];
  const latencies: number[] = [];

  for (const r of fresh) {
    const expected = new Set(r.expectedIds);
    hits1.push(computeHitAtK(r.resultIds, expected, 1));
    hits3.push(computeHitAtK(r.resultIds, expected, 3));
    hits5.push(computeHitAtK(r.resultIds, expected, 5));
    hits8.push(computeHitAtK(r.resultIds, expected, 8));
    mrrs.push(computeMrr(r.resultIds, expected));
    judgeScores.push(...r.judgeScores);
    latencies.push(r.latencyMs);
  }

  const mean = (arr: number[]) => arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

  return {
    hitAt1: mean(hits1),
    hitAt3: mean(hits3),
    hitAt5: mean(hits5),
    hitAt8: mean(hits8),
    mrr: mean(mrrs),
    judgeScoreMean: mean(judgeScores),
    latencyP50Ms: computePercentile(latencies, 50),
    latencyP95Ms: computePercentile(latencies, 95),
    fixtureCount: fresh.length,
    staleCount,
  };
}
