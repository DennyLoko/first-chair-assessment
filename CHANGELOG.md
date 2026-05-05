# Changelog

All notable changes to this project, with the prompts that drove them. Per the assessment, the focus is on **search, retrieval, and ranking** decisions; setup and tooling get one-line entries, design and code-impacting prompts get full entries with rationale and outcome.

Prompts are recorded in English. When the original prompt was in another language, it is translated before logging — the original is not retained.

## [Unreleased]

### 2026-05-05 — BM25 tuple/object shape bug — add regression test

#### Prompt — One result returning incomplete data

> `There's one result, when uploading a sofa image, returning incomplete data.`

- **Rationale:** During live API validation a search returned 8 results but one had no `productId`, `title`, or other fields — only `rrfScore: 0.975` and `lexicalRank: 100`. The anomalously high score (vs ~0.016 for all other results) pointed to a scoring accumulation bug.
- **Root cause:** `wink-bm25-text-search` returns results as `[docId, score]` tuples, but `bm25Index.ts` declared the interface as `{ ref: string; score: number }`. `h.ref` resolved to `undefined` for every BM25 hit. `lexical.ts` mapped `h.ref` → `undefined` as the hit ID. RRF accumulated all 100 lexical contributions under the `undefined` key (sum ≈ Σ 1/(60+rank) for rank 1..100 ≈ 0.975), producing a phantom result with no product data. Products that appeared in both dense and lexical results only received their dense contribution — no lexical boost.
- **Fix:** Corrected `bm25Index.ts` to destructure tuples: `index.search(query, n).map(([id, score]) => ({ id, score }))`. Updated `lexical.ts` from `h.ref` → `h.id`.
- **Files changed:** `apps/api/src/data/bm25Index.ts`, `apps/api/src/search/lexical.ts`.
- **Impact on retrieval quality:** RRF scores now reflect the combined dense + lexical signal per product (range 0.025–0.032) instead of near-identical dense-only contributions (~0.0163). Hybrid retrieval is working as designed.

#### Prompt — Add regression test for BM25 shape contract

> `I want [a unit test for the BM25 shape].`

- **Rationale:** The tuple/object mismatch was invisible to existing tests because `smoke-retrieval.test.ts` mocks `lexicalSearch` directly, bypassing the real library. A regression here would silently break search quality.
- **Outcome:** Added `apps/api/test/bm25-shape.test.ts` — uses the **real** `wink-bm25-text-search` (not mocked). Asserts: `hit.id` is a non-empty string; `hit.score` is positive and finite; `Array.isArray(hit)` is false; `hit.ref` is `undefined` (explicit guard against the old buggy interface). 42 tests now passing across 7 suites.

---

### 2026-05-05 — API startup and search bugs found during live validation

#### Prompt — Start the API for me

> `Start the API for me, please.`

- **Rationale:** First `npm run dev` after the team implementation revealed three startup/runtime bugs.
- **Bugs fixed:**
  1. **`MongoParseError` on startup** — `apps/api/src/data/mongo.ts` instantiated `MongoClient` at module level before `dotenv/config` loaded, so `MONGO_URI` was `undefined`. Fix: lazy `getClient()` factory + `import 'dotenv/config'` as first line of `index.ts`.
  2. **`judge.ts` template literal syntax error** — `${{price}}` inside a backtick string was parsed as `${` `{price}` `}` — JS tried to evaluate `{price}` as an expression. Fix: escaped as `\${{price}}`.
  3. **BM25 `defineConfig` must precede `definePrepTasks`** — wink-bm25 enforces call order; the two calls were in reverse order. Fix: swap order in `bm25Index.ts`.

#### Prompt — There was an error in the search

> `There was an error in the search.`

- **Rationale:** First search attempt after startup fix returned 500 from `pipeline.ts`.
- **Bugs fixed:**
  1. **`POST /session/roles` returning 404** — route was registered as `app.put(...)` but spec and UI both use `POST`. Fix: `app.put` → `app.post` in `apps/api/src/routes/session.ts`.
  2. **`prepareInput(...).filter is not a function`** — `wink-bm25-text-search` requires `definePrepTasks` to be called so it knows how to tokenize queries; without it the library returns the raw string and `.filter()` fails. Fix: added `engine.definePrepTasks([(s) => s.toLowerCase().split(/\W+/).filter(Boolean)])` after `defineConfig`.

#### Prompt — Blank screen after search

> `A blank screen loaded when I searched.`

- **Rationale:** API returned 200 with valid data but UI rendered nothing. Root cause: `Search.tsx` defined its own local TypeScript interfaces (`product.title`, `scores.final`) that did not match the actual `SearchResponse` shape (`productId`, `rrfScore`).
- **Fix:** Replaced local interface declarations with `import type { SearchResponse } from '@first-chair/shared/schemas'`. Now TypeScript enforces the contract at compile time — shape drift breaks the build.
- **Note:** This gap (UI defining its own types instead of importing from shared) would not have been caught by the backend tests. An end-to-end type check across the HTTP boundary requires either a shared schema import (now done) or an integration test that deserializes the real response.

---

### 2026-05-05 — Implement Phase 2 backend: complete provider adapters and eval module

- **Rationale:** Phase 2 completes the backend by wiring Anthropic and Google provider adapters fully, implementing the eval runner with the frozen `JUDGE_PROMPT_VERSION='v1'` judge prompt (verbatim from §6.4.1), and adding `POST /admin/eval` with the judge-independence precondition gate (412 if `judgeProviderId === rerankProviderId`). The eval module enforces pre-run fixture freshness checks (strict any-absent rule), excludes stale fixtures from aggregate metrics, and logs a re-curation summary. Metrics computed: Hit@1/3/5/8, MRR, LLM-judge mean, latency p50/p95.
- **Key decisions:**
  - **Judge prompt frozen at `JUDGE_PROMPT_VERSION='v1'`** (re-exported from `packages/shared/src/schemas.ts`) — canonical declaration ensures any future bump is a breaking change visible in the shared package's diff.
  - **Judge independence is a hard precondition** — `POST /admin/eval` returns 412 `judge_independence_required` when `judgeProviderId === rerankProviderId` or when no judge key is configured. No silent fallback.
  - **Stale fixtures excluded from all aggregates** (Hit@K, MRR, judge mean, latency) — strict any-absent rule per §6.6.
  - **Anthropic `textEmbedDimensions()` returns `null`** — `POST /session/key` with `embedProviderId='anthropic'` returns `MissingCapabilityError('text_embed')` before any network call.
  - **Google `textEmbedDimensions()` returns 768** — mismatch against the default 1536-dim `vectors.bin` surfaces `EmbedModelMismatchError` at session creation with the rebuild command in the typed error body.

### 2026-05-04 — Bootstrap and consensus plan

#### Prompt — RALPLAN consensus planning

> `/oh-my-claudecode:ralplan @assessment.md`

- **Rationale:** Run the consensus planning workflow (Planner → Architect → Critic, max 5 iterations) on the assessment brief before any implementation, so design decisions are explicitly argued, alternatives are invalidated on record, and the implementer starts with a defensible plan.
- **Outcome:** 3-iteration loop converged at `APPROVE`. Final plan at `.omc/plans/first-chair-final.md` (1425 lines, gitignored as session state).
- **Search-pipeline decisions captured in the plan (highlights):**
  - **Architecture A (chosen):** VLM image extract → canonical text → hybrid retrieval (BM25 + dense `text-embedding-3-small` linear scan over 2.5K vectors) → normalized RRF (`k=60, targetPool=100`) → optional LLM rerank top-20 → top-K=8.
  - **Architecture B (deferred):** multimodal embeddings (Cohere `embed-v4.0` / Voyage / Vertex). Cost ceiling for switching: catalog > 50K, sustained QPS > 5, or LLM-judge mean < 0.55.
  - **Architecture C (invalidated as primary):** Mongo `$text` only — no semantic similarity, weak on furniture vocabulary mismatches. Kept as the lexical leg of the hybrid via `wink-bm25-text-search`.
  - **Embeddings precomputed at dev time** and committed under `data/embeddings/v1/`. Runtime drift surfaces as `embedding_stale` / `manifest_miss` diagnostics; no silent re-embedding at request time.
  - **Cross-provider correctness:** `EmbedModelMismatchError` thrown at session creation when the user's selected embed model dim ≠ `manifest.dimensions`. Multi-vendor mode allows separate vendors for vision / embed / rerank / judge.
  - **Eval:** ≥25 system-independent fixtures (external query images, Mongo-filter-derived expected IDs, ≥5 with second-rater). `JUDGE_PROMPT_VERSION='v1'` frozen with rubric anchors `1.0 / 0.7 / 0.4 / 0.0`. Judge-vendor independence is a hard precondition (412 if not satisfied — no silent fallback).
  - **Normalized RRF math** (verified during consensus): `RRF(d) = Σᵢ 1 / (k + rᵢ × TARGET_POOL/|poolᵢ|)`. Per-rank contribution at fixed `rank=1` increases monotonically as `poolSizeRaw` grows, approaching `1/k = 0.016667` from below.
- **Iterations:**
  - **i1:** Architect `ENDORSE_WITH_CHANGES` (10 revisions; caught two own factual errors — hallucinated `data/products_2025_10.txt` and `onfly-frontend.md` — neither exists). Critic `ITERATE` (2 BLOCKERs, 5 MAJORs, 3 MINORs).
  - **i2:** Architect `ENDORSE_WITH_CHANGES` (6 surgical revisions; caught a real RRF test invariant math bug). Critic `ITERATE` (3 BLOCKERs: cross-provider dim mismatch, judge prompt verbatim, multipart 10 MB; 4 MAJORs; 2 MINORs).
  - **i3:** Architect `ENDORSE_WITH_CHANGES` (9 surgical revisions; caught RRF wording inversion — math says "increases" but text said "decreases"). Critic `APPROVE`.
- **Final plan applied:** `.omc/plans/first-chair-final.md`.

#### Prompt — Initial commit

> `Before anything else, make the initial commit of the repository.`

- **Rationale:** Baseline the repo before any implementation lands so subsequent diffs are clean.
- **Outcome:** Commit `5c21843` — `chore: initial commit with assessment brief and agent toolkit` (40 files, 6907 insertions). `.omc/` planning artifacts intentionally gitignored.

#### Prompt — Project memory and changelog protocol

> `Create a CLAUDE.md to follow what's asked in assessment.md. Every relevant prompt given should be listed in CHANGELOG.md. Always write any documentation in English.`

- **Rationale:** Establish durable project instructions for Claude Code (CLAUDE.md) and the changelog-of-prompts deliverable required by `assessment.md`. Lock the documentation language to English.
- **Outcome:** Created `CLAUDE.md` (project memory: stack, hard constraints, workflow rules, anti-slop rules, file map, typed errors, ADR pointer) and `CHANGELOG.md` (this file). All future relevant prompts will be appended here.
