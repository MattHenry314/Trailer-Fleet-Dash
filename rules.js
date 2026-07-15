// Core business rules for Germfree Fleet Command.
// Centralized here so the matching engine, fleet builder, and workbook
// importer all apply the exact same identity / exclusion / capability logic.

export function normalize(str) {
  if (str === null || str === undefined) return '';
  return String(str).trim().replace(/\s+/g, ' ').toLowerCase();
}

export function trailerKey(id, name) {
  return `${normalize(id)}::${normalize(name)}`;
}

// Hard-coded identity exclusion rules. These are seeded into the
// fleet_exclusions table (editable there) but the defaults live here so the
// rules are always re-derivable even after a fresh workbook import.
export const DEFAULT_EXCLUSIONS = [
  {
    trailer_id: '18',
    trailer_name: 'RT018-HD',
    reason: 'Nonfunctional and retired.'
  },
  {
    trailer_id: '52',
    trailer_name: '52',
    reason: 'Not currently part of the fleet.'
  }
];

// Statuses allowed for editing via Fleet Operations.
export const STATUSES = [
  'Available',
  'Leased',
  'Pending Lease',
  'Remediation',
  'Out of Service',
  'Sold'
];

export const RATE_STAGES = ['unpriced', 'draft', 'quoted', 'approved', 'contracted'];
export const OPPORTUNITY_CATEGORIES = ['Pharmacy', 'BSL2'];

// Purpose-built BSL2 trailers, in strict priority order, per spec.
export const PRIMARY_BSL2_IDS = ['2', '3', '5'];

// Planning-only benchmark monthly rates by application class. These are
// NEVER substituted for a missing customer rate - they exist purely for
// capacity / scenario modeling and are always displayed separately from
// actual entered rent.
export const BENCHMARK_RATES = {
  'BSL2 Only': { shortTerm: 42000, longTerm: 30000 },
  'Hybrid BSL2/Pharmacy': { shortTerm: 38000, longTerm: 27500 },
  'Pharmacy Only': { shortTerm: 34000, longTerm: 24500 },
  'Other': { shortTerm: 40000, longTerm: 28000 },
  'Unknown': { shortTerm: 30000, longTerm: 20000 }
};

export function benchmarkFor(applicationClass) {
  return BENCHMARK_RATES[applicationClass] || BENCHMARK_RATES.Unknown;
}

// Trailers that must never be matched individually, even though visible.
export const NG04_ID = 'NG-04';
export const PAIRED_NONCORE_IDS = ['NG-02', 'NG-03'];

export function isExcludedByIdentity(idStr, nameStr, exclusionRows) {
  const key = trailerKey(idStr, nameStr);
  return exclusionRows.some((ex) => trailerKey(ex.trailer_id, ex.trailer_name) === key && ex.active !== 0);
}

// Exact UTC date-only arithmetic helpers (also mirrored on the client for
// the Gantt chart so both use identical day-count math).
export function toUTCDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(aStr, bStr) {
  const a = toUTCDate(aStr);
  const b = toUTCDate(bStr);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86400000);
}

export function dateRangesOverlap(aStart, aEnd, bStart, bEnd) {
  // Treat ranges as [start, end) - a lease ending the same day another
  // begins is NOT an overlap (matches the NG-00 BayCare/Link Pharmacy
  // back-to-back regression requirement).
  const as = toUTCDate(aStart);
  const ae = toUTCDate(aEnd);
  const bs = toUTCDate(bStart);
  const be = toUTCDate(bEnd);
  if ([as, ae, bs, be].some((v) => v === null)) return false;
  return as < be && bs < ae;
}
