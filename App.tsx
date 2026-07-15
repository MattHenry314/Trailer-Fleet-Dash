import { useEffect, useState, useCallback } from 'react';
import { api, getToken } from './api';
import type { Trailer, Opportunity, BillingException, Session } from './types';
import Overview from './components/Overview';
import FleetTab from './components/FleetTab';
import FullGantt from './components/FullGantt';
import FleetOperations from './components/FleetOperations';
import RateVisibility from './components/RateVisibility';
import Revenue from './components/Revenue';
import Remediation from './components/Remediation';
import RiskQuality from './components/RiskQuality';
import Login from './components/Login';
import TrailerDetailModal from './components/TrailerDetailModal';

const TABS = ['Overview', 'Full Gantt', 'Fleet', 'Fleet Operations', 'Rate Visibility', 'Revenue', 'Remediation', 'Risk & Quality'] as const;
type Tab = typeof TABS[number];

export default function App() {
  const [tab, setTab] = useState<Tab>('Overview');
  const [session, setSession] = useState<Session>({ email: null, role: 'public', token: null });
  const [showLogin, setShowLogin] = useState(false);

  const [fleet, setFleet] = useState<Trailer[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [exceptions, setExceptions] = useState<BillingException[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Trailer | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  const notify = useCallback((msg: string, isError = false) => {
    setToast({ msg, error: isError });
    setTimeout(() => setToast(null), 4500);
  }, []);

  // Requirement: database/read errors must be visible and must NEVER cause
  // a silent fallback to stale data.
  const refreshAll = useCallback(async () => {
    try {
      const [f, o, e] = await Promise.all([api.getFleet(), api.getOpportunities(), api.getExceptions()]);
      setFleet(f.fleet);
      setOpportunities(o.opportunities);
      setExceptions(e.exceptions);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load fleet data from the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (token) {
      api.me().then((d) => setSession({ email: d.email, role: d.role, token })).catch(() => {
        localStorage.removeItem('gfc_token');
      });
    }
    refreshAll();
  }, [refreshAll]);

  function handleLogin(email: string, role: string, token: string) {
    localStorage.setItem('gfc_token', token);
    setSession({ email, role: role as any, token });
    setShowLogin(false);
    notify(`Signed in as ${email} (${role}).`);
  }

  function logout() {
    localStorage.removeItem('gfc_token');
    setSession({ email: null, role: 'public', token: null });
    notify('Signed out.');
  }

  const trailerByKey = (key: string) => fleet.find((t) => t.trailerKey === key) || null;

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark">GF</div>
          <div>
            <div className="brand-title">Germfree Fleet Command</div>
            <div className="brand-sub">Fleet Operating System</div>
          </div>
        </div>
        <div className="session-box">
          <span className={`role-pill ${session.role}`}>{session.role === 'owner' ? 'Owner access' : session.role}</span>
          {session.email ? (
            <>
              <span>{session.email}</span>
              <button className="btn secondary" onClick={logout}>Sign out</button>
            </>
          ) : (
            <button className="btn" onClick={() => setShowLogin(true)}>Sign in</button>
          )}
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="main-content">
        {loadError && (
          <div className="card" style={{ borderColor: '#b3413a', background: '#fdf1ef' }}>
            <b>Data error:</b> {loadError}. The app will not silently fall back to stale data — please retry.
            <div><button className="btn" onClick={refreshAll}>Retry</button></div>
          </div>
        )}
        {loading && !loadError && <p>Loading fleet data…</p>}

        {!loading && !loadError && (
          <>
            {tab === 'Overview' && <Overview fleet={fleet} opportunities={opportunities} exceptions={exceptions} onSelect={setSelected} />}
            {tab === 'Full Gantt' && <FullGantt fleet={fleet} onSelect={setSelected} />}
            {tab === 'Fleet' && <FleetTab fleet={fleet} onSelect={setSelected} />}
            {tab === 'Fleet Operations' && (
              <FleetOperations fleet={fleet} opportunities={opportunities} session={session} onRefresh={refreshAll} notify={notify} />
            )}
            {tab === 'Rate Visibility' && <RateVisibility fleet={fleet} onSelect={setSelected} />}
            {tab === 'Revenue' && <Revenue fleet={fleet} />}
            {tab === 'Remediation' && <Remediation fleet={fleet} onSelect={setSelected} />}
            {tab === 'Risk & Quality' && <RiskQuality exceptions={exceptions} session={session} onRefresh={refreshAll} notify={notify} />}
          </>
        )}
      </div>

      {selected && <TrailerDetailModal trailer={trailerByKey(selected.trailerKey) || selected} onClose={() => setSelected(null)} />}
      {showLogin && (
        <div className="modal-backdrop" onClick={() => setShowLogin(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <Login onLoggedIn={handleLogin} />
          </div>
        </div>
      )}
      {toast && <div className={`toast ${toast.error ? 'error' : ''}`}>{toast.msg}</div>}
    </div>
  );
}
