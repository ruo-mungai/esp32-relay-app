import { useState } from 'react';
import { useAuth } from '../auth.jsx';

function EyeIcon({ off }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {off ? (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.1 3.7M6.2 6.2A17 17 0 0 0 2 12s3.6 6 10 6a9.7 9.7 0 0 0 4-.8" />
        </>
      ) : (
        <>
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

const FEATURES = [
  'Live inverter telemetry, GPS and sensor data',
  'Role-based access for admins, managers and field teams',
  'Automatic relay cutoff for overdue accounts',
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password, remember);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <aside className="auth-brand">
        <div>
          <div className="auth-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M13 2 4.5 13H11l-1 9 8.5-11H12l1-9Z" strokeLinejoin="round" />
            </svg>
          </div>
          <h1>Inverter Cloud</h1>
          <p className="auth-tagline">
            Monitor and manage your fleet of inverter controllers from one place.
          </p>
        </div>

        <ul className="auth-features">
          {FEATURES.map((f) => (
            <li key={f}>
              <span className="auth-check" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              {f}
            </li>
          ))}
        </ul>

        <p className="auth-copy">© 2026 Inverter Cloud</p>
      </aside>

      <main className="auth-main">
        <form className="auth-card" onSubmit={submit}>
          <h2>Welcome back</h2>
          <p className="auth-sub">Sign in to your account to continue</p>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="pw">
              <input
                id="password"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                <EyeIcon off={show} />
              </button>
            </div>
          </div>

          <label className="remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span className="remember-box" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            <span>Keep me signed in</span>
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button className="auth-btn" disabled={busy} type="submit">
            {busy ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>

          <div className="auth-demo">
            <strong>Demo access</strong>
            <span>admin@example.com · admin123</span>
          </div>
        </form>
      </main>
    </div>
  );
}
