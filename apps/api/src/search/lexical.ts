import { searchBm25 } from '../data/bm25Index.js';
import type { RankedHit } from './rrf.js';

export interface LexicalSearchResult {
  hits: RankedHit[];
  poolSize: number;
}

export function lexicalSearch(query: string, topN: number): LexicalSearchResult {
  const hits = searchBm25(query, topN);
  return {
    hits: hits.map((h, idx) => ({ id: h.id, rank: idx + 1 })),
    poolSize: hits.length,
  };
}
