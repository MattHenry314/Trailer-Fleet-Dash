import express from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { db } from '../db.js';
import { requireEditor } from '../auth.js';
import { trailerKey } from '../lib/rules.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const HEADER_ROW = 7; // 1-indexed row containing TRAILER CONTROL column headers
const DATA_START_ROW = 8;

function extractTrailerControlRows(workbook) {
  const sheet = workbook.Sheets['TRAILER CONTROL'];
  if (!sheet) throw new Error('Workbook is missing the required "TRAILER CONTROL" sheet.');

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const headers = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: HEADER_ROW - 1, c })];
    headers[c] = cell ? cell.v : null;
  }

  const rows = [];
  for (let r = DATA_START_ROW - 1; r <= range.e.r; r++) {
    const row = {};
    let hasData = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      if (!headers[c]) continue;
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.v !== undefined && cell.v !== null && cell.v !== '') {
        let value = cell.v;
        if (cell.t === 'd') {
          value = value.toISOString().slice(0, 10);
        } else if (cell.w && /^\d{4}-\d{2}-\d{2}/.test(cell.w)) {
          // leave numeric as-is
        }
        // Strip workbook potential-client fields per spec - never imported.
        if (headers[c] === 'Next Customer' || headers[c] === 'Next Opportunity') continue;
        row[headers[c]] = value;
        hasData = true;
      }
    }
    if (hasData && row['Trailer ID'] !== undefined) rows.push(row);
  }
  return rows;
}

router.post('/refresh', requireEditor, upload.single('workbook'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No workbook file uploaded (field name: "workbook").' });

  let rows;
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    rows = extractTrailerControlRows(wb);
  } catch (err) {
    return res.status(400).json({ error: `Workbook validation failed: ${err.message}` });
  }

  if (rows.length === 0) {
    return res.status(400).json({ error: 'No trailer rows found in TRAILER CONTROL sheet.' });
  }

  const ids = rows.map((r) => String(r['Trailer ID']));
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0) {
    return res.status(400).json({ error: `Duplicate Trailer IDs found in workbook: ${[...new Set(dupes)].join(', ')}` });
  }

  const now = new Date().toISOString();
  const txn = db.transaction(() => {
    db.prepare('UPDATE fleet_snapshots SET is_active = 0').run();
    const info = db.prepare(
      'INSERT INTO fleet_snapshots (source_file, imported_by, imported_at, record_count, is_active) VALUES (?,?,?,?,1)'
    ).run(req.file.originalname, req.user.email, now, rows.length);
    const snapshotId = info.lastInsertRowid;
    const insertRow = db.prepare(
      'INSERT INTO fleet_snapshot_rows (snapshot_id, trailer_id, trailer_name, trailer_key, raw_json) VALUES (?,?,?,?,?)'
    );
    for (const row of rows) {
      const id = String(row['Trailer ID']);
      const name = String(row['Trailer Name']);
      insertRow.run(snapshotId, id, name, trailerKey(id, name), JSON.stringify(row));
    }
    db.prepare(
      'INSERT INTO refresh_history (source_file, source_date, record_count, imported_by, imported_at) VALUES (?,?,?,?,?)'
    ).run(req.file.originalname, now, rows.length, req.user.email, now);
    // App overrides, opportunities, assignments, rate history, editors, and
    // exception resolutions are untouched - they live in separate tables
    // keyed by trailer_key, so nothing here can overwrite them.
  });

  try {
    txn();
  } catch (err) {
    return res.status(500).json({ error: `Refresh failed and was rolled back: ${err.message}` });
  }

  res.json({ ok: true, recordCount: rows.length, importedAt: now });
});

router.get('/history', (req, res) => {
  const rows = db.prepare('SELECT * FROM refresh_history ORDER BY imported_at DESC').all();
  res.json({ history: rows });
});

export default router;
