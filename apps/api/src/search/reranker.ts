import type { LLMProvider } from '../providers/types.js';
import { MissingCapabilityError } from '../providers/types.js';

export interface RerankerCandidate {
  id: string;
  text: string;
}

export async function rerankCandidates(
  provider: LLMProvider,
  query: string,
  candidates: RerankerCandidate[]
): Promise<string[]> {
  if (!provider.capabilities.has('rerank') && !provider.capabilities.has('chat_text')) {
    throw new MissingCapabilityError('rerank', provider.id);
  }

  if (provider.rerank) {
    const docs = candidates.map((c) => c.text);
    const rankedIndices = await provider.rerank(query, docs);
    return rankedIndices
      .filter((i) => i >= 0 && i < candidates.length)
      .map((i) => candidates[i].id);
  }

  throw new MissingCapabilityError('rerank', provider.id);
}
