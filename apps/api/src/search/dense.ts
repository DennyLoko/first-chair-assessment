import type { EmbeddingsArtifact } from '../data/embeddings.js';
import type { RankedHit } from './rrf.js';

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export interface DenseSearchResult {
  hits: RankedHit[];
  poolSize: number;
}

export function denseSearch(
  queryVec: Float32Array,
  artifact: EmbeddingsArtifact,
  topN: number
): DenseSearchResult {
  const { vectors, manifest, entryIndex } = artifact;
  const dim = manifest.dimensions;
  const count = manifest.count;

  const scored: Array<{ id: string; score: number }> = [];
  for (let i = 0; i < count; i++) {
    const row = vectors.subarray(i * dim, (i + 1) * dim);
    const score = cosine(queryVec, row);
    scored.push({ id: manifest.entries[i].productId, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const topHits = scored.slice(0, topN);

  return {
    hits: topHits.map((h, idx) => ({ id: h.id, rank: idx + 1 })),
    poolSize: count,
  };
}
