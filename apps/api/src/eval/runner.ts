import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LLMProvider } from '../providers/types.js';
import type { Fixture } from '@first-chair/shared/schemas';
import { FixtureSchema, JudgeOutputSchema } from '@first-chair/shared/schemas';
import { JUDGE_PROMPT_SYSTEM, JUDGE_PROMPT_USER_TEMPLATE, JUDGE_PROMPT_VERSION } from './judge.js';
import { aggregateMetrics, type EvalMetrics } from './metrics.js';
import { getDb } from '../data/mongo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../../../../eval/fixtures');

export interface EvalResult {
  runAt: string;
  judgePromptVersion: string;
  judgeProviderId: string;
  metrics: EvalMetrics;
  staleFixtures: string[];
}

let lastResult: EvalResult | null = null;

export function getLastEvalResult(): EvalResult | null {
  return lastResult;
}

async function loadFixtures(): Promise<Fixture[]> {
  const entries = await readdir(FIXTURES_DIR);
  const fixtures: Fixture[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const raw = JSON.parse(await readFile(join(FIXTURES_DIR, entry), 'utf8'));
    const parsed = FixtureSchema.safeParse(raw);
    if (parsed.success) fixtures.push(parsed.data);
  }
  return fixtures;
}

async function checkFreshness(fixture: Fixture): Promise<boolean> {
  const db = getDb();
  const expectedIds = fixture.expectedMatchIds;
  for (const id of expectedIds) {
    const doc = await db.collection('products').findOne({ _id: id as unknown as import('mongodb').ObjectId });
    if (!doc) return false;
  }
  return true;
}

function fillTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

async function judgeCandidate(
  judgeProvider: LLMProvider,
  product: Record<string, unknown>
): Promise<number | null> {
  if (!judgeProvider.chatText) return null;

  const userMsg = fillTemplate(JUDGE_PROMPT_USER_TEMPLATE, product);

  try {
    const attempt = async (): Promise<number | null> => {
      const response = await judgeProvider.chatText!([
        { role: 'system', content: JUDGE_PROMPT_SYSTEM },
        { role: 'user', content: userMsg },
      ]);
      const parsed = JudgeOutputSchema.safeParse(JSON.parse(response));
      if (parsed.success) return parsed.data.score;
      return null;
    };

    const result = await attempt();
    if (result !== null) return result;

    const retryResponse = await judgeProvider.chatText([
      { role: 'system', content: JUDGE_PROMPT_SYSTEM },
      { role: 'user', content: userMsg + '\nRe-emit valid JSON matching the schema. Do not include prose.' },
    ]);
    const retried = JudgeOutputSchema.safeParse(JSON.parse(retryResponse));
    return retried.success ? retried.data.score : null;
  } catch {
    return null;
  }
}

export async function runEval(
  judgeProvider: LLMProvider,
  searchFn: (fixture: Fixture) => Promise<{ resultIds: string[]; latencyMs: number }>
): Promise<EvalResult> {
  console.log(`[eval] Starting eval with JUDGE_PROMPT_VERSION=${JUDGE_PROMPT_VERSION}`);

  const fixtures = await loadFixtures();
  console.log(`[eval] Loaded ${fixtures.length} fixtures`);

  const staleFixtures: string[] = [];
  const fixtureResults: Array<{
    resultIds: string[];
    expectedIds: string[];
    judgeScores: number[];
    latencyMs: number;
    stale: boolean;
  }> = [];

  for (const fixture of fixtures) {
    const fresh = await checkFreshness(fixture);
    if (!fresh) {
      staleFixtures.push(fixture.id);
      fixtureResults.push({ resultIds: [], expectedIds: fixture.expectedMatchIds, judgeScores: [], latencyMs: 0, stale: true });
      console.log(`[eval] Fixture ${fixture.id} is stale — excluded from metrics`);
      continue;
    }

    const { resultIds, latencyMs } = await searchFn(fixture);

    const top3 = resultIds.slice(0, 3);
    const db = getDb();
    const judgeScores: number[] = [];

    for (const productId of top3) {
      const doc = await db.collection('products').findOne({ _id: productId as unknown as import('mongodb').ObjectId });
      if (!doc) continue;
      const score = await judgeCandidate(judgeProvider, doc as Record<string, unknown>);
      if (score !== null) judgeScores.push(score);
    }

    fixtureResults.push({ resultIds, expectedIds: fixture.expectedMatchIds, judgeScores, latencyMs, stale: false });
  }

  if (staleFixtures.length > 0) {
    console.log(`[eval] Fixtures: ${fixtures.length - staleFixtures.length} fresh, ${staleFixtures.length} stale and excluded.`);
    console.log(`[eval] Re-curate stale fixtures: ${staleFixtures.join(', ')}`);
  }

  const metrics = aggregateMetrics(fixtureResults);
  const result: EvalResult = {
    runAt: new Date().toISOString(),
    judgePromptVersion: JUDGE_PROMPT_VERSION,
    judgeProviderId: judgeProvider.id,
    metrics,
    staleFixtures,
  };

  lastResult = result;
  return result;
}
