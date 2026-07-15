import type { Trailer } from '../types';
import { toUTC, daysBetween, fmtDate } from '../dateUtils';

// Fixed chart domain. Deliberately NOT auto-scaled to the latest lease-end
// date in the fleet, so a long-term record (e.g. Trailer 25 ending 2050)
// cannot compress or distort the visible short-term bars. Anything beyond
// the domain is clipped with a ">>" continuation indicator.
const CHART_START = '2025-10-01';
const CHART_END = '2029-04-01';
const PX_PER_DAY = 2.4;
const MIN_PX = 3; // small CSS-pixel minimum for visibility only - never changes the calculated end date

const chartStartUTC = toUTC(CHART_START)!;
const chartEndUTC = toUTC(CHART_END)!;
const chartWidthDays = daysBetween(CHART_START, CHART_END)!;
const chartWidthPx = chartWidthDays * PX_PER_DAY;

function xFor(dateStr: string | null): number | null {
  const u = toUTC(dateStr);
  if (u === null) return null;
  const clamped = Math.max(chartStartUTC, Math.min(chartEndUTC, u));
  return ((clamped - chartStartUTC) / 86400000) * PX_PER_DAY;
}

function segment(startStr: string | null, endStr: string | null) {
  const x1 = xFor(startStr);
  const x2 = xFor(endStr);
  if (x1 === null || x2 === null) return null;
  const overflowsRight = toUTC(endStr)! > chartEndUTC;
  const width = Math.max(MIN_PX, x2 - x1);
  return { left: x1, width, overflowsRight };
}

function monthTicks() {
  const ticks: { x: number; label: string }[] = [];
  const d = new Date(chartStartUTC);
  while (d.getTime() <= chartEndUTC) {
    const iso = d.toISOString().slice(0, 10);
    ticks.push({ x: xFor(iso)!, label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }) });
    d.setUTCMonth(d.getUTCMonth() + (d.getUTCMonth() % 3 === 0 ? 3 : 3)); // quarterly ticks
  }
  return ticks;
}

export default function FullGantt({ fleet, onSelect }: { fleet: Trailer[]; onSelect: (t: Trailer) => void }) {
  const ticks = monthTicks();
  const rows = [...fleet].sort((a, b) => a.trailerId.localeCompare(b.trailerId, undefined, { numeric: true }));

  return (
    <div className="card">
      <h2>Full Fleet Gantt</h2>
      <p className="small-muted">
        <span style={{ color: '#0b6b4a' }}>■</span> Client lease/pending &nbsp;
        <span style={{ color: '#e8a33d' }}>▤</span> Turnaround/remediation &nbsp;
        <span style={{ color: '#3b6fa8' }}>■</span> App-created assignment &nbsp;
        <span style={{ color: '#7a6a4a' }}>■</span> Sold/non-rental &nbsp;
        <span style={{ color: '#e8a33d' }}>│</span> True-available marker
      </p>
      <div className="gantt-scroll">
        <div style={{ position: 'relative', width: chartWidthPx + 190, minHeight: 40 }}>
          {/* Month ticks header */}
          <div style={{ display: 'flex', position: 'sticky', top: 0, background: '#fff', zIndex: 5, borderBottom: '1px solid #dfe4e1' }}>
            <div className="gantt-label" style={{ borderRight: '1px solid #dfe4e1' }} />
            <div style={{ position: 'relative', width: chartWidthPx, height: 26 }}>
              {ticks.map((t, i) => (
                <div key={i} style={{ position: 'absolute', left: t.x, top: 4, fontSize: 10, color: '#3d4441', borderLeft: '1px solid #dfe4e1', paddingLeft: 3, height: 18 }}>
                  {t.label}
                </div>
              ))}
            </div>
          </div>

          {rows.map((t) => {
            const clientSeg = t.leaseStart && t.leaseEnd ? segment(t.leaseStart, t.leaseEnd) : null;
            const turnaroundSeg = t.leaseEnd && t.trueAvailableDate ? segment(t.leaseEnd, t.trueAvailableDate) : null;
            const trueAvailX = t.trueAvailableDate ? xFor(t.trueAvailableDate) : null;

            return (
              <div className="gantt-row" key={t.trailerKey} style={{ height: 40 }}>
                <div className="gantt-label clickable" onClick={() => onSelect(t)}>
                  <b>{t.trailerName}</b>
                  <span>
                    {t.leaseEnd ? `End ${fmtDate(t.leaseEnd)}` : ''}
                    {t.trueAvailableDate ? ` · TA ${fmtDate(t.trueAvailableDate)}` : ''}
                  </span>
                </div>
                <div style={{ position: 'relative', width: chartWidthPx, height: 36 }}>
                  {t.soldHistorical && (
                    <div style={{ position: 'absolute', left: 4, top: 8, background: '#7a6a4a', color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 4 }}>
                      SOLD / {t.currentClient}
                    </div>
                  )}
                  {t.pairedNonCore && (
                    <div style={{ position: 'absolute', left: 4, top: 8, background: '#574693', color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 4 }}>
                      Paired package (non-core)
                    </div>
                  )}

                  {clientSeg && (
                    <div title={`${t.currentClient} · ${fmtDate(t.leaseStart)} – ${fmtDate(t.leaseEnd)}`}
                      style={{ position: 'absolute', left: clientSeg.left, width: clientSeg.width, top: 8, height: 20, background: '#0b6b4a', borderRadius: 3 }} />
                  )}
                  {turnaroundSeg && (
                    <div title={`Turnaround · ${fmtDate(t.leaseEnd)} – ${fmtDate(t.trueAvailableDate)}`}
                      style={{
                        position: 'absolute', left: turnaroundSeg.left, width: turnaroundSeg.width, top: 8, height: 20,
                        background: 'repeating-linear-gradient(45deg, #e8a33d, #e8a33d 4px, #f6d9a8 4px, #f6d9a8 8px)', borderRadius: 3
                      }} />
                  )}
                  {trueAvailX !== null && (
                    <div title={`True available ${fmtDate(t.trueAvailableDate)}`}
                      style={{ position: 'absolute', left: trueAvailX, top: 2, width: 2, height: 32, background: '#e8a33d' }} />
                  )}
                  {t.assignments.map((a) => {
                    const seg = segment(a.start_date, a.end_date);
                    if (!seg) return null;
                    return (
                      <div key={a.id} title={`${a.customer} · ${fmtDate(a.start_date)} – ${fmtDate(a.end_date)} (${a.source})`}
                        style={{ position: 'absolute', left: seg.left, width: seg.width, top: 8, height: 20, background: '#3b6fa8', borderRadius: 3, opacity: 0.9 }}>
                        {seg.overflowsRight && <span style={{ position: 'absolute', right: -14, top: 0, color: '#3b6fa8', fontWeight: 700 }}>»</span>}
                      </div>
                    );
                  })}
                  {clientSeg?.overflowsRight && <span style={{ position: 'absolute', left: clientSeg.left + clientSeg.width, top: 8, color: '#0b6b4a', fontWeight: 700 }}>»</span>}
                  {t.readinessConflict && (
                    <div style={{ position: 'absolute', right: 4, top: 8, background: '#b3413a', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>
                      Ready-for-service {fmtDate(t.readyForServiceDate)} after true-available
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
