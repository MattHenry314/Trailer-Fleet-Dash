import type { Trailer } from '../types';
import { fmtDate } from '../dateUtils';

export default function Remediation({ fleet, onSelect }: { fleet: Trailer[]; onSelect: (t: Trailer) => void }) {
  const inRemediation = fleet.filter((t) => t.status === 'Remediation' || (t.leaseEnd && t.trueAvailableDate && t.leaseEnd !== t.trueAvailableDate));

  return (
    <div className="card">
      <h2>Remediation & Turnaround Pipeline</h2>
      <table>
        <thead><tr><th>Trailer</th><th>Status</th><th>Lease End</th><th>True Available</th><th>Ready For Service</th><th>Turnaround Days</th></tr></thead>
        <tbody>
          {inRemediation.map((t) => {
            const turnaroundDays = t.leaseEnd && t.trueAvailableDate
              ? Math.round((new Date(t.trueAvailableDate).getTime() - new Date(t.leaseEnd).getTime()) / 86400000)
              : null;
            return (
              <tr key={t.trailerKey}>
                <td className="clickable" onClick={() => onSelect(t)}>{t.trailerName}</td>
                <td>{t.status}</td>
                <td>{fmtDate(t.leaseEnd)}</td>
                <td>{fmtDate(t.trueAvailableDate)}</td>
                <td>{fmtDate(t.readyForServiceDate)} {t.readinessConflict && <span className="badge conflict">after true-available</span>}</td>
                <td>{turnaroundDays ?? '—'}</td>
              </tr>
            );
          })}
          {inRemediation.length === 0 && <tr><td colSpan={6} className="small-muted">No trailers currently in remediation/turnaround.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
