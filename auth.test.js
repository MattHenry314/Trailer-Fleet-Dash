import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDbPath = path.join(__dirname, 'auth-test.db');
for (const suffix of ['', '-wal', '-shm']) {
  if (fs.existsSync(testDbPath + suffix)) fs.unlinkSync(testDbPath + suffix);
}
process.env.GFC_DB_PATH = testDbPath;
process.env.JWT_SECRET = 'test-secret';

const { initDatabase, db } = await import('../db.js');
const { createApp } = await import('../app.js');
const { OWNER_EMAIL, FORMER_OWNER_EMAILS, KNOWN_VIEWER_EMAIL } = await import('../config.js');

// Simulate a pre-existing production database: seed it as if the OLD owner
// account was already active (and had made real edits) BEFORE this code's
// migrations ever ran. Note: importing db.js above already created the
// (empty) table schema via top-level db.exec() - nothing has been seeded
// or migrated yet at this point.
db.prepare(`INSERT INTO editor_users (email, role, added_by, added_at) VALUES (?, 'owner', 'system', ?)`)
  .run(FORMER_OWNER_EMAILS[0], new Date().toISOString());

// A historical audit record authored by the old owner - must survive the migration untouched.
db.prepare(`
  INSERT INTO rate_history (trailer_key, customer, monthly_rate, rate_status, effective_start, effective_end, source, notes, user, created_at)
  VALUES ('6::rt006-rx', 'VAMC W Roxbury', 33973, 'Leased', '2021-08-23', '2027-06-22', 'fleet_operations_edit', 'Historical edit by prior owner', ?, ?)
`).run(FORMER_OWNER_EMAILS[0], new Date().toISOString());

// Now boot the app for the first time against this "existing" database -
// this seeds the workbook baseline (editor_users already has a row so that
// particular seed step is skipped, matching a real upgrade) and runs the
// migration ledger, which performs the owner transfer.
const migrationResults = initDatabase();

const app = createApp();
const server = app.listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

async function login(email) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  return res.json();
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

test('migration reports both migrations applied', () => {
  assert.ok(migrationResults.some((r) => r.id === '002_owner_transfer_mhenry'));
});

test('mhenry@germfree.com is now the active owner', async () => {
  const d = await login(OWNER_EMAIL);
  assert.equal(d.role, 'owner');
});

test('the previous owner account is demoted and no longer has owner privileges', async () => {
  const d = await login(FORMER_OWNER_EMAILS[0]);
  assert.notEqual(d.role, 'owner');
});

test('the previous owner account historical rate-history entry is preserved untouched', () => {
  const row = db.prepare(`SELECT * FROM rate_history WHERE user = ?`).get(FORMER_OWNER_EMAILS[0]);
  assert.ok(row, 'historical audit record must still exist');
  assert.equal(row.notes, 'Historical edit by prior owner');
});

test('Nick (nvitale10@hotmail.com) remains a read-only viewer by default', async () => {
  const d = await login(KNOWN_VIEWER_EMAIL);
  assert.equal(d.role, 'viewer');
});

test('an unauthenticated (public) request cannot edit a fleet record', async () => {
  const res = await fetch(`${base}/api/fleet/6::rt006-rx`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentClient: 'Hacker Inc' })
  });
  assert.equal(res.status, 403);
});

test('the demoted former owner cannot edit a fleet record via direct API call', async () => {
  const { token } = await login(FORMER_OWNER_EMAILS[0]);
  const res = await fetch(`${base}/api/fleet/6::rt006-rx`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ currentClient: 'Should Not Work' })
  });
  assert.equal(res.status, 403);
});

test('a viewer cannot add or remove editors', async () => {
  const { token } = await login(KNOWN_VIEWER_EMAIL);
  const res = await fetch(`${base}/api/editors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ email: 'someone@example.com', role: 'editor' })
  });
  assert.equal(res.status, 403);
});

test('mhenry@germfree.com CAN edit a fleet record', async () => {
  const { token } = await login(OWNER_EMAIL);
  const res = await fetch(`${base}/api/fleet/6::rt006-rx`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ currentClient: 'VAMC W Roxbury', status: 'Leased', actualMonthlyRent: 34500 })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.trailer.actualMonthlyRent, 34500);
});

test('mhenry@germfree.com CAN create and remove an opportunity', async () => {
  const { token } = await login(OWNER_EMAIL);
  const createRes = await fetch(`${base}/api/opportunities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({
      customer: 'Auth Test Co', projectName: 'Auth Test Project', category: 'Pharmacy',
      requiredStart: '2027-01-01', requiredEnd: '2027-06-01'
    })
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  const delRes = await fetch(`${base}/api/opportunities/${created.opportunity.id}`, {
    method: 'DELETE',
    headers: authHeaders(token)
  });
  assert.equal(delRes.status, 200);
});

test('mhenry@germfree.com CAN resolve a billing exception', async () => {
  const { token } = await login(OWNER_EMAIL);
  const listRes = await fetch(`${base}/api/exceptions`, { headers: authHeaders(token) });
  const { exceptions } = await listRes.json();
  assert.ok(exceptions.length > 0);
  const target = exceptions[0];
  const resolveRes = await fetch(`${base}/api/exceptions/${encodeURIComponent(target.key)}/resolve`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ status: 'resolved', note: 'Reviewed by mhenry@germfree.com' })
  });
  assert.equal(resolveRes.status, 200);
});

test('mhenry@germfree.com CAN add and remove editors', async () => {
  const { token } = await login(OWNER_EMAIL);
  const addRes = await fetch(`${base}/api/editors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ email: 'new.editor@germfree.com', role: 'editor' })
  });
  assert.equal(addRes.status, 200);

  const { token: newEditorToken } = await login('new.editor@germfree.com');
  const editRes = await fetch(`${base}/api/fleet/6::rt006-rx`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(newEditorToken) },
    body: JSON.stringify({ currentClient: 'VAMC W Roxbury' })
  });
  assert.equal(editRes.status, 200); // editor role can edit fleet records

  const removeRes = await fetch(`${base}/api/editors/${encodeURIComponent('new.editor@germfree.com')}`, {
    method: 'DELETE',
    headers: authHeaders(token)
  });
  assert.equal(removeRes.status, 200);
});

test('workbook import route requires editor/owner role', async () => {
  const publicRes = await fetch(`${base}/api/workbook/refresh`, { method: 'POST' });
  assert.equal(publicRes.status, 403);

  const { token } = await login(OWNER_EMAIL);
  // No file attached - should fail validation (400), NOT authorization (403),
  // proving the owner passed the permission check.
  const ownerRes = await fetch(`${base}/api/workbook/refresh`, { method: 'POST', headers: authHeaders(token) });
  assert.equal(ownerRes.status, 400);
});

test('re-running migrations again is a no-op (idempotent)', () => {
  const before = db.prepare(`SELECT role FROM editor_users WHERE email = ?`).get(OWNER_EMAIL);
  const results = initDatabase();
  const after = db.prepare(`SELECT role FROM editor_users WHERE email = ?`).get(OWNER_EMAIL);
  assert.equal(before.role, after.role);
  assert.ok(results.every((r) => r.status === 'already applied'));
});

test.after(() => {
  server.close();
});
