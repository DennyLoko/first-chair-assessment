export interface RankedHit {
  id: string;
  rank: number;
}

export interface RrfInput {
  pool: RankedHit[];
  poolSizeRaw: number;
}

export interface RrfParams {
  k: number;
  targetPool: number;
}

/**
 * Normalized Reciprocal Rank Fusion.
 *
 * Formula:
 *   RRF(d) = Σᵢ 1 / (k + rᵢ(d) * normFactorᵢ)
 *   where normFactorᵢ = TARGET_POOL / |poolᵢ|
 *
 * Normalizing ranks to a common 0..targetPool range makes per-retriever
 * contribution invariant to actual pool size.
 */
export function rrfFuse(inputs: RrfInput[], params: RrfParams): Map<string, number> {
  const scores = new Map<string, number>();
  for (const { pool, poolSizeRaw } of inputs) {
    const norm = poolSizeRaw === 0 ? 1 : params.targetPool / poolSizeRaw;
    for (const hit of pool) {
      const rNorm = hit.rank * norm;
      const contrib = 1 / (params.k + rNorm);
      scores.set(hit.id, (scores.get(hit.id) ?? 0) + contrib);
    }
  }
  return scores;
}
