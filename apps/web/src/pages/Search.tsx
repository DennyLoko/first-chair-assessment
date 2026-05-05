import { useState } from 'react';
import ImageDropzone from '../components/ImageDropzone.tsx';
import { ensureSession, clearSession, authHeaders } from '../lib/session.ts';
import type { SearchResponse } from '@first-chair/shared/schemas';

type Status = 'idle' | 'connecting' | 'ready' | 'searching' | 'error';

export default function Search() {
  const [providerId] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  async function connect() {
    setStatus('connecting');
    setError('');
    try {
      await ensureSession(providerId, apiKey);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }

  async function search() {
    if (!image) return;
    setStatus('searching');
    setError('');
    try {
      const fd = new FormData();
      fd.append('image', image);
      if (query.trim()) fd.append('query', query.trim());
      const r = await fetch('/api/search', { method: 'POST', headers: authHeaders(), body: fd });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Search failed ${r.status}`);
      }
      setResponse(await r.json() as SearchResponse);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('ready');
    }
  }

  function disconnect() {
    clearSession();
    setStatus('idle');
    setResponse(null);
    setApiKey('');
    setImage(null);
    setQuery('');
  }

  const connected = status === 'ready' || status === 'searching';

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6">
      {/* Connect */}
      {!connected && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
          <h2 className="font-semibold text-gray-700">Connect</h2>
          <div className="flex gap-2">
            <span className="px-3 py-2 text-sm bg-gray-100 rounded border border-gray-200 text-gray-600">OpenAI</span>
            <input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
              onKeyDown={e => e.key === 'Enter' && apiKey && connect()}
            />
            <button
              onClick={connect}
              disabled={!apiKey || status === 'connecting'}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {status === 'connecting' ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </div>
      )}

      {/* Connected header */}
      {connected && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span className="text-green-600 font-medium">Connected — OpenAI</span>
          <button onClick={disconnect} className="text-xs text-gray-400 hover:text-red-500">Disconnect</button>
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 rounded p-3">{error}</p>}

      {/* Search form */}
      {connected && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
          <ImageDropzone onFile={setImage} />
          {image && <p className="text-xs text-gray-500">Selected: <span className="font-medium">{image.name}</span> ({(image.size / 1024 / 1024).toFixed(1)} MB)</p>}
          <input
            type="text"
            placeholder="Optional: refine with text (e.g. 'blue velvet sofa')"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            onClick={search}
            disabled={!image || status === 'searching'}
            className="w-full py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {status === 'searching' ? 'Searching…' : 'Search'}
          </button>
        </div>
      )}

      {/* Results */}
      {response && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-700">{response.results.length} matches</h2>
            <button onClick={() => setShowDebug(v => !v)} className="text-xs text-gray-400 hover:text-gray-600">
              {showDebug ? 'Hide debug' : 'Show debug'}
            </button>
          </div>

          {response.results.map((r, i) => (
            <div key={r.productId} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">#{i + 1}</span>
                    <span className="font-medium text-gray-800 truncate">{r.title ?? r.productId}</span>
                    {r.embedding_stale && <span className="text-xs text-amber-500 shrink-0">stale</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {[r.category, r.type, r.price != null ? `$${r.price}` : null, (r.width && r.height && r.depth) ? `${r.width}×${r.height}×${r.depth} cm` : null].filter(Boolean).join(' · ')}
                  </div>
                  {r.rationale && <p className="text-xs text-gray-600 mt-2 italic">{r.rationale}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-mono font-semibold text-blue-600">{r.rrfScore.toFixed(4)}</div>
                  <div className="text-xs text-gray-400">rrf</div>
                </div>
              </div>
            </div>
          ))}

          {showDebug && (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 text-xs font-mono overflow-auto">
              <p className="font-semibold text-gray-600 mb-2">Diagnostics</p>
              <pre className="text-gray-700 whitespace-pre-wrap">{JSON.stringify(response.diagnostics, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
