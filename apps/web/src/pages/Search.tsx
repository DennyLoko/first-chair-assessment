import { useState, useRef, useEffect } from 'react';
import { Icon } from '../components/Icon.tsx';
import { authHeaders } from '../lib/session.ts';
import type { SearchResponse, SearchResultItem } from '@first-chair/shared/schemas';

// Category hue map for placeholder images
const CATEGORY_HUES: Record<string, number> = {
  sofa: 65,
  sofas: 65,
  chair: 85,
  chairs: 85,
  table: 35,
  tables: 35,
  lighting: 85,
  storage: 200,
};

function getCategoryHue(category?: string): number {
  if (!category) return 60;
  const key = category.toLowerCase();
  for (const [prefix, hue] of Object.entries(CATEGORY_HUES)) {
    if (key.startsWith(prefix)) return hue;
  }
  return 60;
}

// ---- PlaceholderImage ----
function PlaceholderImage({ category, type }: { category?: string; type?: string }) {
  const hue = getCategoryHue(category);
  return (
    <div
      className="placeholder"
      style={{
        backgroundColor: `oklch(92% 0.02 ${hue})`,
        backgroundImage: `linear-gradient(135deg, transparent 49%, oklch(80% 0.04 ${hue}) 49%, oklch(80% 0.04 ${hue}) 51%, transparent 51%), linear-gradient(45deg, transparent 49%, oklch(80% 0.04 ${hue}) 49%, oklch(80% 0.04 ${hue}) 51%, transparent 51%)`,
        backgroundSize: '14px 14px',
      }}
    >
      <span className="ph-label">{type ?? 'Furniture'}</span>
    </div>
  );
}

// ---- ProductCard ----
function ProductCard({
  result,
  matchPct,
  saved,
  onToggleSave,
}: {
  result: SearchResultItem;
  matchPct: number;
  saved: boolean;
  onToggleSave: (id: string) => void;
}) {
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  return (
    <article className="card">
      <div className="imgbox">
        <PlaceholderImage category={result.category} type={result.type} />
        <div className="match-badge">
          <span className="dot"></span>
          {matchPct}% match
        </div>
        <button
          className={`save-btn ${saved ? 'saved' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleSave(result.productId); }}
          aria-label="Save"
        >
          <Icon name="bookmark" size={13} />
        </button>
      </div>
      <div className="meta-top">
        <span>{[result.category, result.type].filter(Boolean).join(' · ')}</span>
        <span>{result.type}</span>
      </div>
      <h3 className="title">{result.title ?? result.productId}</h3>
      {result.description && <p className="desc">{result.description}</p>}
      <div className="footer">
        <div className="price">{result.price != null ? fmt.format(result.price) : '—'}</div>
        {(result.width || result.height || result.depth) && (
          <div className="dims">
            {[result.width, result.height, result.depth].map(v => v ?? '—').join(' × ')} cm
            <div style={{ marginTop: 2, opacity: 0.7 }}>W · H · D</div>
          </div>
        )}
      </div>
    </article>
  );
}

// ---- SkeletonCard ----
function SkeletonCard() {
  return (
    <div className="skel-card">
      <div className="skel skel-img"></div>
      <div className="skel skel-row" style={{ width: '50%' }}></div>
      <div className="skel skel-row" style={{ width: '80%', height: 14 }}></div>
      <div className="skel skel-row" style={{ width: '100%' }}></div>
      <div className="skel skel-row" style={{ width: '60%' }}></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
        <div className="skel" style={{ width: 70, height: 22 }}></div>
        <div className="skel" style={{ width: 90, height: 12 }}></div>
      </div>
    </div>
  );
}

// ---- EmptyState ----
function EmptyState() {
  return (
    <div className="empty">
      <div className="icon-block">
        <Icon name="upload" size={22} stroke={1.4} />
      </div>
      <h3>Upload an image to get started</h3>
      <p>
        Drop a photo of any chair, table, lamp or shelf — we'll surface the closest pieces
        from the Atelier catalog by visual + semantic similarity.
      </p>
    </div>
  );
}

// ---- ImageUploader ----
interface ImageUploaderProps {
  file: File | null;
  previewUrl: string | null;
  setFile: (f: File | null, url: string | null) => void;
  detail: string;
  setDetail: (s: string) => void;
  suggestions: string[];
  activeSuggestions: string[];
  toggleSuggestion: (s: string) => void;
  onSearch: () => void;
  loading: boolean;
  sessionActive: boolean;
}

function ImageUploader({
  file,
  previewUrl,
  setFile,
  detail,
  setDetail,
  suggestions,
  activeSuggestions,
  toggleSuggestion,
  onSearch,
  loading,
  sessionActive,
}: ImageUploaderProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files || !files[0]) return;
    const f = files[0];
    if (!f.type.startsWith('image/')) return;
    const url = URL.createObjectURL(f);
    setFile(f, url);
  };

  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setDragging(true);
    }
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const tag = ((e.target as HTMLElement)?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.type?.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) handleFiles(Object.assign([f], { item: () => f, namedItem: () => null }));
          break;
        }
      }
    };
    const blockWindowDrop = (e: DragEvent) => {
      if (!(e.target as HTMLElement)?.closest?.('.dropzone')) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
      }
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('dragover', blockWindowDrop);
    window.addEventListener('drop', blockWindowDrop);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragover', blockWindowDrop);
      window.removeEventListener('drop', blockWindowDrop);
    };
  }, []);

  const canSearch = !!file && sessionActive;

  return (
    <div className="uploader-card">
      {!file ? (
        <div
          className={`dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={onDragOver}
          onDragEnter={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="icon-wrap">
            <Icon name="image" size={22} stroke={1.4} />
          </div>
          <h3>{dragging ? 'Drop your image' : 'Drop a furniture photo'}</h3>
          <p>
            or <span className="browse-link">browse files</span> · paste from clipboard
          </p>
          <div className="formats">JPG · PNG · HEIC · up to 8 MB</div>
        </div>
      ) : (
        <div className="preview-wrap">
          <div className="thumb">
            <img src={previewUrl ?? ''} alt={file.name} />
            <button
              className="remove"
              onClick={(e) => { e.stopPropagation(); setFile(null, null); }}
              aria-label="Remove"
            >
              <Icon name="x" size={11} />
            </button>
          </div>
          <div className="preview-meta">
            <p className="fname">{file.name}</p>
            <p className="fmeta">{(file.size / 1024).toFixed(0)} KB · {file.type.split('/')[1]?.toUpperCase()}</p>
            <div className="analyzing">
              <span style={{ color: 'var(--accent-ink)' }}><Icon name="sparkle" size={13} /></span>
              Image ready · ready to match
            </div>
          </div>
        </div>
      )}

      <div className="detail-input-wrap">
        <input
          className="detail-input"
          placeholder='Add extra details… (e.g. "I want it in dark wood")'
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
        />
      </div>

      <div className="detail-suggest">
        {suggestions.map(s => (
          <button
            key={s}
            className={`chip ${activeSuggestions.includes(s) ? 'active' : ''}`}
            onClick={() => toggleSuggestion(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="search-bar">
        <button
          className="search-btn"
          disabled={!canSearch || loading}
          onClick={onSearch}
        >
          {loading ? (
            <><span className="spinner"></span> Searching…</>
          ) : (
            <><Icon name="search" size={15} /> {!sessionActive ? 'Add API key to search' : 'Find similar pieces'} <span style={{ opacity: 0.6, fontFamily: 'var(--font-mono)', fontSize: 11 }}>⌘K</span></>
          )}
        </button>
      </div>

      {!sessionActive && (
        <p className="session-hint" style={{ padding: '0 6px 10px', textAlign: 'center' }}>
          Enter your OpenAI key in settings (⚙) to enable search.
        </p>
      )}
    </div>
  );
}

// ---- Search page ----
type Phase = 'empty' | 'loading' | 'results' | 'error';

interface SearchProps {
  sessionActive: boolean;
}

export default function Search({ sessionActive }: SearchProps) {
  const [file, setFileState] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [activeSuggestions, setActiveSuggestions] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('empty');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<SearchResponse['diagnostics'] | null>(null);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<'match' | 'price-asc' | 'price-desc'>('match');
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const suggestions = ['Dark wood', 'Bouclé', 'Natural linen', 'Brass', 'Mid-century', 'For a narrow living room'];

  const setFile = (f: File | null, url: string | null) => {
    // Revoke previous object URL if any
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFileState(f);
    setPreviewUrl(url);
  };

  const toggleSuggestion = (s: string) => {
    setActiveSuggestions(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  };

  const onToggleSave = (id: string) => {
    setSavedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  async function onSearch() {
    if (!file || !sessionActive) return;
    setPhase('loading');
    setResults([]);
    setDiagnostics(null);

    const fd = new FormData();
    fd.append('image', file);
    if (detail.trim()) fd.append('query', detail.trim());
    if (activeSuggestions.length > 0) {
      const existing = (fd.get('query') as string) || '';
      fd.set('query', [existing, ...activeSuggestions].filter(Boolean).join(', '));
    }

    try {
      const r = await fetch('/api/search', { method: 'POST', headers: authHeaders(), body: fd });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `Search failed ${r.status}`);
      }
      const data = await r.json() as SearchResponse;
      setResults(data.results);
      setDiagnostics(data.diagnostics);
      setPhase('results');
    } catch (e) {
      setPhase('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const sortedResults = [...results].sort((a, b) => {
    if (sortBy === 'price-asc') return (a.price ?? 0) - (b.price ?? 0);
    if (sortBy === 'price-desc') return (b.price ?? 0) - (a.price ?? 0);
    return b.rrfScore - a.rrfScore;
  });

  // Normalize rrfScore across the result set: best → ~98%, worst → ~72%
  const scores = sortedResults.map(r => r.rrfScore);
  const maxScore = Math.max(...scores, 0.001);
  const minScore = Math.min(...scores, 0);
  const scoreRange = maxScore - minScore;
  const matchPctFor = (s: number) =>
    Math.round(scoreRange > 0.0001 ? 72 + ((s - minScore) / scoreRange) * 26 : 85);

  return (
    <div className="page">
      {/* Hero */}
      <section className="hero">
        <div>
          <div className="eyebrow"><span className="pulse"></span> Visual + Semantic Search · Hybrid Retrieval</div>
          <h1>
            Find the chair<br />
            you saw <em>once</em>,<br />
            in a magazine.
          </h1>
          <p className="lede">
            Drop a photograph — a screenshot, a memory, anything — and Atelier surfaces the
            closest pieces from our catalog by silhouette, material and mood.
          </p>
          <div className="stat-row">
            <div className="stat">
              <div className="num">2,500</div>
              <div className="lbl">Pieces Indexed</div>
            </div>
            <div className="stat">
              <div className="num">&lt; 10s</div>
              <div className="lbl">Avg. Search</div>
            </div>
            <div className="stat">
              <div className="num" style={{ fontSize: 18, paddingTop: 5 }}>Hybrid</div>
              <div className="lbl">Retrieval</div>
            </div>
          </div>
        </div>

        <ImageUploader
          file={file}
          previewUrl={previewUrl}
          setFile={setFile}
          detail={detail}
          setDetail={setDetail}
          suggestions={suggestions}
          activeSuggestions={activeSuggestions}
          toggleSuggestion={toggleSuggestion}
          onSearch={onSearch}
          loading={phase === 'loading'}
          sessionActive={sessionActive}
        />
      </section>

      {/* Error */}
      {phase === 'error' && (
        <div style={{ color: 'var(--danger)', fontFamily: 'var(--font-mono)', fontSize: 12, marginTop: 12 }}>
          {error}
        </div>
      )}

      {/* Results */}
      <section>
        <div className="results-header">
          <div>
            <h2 className="results-title">
              {phase === 'empty' && 'Awaiting your image'}
              {phase === 'loading' && 'Searching the catalog…'}
              {phase === 'results' && 'Closest matches'}
              {phase === 'error' && 'Search failed'}
            </h2>
            {phase === 'results' && (
              <div className="results-meta" style={{ marginTop: 6 }}>
                <b>{results.length}</b> results · ranked by visual + semantic similarity
                {activeSuggestions.length > 0 && <> · filtered by <b>{activeSuggestions.join(', ')}</b></>}
              </div>
            )}
          </div>
          {phase === 'results' && (
            <div className="toolbar">
              <select
                className="toolbar-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              >
                <option value="match">Sort: best match</option>
                <option value="price-asc">Sort: price ↑</option>
                <option value="price-desc">Sort: price ↓</option>
              </select>
            </div>
          )}
        </div>

        {phase === 'empty' && <EmptyState />}

        {phase === 'loading' && (
          <div className="grid">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {phase === 'results' && (
          <div className="grid">
            {sortedResults.map(r => (
              <ProductCard
                key={r.productId}
                result={r}
                matchPct={matchPctFor(r.rrfScore)}
                saved={savedIds.includes(r.productId)}
                onToggleSave={onToggleSave}
              />
            ))}
          </div>
        )}

        {diagnostics && (
          <details className="debug-panel">
            <summary>Debug — VLM extraction + diagnostics</summary>
            <pre className="debug-pre">{JSON.stringify(diagnostics, null, 2)}</pre>
          </details>
        )}
      </section>
    </div>
  );
}
