import { ZodSchema } from 'zod';

export type Capability = 'vision_extract' | 'text_embed' | 'rerank' | 'chat_text';

export interface VisionExtractRequest {
  imageBytes: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  instruction: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMProvider {
  readonly id: 'openai' | 'anthropic' | 'google';
  readonly capabilities: ReadonlySet<Capability>;
  /**
   * Synchronous capability metadata, no network. Returns the dimension of the
   * provider's default text-embed model, or null if `text_embed` is absent.
   * Used at session-creation time to reconcile against manifest.dimensions.
   */
  textEmbedDimensions(): number | null;
  /**
   * Identifier of the embed model this provider would use, for diagnostic
   * messaging on dimension mismatch. null if `text_embed` is absent.
   */
  textEmbedModelId(): string | null;
  visionExtract?<T>(req: VisionExtractRequest, schema: ZodSchema<T>): Promise<T>;
  textEmbed?(texts: string[]): Promise<Float32Array[]>;
  rerank?(query: string, docs: string[]): Promise<number[]>;
  chatText?(messages: ChatMessage[]): Promise<string>;
}

export class MissingCapabilityError extends Error {
  constructor(
    public readonly capability: Capability,
    public readonly providerId: string
  ) {
    super(`Provider "${providerId}" does not implement capability "${capability}"`);
    this.name = 'MissingCapabilityError';
  }
}

export class EmbedModelMismatchError extends Error {
  constructor(
    public readonly providerId: string,
    public readonly providerEmbedModel: string,
    public readonly providerDim: number,
    public readonly manifestEmbedModel: string,
    public readonly manifestDim: number
  ) {
    super(
      `Build artifact uses ${manifestEmbedModel} (${manifestDim} dim). ` +
        `Provider ${providerId} uses ${providerEmbedModel} (${providerDim} dim). ` +
        `Either switch to a compatible provider, or rebuild with ` +
        `EMBED_MODEL_ID=${providerEmbedModel} npm run build:embeddings.`
    );
    this.name = 'EmbedModelMismatchError';
  }
}

export class EmbeddingArtifactCorruptError extends Error {
  public readonly kind: 'byte_length' | 'count_mismatch' | 'malformed_entry';

  constructor(
    kind: 'byte_length' | 'count_mismatch' | 'malformed_entry',
    public readonly observed: { byteLength?: number; manifestEntries?: number; entryIndex?: number },
    public readonly expected: { byteLength?: number; manifestCount?: number }
  ) {
    super(
      `Embedding artifact integrity check failed (kind=${kind}). ` +
        `Run npm run build:embeddings to regenerate.`
    );
    this.name = 'EmbeddingArtifactCorruptError';
    this.kind = kind;
  }
}

export class SessionNotProvisionedError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Session not provisioned. Missing provider keys: ${missing.join(', ')}`);
    this.name = 'SessionNotProvisionedError';
  }
}
