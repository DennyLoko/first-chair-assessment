import { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon.tsx';
import { ensureSession, clearSession } from '../lib/session.ts';

interface HeaderProps {
  tab: 'search' | 'admin';
  setTab: (t: 'search' | 'admin') => void;
  sessionActive: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  adminUser: { username: string } | null;
  onSignOut: () => void;
}

export default function Header({
  tab,
  setTab,
  sessionActive,
  onConnect,
  onDisconnect,
  theme,
  setTheme,
  adminUser,
  onSignOut,
}: HeaderProps) {
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <header className="header">
      <div className="header-inner">
        <div className="logo">
          <span className="dot"></span>
          Atelier
          <small>Search</small>
        </div>
        <nav className="nav">
          <button
            className={`nav-btn ${tab === 'search' ? 'active' : ''}`}
            onClick={() => setTab('search')}
          >
            Catalog / Search
          </button>
          <button
            className={`nav-btn ${tab === 'admin' ? 'active' : ''}`}
            onClick={() => setTab('admin')}
          >
            Admin
            {adminUser && (
              <span style={{ marginLeft: 6, opacity: 0.7, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                · {adminUser.username}
              </span>
            )}
          </button>
        </nav>
        <div className="header-spacer"></div>
        <div className="header-actions">
          {sessionActive && (
            <span className="connected-badge">
              <span className="dot"></span>
              Connected
            </span>
          )}
          {adminUser && (
            <button className="btn btn-ghost" onClick={onSignOut} style={{ padding: '6px 12px', fontSize: 12 }}>
              Sign out
            </button>
          )}
          <button
            className="icon-btn"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            aria-label="Toggle theme"
            title={theme === 'light' ? 'Dark mode' : 'Light mode'}
          >
            <Icon name={theme === 'light' ? 'moon' : 'sun'} size={17} />
          </button>
          <div className="popover-wrap" ref={popRef}>
            <button
              className="icon-btn"
              onClick={() => setOpen(o => !o)}
              aria-label="Settings"
            >
              <Icon name="settings" size={17} />
              {!sessionActive && <span className="ping" />}
            </button>
            {open && (
              <SettingsPopover
                sessionActive={sessionActive}
                onConnect={onConnect}
                onDisconnect={onDisconnect}
                onClose={() => setOpen(false)}
              />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

interface SettingsPopoverProps {
  sessionActive: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onClose: () => void;
}

function SettingsPopover({ sessionActive, onConnect, onDisconnect, onClose }: SettingsPopoverProps) {
  const [draft, setDraft] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!draft.trim()) return;
    setConnecting(true);
    setError('');
    try {
      await ensureSession('openai', draft.trim());
      onConnect();
      setTimeout(onClose, 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    clearSession();
    onDisconnect();
    onClose();
  };

  return (
    <div className="popover" role="dialog" aria-label="Settings">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{
          width: 28, height: 28, borderRadius: 6,
          background: 'var(--accent-soft)', color: 'var(--accent-ink)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="key" size={14} />
        </span>
        <div style={{ flex: 1 }}>
          <div className="popover-title">Provider API Key</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
            session-only · not persisted
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} style={{ width: 28, height: 28 }}>
          <Icon name="close" size={14} />
        </button>
      </div>

      {sessionActive ? (
        <>
          <p className="popover-sub">
            OpenAI session is active. Your key is stored in session memory only.
          </p>
          <button className="btn btn-ghost btn-block" onClick={disconnect}>
            Disconnect
          </button>
        </>
      ) : (
        <>
          <p className="popover-sub">
            Paste your OpenAI key. We keep it in memory for this tab —
            it never touches localStorage or our servers.
          </p>
          <label className="field-label">Secret key</label>
          <input
            type="password"
            className="input mono"
            placeholder="sk-•••• •••• •••• ••••"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            autoFocus
            disabled={connecting}
          />
          {error && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--danger)', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn btn-ghost" onClick={() => setDraft('')} disabled={connecting}>
              Clear
            </button>
            <div style={{ flex: 1 }}></div>
            <button
              className="btn btn-primary"
              onClick={save}
              disabled={!draft.trim() || connecting}
            >
              {connecting
                ? <><span className="popover-spinner" /> Connecting…</>
                : <>Save key <span className="kbd">↵</span></>
              }
            </button>
          </div>
        </>
      )}
    </div>
  );
}
