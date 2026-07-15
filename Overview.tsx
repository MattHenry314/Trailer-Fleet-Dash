import type { Trailer, Opportunity, BillingException } from '../types';
import { fmtMoney } from '../dateUtils';

export default function Overview({ fleet, opportunities, exceptions, onSelect }: {
  fleet: Trailer[]; opportunities: Opportunity[]; exceptions: BillingException[]; onSelect: (t: Trailer) => void;
}) {
  const core = fleet.filter((t) => !t.soldHistorical);
  const leased = core.filter((t) => t.status === 'Leased');
  const available = core.filter((t) => t.status === 'Available');
  const pending = core.filter((t) => t.status === 'Pending Lease');
  const remediation = core.filter((t) => t.status === 'Remediation');
  const actualRevenue = leased.reduce((sum, t) => sum + (t.actualMonthlyRent || 0), 0);
  const pendingRevenue = pending.reduce((sum, t) => sum + (t.actualMonthlyRent || 0), 0);
  const openExceptions = exceptions.filter((e) => e.status === 'open').length;
  const inReview = opportunities.filter((o) => o.status === 'manual_review').length;

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi"><div className="value">{core.length}</div><div className="label">Fleet Records Visible</div></div>
        <div className="kpi"><div className="value">{leased.length}</div><div className="label">Leased</div></div>
        <div className="kpi"><div className="value">{available.length}</div><div className="label">Available</div></div>
        <div className="kpi"><div className="value">{pending.length}</div><div className="label">Pending Lease</div></div>
        <div className="kpi"><div className="value">{remediation.length}</div><div className="label">In Remediation</div></div>
        <div className="kpi"><div className="value">{fmtMoney(actualRevenue)}</div><div className="label">Actual Monthly Revenue</div></div>
        <div className="kpi"><div className="value">{fmtMoney(pendingRevenue)}</div><div className="label">Pending Lease $ (separate)</div></div>
        <div className="kpi"><div className="value">{openExceptions}</div><div className="label">Open Billing Exceptions</div></div>
        <div className="kpi"><div className="value">{inReview}</div><div className="label">Opportunities in Manual Review</div></div>
      </div>

      <div className="card">
        <h2>Expiring soon (next 60 days by true-available date)</h2>
        <table>
          <thead><tr><th>Trailer</th><th>Client</th><th>Status</th><th>Lease End</th><th>True Available</th></tr></thead>
          <tbody>
            {core
              .filter((t) => t.status === 'Leased' || t.status === 'Pending Lease')
              .sort((a, b) => (a.leaseEnd || '9999').localeCompare(b.leaseEnd || '9999'))
              .slice(0, 8)
              .map((t) => (
                <tr key={t.trailerKey}>
                  <td className="clickable" onClick={() => onSelect(t)}>{t.trailerName}</td>
                  <td>{t.currentClient || '—'}</td>
                  <td>{t.status}</td>
                  <td>{t.leaseEnd || '—'}</td>
                  <td>{t.trueAvailableDate || '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
