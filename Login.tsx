import { useState } from 'react';
import { api } from '../api';

export default function Login({ onLoggedIn }: { onLoggedIn: (email: string, role: string, token: string) => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api.login(email);
      onLoggedIn(d.email, d.role, d.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-box card">
      <h2>Sign in</h2>
      <p className="small-muted">Enter your work email to identify yourself. Owners and editors get write access; everyone else is read-only.</p>
      <form onSubmit={submit} className="stack-gap">
        <input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      {error && <p style={{ color: '#b3413a' }}>{error}</p>}
    </div>
  );
}
