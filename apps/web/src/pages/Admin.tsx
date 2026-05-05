import { useState, useEffect } from 'react';
import { Icon } from '../components/Icon.tsx';
import { apiFetch } from '../lib/api.ts';
import type { AdminParams } from '@first-chair/shared/schemas';

// ---- Sub-components ----

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const clamp = (v: number) => Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v));
  return (
    <div className="number-input-wrap">
      <button onClick={() => onChange(clamp(value - step))} aria-label="Decrease">
        <Icon name="minus" size={12} />
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(clamp(parseFloat(e.target.value) || 0))}
        min={min}
        max={max}
        step={step}
      />
      <button onClick={() => onChange(clamp(value + step))} aria-label="Increase">
        <Icon name="plus" size={12} />
      </button>
    </div>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`switch ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      type="button"
    />
  );
}

// ---- Cfg type (UI state) ----
interface Cfg {
  topK: number;
  denseTopN: number;
  lexicalTopN: number;
  rrfK: number;
  rrfTargetPool: number;
  rerankerOn: boolean;
  rerankTopN: number;
  softFilterWeight: number;
  dimTolerancePct: number;
  vlmTemperature: number;
  vlmMaxFeatures: number;
  rateLimitPerMin: number;
}

const DEFAULTS: Cfg = {
  topK: 8,
  denseTopN: 200,
  lexicalTopN: 100,
  rrfK: 60,
  rrfTargetPool: 100,
  rerankerOn: true,
  rerankTopN: 20,
  softFilterWeight: 0.15,
  dimTolerancePct: 30,
  vlmTemperature: 0,
  vlmMaxFeatures: 8,
  rateLimitPerMin: 60,
};

function apiParamsToCfg(p: Partial<AdminParams>): Cfg {
  return {
    topK: p.top_k_final ?? DEFAULTS.topK,
    denseTopN: p.dense_top_n ?? DEFAULTS.denseTopN,
    lexicalTopN: p.lexical_top_n ?? DEFAULTS.lexicalTopN,
    rrfK: p.rrf_k ?? DEFAULTS.rrfK,
    rrfTargetPool: p.rrf_target_pool ?? DEFAULTS.rrfTargetPool,
    rerankerOn: p.rerank_enabled ?? DEFAULTS.rerankerOn,
    rerankTopN: p.rerank_top_n ?? DEFAULTS.rerankTopN,
    softFilterWeight: p.soft_filter_weight ?? DEFAULTS.softFilterWeight,
    dimTolerancePct: p.hard_filter_dim_tolerance_pct ?? DEFAULTS.dimTolerancePct,
    vlmTemperature: p.vlm_temperature ?? DEFAULTS.vlmTemperature,
    vlmMaxFeatures: p.vlm_max_features ?? DEFAULTS.vlmMaxFeatures,
    rateLimitPerMin: p.rate_limit_per_minute ?? DEFAULTS.rateLimitPerMin,
  };
}

function cfgToApiParams(cfg: Cfg): AdminParams {
  return {
    top_k_final: cfg.topK,
    dense_top_n: cfg.denseTopN,
    lexical_top_n: cfg.lexicalTopN,
    rrf_k: cfg.rrfK,
    rrf_target_pool: cfg.rrfTargetPool,
    rerank_enabled: cfg.rerankerOn,
    rerank_top_n: cfg.rerankTopN,
    soft_filter_weight: cfg.softFilterWeight,
    hard_filter_dim_tolerance_pct: cfg.dimTolerancePct,
    vlm_temperature: cfg.vlmTemperature,
    vlm_max_features: cfg.vlmMaxFeatures,
    rate_limit_per_minute: cfg.rateLimitPerMin,
  };
}

// ---- Eval types ----
interface EvalResult {
  hitAt1?: number;
  hitAt3?: number;
  hitAt5?: number;
  hitAt8?: number;
  mrr?: number;
  judgeMean?: number;
  latencyP50?: number;
  latencyP95?: number;
  [key: string]: unknown;
}

// ---- Admin page ----
interface AdminProps {
  onSaved: (msg: string) => void;
}

type Section = 'retrieval' | 'ranking' | 'vlm' | 'eval';

export default function Admin({ onSaved }: AdminProps) {
  const [cfg, setCfg] = useState<Cfg>(DEFAULTS);
  const [savedCfg, setSavedCfg] = useState<Cfg>(DEFAULTS);
  const [section, setSection] = useState<Section>('retrieval');
  const [saving, setSaving] = useState(false);
  const [healthStatus, setHealthStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  // Eval state
  const [evalRunning, setEvalRunning] = useState(false);
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [evalError, setEvalError] = useState('');
  const [judgeApiKey, setJudgeApiKey] = useState('');

  const update = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg(c => ({ ...c, [k]: v }));
  const dirty = JSON.stringify(cfg) !== JSON.stringify(savedCfg);

  // Load params on mount
  useEffect(() => {
    apiFetch('/admin/params')
      .then(r => r.json())
      .then((data: Partial<AdminParams>) => {
        const loaded = apiParamsToCfg(data);
        setCfg(loaded);
        setSavedCfg(loaded);
      })
      .catch(() => {/* use defaults silently */});
  }, []);

  // Check health
  useEffect(() => {
    apiFetch('/health/ready')
      .then(r => setHealthStatus(r.ok ? 'ok' : 'error'))
      .catch(() => setHealthStatus('error'));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch('/admin/params', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cfgToApiParams(cfg)),
      });
      setSavedCfg(cfg);
      onSaved('Settings saved');
    } catch {
      onSaved('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const runEval = async () => {
    if (!judgeApiKey.trim()) {
      setEvalError('Enter an API key for the LLM judge below.');
      return;
    }
    setEvalRunning(true);
    setEvalError('');
    setEvalResult(null);
    try {
      const r = await apiFetch('/admin/eval', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ judgeApiKey: judgeApiKey.trim(), judgeProviderId: 'openai' }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({})) as { error?: string; hint?: string };
        throw new Error(err.hint ?? err.error ?? `Eval failed ${r.status}`);
      }
      const data = await r.json() as EvalResult;
      setEvalResult(data);
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : String(e));
    } finally {
      setEvalRunning(false);
    }
  };

  const loadEvalResults = async () => {
    try {
      const r = await apiFetch('/admin/eval');
      if (r.ok) {
        const data = await r.json() as EvalResult;
        setEvalResult(data);
      }
    } catch { /* silent */ }
  };

  const sections: { id: Section; label: string; n: string }[] = [
    { id: 'retrieval', label: 'Retrieval', n: '01' },
    { id: 'ranking', label: 'Ranking', n: '02' },
    { id: 'vlm', label: 'VLM', n: '03' },
    { id: 'eval', label: 'Eval', n: '04' },
  ];

  return (
    <div className="admin">
      <aside className="admin-side">
        <h2 className="side-title">Admin</h2>
        <p className="side-sub">Retrieval &amp; ranking controls</p>
        <nav className="side-nav">
          {sections.map(s => (
            <button
              key={s.id}
              className={section === s.id ? 'active' : ''}
              onClick={() => {
                setSection(s.id);
                if (s.id === 'eval') loadEvalResults();
              }}
              type="button"
            >
              {s.label}
              <span className="num">{s.n}</span>
            </button>
          ))}
        </nav>

        <div style={{ marginTop: 32, padding: 14, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 8 }}>
            System health
          </div>
          <div className="health-row">
            <span className={`health-dot ${healthStatus}`}></span>
            <span style={{ fontSize: 12.5 }}>
              {healthStatus === 'loading' && 'Checking…'}
              {healthStatus === 'ok' && 'System healthy'}
              {healthStatus === 'error' && 'Unreachable'}
            </span>
          </div>
          <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
            2,500 products indexed
          </div>
        </div>
      </aside>

      <main>
        {/* 01 — Retrieval */}
        {section === 'retrieval' && (
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Retrieval</h2>
                <p>Candidate pool sizes, RRF constants, and final result count.</p>
              </div>
              <span className="panel-tag">Stage 1</span>
            </div>
            <div className="control-grid">
              <div className="ctrl">
                <div className="ctrl-head">
                  <span className="ctrl-name">Top K Final</span>
                  <span className="ctrl-val">{cfg.topK}</span>
                </div>
                <input type="range" className="range" min={1} max={20} step={1}
                  value={cfg.topK} onChange={(e) => update('topK', parseInt(e.target.value))} />
                <div className="balance"><span>1</span><span>10</span><span>20</span></div>
                <p className="ctrl-help">Final number of results returned to the user after RRF + re-ranking.</p>
              </div>

              <div className="ctrl">
                <div className="ctrl-head">
                  <span className="ctrl-name">Dense top-N</span>
                  <span className="ctrl-val">{cfg.denseTopN}</span>
                </div>
                <input type="range" className="range" min={50} max={500} step={10}
                  value={cfg.denseTopN} onChange={(e) => update('denseTopN', parseInt(e.target.value))} />
                <div className="balance"><span>50</span><span>275</span><span>500</span></div>
                <p className="ctrl-help">Candidates from vector scan before RRF.</p>
              </div>

              <div className="ctrl">
                <div className="ctrl-head">
                  <span className="ctrl-name">Lexical top-N</span>
                  <span className="ctrl-val">{cfg.lexicalTopN}</span>
                </div>
                <input type="range" className="range" min={30} max={300} step={10}
                  value={cfg.lexicalTopN} onChange={(e) => update('lexicalTopN', parseInt(e.target.value))} />
                <div className="balance"><span>30</span><span>165</span><span>300</span></div>
                <p className="ctrl-help">Candidates from BM25 before RRF.</p>
              </div>

              <div className="ctrl">
                <div className="ctrl-head">
                  <span className="ctrl-name">RRF k</span>
                  <span className="ctrl-val">{cfg.rrfK}</span>
                </div>
                <input type="range" className="range" min={10} max={200} step={5}
                  value={cfg.rrfK} onChange={(e) => update('rrfK', parseInt(e.target.value))} />
                <div className="balance"><span>10</span><span>105</span><span>200</span></div>
                <p className="ctrl-help">RRF smoothing constant — higher = less aggressive ranking.</p>
              </div>

              <div className="ctrl" style={{ gridColumn: '1 / -1' }}>
                <div className="ctrl-head">
                  <span className="ctrl-name">RRF target pool</span>
                  <span className="ctrl-val">{cfg.rrfTargetPool}</span>
                </div>
                <input type="range" className="range" min={50} max={500} step={10}
                  value={cfg.rrfTargetPool} onChange={(e) => update('rrfTargetPool', parseInt(e.target.value))} />
                <div className="balance"><span>50</span><span>275</span><span>500</span></div>
                <p className="ctrl-help">Normalizes pool sizes across retrievers.</p>
              </div>
            </div>
          </div>
        )}

        {/* 02 — Ranking */}
        {section === 'ranking' && (
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Ranking</h2>
                <p>Post-retrieval transforms applied to candidates before they reach the user.</p>
              </div>
              <span className="panel-tag">Stage 2</span>
            </div>

            <div className="toggle-row">
              <div className="label-block">
                <div className="name">Cross-encoder re-ranker</div>
                <div className="desc">Run a second-pass relevance model over candidates. Improves precision.</div>
              </div>
              <Switch on={cfg.rerankerOn} onChange={(v) => update('rerankerOn', v)} />
            </div>

            <div className="control-grid" style={{ marginTop: 24 }}>
              <div className="ctrl">
                <div className="ctrl-head">
                  <span className="ctrl-name">Rerank top-N</span>
                  <span className="ctrl-val">{cfg.rerankTopN}</span>
                </div>
                <input type="range" className="range" min={5} max={50} step={1}
                  value={cfg.rerankTopN} onChange={(e) => update('rerankTopN', parseInt(e.target.value))} />
                <div className="balance"><span>5</span><span>27</span><span>50</span></div>
                <p className="ctrl-help">Number of candidates passed to the re-ranker.</p>
              </div>

              <div className="ctrl">
                <div className="ctrl-head">
                  <span className="ctrl-name">Soft filter weight</span>
                  <span className="ctrl-val">{cfg.softFilterWeight.toFixed(2)}</span>
                </div>
                <input type="range" className="range" min={0} max={1} step={0.01}
                  value={cfg.softFilterWeight} onChange={(e) => update('softFilterWeight', parseFloat(e.target.value))} />
                <div className="balance"><span>0.0</span><span>0.5</span><span>1.0</span></div>
                <p className="ctrl-help">Blend weight for soft attribute filtering.</p>
              </div>

              <div className="ctrl" style={{ gridColumn: '1 / -1' }}>
                <div className="ctrl-head">
                  <span className="ctrl-name">Dimension tolerance %</span>
                  <span className="ctrl-val">{cfg.dimTolerancePct}%</span>
                </div>
                <input type="range" className="range" min={0} max={100} step={5}
                  value={cfg.dimTolerancePct} onChange={(e) => update('dimTolerancePct', parseInt(e.target.value))} />
                <div className="balance"><span>0%</span><span>50%</span><span>100%</span></div>
                <p className="ctrl-help">Hard filter tolerance for dimension matching.</p>
              </div>
            </div>
          </div>
        )}

        {/* 03 — VLM */}
        {section === 'vlm' && (
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>VLM</h2>
                <p>Vision language model settings for image feature extraction.</p>
              </div>
              <span className="panel-tag">Stage 0</span>
            </div>
            <div className="control-grid">
              <div className="ctrl">
                <div className="ctrl-head">
                  <span className="ctrl-name">VLM temperature</span>
                  <span className="ctrl-val">{cfg.vlmTemperature.toFixed(2)}</span>
                </div>
                <input type="range" className="range" min={0} max={1} step={0.01}
                  value={cfg.vlmTemperature} onChange={(e) => update('vlmTemperature', parseFloat(e.target.value))} />
                <div className="balance"><span>0.0</span><span>0.5</span><span>1.0</span></div>
                <p className="ctrl-help">Lower = more deterministic VLM extraction.</p>
              </div>

              <div className="ctrl">
                <div className="ctrl-head">
                  <span className="ctrl-name">VLM max features</span>
                  <span className="ctrl-val">{cfg.vlmMaxFeatures}</span>
                </div>
                <NumberInput
                  value={cfg.vlmMaxFeatures}
                  onChange={(v) => update('vlmMaxFeatures', v)}
                  min={3}
                  max={20}
                />
                <p className="ctrl-help" style={{ marginTop: 8 }}>Max feature attributes extracted per image.</p>
              </div>

              <div className="ctrl" style={{ gridColumn: '1 / -1' }}>
                <div style={{
                  padding: '12px 16px',
                  background: 'var(--bg)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11.5,
                  color: 'var(--ink-3)',
                  lineHeight: 1.6,
                }}>
                  Vision model: <span style={{ color: 'var(--ink-2)' }}>gpt-4o-mini</span> · set via provider at session creation
                </div>
              </div>

              <div className="ctrl">
                <div className="ctrl-head">
                  <span className="ctrl-name">Rate limit / min</span>
                  <span className="ctrl-val">{cfg.rateLimitPerMin}</span>
                </div>
                <input type="range" className="range" min={10} max={600} step={10}
                  value={cfg.rateLimitPerMin} onChange={(e) => update('rateLimitPerMin', parseInt(e.target.value))} />
                <div className="balance"><span>10</span><span>305</span><span>600</span></div>
                <p className="ctrl-help">Max search requests per minute per session.</p>
              </div>
            </div>
          </div>
        )}

        {/* 04 — Eval */}
        {section === 'eval' && (
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Evaluation</h2>
                <p>Run the fixture test suite and inspect retrieval quality metrics.</p>
              </div>
              <span className="panel-tag">QA</span>
            </div>

            <div className="ctrl" style={{ marginBottom: 24 }}>
              <span className="field-label">LLM Judge API key</span>
              <input
                type="password"
                className="input mono"
                placeholder="sk-•••• — used only for the judge LLM call"
                value={judgeApiKey}
                onChange={e => setJudgeApiKey(e.target.value)}
              />
              <p className="ctrl-help">The judge evaluates top-K results per fixture. Can be the same OpenAI key used for search.</p>
            </div>
            <div style={{ marginBottom: 24 }}>
              <button
                className="btn btn-primary"
                onClick={runEval}
                disabled={evalRunning || !judgeApiKey.trim()}
                type="button"
              >
                {evalRunning
                  ? <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }}></span> Running…</>
                  : <><Icon name="play" size={13} /> Run Evaluation</>
                }
              </button>
            </div>

            {evalError && (
              <div className="login-error" style={{ marginBottom: 16 }}>
                <Icon name="x" size={12} />
                {evalError}
              </div>
            )}

            {evalResult && (
              <table className="eval-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {evalResult.hitAt1 != null && (
                    <tr><td>Hit@1</td><td>{(evalResult.hitAt1 * 100).toFixed(1)}%</td></tr>
                  )}
                  {evalResult.hitAt3 != null && (
                    <tr><td>Hit@3</td><td>{(evalResult.hitAt3 * 100).toFixed(1)}%</td></tr>
                  )}
                  {evalResult.hitAt5 != null && (
                    <tr><td>Hit@5</td><td>{(evalResult.hitAt5 * 100).toFixed(1)}%</td></tr>
                  )}
                  {evalResult.hitAt8 != null && (
                    <tr><td>Hit@8</td><td>{(evalResult.hitAt8 * 100).toFixed(1)}%</td></tr>
                  )}
                  {evalResult.mrr != null && (
                    <tr><td>MRR</td><td>{evalResult.mrr.toFixed(3)}</td></tr>
                  )}
                  {evalResult.judgeMean != null && (
                    <tr><td>LLM-judge mean</td><td>{evalResult.judgeMean.toFixed(3)}</td></tr>
                  )}
                  {evalResult.latencyP50 != null && (
                    <tr><td>Latency p50</td><td>{evalResult.latencyP50}ms</td></tr>
                  )}
                  {evalResult.latencyP95 != null && (
                    <tr><td>Latency p95</td><td>{evalResult.latencyP95}ms</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {!evalResult && !evalError && !evalRunning && (
              <p style={{ fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic' }}>
                No results yet. Click "Run Evaluation" to start.
              </p>
            )}
          </div>
        )}

        <div className="admin-foot">
          <div className="status">
            <span className={`dot ${dirty ? 'dirty' : ''}`}></span>
            {dirty ? 'Unsaved changes' : 'All settings saved'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-ghost"
              onClick={() => setCfg(savedCfg)}
              disabled={!dirty}
              type="button"
            >
              <Icon name="rotate" size={13} /> Reset
            </button>
            <button
              className="btn btn-primary"
              onClick={save}
              disabled={!dirty || saving}
              type="button"
            >
              {saving
                ? <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }}></span> Saving…</>
                : <><Icon name="save" size={13} /> Save Settings</>
              }
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
