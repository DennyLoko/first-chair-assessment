import { describe, it, expect, vi, afterEach } from 'vitest';

const COUNT = 3;
const DIM = 4;

function makeValidBin(): Buffer {
  const arr = new Float32Array(COUNT * DIM);
  return Buffer.from(arr.buffer);
}

function makeValidManifest(overrides?: Partial<{
  count: number;
  dimensions: number;
  entries: { productId: string; contentHash: string }[];
}>) {
  const entries = overrides?.entries ?? Array.from({ length: COUNT }, (_, i) => ({
    productId: `00000000000000000000000${i}`.slice(-24),
    contentHash: 'a'.repeat(64),
  }));
  return JSON.stringify({
    snapshotAt: new Date().toISOString(),
    embedModelId: 'text-embedding-3-small',
    dimensions: overrides?.dimensions ?? DIM,
    count: overrides?.count ?? COUNT,
    hashAlgo: 'sha256',
    rowOrder: 'test',
    entries,
  });
}

vi.mock('node:fs/promises', async (importOriginal) => {
  const mod = await importOriginal<typeof import('node:fs/promises')>();
  return { ...mod, readFile: vi.fn() };
});

afterEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
});

async function setup(manifestStr: string, bin: Buffer) {
  const { readFile } = await import('node:fs/promises');
  vi.mocked(readFile)
    .mockResolvedValueOnce(manifestStr as unknown as Buffer)
    .mockResolvedValueOnce(bin as unknown as Buffer);
  const mod = await import('../src/data/embeddings.js');
  return mod;
}

describe('loadEmbeddings — integrity assertions', () => {
  it('(i) truncated vectors.bin → EmbeddingArtifactCorruptError', async () => {
    const validBin = makeValidBin();
    const truncated = validBin.subarray(0, validBin.length - 1);
    const mod = await setup(makeValidManifest(), truncated);
    const err = await mod.loadEmbeddings().catch((e) => e);
    expect(err).toBeInstanceOf(mod.EmbeddingArtifactCorruptError);
  });

  it('(ii) over-long vectors.bin → EmbeddingArtifactCorruptError', async () => {
    const validBin = makeValidBin();
    const extra = Buffer.alloc(DIM * 4);
    const overlong = Buffer.concat([validBin, extra]);
    const mod = await setup(makeValidManifest(), overlong);
    const err = await mod.loadEmbeddings().catch((e) => e);
    expect(err).toBeInstanceOf(mod.EmbeddingArtifactCorruptError);
  });

  it('(iii) manifest.entries.length !== manifest.count → EmbeddingArtifactCorruptError', async () => {
    const manifest = makeValidManifest({
      count: COUNT + 1,
      entries: Array.from({ length: COUNT }, (_, i) => ({
        productId: `00000000000000000000000${i}`.slice(-24),
        contentHash: 'a'.repeat(64),
      })),
    });
    const bin = Buffer.alloc((COUNT + 1) * DIM * 4);
    const mod = await setup(manifest, bin);
    const err = await mod.loadEmbeddings().catch((e) => e);
    expect(err).toBeInstanceOf(mod.EmbeddingArtifactCorruptError);
  });

  it('(iv) malformed productId → EmbeddingArtifactCorruptError with kind=malformed_entry', async () => {
    const entries = Array.from({ length: COUNT }, (_, i) => ({
      productId: i === 1 ? 'BADID' : `00000000000000000000000${i}`.slice(-24),
      contentHash: 'a'.repeat(64),
    }));
    const mod = await setup(makeValidManifest({ entries }), makeValidBin());
    const err = await mod.loadEmbeddings().catch((e) => e);
    expect(err).toBeInstanceOf(mod.EmbeddingArtifactCorruptError);
    expect((err as InstanceType<typeof mod.EmbeddingArtifactCorruptError>).observed.kind).toBe('malformed_entry');
  });

  it('(iv) malformed contentHash → EmbeddingArtifactCorruptError with kind=malformed_entry', async () => {
    const entries = Array.from({ length: COUNT }, (_, i) => ({
      productId: `00000000000000000000000${i}`.slice(-24),
      contentHash: i === 0 ? 'BADHASH' : 'a'.repeat(64),
    }));
    const mod = await setup(makeValidManifest({ entries }), makeValidBin());
    const err = await mod.loadEmbeddings().catch((e) => e);
    expect(err).toBeInstanceOf(mod.EmbeddingArtifactCorruptError);
    expect((err as InstanceType<typeof mod.EmbeddingArtifactCorruptError>).observed.kind).toBe('malformed_entry');
  });

  it('(v) healthy artifact loads and exposes correct dimension', async () => {
    const mod = await setup(makeValidManifest(), makeValidBin());
    const artifact = await mod.loadEmbeddings();
    expect(artifact.manifest.dimensions).toBe(DIM);
    expect(artifact.manifest.count).toBe(COUNT);
    expect(artifact.vectors.length).toBe(COUNT * DIM);
  });
});
