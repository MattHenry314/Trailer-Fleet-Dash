import type { Trailer } from '../types';
import { fmtMoney } from '../dateUtils';

export default function Revenue({ fleet }: { fleet: Trailer[] }) {
  const core = fleet.filter((t) => !t.soldHistorical);
  const leased = core.filter((t) => t.status === 'Leased');
  const pending = core.filter((t) => t.status === 'Pending Lease');

  const actualRevenue = leased.reduce((s, t) => s + (t.actualMonthlyRent || 0), 0);
  const pendingRevenue = pending.reduce((s, t) => s + (t.actualMonthlyRent || 0), 0);
  const unpricedLeased = leased.filter((t) => t.isUnpriced).length;
  const unpricedPending = pending.filter((t) => t.isUnpriced).length;

  const shortBenchmarkTotal = core.reduce((s, t) => s + t.benchmarkShortTerm, 0);
  const longBenchmarkTotal = core.reduce((s, t) => s + t.benchmarkLongTerm, 0);

  const byClass: Record<string, { count: number; actual: number }> = {};
  for (const t of core) {
    byClass[t.applicationClass] = byClass[t.applicationClass] || { count: 0, actual: 0 };
    byClass[t.applicationClass].count += 1;
    byClass[t.applicationClass].actual += t.actualMonthlyRent || 0;
  }

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi"><div className="value">{fmtMoney(actualRevenue)}</div><div className="label">Actual Monthly Revenue (Leased, entered)</div></div>
        <div className="kpi"><div className="value">{fmtMoney(pendingRevenue)}</div><div className="label">Pending-Lease $ (shown separately)</div></div>
        <div className="kpi"><div className="value">{unpricedLeased + unpricedPending}</div><div className="label">Records Explicitly Unpriced</div></div>
        <div className="kpi"><div className="value">{fmtMoney(shortBenchmarkTotal)}</div><div className="label">Capacity Model — Short-Term Benchmark Total</div></div>
        <div className="kpi"><div className="value">{fmtMoney(longBenchmarkTotal)}</div><div className="label">Capacity Model — Long-Term Benchmark Total</div></div>
      </div>

      <div className="card">
        <h2>Revenue by Application Class</h2>
        <table>
          <thead><tr><th>Application Class</th><th>Trailers</th><th className="text-right">Actual Revenue (entered only)</th></tr></thead>
          <tbody>
            {Object.entries(byClass).map(([cls, v]) => (
              <tr key={cls}><td>{cls}</td><td>{v.count}</td><td className="text-right">{fmtMoney(v.actual)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="small-muted">Theoretical short/long-term benchmarks are shown only for capacity and scenario modeling above — they are never substituted for a missing customer rate.</p>
      </div>
    </div>
  );
}
