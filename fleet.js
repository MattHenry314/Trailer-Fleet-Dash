import express from 'express';
import { db } from '../db.js';
import { buildEffectiveFleet, getFleetByKey } from '../lib/fleet.js';
import { requireEditor } from '../auth.js';
import { STATUSES } from '../lib/rules.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    res.json({ fleet: buildEffectiveFleet() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load fleet data.', detail: err.message });
  }
});

router.get('/:trailerKey', (req, res) => {
  const trailer = getFleetByKey(req.params.trailerKey);
  if (!trailer) return res.status(404).json({ error: 'Trailer not found.' });
  res.json({ trailer });
});

router.get('/:trailerKey/rate-history', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM rate_history WHERE trailer_key = ? ORDER BY created_at DESC')
    .all(req.params.trailerKey);
  res.json({ history: rows });
});

router.put('/:trailerKey', requireEditor, (req, res) => {
  const key = req.params.trailerKey;
  const before = getFleetByKey(key);
  if (!before) return res.status(404).json({ error: 'Trailer not found.' });
  if (before.pairedNonCore) {
    return res.status(400).json({ error: 'NG-02/NG-03 are a paired package and cannot be independently edited.' });
  }

  const { currentClient, leaseStart, leaseEnd, status, actualMonthlyRent, trueAvailableDate, notes } = req.body || {};

  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${STATUSES.join(', ')}` });
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO fleet_overrides
      (trailer_key, trailer_id, trailer_name, current_client, lease_start, lease_end, status, actual_monthly_rent, true_available_date, notes, updated_by, updated_at)
    VALUES (@trailer_key, @trailer_id, @trailer_name, @current_client, @lease_start, @lease_end, @status, @actual_monthly_rent, @true_available_date, @notes, @updated_by, @updated_at)
    ON CONFLICT(trailer_key) DO UPDATE SET
      current_client = excluded.current_client,
      lease_start = excluded.lease_start,
      lease_end = excluded.lease_end,
      status = excluded.status,
      actual_monthly_rent = excluded.actual_monthly_rent,
      true_available_date = excluded.true_available_date,
      notes = excluded.notes,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run({
    trailer_key: key,
    trailer_id: before.trailerId,
    trailer_name: before.trailerName,
    current_client: currentClient ?? before.currentClient ?? null,
    lease_start: leaseStart ?? before.leaseStart ?? null,
    lease_end: leaseEnd ?? before.leaseEnd ?? null,
    status: status ?? before.status ?? null,
    actual_monthly_rent: actualMonthlyRent !== undefined ? actualMonthlyRent : before.actualMonthlyRent,
    true_available_date: trueAvailableDate ?? before.trueAvailableDate ?? null,
    notes: notes ?? null,
    updated_by: req.user.email,
    updated_at: now
  });

  // Step 2/3: read the record back to confirm it became the effective record.
  const after = getFleetByKey(key);
  if (!after) {
    return res.status(500).json({ error: 'Save could not be verified. No change was reported as successful.' });
  }

  // Step 4/5: only append rate history if client, rent, or lease dates actually changed.
  const changed =
    before.currentClient !== after.currentClient ||
    before.leaseStart !== after.leaseStart ||
    before.leaseEnd !== after.leaseEnd ||
    before.actualMonthlyRent !== after.actualMonthlyRent;

  if (changed) {
    db.prepare(`
      INSERT INTO rate_history (trailer_key, customer, monthly_rate, rate_status, effective_start, effective_end, source, notes, user, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      key,
      after.currentClient,
      after.actualMonthlyRent,
      after.status,
      after.leaseStart,
      after.leaseEnd,
      'fleet_operations_edit',
      notes || 'Fleet record updated via Fleet Operations.',
      req.user.email,
      now
    );
  }

  res.json({ trailer: after, rateHistoryAdded: changed });
});

export default router;
