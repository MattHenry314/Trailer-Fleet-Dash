import { useRef, useState } from 'react';
import type { Trailer, Opportunity, Session } from '../types';
import { api } from '../api';
import { fmtDate, fmtMoney } from '../dateUtils';
import StatusBadge from './StatusBadge';
import { STATUSES_CONST } from '../constants';

export default function FleetOperations({
  fleet, opportunities, session, onRefresh, notify
}: {
  fleet: Trailer[]; opportunities: Opportunity[]; session: Session;
  onRefresh: () => Promise<void>; notify: (msg: string, isError?: boolean) => void;
}) {
  const canEdit = session.role === 'editor' || session.role === 'owner';
  const isOwner = session.role === 'owner';

  // New opportunity form state
  const [customer, setCustomer] = useState('');
  const [projectName, setProjectName] = useState('');
  const [category, setCategory] = useState<'Pharmacy' | 'BSL2'>('Pharmacy');
  const [requiredStart, setRequiredStart] = useState('');
  const [requiredEnd, setRequiredEnd] = useState('');
  const [customerRate, setCustomerRate] = useState('');
  const [rateStage, setRateStage] = useState('unpriced');
  const [submitting, setSubmitting] = useState(false);

  // Fleet record edit state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  // Workbook upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Editors
  const [newEditorEmail, setNewEditorEmail] = useState('');
  const [newEditorRole, setNewEditorRole] = useState('editor');
  const [editors, setEditors] = useState<any[]>([]);

  async function loadEditors() {
    try {
      const d = await api.getEditors();
      setEditors(d.editors);
    } catch (e: any) { notify(e.message, true); }
  }

  async function submitOpportunity(e: React.FormEvent) {
    e.preventDefault();
    if (!customer || !projectName || !requiredStart || !requiredEnd) {
      notify('Customer, project name, and both dates are required.', true);
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.createOpportunity({
        customer, projectName, category, requiredStart, requiredEnd,
        customerRate: customerRate ? Number(customerRate) : null, rateStage
      });
      const opp = result.opportunity;
      if (opp.status === 'assigned') {
        notify(`Matched to ${opp.assignedTrailerKey} — ${opp.matchNotes}`);
      } else {
        notify('No eligible trailer found — saved to Manual Review.');
      }
      setCustomer(''); setProjectName(''); setRequiredStart(''); setRequiredEnd(''); setCustomerRate(''); setRateStage('unpriced');
      await onRefresh();
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setSubmitting(false);
    }
  }

  async function reoptimize(id: number) {
    try {
      const r = await api.reoptimizeOpportunity(id);
      notify(r.matchResult?.status === 'assigned' ? `Re-optimized: ${r.matchResult.notes}` : 'Still in manual review — no eligible trailer.');
      await onRefresh();
    } catch (e: any) { notify(e.message, true); }
  }

  async function removeOpp(id: number) {
    if (!confirm('Remove this opportunity? Its active assignment will also be removed from the Gantt.')) return;
    try {
      await api.removeOpportunity(id);
      notify('Opportunity removed.');
      await onRefresh();
    } catch (e: any) { notify(e.message, true); }
  }

  async function saveRate(id: number, rate: string, stage: string) {
    try {
      await api.updateOpportunity(id, { customerRate: rate ? Number(rate) : null, rateStage: stage });
      notify('Opportunity rate updated.');
      await onRefresh();
    } catch (e: any) { notify(e.message, true); }
  }

  function startEdit(t: Trailer) {
    setEditingKey(t.trailerKey);
    setEditForm({
      currentClient: t.currentClient || '',
      leaseStart: t.leaseStart || '',
      leaseEnd: t.leaseEnd || '',
      status: t.status || 'Available',
      actualMonthlyRent: t.actualMonthlyRent?.toString() || '',
      trueAvailableDate: t.trueAvailableDate || ''
    });
  }

  async function saveFleetRecord(key: string) {
    try {
      const result = await api.updateTrailer(key, {
        currentClient: editForm.currentClient || null,
        leaseStart: editForm.leaseStart || null,
        leaseEnd: editForm.leaseEnd || null,
        status: editForm.status,
        actualMonthlyRent: editForm.actualMonthlyRent ? Number(editForm.actualMonthlyRent) : null,
        trueAvailableDate: editForm.trueAvailableDate || null
      });
      notify(result.rateHistoryAdded ? 'Saved. Rate history entry added.' : 'Saved. No rate history change (unchanged values).');
      setEditingKey(null);
      await onRefresh();
    } catch (e: any) { notify(e.message, true); }
  }

  async function uploadWorkbook() {
    const file = fileRef.current?.files?.[0];
    if (!file) { notify('Choose a workbook file first.', true); return; }
    setUploading(true);
    try {
      const r = await api.refreshWorkbook(file);
      notify(`Workbook refreshed: ${r.recordCount} records imported. App-managed data preserved.`);
      await onRefresh();
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setUploading(false);
    }
  }

  async function addEditor() {
    try {
      await api.addEditor(newEditorEmail, newEditorRole);
      setNewEditorEmail('');
      notify('Editor saved.');
      await loadEditors();
    } catch (e: any) { notify(e.message, true); }
  }

  const editableFleet = fleet.filter((t) => !t.pairedNonCore);

  return (
    <div>
      {!canEdit && (
        <div className="card"><p>You are signed in as a <b>{session.role}</b>. Fleet Operations is read-only for your role — contact the fleet owner to request editor access.</p></div>
      )}

      <div className="card">
        <h2>New Opportunity</h2>
        <form onSubmit={submitOpportunity} className="field-grid">
          <div className="field"><label>Customer</label><input type="text" value={customer} onChange={(e) => setCustomer(e.target.value)} disabled={!canEdit} /></div>
          <div className="field"><label>Project / Opportunity name</label><input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} disabled={!canEdit} /></div>
          <div className="field"><label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as any)} disabled={!canEdit}>
              <option value="Pharmacy">Pharmacy</option>
              <option value="BSL2">BSL2</option>
            </select>
          </div>
          <div className="field"><label>Required start</label><input type="date" value={requiredStart} onChange={(e) => setRequiredStart(e.target.value)} disabled={!canEdit} /></div>
          <div className="field"><label>Required end</label><input type="date" value={requiredEnd} onChange={(e) => setRequiredEnd(e.target.value)} disabled={!canEdit} /></div>
          <div className="field"><label>Customer rate (optional)</label><input type="number" value={customerRate} onChange={(e) => setCustomerRate(e.target.value)} disabled={!canEdit} /></div>
          <div className="field"><label>Rate stage</label>
            <select value={rateStage} onChange={(e) => setRateStage(e.target.value)} disabled={!canEdit}>
              {['unpriced', 'draft', 'quoted', 'approved', 'contracted'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field" style={{ alignSelf: 'end' }}>
            <button className="btn" type="submit" disabled={!canEdit || submitting}>{submitting ? 'Matching…' : 'Add & Auto-Match'}</button>
          </div>
        </form>
        <p className="small-muted">The app finds the best eligible trailer automatically — you never choose a trailer directly. If required dates cannot be met exactly, the earliest conflict-free window is recommended. If nothing is eligible, the opportunity is saved to Manual Review.</p>
      </div>

      <div className="card">
        <h2>Assignment Queue / Opportunities</h2>
        <table>
          <thead><tr><th>Customer</th><th>Project</th><th>Category</th><th>Required</th><th>Status</th><th>Assigned</th><th>Rate</th><th></th></tr></thead>
          <tbody>
            {opportunities.map((o) => (
              <tr key={o.id}>
                <td>{o.customer}</td>
                <td>{o.projectName}</td>
                <td>{o.category}</td>
                <td>{fmtDate(o.requiredStart)} → {fmtDate(o.requiredEnd)}</td>
                <td>{o.status === 'assigned' ? <span className="badge available">Assigned</span> : <span className="badge conflict">Manual Review</span>}
                  {o.matchNotes && <div className="small-muted">{o.matchNotes}</div>}
                </td>
                <td>{o.assignedTrailerKey ? <>{o.assignedTrailerKey.split('::')[1]?.toUpperCase()}<div className="small-muted">{fmtDate(o.recommendedStart)} → {fmtDate(o.recommendedEnd)}</div></> : '—'}</td>
                <td>
                  {canEdit ? (
                    <RateEditor opp={o} onSave={saveRate} />
                  ) : (o.customerRate ? fmtMoney(o.customerRate) : 'Unpriced')}
                </td>
                <td>
                  {canEdit && (
                    <div className="stack-gap">
                      <button className="link-btn" onClick={() => reoptimize(o.id)}>Re-optimize</button>
                      <button className="link-btn" style={{ color: '#b3413a' }} onClick={() => removeOpp(o.id)}>Remove</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {opportunities.length === 0 && <tr><td colSpan={8} className="small-muted">No opportunities yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Fleet Records</h2>
        <table>
          <thead><tr><th>Trailer</th><th>Client</th><th>Status</th><th>Lease Start</th><th>Lease End</th><th>Actual Rent</th><th>True Available</th><th></th></tr></thead>
          <tbody>
            {editableFleet.map((t) => (
              editingKey === t.trailerKey ? (
                <tr key={t.trailerKey}>
                  <td>{t.trailerName}</td>
                  <td><input type="text" value={editForm.currentClient} onChange={(e) => setEditForm({ ...editForm, currentClient: e.target.value })} /></td>
                  <td>
                    <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                      {STATUSES_CONST.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td><input type="date" value={editForm.leaseStart} onChange={(e) => setEditForm({ ...editForm, leaseStart: e.target.value })} /></td>
                  <td><input type="date" value={editForm.leaseEnd} onChange={(e) => setEditForm({ ...editForm, leaseEnd: e.target.value })} /></td>
                  <td><input type="number" value={editForm.actualMonthlyRent} onChange={(e) => setEditForm({ ...editForm, actualMonthlyRent: e.target.value })} /></td>
                  <td><input type="date" value={editForm.trueAvailableDate} onChange={(e) => setEditForm({ ...editForm, trueAvailableDate: e.target.value })} /></td>
                  <td>
                    <button className="btn" onClick={() => saveFleetRecord(t.trailerKey)}>Save</button>{' '}
                    <button className="btn secondary" onClick={() => setEditingKey(null)}>Cancel</button>
                  </td>
                </tr>
              ) : (
                <tr key={t.trailerKey}>
                  <td>{t.trailerName}</td>
                  <td>{t.currentClient || '—'}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td>{fmtDate(t.leaseStart)}</td>
                  <td>{fmtDate(t.leaseEnd)}</td>
                  <td>{t.isUnpriced ? 'Unpriced' : fmtMoney(t.actualMonthlyRent)}</td>
                  <td>{fmtDate(t.trueAvailableDate)}</td>
                  <td>{canEdit && <button className="link-btn" onClick={() => startEdit(t)}>Edit</button>}</td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Workbook Sync</h2>
        <p className="small-muted">Editor-only. Refreshes configuration/readiness data from TRAILER CONTROL without ever overwriting app-managed opportunities, assignments, rate history, exclusions, or fleet overrides.</p>
        <div className="filters-row">
          <input type="file" ref={fileRef} accept=".xlsx" disabled={!canEdit} />
          <button className="btn" onClick={uploadWorkbook} disabled={!canEdit || uploading}>{uploading ? 'Refreshing…' : 'Refresh from Workbook'}</button>
        </div>
      </div>

      {isOwner && (
        <div className="card">
          <h2>Editors <span className="small-muted">(owner only)</span></h2>
          <button className="link-btn" onClick={loadEditors}>Load current editors</button>
          {editors.length > 0 && (
            <table>
              <thead><tr><th>Email</th><th>Role</th><th></th></tr></thead>
              <tbody>
                {editors.map((e) => (
                  <tr key={e.email}>
                    <td>{e.email}</td><td>{e.role}</td>
                    <td><button className="link-btn" style={{ color: '#b3413a' }} onClick={async () => { await api.removeEditor(e.email); loadEditors(); }}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="filters-row" style={{ marginTop: '0.75rem' }}>
            <input type="email" placeholder="email@company.com" value={newEditorEmail} onChange={(e) => setNewEditorEmail(e.target.value)} />
            <select value={newEditorRole} onChange={(e) => setNewEditorRole(e.target.value)}>
              <option value="editor">editor</option>
              <option value="viewer">viewer</option>
              <option value="owner">owner</option>
            </select>
            <button className="btn" onClick={addEditor}>Save Editor</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RateEditor({ opp, onSave }: { opp: Opportunity; onSave: (id: number, rate: string, stage: string) => void }) {
  const [rate, setRate] = useState(opp.customerRate?.toString() || '');
  const [stage, setStage] = useState(opp.rateStage);
  return (
    <div className="stack-gap">
      <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="rate" style={{ width: 100 }} />
      <select value={stage} onChange={(e) => setStage(e.target.value)}>
        {['unpriced', 'draft', 'quoted', 'approved', 'contracted'].map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <button className="link-btn" onClick={() => onSave(opp.id, rate, stage)}>Save</button>
    </div>
  );
}
