import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { searchRoutes } from '../src/routes/search.js';
import * as store from '../src/session/store.js';
import type { SessionState } from '@first-chair/shared/types';

vi.mock('../src/data/embeddings.js', () => ({
  embeddingsArtifact: null,
  isDegraded: false,
  manifest: null,
  getVector: null,
}));

vi.mock('../src/search/pipeline.js', () => ({
  runSearch: vi.fn(async () => ({
    results: [],
    diagnostics: { poolSizes: { dense: 0, lexical: 0 }, rrfInputs: [], embeddingStaleCount: 0, manifestMissCount: 0, latencyMs: 0 },
  })),
}));

async function buildApp(session: SessionState | null, sessionId = 'test-session-id') {
  const app = Fastify({ logger: false });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 }, attachFieldsToBody: false });

  vi.spyOn(store, 'getSession').mockReturnValue(session ?? undefined);
  vi.spyOn(store, 'refreshSession').mockImplementation(() => {});

  await app.register(searchRoutes);
  return app;
}

function makeSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    keys: { openai: { apiKey: 'sk-test', lastSeenAt: new Date() } },
    roles: { visionProviderId: 'openai', embedProviderId: 'openai', rerankProviderId: 'openai', judgeProviderId: 'openai' },
    createdAt: new Date(),
    lastSeenAt: new Date(),
    ...overrides,
  };
}

describe('search preconditions — 412 guards', () => {
  it('POST /search with no X-Session-Id → 401', async () => {
    const app = await buildApp(null);
    const res = await app.inject({ method: 'POST', url: '/search' });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('session_required');
  });

  it('POST /search with empty roles → 412 session_not_provisioned', async () => {
    const session = makeSession({ roles: {} });
    const app = await buildApp(session);
    const res = await app.inject({
      method: 'POST',
      url: '/search',
      headers: { 'x-session-id': 'test-session-id' },
    });
    expect(res.statusCode).toBe(412);
    expect(JSON.parse(res.body).error).toBe('session_not_provisioned');
  });

  it('POST /search with roles but missing key for required role → 412', async () => {
    const session = makeSession({
      keys: {},
      roles: { visionProviderId: 'openai', embedProviderId: 'openai', rerankProviderId: 'openai', judgeProviderId: 'openai' },
    });
    const app = await buildApp(session);
    const res = await app.inject({
      method: 'POST',
      url: '/search',
      headers: { 'x-session-id': 'test-session-id' },
    });
    expect(res.statusCode).toBe(412);
    expect(JSON.parse(res.body).error).toBe('session_not_provisioned');
  });
});
