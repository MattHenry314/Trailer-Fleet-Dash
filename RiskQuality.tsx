import { useState } from 'react';
import type { BillingException, Session } from '../types';
import { api } from '../api';

export default function RiskQuality({
  exceptions, session, onRefresh, notify
}: { exceptions: BillingException[]; session: Session; onRefresh: () => Promise<void>; notify: (m: string, isErr?: boolean) => void }) {
  const canEdit = session.role === 'editor' || session.role === 'owner';
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function resolve(key: string, status: 'resolved' | 'reopened') {
    try {
      await api.resolveException(key, { status, note: notes[key] || '' });
      notify(status === 'resolved' ? 'Exception resolved.' : 'Exception reopened.');
      await onRefresh();
    } catch (e: any) { notify(e.message, true); }
  }

  const open = exceptions.filter((e) => e.status !== 'resolved');
  const resolved = exceptions.filter((e) => e.status === 'resolved');

  return (
    <div>
      <div className="card">
        <h2>Billing Exceptions — Open ({open.length})</h2>
        {open.length === 0 && <p className="small-muted">No open exceptions.</p>}
        <div className="stack-gap">
          {open.map((e) => (
            <div key={e.key} className={`card exception-row ${e.status}`} style={{ marginBottom: 0 }}>
              <b>{e.trailerName}</b> <span className="small-muted">#{e.trailerId}</span>
              <div>{e.type}</div>
              <div className="small-muted">{e.detail}</div>
              {canEdit && (
                <div className="filters-row" style={{ marginTop: '0.5rem' }}>
                  <input type="text" placeholder="Audit note…" value={notes[e.key] || ''} onChange={(ev) => setNotes({ ...notes, [e.key]: ev.target.value })} style={{ flex: 1 }} />
                  <button className="btn" onClick={() => resolve(e.key, 'resolved')}>Resolve</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Resolved ({resolved.length})</h2>
        <div className="stack-gap">
          {resolved.map((e) => (
            <div key={e.key} className={`card exception-row ${e.status}`} style={{ marginBottom: 0 }}>
              <b>{e.trailerName}</b> — {e.type}
              <div className="small-muted">Resolved by {e.resolvedBy} · {e.note}</div>
              {canEdit && <button className="link-btn" onClick={() => resolve(e.key, 'reopened')}>Reopen</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
