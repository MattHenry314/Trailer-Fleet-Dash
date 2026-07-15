import { useEffect, useState } from 'react';
import type { Trailer, RateHistoryEntry } from '../types';
import { fmtDate, fmtMoney } from '../dateUtils';
import { api } from '../api';
import StatusBadge from './StatusBadge';

export default function TrailerDetailModal({ trailer, onClose }: { trailer: Trailer; onClose: () => void }) {
  const [history, setHistory] = useState<RateHistoryEntry[]>([]);

  useEffect(() => {
    api.getRateHistory(trailer.trailerKey).then((d) => setHistory(d.history)).catch(() => setHistory([]));
  }, [trailer.trailerKey]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>{trailer.trailerName} <span className="small-muted">#{trailer.trailerId}</span></h2>
        <div className="stack-gap">
          <div><StatusBadge status={trailer.status} /> {trailer.pairedNonCore && <span className="badge paired">Paired NG-02/NG-03 package</span>} {trailer.soldHistorical && <span className="badge sold">Historical / Sold</span>} {trailer.readinessConflict && <span className="badge conflict">Readiness conflict</span>}</div>

          <div className="field-grid">
            <div><b>Client:</b> {trailer.currentClient || '—'}</div>
            <div><b>Category:</b> {trailer.category} ({trailer.applicationClass})</div>
            <div><b>Lease Start:</b> {fmtDate(trailer.leaseStart)}</div>
            <div><b>Lease End:</b> {fmtDate(trailer.leaseEnd)}</div>
            <div><b>True Available:</b> {fmtDate(trailer.trueAvailableDate)}</div>
            <div><b>Ready For Service:</b> {fmtDate(trailer.readyForServiceDate)}</div>
            <div><b>Actual Rent:</b> {trailer.isUnpriced ? 'Unpriced' : fmtMoney(trailer.actualMonthlyRent)}</div>
            <div><b>Benchmark (short/long):</b> {fmtMoney(trailer.benchmarkShortTerm)} / {fmtMoney(trailer.benchmarkLongTerm)}</div>
            <div><b>BSL2 / Pharmacy suitability:</b> {trailer.bsl2Suitability ?? '—'} / {trailer.pharmacySuitability ?? '—'}</div>
            <div><b>Match Tier:</b> {trailer.matchTier || '—'}</div>
          </div>
          {trailer.matchNotes && <p className="small-muted">{trailer.matchNotes}</p>}

          <h3>Active assignments</h3>
          {trailer.assignments.length === 0 && <p className="small-muted">No assignments on record.</p>}
          {trailer.assignments.length > 0 && (
            <table>
              <thead><tr><th>Customer</th><th>Start</th><th>End</th><th>Source</th></tr></thead>
              <tbody>
                {trailer.assignments.map((a) => (
                  <tr key={a.id}><td>{a.customer}</td><td>{fmtDate(a.start_date)}</td><td>{fmtDate(a.end_date)}</td><td>{a.source}</td></tr>
                ))}
              </tbody>
            </table>
          )}

          <h3>Rate history (immutable)</h3>
          {history.length === 0 && <p className="small-muted">No rate history entries yet.</p>}
          {history.length > 0 && (
            <table>
              <thead><tr><th>When</th><th>Customer</th><th>Rate</th><th>Status</th><th>Source</th><th>User</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{fmtDate(h.created_at.slice(0, 10))}</td>
                    <td>{h.customer}</td>
                    <td>{fmtMoney(h.monthly_rate)}</td>
                    <td>{h.rate_status}</td>
                    <td>{h.source}</td>
                    <td>{h.user}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
