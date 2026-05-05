import { createHash } from 'node:crypto';

/**
 * Canonical text used for embedding generation AND for runtime drift detection.
 *
 * IMPORTANT: do NOT replace this with `JSON.stringify(p)`. Object key order in
 * JSON.stringify is implementation-defined for non-array objects when keys are
 * inserted in non-monotonic order, and any code formatter that pretty-prints
 * the result would silently invalidate every cached embedding.
 *
 * The canonical form is line-oriented, deterministic, locale-stable, and
 * dimension-precision-stable. Changing the model invalidates all hashes by
 * design (the `model=` prefix is part of the hashed input).
 */
export interface CanonicalProduct {
  title?: string | null;
  description?: string | null;
  category?: string | null;
  type?: string | null;
  price?: number | null;
  width?: number | null;
  height?: number | null;
  depth?: number | null;
}

export function canonicalProductText(
  p: CanonicalProduct,
  modelId: string
): { text: string; hash: string } {
  const norm = (s: string | null | undefined) =>
    (s ?? '').normalize('NFC').trim();
  const lower = (s: string | null | undefined) =>
    norm(s).toLocaleLowerCase('en-US');
  const num = (n: number | null | undefined, places: number) =>
    n == null ? '' : n.toFixed(places);

  const parts = [
    `model=${modelId}`,
    `title=${norm(p.title)}`,
    `description=${norm(p.description)}`,
    `category=${lower(p.category)}`,
    `type=${lower(p.type)}`,
    `price=${num(p.price, 2)}`,
    `width=${num(p.width, 1)}`,
    `height=${num(p.height, 1)}`,
    `depth=${num(p.depth, 1)}`,
  ];
  const text = parts.join('\n');
  const hash = createHash('sha256').update(text, 'utf8').digest('hex');
  return { text, hash };
}
