import { useMemo, useState } from 'react';
import type { Trailer } from '../types';
import StatusBadge from './StatusBadge';
import { fmtDate, fmtMoney } from '../dateUtils';

function toCSV(rows: Trailer[]): string {
  const headers = ['Trailer ID', 'Trailer Name', 'Category', 'Application Class', 'Client', 'Status', 'Lease Start', 'Lease End', 'True Available', 'Actual Rent', 'Unpriced'];
  const lines = [headers.join(',')];
  for (const t of rows) {
    lines.push([
      t.trailerId, t.trailerName, t.category, t.applicationClass, t.currentClient || '', t.status || '',
      t.leaseStart || '', t.leaseEnd || '', t.trueAvailableDate || '', t.actualMonthlyRent ?? '', t.isUnpriced ? 'Yes' : 'No'
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  }
  return lines.join('\n');
}

export default function FleetTab({ fleet, onSelect }: { fleet: Trailer[]; onSelect: (t: Trailer) => void }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fleet.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (classFilter !== 'all' && t.applicationClass !== classFilter) return false;
      if (!q) return true;
      return (
        t.trailerName.toLowerCase().includes(q) ||
        t.trailerId.toLowerCase().includes(q) ||
        (t.currentClient || '').toLowerCase().includes(q)
      );
    });
  }, [fleet, search, statusFilter, classFilter]);

  const statuses = Array.from(new Set(fleet.map((t) => t.status).filter(Boolean))) as string[];
  const classes = Array.from(new Set(fleet.map((t) => t.applicationClass)));

  function exportCSV() {
    const blob = new Blob([toCSV(filtered)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'germfree_effective_fleet.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card">
      <h2>Fleet ({filtered.length} of {fleet.length})</h2>
      <div className="filters-row">
        <input type="text" placeholder="Search trailer, ID, or client…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
          <option value="all">All application classes</option>
          {classes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn secondary" onClick={exportCSV}>Export CSV</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Trailer</th><th>Class</th><th>Client</th><th>Status</th><th>Lease Start</th><th>Lease End</th>
            <th>True Available</th><th className="text-right">Actual Rent</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((t) => (
            <tr key={t.trailerKey}>
              <td className="clickable" onClick={() => onSelect(t)}>
                <b>{t.trailerName}</b> <span className="small-muted">#{t.trailerId}</span>
                {t.pairedNonCore && <div><span className="badge paired">Paired</span></div>}
                {t.soldHistorical && <div><span className="badge sold">Sold</span></div>}
              </td>
              <td>{t.applicationClass}</td>
              <td>{t.currentClient || '—'}</td>
              <td><StatusBadge status={t.status} /></td>
              <td>{fmtDate(t.leaseStart)}</td>
              <td>{fmtDate(t.leaseEnd)}</td>
              <td>{fmtDate(t.trueAvailableDate)} {t.readinessConflict && <span className="badge conflict">conflict</span>}</td>
              <td className="text-right">{t.isUnpriced ? <span className="badge unpriced">Unpriced</span> : fmtMoney(t.actualMonthlyRent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
