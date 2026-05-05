import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '../../../../..');
const BIN_PATH = join(ROOT, 'data/embeddings/v1/vectors.bin');
const MANIFEST_PATH = join(ROOT, 'data/embeddings/v1/manifest.json');

export interface ManifestEntry {
  productId: string;
  contentHash: string;
}

export interface Manifest {
  snapshotAt: string;
  embedModelId: string;
  embedModelVersion?: string;
  dimensions: number;
  count: number;
  hashAlgo: string;
  rowOrder: string;
  entries: ManifestEntry[];
}

export interface EmbeddingsArtifact {
  vectors: Float32Array;
  manifest: Manifest;
  entryIndex: Map<string, number>;
}

export class EmbeddingArtifactCorruptError extends Error {
  constructor(
    public readonly observed: { byteLength: number; manifestEntries: number; kind?: string; index?: number; violation?: string },
    public readonly expected: { byteLength: number; manifestCount: number }
  ) {
    super(
      `Embedding artifact integrity check failed. ` +
        `Observed bin=${observed.byteLength}B, manifest.entries=${observed.manifestEntries}; ` +
        `expected bin=${expected.byteLength}B, manifest.count=${expected.manifestCount}. ` +
        `Run npm run build:embeddings to regenerate.`
    );
    this.name = 'EmbeddingArtifactCorruptError';
  }
}

export let isDegraded = false;
export let manifest: Manifest | null = null;
export let getVector: ((row: number) => Float32Array) | null = null;
export let embeddingsArtifact: EmbeddingsArtifact | null = null;

export async function loadEmbeddings(): Promise<EmbeddingsArtifact> {
  let manifestData: Manifest;
  let buf: Buffer;

  try {
    manifestData = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as Manifest;
    buf = await readFile(BIN_PATH);
  } catch {
    isDegraded = true;
    manifest = null;
    getVector = null;
    console.warn('[embeddings] vectors.bin or manifest.json not found — running in degraded mode (dense leg disabled)');
    throw new Error('Embeddings artifact not found');
  }

  const expectedBytes = manifestData.count * manifestData.dimensions * 4;

  if (buf.byteLength !== expectedBytes) {
    throw new EmbeddingArtifactCorruptError(
      { byteLength: buf.byteLength, manifestEntries: manifestData.entries.length },
      { byteLength: expectedBytes, manifestCount: manifestData.count }
    );
  }

  if (manifestData.entries.length !== manifestData.count) {
    throw new EmbeddingArtifactCorruptError(
      { byteLength: buf.byteLength, manifestEntries: manifestData.entries.length },
      { byteLength: expectedBytes, manifestCount: manifestData.count }
    );
  }

  for (let i = 0; i < manifestData.count; i++) {
    const entry = manifestData.entries[i];
    if (!/^[0-9a-f]{24}$/i.test(entry.productId)) {
      throw new EmbeddingArtifactCorruptError(
        { byteLength: buf.byteLength, manifestEntries: manifestData.entries.length, kind: 'malformed_entry', index: i, violation: 'productId' },
        { byteLength: expectedBytes, manifestCount: manifestData.count }
      );
    }
    if (!/^[0-9a-f]{64}$/.test(entry.contentHash)) {
      throw new EmbeddingArtifactCorruptError(
        { byteLength: buf.byteLength, manifestEntries: manifestData.entries.length, kind: 'malformed_entry', index: i, violation: 'contentHash' },
        { byteLength: expectedBytes, manifestCount: manifestData.count }
      );
    }
  }

  const vectors = new Float32Array(buf.buffer, buf.byteOffset, manifestData.count * manifestData.dimensions);

  const entryIndex = new Map<string, number>();
  for (let i = 0; i < manifestData.entries.length; i++) {
    entryIndex.set(manifestData.entries[i].productId, i);
  }

  const artifact: EmbeddingsArtifact = { vectors, manifest: manifestData, entryIndex };

  isDegraded = false;
  manifest = manifestData;
  getVector = (row: number) => {
    const dim = manifestData.dimensions;
    return vectors.subarray(row * dim, (row + 1) * dim);
  };
  embeddingsArtifact = artifact;

  return artifact;
}
