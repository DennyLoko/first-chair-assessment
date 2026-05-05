import type { VlmJson } from '@first-chair/shared';
import type { AdminParams } from '@first-chair/shared';

export interface FilterableProduct {
  id: string;
  price?: number;
  width?: number;
  height?: number;
  depth?: number;
  rrfScore: number;
}

export function applyHardFilters(
  candidates: FilterableProduct[],
  vlmJson: VlmJson,
  params: AdminParams
): FilterableProduct[] {
  const tol = params.hard_filter_dim_tolerance_pct / 100;

  return candidates.filter((c) => {
    if (vlmJson.dims) {
      const { width, height, depth } = vlmJson.dims;
      if (width != null && c.width != null) {
        const lo = width * (1 - tol);
        const hi = width * (1 + tol);
        if (c.width < lo || c.width > hi) return false;
      }
      if (height != null && c.height != null) {
        const lo = height * (1 - tol);
        const hi = height * (1 + tol);
        if (c.height < lo || c.height > hi) return false;
      }
      if (depth != null && c.depth != null) {
        const lo = depth * (1 - tol);
        const hi = depth * (1 + tol);
        if (c.depth < lo || c.depth > hi) return false;
      }
    }
    return true;
  });
}

export function applySoftFilters(
  candidates: FilterableProduct[],
  vlmJson: VlmJson,
  params: AdminParams
): FilterableProduct[] {
  const weight = params.soft_filter_weight;
  return candidates.map((c) => {
    let nudge = 0;
    if (vlmJson.dims) {
      const { width, height, depth } = vlmJson.dims;
      const dimMatches = [
        [width, c.width],
        [height, c.height],
        [depth, c.depth],
      ].filter(([a, b]) => a != null && b != null);
      if (dimMatches.length > 0) {
        const closeCount = dimMatches.filter(([a, b]) => {
          const ratio = Math.abs((b as number) - (a as number)) / (a as number);
          return ratio < 0.15;
        }).length;
        nudge = (closeCount / dimMatches.length) * weight;
      }
    }
    return { ...c, rrfScore: c.rrfScore + nudge };
  });
}
