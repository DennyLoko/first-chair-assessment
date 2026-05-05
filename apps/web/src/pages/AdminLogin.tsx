import { useState } from 'react';
import { Icon } from '../components/Icon.tsx';

interface AdminLoginProps {
  onLogin: (user: { username: string }) => void;
}

const VALID = { username: 'admin', password: 'atelier2025' };

export default function AdminLogin({ onLogin }: AdminLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Enter your username and password to continue.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      if (username.trim().toLowerCase() === VALID.username && password === VALID.password) {
        onLogin({ username: username.trim() });
      } else {
        setError('Invalid credentials. Try admin / atelier2025.');
        setLoading(false);
      }
    }, 700);
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-left">
          <div>
            <div className="login-eyebrow">
              <span className="lock-pill">
                <Icon name="key" size={12} />
                Restricted area
              </span>
            </div>
            <h1 className="login-title">
              Sign in to the<br />
              <em>Atelier</em> back-office.
            </h1>
            <p className="login-lede">
              Internal tooling for retrieval &amp; ranking. Your session stays in this tab — no
              cookies, no telemetry.
            </p>
          </div>
          <div className="login-marks">
            <div className="mark-row">
              <span className="mark-num">01</span>
              <div>
                <div className="mark-name">Tune retrieval</div>
                <div className="mark-desc">Top-K, RRF constants, semantic × visual balance.</div>
              </div>
            </div>
            <div className="mark-row">
              <span className="mark-num">02</span>
              <div>
                <div className="mark-name">Configure ranking</div>
                <div className="mark-desc">Reranker, soft filters, dimension tolerance.</div>
              </div>
            </div>
            <div className="mark-row">
              <span className="mark-num">03</span>
              <div>
                <div className="mark-name">Run evaluation</div>
                <div className="mark-desc">Hit@K, MRR, LLM-judge scores on fixture set.</div>
              </div>
            </div>
          </div>
        </div>

        <form className="login-right" onSubmit={submit}>
          <div className="login-form-head">
            <div className="login-logo">
              <span className="dot"></span>
              Atelier <small>Admin</small>
            </div>
            <span className="login-version">v1.0.0</span>
          </div>

          <h2 className="login-form-title">Welcome back</h2>
          <p className="login-form-sub">Use your internal credentials to continue.</p>

          <label className="field-label">Username</label>
          <input
            className="input"
            placeholder="e.g. admin"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16 }}>
            <label className="field-label">Password</label>
            <button type="button" className="login-link" onClick={(e) => e.preventDefault()}>Forgot?</button>
          </div>
          <div className="pw-wrap">
            <input
              className="input"
              type={showPw ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="pw-toggle"
              onClick={() => setShowPw(s => !s)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              <Icon name="eye" size={14} />
            </button>
          </div>

          <label className="remember">
            <span
              className={`checkbox ${remember ? 'on' : ''}`}
              onClick={() => setRemember(r => !r)}
              role="checkbox"
              aria-checked={remember}
            >
              {remember && <Icon name="check" size={11} stroke={2.6} />}
            </span>
            Keep me signed in for this session
          </label>

          {error && (
            <div className="login-error">
              <Icon name="x" size={12} />
              {error}
            </div>
          )}

          <button className="btn btn-primary btn-block login-submit" type="submit" disabled={loading}>
            {loading
              ? <><span className="spinner"></span> Signing in…</>
              : <>Sign in <Icon name="arrowRight" size={14} /></>
            }
          </button>

          <div className="login-hint">
            <span className="hint-label">Demo credentials</span>
            <span className="hint-creds">
              <code>admin</code>
              <span style={{ color: 'var(--ink-3)' }}>/</span>
              <code>atelier2025</code>
            </span>
          </div>

          <div className="login-foot">
            Protected by Atelier SSO · Session-only · No cookies
          </div>
        </form>
      </div>
    </div>
  );
}
