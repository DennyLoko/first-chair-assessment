# First Chair — Image-Based Product Search

Project memory for Claude Code and any AI agent working on this repo. Read this first; then read `assessment.md` (task brief) and `.omc/plans/first-chair-final.md` (RALPLAN consensus plan, Architect + Critic approved at iteration 3).

## What this is

A take-home assessment: full-stack TypeScript app that accepts a furniture image (with optional natural-language refinement) and returns ranked matches from a read-only MongoDB catalog of ~2,500 products. The grading bar is **match relevance**, not novelty.

## Stack

| Layer    | Technology                                                 |
|----------|------------------------------------------------------------|
| Frontend | React 19 + TypeScript + Vite + Tailwind + zustand          |
| Backend  | Node 20 + TypeScript + Fastify 5 + Pino + Zod              |
| Shared   | npm workspaces; `packages/shared/` for Zod + canonical text |

## Hard constraints (do NOT violate)

- Catalog is **read-only** Mongo. Connection string lives in `assessment.md`. Do not modify the database, do not assume Atlas Vector Search exists.
- User's API key is **in memory only** (server-side `Map<sessionId, {keys, roles}>`). No disk persistence, no logs, no env files at runtime.
- Session ID via `X-Session-Id` header. No cookies, no `cookie-parser` in dependencies.
- No `JSON.stringify(product)` in canonical text. Use the deterministic builder in `packages/shared/src/canonical.ts` (NFC, locale-stable lowercase, fixed precision, `model=` prefix).
- `data/embeddings/v1/{vectors.bin, manifest.json}` is built at dev time via `npm run build:embeddings` and committed (~15 MB regular blob, no LFS in v1). Runtime drift surfaces as `embedding_stale` / `manifest_miss` diagnostics, never silent re-embedding.
- Embed-dim reconciliation runs at **session creation** (`POST /session/key`, `PUT /session/roles`), not per query. `EmbedModelMismatchError` is a typed UI surface.
- LLM judge for eval requires a **second-vendor key** (hard precondition, not a fallback). Disabled "Run Eval" button when not configured.
- All documentation in **English**. User prompts logged in `CHANGELOG.md` are always recorded in English — translate before logging if the original was in another language; do not retain the original.

## Workflow rules

1. **CHANGELOG.md is a deliverable.** Every relevant prompt the developer gives must be appended with date, short rationale, and outcome. "Relevant" = drives an architectural / search-pipeline / ranking decision OR changes shipping code or docs. Setup prompts (commits, tooling) get one-liners; design prompts get full entries.
2. **Search/retrieval/ranking gets the most detail** in CHANGELOG, per `assessment.md`.
3. **Phased delivery** per `.omc/plans/first-chair-final.md` §7. Cut-line guidance lives in the same section. Do not skip phases.
4. **Authoring vs reviewing are separate passes.** Implementation by `executor`/`fullstack-developer`; review by `code-reviewer` / `verifier` in a separate lane. Never self-approve.
5. **Verify before claiming done.** UI changes require a browser session, not just type-check + tests. Tests verify code correctness, not feature correctness.

## Anti-slop rules

- No fallbacks dressed as features. Capability mismatches throw typed errors; UIs gate features on prerequisites; no silent metric degradation.
- Don't add features beyond the plan. If the plan is wrong, update the plan first.
- Don't add error handling for impossible states. Trust internal contracts; validate at boundaries.
- Don't write comments that re-narrate code. Comments only for non-obvious WHY (hidden constraints, workarounds).

## Where things live

- `apps/api/` — Fastify backend (routes, providers, search pipeline, eval runner).
- `apps/web/` — React frontend (search page, admin tab, debug panel).
- `packages/shared/` — Zod schemas, canonical text builder, judge prompt + version constant.
- `data/embeddings/v1/` — committed embeddings artifact.
- `eval/fixtures/` — system-independent eval fixtures (≥25 target; floor 10–15 for the ship cut).
- `.omc/plans/first-chair-final.md` — full design spec (1425 lines, ADR included). **This is the canonical source of truth for design decisions.**
- `.omc/` is gitignored (planning artifacts are session state, not version-controlled).

## Common commands (added as scripts land)

- `npm run dev` — start api + web concurrently.
- `npm run build:embeddings` — fetch catalog from Mongo, embed, write `data/embeddings/v1/`. Build-time provider key from `apps/api/.env` (gitignored).
- `npm test` — vitest across api + shared.
- `npm run eval` — run fixtures end-to-end, write `eval/results/*.json`.

## Typed errors to surface (never crash silently)

- `MissingCapabilityError(capability, providerId)` — provider lacks needed capability.
- `EmbedModelMismatchError({ providerId, providerEmbedModel, providerDim, manifestEmbedModel, manifestDim })` — runtime embed model dim ≠ committed `vectors.bin`.
- `EmbeddingArtifactCorruptError({ kind, ... })` — `vectors.bin` byte length mismatch, manifest count mismatch, or malformed entry.
- `SessionNotProvisionedError({ missing: providerId[] })` — `/search` called with empty roles or missing required keys → 412.

## ADR pointer

Architecture rationale, alternatives considered (multimodal embeddings, Mongo `$text`, external vector DB), cost ceiling for switching strategies, and follow-ups all live in `.omc/plans/first-chair-final.md` §11. Cite that section in code comments when a non-obvious choice needs justification — do not duplicate the rationale inline.
