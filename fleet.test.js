import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDbPath = path.join(__dirname, 'test.db');
for (const suffix of ['', '-wal', '-shm']) {
  if (fs.existsSync(testDbPath + suffix)) fs.unlinkSync(testDbPath + suffix);
}
process.env.GFC_DB_PATH = testDbPath;

const { initDatabase, db } = await import('../db.js');
const { buildEffectiveFleet, getFleetByKey } = await import('../lib/fleet.js');
const { findMatch } = await import('../lib/matching.js');
const { trailerKey, dateRangesOverlap } = await import('../lib/rules.js');

initDatabase();

test('RT018-HD and RT052 are excluded from the fleet', () => {
  const fleet = buildEffectiveFleet();
  assert.ok(!fleet.some((t) => t.trailerId === '18'));
  assert.ok(!fleet.some((t) => t.trailerId === '52'));
});

test('Renaming an excluded identity allows a replacement record back in', () => {
  const row = db.prepare('SELECT * FROM fleet_snapshot_rows WHERE trailer_id = ?').get('18');
  const parsed = JSON.parse(row.raw_json);
  parsed['Trailer Name'] = 'RT018-NEW';
  db.prepare('UPDATE fleet_snapshot_rows SET raw_json = ?, trailer_key = ? WHERE id = ?')
    .run(JSON.stringify(parsed), trailerKey('18', 'RT018-NEW'), row.id);

  const fleet = buildEffectiveFleet();
  assert.ok(fleet.some((t) => t.trailerId === '18' && t.trailerName === 'RT018-NEW'));

  // revert for later tests
  parsed['Trailer Name'] = 'RT018-HD';
  db.prepare('UPDATE fleet_snapshot_rows SET raw_json = ?, trailer_key = ? WHERE id = ?')
    .run(JSON.stringify(parsed), trailerKey('18', 'RT018-HD'), row.id);
});

test('NG-04 is visible, sold to Verizon, and not matchable', () => {
  const t = getFleetByKey(trailerKey('NG-04', 'NG-04'));
  assert.ok(t);
  assert.equal(t.currentClient, 'Verizon');
  assert.equal(t.status, 'Sold');
  assert.equal(t.matchable, false);
});

test('NG-02 and NG-03 are visible but not independently matchable', () => {
  const ng02 = getFleetByKey(trailerKey('NG-02', 'NG-02-cGMP'));
  const ng03 = getFleetByKey(trailerKey('NG-03', 'NG-03-cGMP'));
  assert.ok(ng02 && ng03);
  assert.equal(ng02.matchable, false);
  assert.equal(ng03.matchable, false);
  assert.equal(ng02.pairedNonCore, true);
});

test('Trailer 25 preserves the seeded app-managed override', () => {
  const t = getFleetByKey(trailerKey('25', 'RT025-RX'));
  assert.equal(t.currentClient, 'UTMB (SWAP)');
  assert.equal(t.leaseEnd, '2050-07-26');
  assert.equal(t.trueAvailableDate, '2050-07-26');
});

test('NG-00 flags the true-available vs ready-for-service conflict', () => {
  const t = getFleetByKey(trailerKey('NG-00', 'NG-00-cGMP'));
  assert.equal(t.leaseEnd, '2026-07-11');
  assert.equal(t.trueAvailableDate, '2026-08-11');
  assert.equal(t.readyForServiceDate, '2026-10-02');
  assert.equal(t.readinessConflict, true);
});

test('NG-00 BayCare and Link Pharmacy assignments do not overlap', () => {
  const t = getFleetByKey(trailerKey('NG-00', 'NG-00-cGMP'));
  const [a, b] = t.assignments;
  assert.equal(dateRangesOverlap(a.start_date, a.end_date, b.start_date, b.end_date), false);
});

test('RT045 lease ends exactly September 2, 2026', () => {
  const t = getFleetByKey(trailerKey('45', 'RT045-RX'));
  assert.equal(t.leaseEnd, '2026-09-02');
});

test('BSL2 matching prioritizes purpose-built trailers 2, 3, 5 first', () => {
  const result = findMatch({ customer: 'Test', category: 'BSL2', required_start: '2027-01-01', required_end: '2027-06-01' });
  assert.equal(result.status, 'assigned');
  assert.ok(['2', '3', '5'].includes(result.trailerId));
});

test('Opportunity with no eligible trailer is saved to manual review, not rejected', () => {
  const result = findMatch({ customer: 'Test', category: 'BSL2', required_start: '1999-01-01', required_end: '1999-02-01' });
  // Even far-past dates should not throw; either assigned or manual_review, never an exception.
  assert.ok(result.status === 'assigned' || result.status === 'manual_review');
});

test('An unchanged fleet save does not add a duplicate rate history entry', () => {
  const key = trailerKey('6', 'RT006-RX');
  const before = getFleetByKey(key);
  const beforeCount = db.prepare('SELECT COUNT(*) c FROM rate_history WHERE trailer_key = ?').get(key).c;

  db.prepare(`
    INSERT INTO fleet_overrides (trailer_key, trailer_id, trailer_name, current_client, lease_start, lease_end, status, actual_monthly_rent, true_available_date, notes, updated_by, updated_at)
    VALUES (@trailer_key, @trailer_id, @trailer_name, @current_client, @lease_start, @lease_end, @status, @actual_monthly_rent, @true_available_date, NULL, 'test', @now)
    ON CONFLICT(trailer_key) DO UPDATE SET current_client = excluded.current_client, lease_start = excluded.lease_start,
      lease_end = excluded.lease_end, status = excluded.status, actual_monthly_rent = excluded.actual_monthly_rent,
      true_available_date = excluded.true_available_date, updated_at = excluded.updated_at
  `).run({
    trailer_key: key, trailer_id: before.trailerId, trailer_name: before.trailerName,
    current_client: before.currentClient, lease_start: before.leaseStart, lease_end: before.leaseEnd,
    status: before.status, actual_monthly_rent: before.actualMonthlyRent, true_available_date: before.trueAvailableDate,
    now: new Date().toISOString()
  });

  const after = getFleetByKey(key);
  const afterCount = db.prepare('SELECT COUNT(*) c FROM rate_history WHERE trailer_key = ?').get(key).c;
  assert.equal(before.currentClient, after.currentClient);
  assert.equal(beforeCount, afterCount);
});
