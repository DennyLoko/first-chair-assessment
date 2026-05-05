import { create } from 'zustand';

export interface AdminParams {
  top_k_final: number;
  dense_top_n: number;
  lexical_top_n: number;
  rrf_k: number;
  rrf_target_pool: number;
  rerank_enabled: boolean;
  rerank_top_n: number;
  vlm_temperature: number;
  vlm_max_features: number;
  soft_filter_weight: number;
  hard_filter_dim_tolerance_pct: number;
  rate_limit_per_minute: number;
}

const DEFAULT_PARAMS: AdminParams = {
  top_k_final: 8,
  dense_top_n: 200,
  lexical_top_n: 100,
  rrf_k: 60,
  rrf_target_pool: 100,
  rerank_enabled: true,
  rerank_top_n: 20,
  vlm_temperature: 0.0,
  vlm_max_features: 8,
  soft_filter_weight: 0.15,
  hard_filter_dim_tolerance_pct: 30,
  rate_limit_per_minute: 60,
};

interface ParamsStore {
  params: AdminParams;
  setParams: (p: Partial<AdminParams>) => void;
  resetParams: () => void;
}

export const useParamsStore = create<ParamsStore>((set) => ({
  params: DEFAULT_PARAMS,
  setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),
  resetParams: () => set({ params: DEFAULT_PARAMS }),
}));
