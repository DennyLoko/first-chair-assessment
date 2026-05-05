import { z } from 'zod';

export const JUDGE_PROMPT_VERSION = 'v1' as const;

export const VlmJsonSchema = z.object({
  category: z.string(),
  type: z.string(),
  materials: z.array(z.string()),
  palette: z.array(z.string()),
  dims: z
    .object({
      width: z.number().nullable().optional(),
      height: z.number().nullable().optional(),
      depth: z.number().nullable().optional(),
    })
    .optional()
    .nullable(),
  features: z.array(z.string()),
  caption: z.string(),
});

export type VlmJson = z.infer<typeof VlmJsonSchema>;

export const AdminParamsSchema = z.object({
  top_k_final: z.number().int().min(1).max(20).default(8),
  dense_top_n: z.number().int().min(50).max(500).default(200),
  lexical_top_n: z.number().int().min(30).max(300).default(100),
  rrf_k: z.number().int().min(10).max(200).default(60),
  rrf_target_pool: z.number().int().min(50).max(500).default(100),
  rerank_enabled: z.boolean().default(true),
  rerank_top_n: z.number().int().min(5).max(50).default(20),
  vlm_temperature: z.number().min(0).max(1).default(0.0),
  vlm_max_features: z.number().int().min(3).max(20).default(8),
  soft_filter_weight: z.number().min(0).max(1).default(0.15),
  hard_filter_dim_tolerance_pct: z.number().int().min(0).max(100).default(30),
  rate_limit_per_minute: z.number().int().min(10).max(600).default(60),
});

export type AdminParams = z.infer<typeof AdminParamsSchema>;

export const SearchResultItemSchema = z.object({
  productId: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  type: z.string().optional(),
  price: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  depth: z.number().optional(),
  rrfScore: z.number(),
  denseRank: z.number().optional(),
  lexicalRank: z.number().optional(),
  rerankScore: z.number().optional(),
  embedding_stale: z.boolean().optional(),
});

export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const SearchResponseSchema = z.object({
  results: z.array(SearchResultItemSchema),
  diagnostics: z.object({
    vlmJson: VlmJsonSchema.optional(),
    poolSizes: z.object({
      dense: z.number(),
      lexical: z.number(),
    }),
    rrfInputs: z.array(
      z.object({
        id: z.string(),
        denseRank: z.number().optional(),
        lexicalRank: z.number().optional(),
      })
    ),
    embeddingStaleCount: z.number(),
    manifestMissCount: z.number(),
    latencyMs: z.number(),
  }),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const FixtureSchema = z.object({
  id: z.string(),
  queryImage: z.object({
    source: z.enum(['external_public', 'ai_generated', 'personal']),
    url: z.string().optional(),
    localPath: z.string().optional(),
    prompt: z.string().optional(),
    description: z.string().optional(),
  }),
  userQuery: z.string().nullable(),
  manualFilter: z.record(z.unknown()),
  expectedMatchIds: z.array(z.string()),
  judgedRelevantBecause: z.string(),
  curatorNote: z.string().optional(),
  secondRater: z
    .object({
      kind: z.enum(['model', 'human']),
      model: z.string().optional(),
      agreement: z.number().min(0).max(1),
      disagreementNotes: z.string().optional(),
    })
    .optional()
    .nullable(),
});

export type Fixture = z.infer<typeof FixtureSchema>;

export const JudgeOutputSchema = z.object({
  score: z.number().min(0).max(1),
  reason: z.string().min(1).max(280),
});

export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;
