// Exact UTC date-only arithmetic - mirrors server/src/lib/rules.js so the
// Gantt chart's pixel math always agrees with server-side conflict checks.

export function toUTC(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(a: string | null, b: string | null): number | null {
  const au = toUTC(a);
  const bu = toUTC(b);
  if (au === null || bu === null) return null;
  return Math.round((bu - au) / 86400000);
}

export function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const u = toUTC(dateStr);
  if (u === null) return dateStr;
  return new Date(u).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'Unpriced';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function addDays(dateStr: string, days: number): string {
  const u = toUTC(dateStr)!;
  return new Date(u + days * 86400000).toISOString().slice(0, 10);
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
