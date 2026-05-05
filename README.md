# First Chair — Image-Based Product Search

A full-stack TypeScript application that accepts a furniture product image and returns ranked matches from a read-only MongoDB catalog using hybrid retrieval (dense + lexical), normalized reciprocal-rank fusion (RRF), and optional LLM reranking.

**Designed for relevance**: the system combines vision understanding (VLM extraction), semantic search (dense embeddings), lexical matching (BM25), and intelligent ranking to surface the most relevant products. All components are tunable via an admin panel, and evaluation metrics are built in.

---

## Quick Start

### Prerequisites

- **Node 20+** and npm
- **An OpenAI, Anthropic, or Google API key** (user provides at runtime; not persisted)
- **MongoDB read-only access** provided via the catalog connection string in `assessment.md` (already configured)

### Setup and Run

```bash
# Clone and install dependencies
git clone <repo-url>
cd first-chair
npm install

# Build embeddings (one-time setup; requires PROVIDER_API_KEY in apps/api/.env)
# See "Build-Time vs Runtime Keys" section below
npm run build:embeddings

# Start dev server (API on :3000, Web on :5173)
npm run dev

# Run tests
npm test

# Run evaluation fixtures
npm run eval
```

Open `http://localhost:5173` in your browser. You'll see:
- **Search tab** — upload an image, optionally add a natural-language query.
- **Admin tab** — configure API keys, tune 12 retrieval parameters, run evals, view capabilities matrix.
- **Debug panel** — inspect what the system "saw" in the image and how it ranked candidates.

**Cold-start target**: `npm run dev` → `/health/ready` returns 200 within 5 seconds on a fresh clone (embeddings are pre-computed and committed).

### Build-Time vs Runtime Keys

The build script (`npm run build:embeddings`) reads **one API key** from `apps/api/.env` (via `dotenv/config`) to pre-compute embeddings for the 2.5K catalog. This is a one-time developer cost, never charged to the reviewer.

The web UI accepts **the reviewer's API key** at runtime (stored in-memory on the server, never persisted). This key pays for per-query VLM extraction, query embedding, and reranking. These are distinct flows — do not share a key between them.

Create `apps/api/.env` from `.env.example`:

```bash
MONGO_URI=<connection-string-from-assessment>
PROVIDER_API_KEY=sk-...
EMBED_PROVIDER_ID=openai
EMBED_MODEL_ID=text-embedding-3-small
```

Run `npm run build:embeddings` once. The output (`data/embeddings/v1/{vectors.bin, manifest.json}`) is committed to git (~15 MB total) so subsequent clones skip the embedding step.

---

## Architecture Overview

### System Stack

| Layer    | Technology                                     |
|----------|------------------------------------------------|
| Frontend | React 19 + TypeScript + Vite + Tailwind       |
| Backend  | Node 20 + Fastify 5 + TypeScript + Pino logs |
| Data     | MongoDB (read-only catalog), pre-computed embeddings |

### High-Level Flow

```
Browser
  │
  ├─ POST /session/key { providerId, apiKey }
  │  (authenticate one or more LLM providers)
  │
  ├─ PUT /session/roles { visionProviderId, embedProviderId, rerankProviderId, judgeProviderId }
  │  (assign roles across providers; enable mixed-vendor setups)
  │
  └─ POST /search (multipart: image + optional query)
     │
     ├─► VLM Extract (gpt-4o-mini vision)
     │   image → { category, type, materials, palette, dims?, caption, features }
     │
     ├─► Fuse Query
     │   "caption. features. user said: <query>"
     │
     ├─► Dense Search
     │   embed query → cosine scan vs 2.5K pre-computed vectors → top-200 hits
     │
     ├─► Lexical Search
     │   BM25 over title (weight 3), type (2), category (2), description (1) → top-100 hits
     │
     ├─► Normalized RRF
     │   merge dense + lexical, score = Σ 1/(k + r_i * norm_i)
     │   normalizes asymmetric pool sizes (2500 dense vs ~100 lexical)
     │
     ├─► Filters
     │   hard: category must match VLM extraction
     │   soft: dimension/price penalty on RRF score
     │
     ├─► LLM Rerank (optional, default on)
     │   top-20 RRF candidates → LLM ranks by relevance → top-K
     │
     └─► Fetch & Return
         top-K product documents from live Mongo + diagnostics
```

---

## Retrieval & Ranking Pipeline

This section details the core design — the assessment focuses on this.

### 1. VLM Extraction

The pipeline begins with a vision language model call:

**Input**: User-uploaded image (JPEG, PNG, or WebP; ≤10 MB)

**Process**: Sends image to `gpt-4o-mini` with a structured prompt asking for:
- `category` (e.g., "chair", "table", "sofa") — used for hard filtering
- `type` (e.g., "office", "dining", "lounge") — refinement signal
- `materials[]` (e.g., "wood", "leather") — semantic signal
- `palette[]` (colors) — visual signal
- `approximateDims?` (height, width, depth in cm) — soft filtering
- `caption` (free-text description) — embedding input
- `features[]` (parsed attributes) — embedding input

**Output**: Structured JSON validated against a Zod schema; visible in the Debug panel.

**Why**: Extracting structured JSON gives interpretable intermediate state. The reviewer can see exactly what the system understood about the image. Alternatives like multimodal image embeddings are opaque; we chose clarity over 20× cost savings (documented as the at-scale follow-up when catalog grows past 50K products).

**Temperature**: Tunable (default 0.0) via Admin panel to balance consistency vs exploration.

### 2. Fused Query Construction

The caption, features, and optional user prompt are combined into a single text string:

```
"{caption}. {features.join(', ')}. user said: {userQuery}"
```

This fused query is the single input to both dense and lexical retrievers. The canonical text builder (in `packages/shared/src/canonical.ts`) ensures deterministic, locale-stable normalization.

### 3. Dense Retrieval

**Index**: Pre-computed `Float32Array` of 2,500 product vectors, 1536-dim (from `text-embedding-3-small`).

**Build-time**: `npm run build:embeddings` fetches all products from Mongo, embeds each via OpenAI, writes a packed binary `data/embeddings/v1/vectors.bin` and a manifest.

**Runtime**: 
- Embed the fused query → 1536-dim float vector.
- Linear scan cosine similarity vs all 2,500 rows (~5 ms on a laptop).
- Return top-200 hits (admin-tunable via `dense_top_n`).

**Tuning parameters**:
- `dense_top_n` (default 200, range 50–500) — pool size for RRF fusion.

**Why no external vector DB**: At 2,500 products and <50 ms query latency, an in-memory linear scan suffices. The interface (`RetrievalIndex` abstraction) is designed for a clean swap to HNSW or Qdrant when the catalog exceeds 50K.

### 3.1 Why vectors.bin instead of a vector database

`data/embeddings/v1/vectors.bin` is a packed `Float32Array` (~15 MB) containing 2,500 product embeddings (1,536-dim, from `text-embedding-3-small`). It ships committed to the repository alongside `manifest.json`, which maps `productId` to its content hash for drift detection.

**Performance at scale 2,500**:
- A linear cosine scan over 2,500 vectors in Node.js takes ~5 ms — faster than a network round-trip to any hosted vector database (Pinecone, Qdrant, Weaviate, pgvector: 20–50 ms).
- HNSW and IVF algorithms inside vector databases only outperform brute-force above ~50K–100K vectors. Below that threshold, the index overhead exceeds the savings.

**Zero infrastructure**:
- No account signup, no docker-compose, no Kubernetes pods, no extra secrets beyond the Mongo URI.
- Reviewers clone the repo, run `npm install`, and are ready in <5 seconds. Embeddings are pre-computed and committed.

**Cost efficiency**:
- Embeddings are pre-computed at build time (`npm run build:embeddings`) using the developer's API key — a one-time cost.
- Reviewers pay only for their own search queries (VLM extraction, query embedding, reranking), never for catalog re-embedding.
- Eliminates the per-request vector DB subscription or query pricing.

**Runtime drift detection**:
- At boot, each product fetched from Mongo is checked against `manifest.json`'s `contentHash`.
- Products edited after the snapshot surface as `embedding_stale: true` in the Admin panel's diagnostics view and in the `/search` response.
- No silent failures — stale embeddings are visible.

**When to migrate to a vector database**:
- **Catalog grows past ~50K products**: Linear scan exceeds ~50 ms p99; HNSW becomes cost-effective.
- **Sustained QPS > 5**: Concurrent linear scans compete for CPU; a remote index isolates compute.
- **Multi-tenant deployments**: Namespace isolation and tenant-specific indexes require external coordination.
- **Seamless swap**: The `RetrievalIndex` interface (`apps/api/src/data/embeddings.ts`) can be replaced with a Qdrant or pgvector client in a single file — `pipeline.ts`, `rrf.ts`, and all routes remain unchanged.

### 4. Lexical Retrieval

**Index**: In-memory BM25 index built at server startup using `wink-bm25-text-search`.

**Fields and weights**:
- `title` (weight 3) — exact product name, highest signal
- `type` (weight 2) — furniture class
- `category` (weight 2) — broad category
- `description` (weight 1) — free text

**Runtime**: 
- BM25 search on fused query → top-100 hits (admin-tunable).
- Complements dense retrieval when vocabulary alignment is strong (e.g., user types "office chair" and the catalog has "office chair" in title).

**Tuning parameters**:
- `lexical_top_n` (default 100, range 30–300) — pool size for RRF fusion.

### 5. Normalized Reciprocal Rank Fusion (RRF)

**Problem**: Dense retrieval returns up to 2,500 hits; lexical returns ~100. If scored naively, dense contributions dominate.

**Solution**: Normalized RRF weights each retriever's contribution equally, regardless of pool size.

**Formula**:

```
score(d) = Σᵢ 1 / (k + rᵢ(d) * normFactorᵢ)

where:
  rᵢ(d) = rank of document d in retriever i
  normFactorᵢ = targetPool / |poolᵢ|
  k = dampening constant (default 60)
  targetPool = normalization target (default 100)
```

**Example**: If dense pool has 2500 hits and lexical has 100 hits:
- Dense rank 1 → normalized rank = 1 × (100/2500) = 0.04 → score = 1/(60+0.04) ≈ 0.0166
- Lexical rank 1 → normalized rank = 1 × (100/100) = 1 → score = 1/(60+1) ≈ 0.0161

Both retrievers contribute similarly at rank 1, despite the 25× difference in pool sizes.

**Tuning parameters**:
- `rrf_k` (default 60, range 10–200) — dampening; higher k gives more weight to top ranks.
- `rrf_target_pool` (default 100, range 50–500) — normalization target; influences relative retriever balance.

**Diagnostics**: Every search response includes `poolSizes: { dense, lexical }` and `rrfInputs` (per-candidate ranks) so you can inspect the fusion.

### 6. Hard and Soft Filters

**Hard filter**: Category extracted by VLM must match product category. Violations are culled pre-fusion.

**Soft filter**: If VLM extracted approximate dimensions, products far outside the range incur a score penalty rather than removal. Tunable:
- `hard_filter_dim_tolerance_pct` (default 30 %) — how far outside the inferred range before culling.
- `soft_filter_weight` (default 0.15) — how much to penalize off-size products in scoring.

Both filters run post-RRF on the candidate pool, not per-document.

### 7. LLM Reranking (Optional, Default On)

**Process**:
- Take top-20 RRF candidates (tunable via `rerank_top_n`).
- Send to LLM with the fused query and each product's canonical text.
- LLM returns a relevance score per product.
- Re-sort by LLM score.
- Return top-K (default 8).

**Benefit**: LLM can reason about subtle semantic match (material compatibility, style fit) that pure embedding/BM25 may miss.

**Cost**: Adds ~1–2 seconds per query (dominates latency).

**Tuning**:
- `rerank_enabled` (default true) — toggle to measure impact.
- `rerank_top_n` (default 20, range 5–50) — how many candidates to send to LLM.
- `top_k_final` (default 8, range 1–20) — final result count.

### 8. Result Fetching and Diagnostics

Top-K IDs are fetched fresh from Mongo (guarantees fresh `title`, `description`, `price`, dimensions). 

Diagnostic metadata is attached:
- `vlmJson` — structured image understanding.
- `poolSizes` — dense and lexical hit counts.
- `rrfInputs` — each final result's contribution from dense/lexical.
- `embeddingStaleCount` / `manifestMissCount` — drift indicators.
- `latencyMs` — wall-clock time for the full search.

---

## Design Rationale & Trade-Offs

### Why VLM Extract + Text Embed (vs Multimodal Image Embeddings)

**Chosen approach**: `gpt-4o-mini` vision → structured JSON → text embedding of JSON.

**Alternatives considered**:
1. **Multimodal embeddings** (Cohere `embed-v4.0`): Embed image + text in a shared space; search once.
   - Pros: 20× cheaper, 15× faster, preserves visual signal (texture, palette).
   - Cons: Black-box to reviewer (no readable trace), catalog re-embedding on model upgrade, structured filters need workarounds.
   - **Verdict**: Use as v2 at scale (>50K products, >5 QPS), not v1.

2. **Mongo `$text` only**: Keyword search on title + description.
   - Pros: Zero new infra, built-in to Mongo.
   - Cons: No semantic similarity, poor on furniture vocabulary mismatches.
   - **Verdict**: Kept as lexical leg of hybrid, not standalone.

**Cost ceiling for switching to multimodal**: catalog >50K products, sustained QPS >5, or LLM-judge mean <0.55 after tuning exhausted.

### Why Committed Embeddings (No Runtime Re-Embedding)

`data/embeddings/v1/{vectors.bin, manifest.json}` is built once via `npm run build:embeddings` and committed to git.

**Pros**:
- Cold-start on fresh clone is <5 seconds (no embedding API calls needed).
- Embedding costs are front-loaded to the developer, not charged per-query to the reviewer.
- Frozen snapshot enables reproducible eval baselines.

**Cons**:
- If catalog changes between dev and demo, dense results may drift (surfaced via `embedding_stale` / `manifest_miss` diagnostics).
- Rebuild policy: re-run `npm run build:embeddings` if catalog grows >5% or you change the embed model.

### Why In-Memory BM25 (Not Mongo `$text`)

Wink-bm25 is built at server startup from a Mongo cursor. BM25 is well-understood, tunable via field weights, and deterministic. Mongo `$text` is simpler but less controllable.

---

## Admin Interface

The **Admin tab** exposes:

### Retrieval Parameters (~12 tunable)

All real-time; apply to subsequent searches:

| Parameter | Default | Range | Notes |
|-----------|---------|-------|-------|
| `top_k_final` | 8 | 1–20 | Final result count |
| `dense_top_n` | 200 | 50–500 | Dense pool for RRF |
| `lexical_top_n` | 100 | 30–300 | Lexical pool for RRF |
| `rrf_k` | 60 | 10–200 | RRF dampening |
| `rrf_target_pool` | 100 | 50–500 | RRF normalization target |
| `rerank_enabled` | true | — | Toggle LLM rerank |
| `rerank_top_n` | 20 | 5–50 | Rerank candidate pool |
| `vlm_temperature` | 0.0 | 0–1 | VLM extraction determinism |
| `vlm_max_features` | 8 | 3–20 | Max feature count from VLM |
| `soft_filter_weight` | 0.15 | 0–1 | Dimension/price penalty |
| `hard_filter_dim_tolerance_pct` | 30 | 0–100 | Dim mismatch tolerance |
| `rate_limit_per_minute` | 60 | 10–600 | Per-session rate limit |

### Provider Configuration

Three rows (OpenAI / Anthropic / Google), each with:
- Textbox for API key + "Validate" button.
- Last-4 of stored key + "Remove" button.
- Capability badges (vision_extract, text_embed, rerank, chat_text).
- Embed model and dimension if applicable.

A **roles selector** below picks which provider fills each role (vision, embed, rerank, judge). Mixed-vendor setups supported (e.g., Anthropic for vision, OpenAI for embed/rerank, Google for judge).

**Capability matrix** shows compatible (✓) and incompatible (✗) combinations:

| Provider | vision_extract | text_embed | rerank | chat_text | embed-model | dim | compatible with default vectors.bin (1536)? |
|----------|---|---|---|---|---|---|---|
| openai | ✓ | ✓ | ✓ | ✓ | text-embedding-3-small | **1536** | ✓ |
| anthropic | ✓ | ✗ | ✓ | ✓ | (none) | — | mixed mode only |
| google | ✓ | ✓ | ✓ | ✓ | text-embedding-004 | 768 | ✗ rebuild required |

Embed-dimension mismatch surfaces as a 409 error with an exact rebuild command.

### Evaluation Panel

- **Run Eval** button (disabled unless two distinct vendor keys configured).
- **Metrics**: Hit@1/3/5/8, MRR, LLM-judge mean, latency p50/p95.
- **Delta vs baseline**: `eval/fixtures/baselines/default.json` for comparison.
- **Stale fixtures** badge: catalog drift detection.
- **Save as baseline** button: commit new results (developer-initiated).

---

## Evaluation

### Strategy: Independence Rule

Fixture `expectedMatchIds` are **NOT** derived by running the search system. Instead:

1. Query images are sourced externally (IKEA/Wayfair product shots, or AI-generated).
2. Expected matches are hand-curated using **direct Mongo filter queries** (e.g., `{category: "chair", type: "office", height: {$gte: 90, $lte: 110}}`).
3. The filter encodes a human judgment ("for this image, any office chair 90–110 cm is relevant"), which differs from what the system decides (semantic + lexical + rerank). This difference is the signal the metric measures.

### Metrics

- **Hit@K**: Binary (1 if any expected match in top-K, else 0). Averaged over fixtures.
- **MRR** (Mean Reciprocal Rank): 1 / rank of first expected match, or 0.
- **LLM-judge mean** (0–1): Separate LLM (not the reranker, ensuring judge vendor ≠ rerank vendor) scores each result for relevance to the image and expected matches. Average over all results.
- **Latency p50/p95**: Wall-clock milliseconds, computed over fixture runs.

### Baseline

`eval/fixtures/baselines/default.json` is the last golden run:

```json
{
  "hitAt1": 0.16,
  "hitAt3": 0.28,
  "hitAt5": 0.28,
  "hitAt8": 0.28,
  "mrr": 0.207,
  "judgeScoreMean": 0.607,
  "latencyP50Ms": 5771,
  "latencyP95Ms": 11604,
  "fixtureCount": 25
}
```

**Interpretation**: Hit@8 = 0.28 means 28% of fixtures have at least one relevant match in top-8. MRR = 0.207 and judge = 0.607 ("same product class and subtype, partial material/dimension match") reflect the system's consistency at retrieving the right furniture type with room to improve on material/dimension precision.

### Run Evaluation

In the Admin tab, click "Run Eval". The system:
1. Checks catalog freshness (products in expected sets still exist).
2. Iterates 25 fixtures, running the full pipeline under current params.
3. Computes metrics and calls the judge LLM for scoring.
4. Renders results with delta vs baseline.

**Time**: ~2–3 minutes for 25 fixtures (dominated by LLM calls and reranking).

---

## Security & Privacy

- **API keys**: Stored in-memory only, in a `Map<sessionId, SessionState>`. 30-minute idle TTL; no disk persistence, no logs.
- **Sessions**: Identified by `X-Session-Id` header (browser localStorage). No cookies, no CSRF.
- **Logging**: Pino logger redacts `apiKey`, `Authorization`, `x-api-key` fields from all output.
- **Rate limit**: 60 requests/min per session (admin-tunable) to bound blast radius if key leaks via shared localhost.
- **Catalog**: Read-only; no writes allowed.

---

## Repository Structure

```
first-chair/
├── apps/
│   ├── api/                          # Fastify backend
│   │   ├── src/
│   │   │   ├── index.ts              # Server bootstrap
│   │   │   ├── routes/
│   │   │   │   ├── session.ts        # POST /session/key, PUT /session/roles
│   │   │   │   ├── search.ts         # POST /search
│   │   │   │   ├── admin.ts          # GET/PUT /admin/params, POST /admin/eval
│   │   │   │   └── health.ts         # GET /health/ready
│   │   │   ├── search/
│   │   │   │   ├── pipeline.ts       # Main orchestration (extract → fuse → retrieve → rerank)
│   │   │   │   ├── extractor.ts      # VLM call
│   │   │   │   ├── dense.ts          # Float32Array cosine scan
│   │   │   │   ├── lexical.ts        # BM25 search
│   │   │   │   ├── rrf.ts            # Normalized RRF
│   │   │   │   ├── filters.ts        # Hard/soft filters
│   │   │   │   └── reranker.ts       # LLM reranking
│   │   │   ├── providers/
│   │   │   │   ├── types.ts          # LLMProvider interface
│   │   │   │   ├── openai.ts         # OpenAI adapter
│   │   │   │   ├── anthropic.ts      # Anthropic adapter
│   │   │   │   └── google.ts         # Google adapter
│   │   │   ├── data/
│   │   │   │   ├── mongo.ts          # MongoDB client
│   │   │   │   ├── embeddings.ts     # Binary vector loading + manifest
│   │   │   │   └── bm25Index.ts      # BM25 index builder
│   │   │   ├── eval/
│   │   │   │   ├── runner.ts         # Fixture evaluator
│   │   │   │   ├── metrics.ts        # Hit@K, MRR, LLM-judge, latency
│   │   │   │   └── judge.ts          # LLM judge prompt + scoring
│   │   │   ├── middleware/
│   │   │   │   ├── session.ts        # Session middleware
│   │   │   │   └── rateLimit.ts      # Token-bucket rate limiter
│   │   │   ├── config/
│   │   │   │   └── params.ts         # Tunable parameter defaults + schema
│   │   │   └── ...
│   │   ├── scripts/
│   │   │   └── build-embeddings.ts   # npm run build:embeddings
│   │   ├── test/
│   │   │   ├── canonical.test.ts
│   │   │   ├── rrf.test.ts
│   │   │   ├── embeddings-load.test.ts
│   │   │   ├── smoke-retrieval.test.ts
│   │   │   └── ...
│   │   ├── .env.example
│   │   └── package.json
│   └── web/                          # React frontend
│       ├── src/
│       │   ├── App.tsx               # Tab layout (Search | Admin)
│       │   ├── pages/
│       │   │   ├── Search.tsx        # Image upload + query input
│       │   │   ├── Admin.tsx         # Parameter sliders, provider config, eval panel
│       │   │   └── DebugPanel.tsx    # VLM JSON, RRF diagnostics
│       │   ├── components/
│       │   │   └── ImageDropzone.tsx # Image drop zone with size check
│       │   ├── lib/
│       │   │   ├── api.ts            # Fetch wrappers with X-Session-Id
│       │   │   └── session.ts        # localStorage session ID mgmt
│       │   └── store/
│       │       └── params.ts         # zustand param store
│       └── package.json
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── canonical.ts          # canonicalProductText (deterministic)
│       │   ├── schemas.ts            # Zod schemas, JUDGE_PROMPT_VERSION
│       │   └── types.ts              # Shared types
│       └── package.json
├── data/
│   └── embeddings/
│       └── v1/
│           ├── vectors.bin           # 2487 × 1536 × 4 bytes (committed)
│           └── manifest.json         # Metadata + content hashes
├── eval/
│   └── fixtures/
│       ├── README.md                 # Independence rule
│       ├── 001-*.json                # 25+ curated test cases
│       └── baselines/
│           └── default.json          # Baseline metrics
├── README.md (this file)
├── CHANGELOG.md                      # Development prompts and decisions
└── package.json                      # npm workspaces root
```

---

## Testing

Run all tests:

```bash
npm test
```

Key test suites:

- `apps/api/test/canonical.test.ts` — Unicode normalization, locale stability, price precision.
- `apps/api/test/rrf.test.ts` — Normalized RRF math invariants.
- `apps/api/test/embeddings-load.test.ts` — Binary integrity, manifest validation.
- `apps/api/test/smoke-retrieval.test.ts` — Pipeline invariants (not hit counts).
- `apps/api/test/fixtures-drift.test.ts` — Catalog drift detection.
- `apps/api/test/upload-limits.test.ts` — File size + MIME validation.

---

## Future Enhancements

Listed in priority order (from the architectural ADR):

1. **Multimodal image embeddings** (Cohere `embed-v4.0` or Voyage) — Switch when catalog >50K products or QPS >5. Retains the `RetrievalIndex` abstraction; one-file swap.

2. **HNSW vector index** (`hnswlib-node`) — Replace linear cosine scan when query latency exceeds 50 ms at scale.

3. **External vector DB** (Qdrant / Pinecone) — For multi-tenant or geo-replicated deployments.

4. **Streaming rerank** — Show top-K results immediately via Server-Sent Events, refine as LLM rerank completes in background.

5. **Product image embeddings** — If catalog gains product images, use CLIP or multimodal embeddings to preserve visual signal vs text bridge.

6. **Eval in CI** — Gate regression: Hit@5 must not drop >5 percentage points vs main baseline.

7. **Fine-tuned embedding model** — Domain-specific fine-tuning on furniture vocabulary and Mongo descriptions.

8. **Query expansion** — LLM synonymizes user prompt into design vocabulary before embedding (e.g., "lumbar support" → "ergonomic, lower-back supportive").

9. **MMR diversity** — Maximal-Marginal-Relevance to prevent clustering of near-identical products in top-K.

10. **Admin rebuild embeddings** — UI button for `npm run build:embeddings` when catalog drifts significantly.

---

## Troubleshooting

### `/health/ready` returns 503

Embeddings artifact is corrupt or missing. Check:
- `data/embeddings/v1/vectors.bin` and `manifest.json` exist.
- Re-run `npm run build:embeddings` to regenerate.

### "Embed-dimension mismatch" error

The provider's embed model returns a different dimension than `data/embeddings/v1/manifest.json`. 

**Solution**: Either:
- Switch to a compatible provider (OpenAI `text-embedding-3-small` is default, 1536-dim), OR
- Rebuild with the new model: `EMBED_MODEL_ID=<model> npm run build:embeddings`.

Exact command is shown in the error message.

### Eval disabled ("Run Eval" button greyed out)

Evaluation requires two **distinct vendor keys** for judge vendor ≠ rerank vendor. Configure at least two providers in the Admin → Providers panel.

### Search latency > 10s

Reranking dominates. Toggle `rerank_enabled` off in Admin and re-run. If latency improves, consider raising `rerank_top_n` threshold or tuning `vlm_temperature` for faster VLM extraction.

---

## References

- **Assessment brief**: `assessment.md` — original task requirements.
- **Architecture & design decisions**: `.omc/plans/first-chair-final.md` — comprehensive RALPLAN consensus plan (1425 lines, ADR, alternatives, cost ceilings, follow-ups).
- **Development log**: `CHANGELOG.md` — prompts and decisions that shaped the implementation.
- **Test baselines**: `eval/fixtures/baselines/default.json` — golden eval metrics.

---

## License

Internal assessment deliverable.
