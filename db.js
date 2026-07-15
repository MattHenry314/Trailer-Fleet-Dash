import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DEFAULT_EXCLUSIONS } from './lib/rules.js';
import { OWNER_EMAIL, KNOWN_VIEWER_EMAIL } from './config.js';
import { runMigrations } from './migrations/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.GFC_DB_PATH || path.join(DATA_DIR, 'fleet.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS fleet_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_file TEXT NOT NULL,
  imported_by TEXT,
  imported_at TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fleet_snapshot_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL REFERENCES fleet_snapshots(id),
  trailer_id TEXT NOT NULL,
  trailer_name TEXT NOT NULL,
  trailer_key TEXT NOT NULL,
  raw_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fleet_exclusions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trailer_id TEXT NOT NULL,
  trailer_name TEXT NOT NULL,
  reason TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fleet_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trailer_key TEXT NOT NULL UNIQUE,
  trailer_id TEXT NOT NULL,
  trailer_name TEXT NOT NULL,
  current_client TEXT,
  lease_start TEXT,
  lease_end TEXT,
  status TEXT,
  actual_monthly_rent REAL,
  true_available_date TEXT,
  notes TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer TEXT NOT NULL,
  project_name TEXT NOT NULL,
  category TEXT NOT NULL,
  required_start TEXT NOT NULL,
  required_end TEXT NOT NULL,
  customer_rate REAL,
  rate_stage TEXT NOT NULL DEFAULT 'unpriced',
  status TEXT NOT NULL DEFAULT 'manual_review',
  assigned_trailer_key TEXT,
  recommended_start TEXT,
  recommended_end TEXT,
  match_notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  removed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trailer_key TEXT NOT NULL,
  opportunity_id INTEGER REFERENCES opportunities(id),
  customer TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'app',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trailer_key TEXT NOT NULL,
  customer TEXT,
  monthly_rate REAL,
  rate_status TEXT,
  effective_start TEXT,
  effective_end TEXT,
  source TEXT,
  notes TEXT,
  user TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS editor_users (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  added_by TEXT,
  added_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exception_resolutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exception_key TEXT NOT NULL,
  trailer_key TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  note TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_file TEXT NOT NULL,
  source_date TEXT,
  record_count INTEGER NOT NULL,
  imported_by TEXT,
  imported_at TEXT NOT NULL
);
`);

function now() {
  return new Date().toISOString();
}

function seedExclusions() {
  const count = db.prepare('SELECT COUNT(*) c FROM fleet_exclusions').get().c;
  if (count > 0) return;
  const insert = db.prepare(
    'INSERT INTO fleet_exclusions (trailer_id, trailer_name, reason, active, created_at) VALUES (?,?,?,1,?)'
  );
  for (const ex of DEFAULT_EXCLUSIONS) {
    insert.run(ex.trailer_id, ex.trailer_name, ex.reason, now());
  }
}

function seedEditors() {
  const count = db.prepare('SELECT COUNT(*) c FROM editor_users').get().c;
  if (count > 0) return;
  const insert = db.prepare(
    'INSERT INTO editor_users (email, role, added_by, added_at) VALUES (?,?,?,?)'
  );
  insert.run(OWNER_EMAIL, 'owner', 'system', now());
  insert.run(KNOWN_VIEWER_EMAIL, 'viewer', 'system', now());
}

function seedInitialWorkbookSnapshot() {
  const count = db.prepare('SELECT COUNT(*) c FROM fleet_snapshots').get().c;
  if (count > 0) return;
  const seedPath = path.join(__dirname, 'seed', 'trailer_control.json');
  const rows = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
  const insertSnap = db.prepare(
    'INSERT INTO fleet_snapshots (source_file, imported_by, imported_at, record_count, is_active) VALUES (?,?,?,?,1)'
  );
  const info = insertSnap.run('Trailer_Fleet_v2_MASTER.xlsx (initial load)', 'system', now(), rows.length);
  const snapshotId = info.lastInsertRowid;
  const insertRow = db.prepare(
    'INSERT INTO fleet_snapshot_rows (snapshot_id, trailer_id, trailer_name, trailer_key, raw_json) VALUES (?,?,?,?,?)'
  );
  const { trailerKey } = importRulesSync();
  for (const row of rows) {
    const id = String(row['Trailer ID']);
    const name = String(row['Trailer Name']);
    insertRow.run(snapshotId, id, name, trailerKey(id, name), JSON.stringify(row));
  }
  db.prepare(
    'INSERT INTO refresh_history (source_file, source_date, record_count, imported_by, imported_at) VALUES (?,?,?,?,?)'
  ).run('Trailer_Fleet_v2_MASTER.xlsx', now(), rows.length, 'system', now());
}

function importRulesSync() {
  // small sync wrapper since rules.js is ESM - imported at top already,
  // kept as a function for clarity at call site.
  return { trailerKey: (id, name) => `${String(id).trim().toLowerCase()}::${String(name).trim().replace(/\s+/g,' ').toLowerCase()}` };
}

function seedAppManagedOverrides() {
  const upsert = db.prepare(`
    INSERT INTO fleet_overrides
      (trailer_key, trailer_id, trailer_name, current_client, lease_start, lease_end, status, actual_monthly_rent, true_available_date, notes, updated_by, updated_at)
    VALUES (@trailer_key, @trailer_id, @trailer_name, @current_client, @lease_start, @lease_end, @status, @actual_monthly_rent, @true_available_date, @notes, @updated_by, @updated_at)
    ON CONFLICT(trailer_key) DO NOTHING
  `);
  const { trailerKey } = importRulesSync();

  // Trailer 25 / RT025-RX - required app-managed record.
  upsert.run({
    trailer_key: trailerKey('25', 'RT025-RX'),
    trailer_id: '25',
    trailer_name: 'RT025-RX',
    current_client: 'UTMB (SWAP)',
    lease_start: '2026-07-25',
    lease_end: '2050-07-26',
    status: 'Pending Lease',
    actual_monthly_rent: null,
    true_available_date: '2050-07-26',
    notes: 'Seeded app-managed override per program requirements.',
    updated_by: 'system',
    updated_at: now()
  });

  // NG-00 / NG-00-cGMP - required app-managed record, including the
  // intentional true-available/ready-for-service conflict.
  upsert.run({
    trailer_key: trailerKey('NG-00', 'NG-00-cGMP'),
    trailer_id: 'NG-00',
    trailer_name: 'NG-00-cGMP',
    current_client: 'Pharm Blanchard',
    lease_start: '2026-01-05',
    lease_end: '2026-07-11',
    status: 'Leased',
    actual_monthly_rent: 25000,
    true_available_date: '2026-08-11',
    notes: 'Seeded app-managed override. Ready-for-service (2026-10-02) intentionally later than true-available - flagged as billing exception.',
    updated_by: 'system',
    updated_at: now()
  });

  // NG-04 sold-to-Verizon override (also enforced structurally in the
  // fleet builder regardless of this row, per spec "must always display").
  upsert.run({
    trailer_key: trailerKey('NG-04', 'NG-04'),
    trailer_id: 'NG-04',
    trailer_name: 'NG-04',
    current_client: 'Verizon',
    lease_start: null,
    lease_end: null,
    status: 'Sold',
    actual_monthly_rent: null,
    true_available_date: null,
    notes: 'Sold / Removed from Rental Fleet. Retained for historical visibility only.',
    updated_by: 'system',
    updated_at: now()
  });
}

function seedAssignmentsAndOpportunities() {
  const count = db.prepare('SELECT COUNT(*) c FROM assignments').get().c;
  const { trailerKey } = importRulesSync();
  if (count === 0) {
    const insert = db.prepare(`
      INSERT INTO assignments (trailer_key, opportunity_id, customer, start_date, end_date, source, active, created_at)
      VALUES (?,?,?,?,?,?,1,?)
    `);
    const ng00Key = trailerKey('NG-00', 'NG-00-cGMP');
    insert.run(ng00Key, null, 'BayCare', '2026-12-05', '2027-04-04', 'workbook', now());
    insert.run(ng00Key, null, 'Link Pharmacy', '2027-04-04', '2027-10-02', 'workbook', now());
  }

  const oppCount = db.prepare('SELECT COUNT(*) c FROM opportunities').get().c;
  if (oppCount === 0) {
    db.prepare(`
      INSERT INTO opportunities
        (customer, project_name, category, required_start, required_end, customer_rate, rate_stage, status, assigned_trailer_key, recommended_start, recommended_end, match_notes, created_by, created_at, updated_at, removed)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)
    `).run(
      'VCU', 'VCU BSL2 Research Program', 'BSL2', '2026-11-05', '2027-07-03', null, 'draft',
      'manual_review', null, null, null,
      'Preserved app-created opportunity (example seed). Re-run matching from Fleet Operations to auto-assign.',
      'system', now(), now()
    );
  }
}

export function initDatabase() {
  seedExclusions();
  seedEditors();
  seedInitialWorkbookSnapshot();
  seedAppManagedOverrides();
  seedAssignmentsAndOpportunities();
  // Runs on every startup, idempotent. Handles the owner-account transfer
  // (and any future migrations) whether this is a brand-new database or an
  // existing one that previously seeded the old owner account.
  return runMigrations(db);
}
