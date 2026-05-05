import { canonicalProductText } from '@first-chair/shared';
import type { AdminParams, SearchResponse, VlmJson } from '@first-chair/shared';
import type { LLMProvider } from '../providers/types.js';
import { MissingCapabilityError } from '../providers/types.js';
import type { EmbeddingsArtifact } from '../data/embeddings.js';
import { fetchProductsByIds } from '../data/mongo.js';
import { extractVlmJson } from './extractor.js';
import { denseSearch } from './dense.js';
import { lexicalSearch } from './lexical.js';
import { rrfFuse } from './rrf.js';
import { applyHardFilters, applySoftFilters } from './filters.js';
import { rerankCandidates } from './reranker.js';

export interface ResolvedProviders {
  visionProvider: LLMProvider;
  embedProvider: LLMProvider;
  rerankProvider: LLMProvider;
}

export async function runSearch(
  providers: ResolvedProviders,
  imageBytes: Uint8Array,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
  userQuery: string | undefined,
  params: AdminParams,
  artifact: EmbeddingsArtifact
): Promise<SearchResponse> {
  const startMs = Date.now();

  const vlmJson: VlmJson = await extractVlmJson(providers.visionProvider, imageBytes, mimeType);

  const queryParts = [vlmJson.caption, vlmJson.features.join(', ')];
  if (userQuery) queryParts.push(`user said: ${userQuery}`);
  const fusedQuery = queryParts.join('. ');

  let denseHits: { id: string; rank: number }[] = [];
  let densePoolSize = 0;
  let embeddingStaleCount = 0;
  let manifestMissCount = 0;

  if (!providers.embedProvider.capabilities.has('text_embed') || !providers.embedProvider.textEmbed) {
    throw new MissingCapabilityError('text_embed', providers.embedProvider.id);
  }

  const [queryVec] = await providers.embedProvider.textEmbed([fusedQuery]);
  const denseResult = denseSearch(queryVec, artifact, params.dense_top_n);
  denseHits = denseResult.hits;
  densePoolSize = denseResult.poolSize;

  const denseIds = denseHits.map((h) => h.id);
  const freshDocs = await fetchProductsByIds(denseIds);
  const freshDocMap = new Map(freshDocs.map((d) => [d._id.toString(), d]));

  const filteredDenseHits: typeof denseHits = [];
  for (const hit of denseHits) {
    const doc = freshDocMap.get(hit.id);
    if (!doc) {
      manifestMissCount++;
      continue;
    }
    const manifestEntry = artifact.entryIndex.get(hit.id);
    if (manifestEntry === undefined) {
      manifestMissCount++;
      filteredDenseHits.push(hit);
      continue;
    }
    const { hash: actualHash } = canonicalProductText(
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
      artifact.manifest.embedModelId
    );
    const expectedHash = artifact.manifest.entries[manifestEntry].contentHash;
    if (expectedHash !== actualHash) embeddingStaleCount++;
    filteredDenseHits.push(hit);
  }

  const lexicalResult = lexicalSearch(fusedQuery, params.lexical_top_n);

  const rrfScores = rrfFuse(
    [
      { pool: filteredDenseHits, poolSizeRaw: densePoolSize },
      { pool: lexicalResult.hits, poolSizeRaw: lexicalResult.poolSize },
    ],
    { k: params.rrf_k, targetPool: params.rrf_target_pool }
  );

  const sortedIds = [...rrfScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  const topCandidateIds = sortedIds.slice(0, Math.max(params.rerank_top_n * 2, params.top_k_final * 4));
  const topDocs = await fetchProductsByIds(topCandidateIds);
  const topDocMap = new Map(topDocs.map((d) => [d._id.toString(), d]));

  let filterableCandidates = topCandidateIds.map((id) => {
    const doc = topDocMap.get(id);
    return {
      id,
      price: doc?.price,
      width: doc?.width,
      height: doc?.height,
      depth: doc?.depth,
      rrfScore: rrfScores.get(id) ?? 0,
    };
  });

  filterableCandidates = applyHardFilters(filterableCandidates, vlmJson, params);
  filterableCandidates = applySoftFilters(filterableCandidates, vlmJson, params);
  filterableCandidates.sort((a, b) => b.rrfScore - a.rrfScore);

  let finalIds: string[];
  if (params.rerank_enabled) {
    const rerankPool = filterableCandidates.slice(0, params.rerank_top_n);
    const rerankCandidateList = rerankPool.map((c) => {
      const doc = topDocMap.get(c.id);
      const text = doc
        ? canonicalProductText(
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
            artifact.manifest.embedModelId
          ).text
        : c.id;
      return { id: c.id, text };
    });

    try {
      const rerankedIds = await rerankCandidates(providers.rerankProvider, fusedQuery, rerankCandidateList);
      const rerankedSet = new Set(rerankedIds);
      const remainingIds = rerankPool.map((c) => c.id).filter((id) => !rerankedSet.has(id));
      finalIds = [...rerankedIds, ...remainingIds].slice(0, params.top_k_final);
    } catch {
      finalIds = filterableCandidates.slice(0, params.top_k_final).map((c) => c.id);
    }
  } else {
    finalIds = filterableCandidates.slice(0, params.top_k_final).map((c) => c.id);
  }

  const finalDocs = await fetchProductsByIds(finalIds);
  const finalDocMap = new Map(finalDocs.map((d) => [d._id.toString(), d]));

  const denseRankMap = new Map(filteredDenseHits.map((h) => [h.id, h.rank]));
  const lexicalRankMap = new Map(lexicalResult.hits.map((h) => [h.id, h.rank]));

  const results = finalIds.map((id) => {
    const doc = finalDocMap.get(id);
    const manifestIdx = artifact.entryIndex.get(id);
    let embedding_stale: boolean | undefined;
    if (manifestIdx !== undefined && doc) {
      const { hash: actual } = canonicalProductText(
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
        artifact.manifest.embedModelId
      );
      embedding_stale = actual !== artifact.manifest.entries[manifestIdx].contentHash;
    }
    return {
      productId: id,
      title: doc?.title,
      description: doc?.description,
      category: doc?.category,
      type: doc?.type,
      price: doc?.price,
      width: doc?.width,
      height: doc?.height,
      depth: doc?.depth,
      rrfScore: rrfScores.get(id) ?? 0,
      denseRank: denseRankMap.get(id),
      lexicalRank: lexicalRankMap.get(id),
      embedding_stale,
    };
  });

  const rrfInputs = finalIds.map((id) => ({
    id,
    denseRank: denseRankMap.get(id),
    lexicalRank: lexicalRankMap.get(id),
  }));

  return {
    results,
    diagnostics: {
      vlmJson,
      poolSizes: { dense: densePoolSize, lexical: lexicalResult.poolSize },
      rrfInputs,
      embeddingStaleCount,
      manifestMissCount,
      latencyMs: Date.now() - startMs,
    },
  };
}
