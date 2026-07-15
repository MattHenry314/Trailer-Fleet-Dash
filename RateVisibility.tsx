import type { Trailer } from '../types';
import { fmtMoney } from '../dateUtils';

export default function RateVisibility({ fleet, onSelect }: { fleet: Trailer[]; onSelect: (t: Trailer) => void }) {
  const visible = fleet.filter((t) => !t.soldHistorical);
  return (
    <div className="card">
      <h2>Rate Visibility</h2>
      <p className="small-muted">Actual entered rent is always separated from theoretical short/long-term planning benchmarks. Benchmarks are never substituted for a missing customer rate.</p>
      <table>
        <thead>
          <tr><th>Trailer</th><th>Client</th><th>Status</th><th className="text-right">Actual Rent</th><th className="text-right">Short-Term Benchmark</th><th className="text-right">Long-Term Benchmark</th><th className="text-right">Variance (Short)</th></tr>
        </thead>
        <tbody>
          {visible.map((t) => (
            <tr key={t.trailerKey}>
              <td className="clickable" onClick={() => onSelect(t)}>{t.trailerName}</td>
              <td>{t.currentClient || '—'}</td>
              <td>{t.status}</td>
              <td className="text-right">{t.isUnpriced ? <span className="badge unpriced">Unpriced</span> : fmtMoney(t.actualMonthlyRent)}</td>
              <td className="text-right small-muted">{fmtMoney(t.benchmarkShortTerm)}</td>
              <td className="text-right small-muted">{fmtMoney(t.benchmarkLongTerm)}</td>
              <td className="text-right">
                {t.varianceVsShortTerm === null ? '—' : (
                  <span style={{ color: t.varianceVsShortTerm >= 0 ? '#187a58' : '#a44a37' }}>
                    {t.varianceVsShortTerm >= 0 ? '+' : ''}{fmtMoney(t.varianceVsShortTerm)}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
