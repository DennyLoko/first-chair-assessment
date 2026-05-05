import { canonicalProductText } from '@first-chair/shared';
import { streamAllProducts } from './mongo.js';

export interface BM25Hit {
  id: string;
  score: number;
}

// wink-bm25-text-search returns [docId, score] tuples, NOT {ref, score} objects.
type WinkBm25SearchResult = [string, number];

interface WinkBm25 {
  defineConfig: (cfg: { fldWeights: Record<string, number> }) => void;
  definePrepTasks: (tasks: Array<(s: string) => unknown>) => void;
  addDoc: (doc: Record<string, string>, id: string) => void;
  consolidate: (k?: number) => void;
  search: (text: string, n: number) => WinkBm25SearchResult[];
}

let index: WinkBm25 | null = null;
let buildModelId = 'text-embedding-3-small';

export async function buildBm25Index(embedModelId: string): Promise<void> {
  const { default: bm25 } = await import('wink-bm25-text-search') as { default: () => WinkBm25 };
  const engine = bm25();
  engine.defineConfig({ fldWeights: { text: 1 } });
  // defineConfig must precede definePrepTasks; tokenizes text into lowercase words.
  engine.definePrepTasks([(s: string) => s.toLowerCase().split(/\W+/).filter(Boolean)]);

  buildModelId = embedModelId;
  let count = 0;
  await streamAllProducts((doc) => {
    const id = doc._id?.toString() ?? '';
    const { text } = canonicalProductText(
      {
        title: doc.title,
        description: doc.description,
        category: doc.category,
        type: doc.type,
        price: doc.price,
        width: doc.width,
        height: doc.height,
        depth: doc.depth,
      },
      embedModelId
    );
    engine.addDoc({ text }, id);
    count++;
  });

  engine.consolidate(1);
  index = engine;
  console.info(`[bm25] built index with ${count} docs`);
}

export function searchBm25(query: string, topN: number): BM25Hit[] {
  if (!index) return [];
  return index.search(query, topN).map(([id, score]) => ({ id, score }));
}
