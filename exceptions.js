import express from 'express';
import { db } from '../db.js';
import { buildEffectiveFleet } from '../lib/fleet.js';
import { requireEditor } from '../auth.js';
import { toUTCDate } from '../lib/rules.js';

const router = express.Router();

function todayUTC() {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function computeExceptions() {
  const fleet = buildEffectiveFleet();
  const today = todayUTC();
  const exceptions = [];

  for (const t of fleet) {
    if (t.soldHistorical) continue; // NG-04 style sold records aren't billing-active

    const leaseStart = toUTCDate(t.leaseStart);
    const leaseEnd = toUTCDate(t.leaseEnd);

    if (t.status === 'Leased' && leaseStart && today < leaseStart) {
      exceptions.push({
        key: `${t.trailerKey}::leased-before-start`,
        trailerKey: t.trailerKey,
        trailerId: t.trailerId,
        trailerName: t.trailerName,
        type: 'Status says Leased before lease start',
        detail: `Lease start ${t.leaseStart} is in the future.`
      });
    }
    if (t.status === 'Leased' && leaseEnd && today > leaseEnd) {
      exceptions.push({
        key: `${t.trailerKey}::leased-after-end`,
        trailerKey: t.trailerKey,
        trailerId: t.trailerId,
        trailerName: t.trailerName,
        type: 'Status remains Leased after lease end',
        detail: `Lease end ${t.leaseEnd} has passed.`
      });
    }
    if (t.status === 'Leased' && t.isUnpriced) {
      exceptions.push({
        key: `${t.trailerKey}::missing-rate`,
        trailerKey: t.trailerKey,
        trailerId: t.trailerId,
        trailerName: t.trailerName,
        type: 'Actual rate missing for active lease',
        detail: 'No actual monthly rent entered for a Leased record.'
      });
    }
    if (t.readinessConflict) {
      exceptions.push({
        key: `${t.trailerKey}::readiness-conflict`,
        trailerKey: t.trailerKey,
        trailerId: t.trailerId,
        trailerName: t.trailerName,
        type: 'True Available precedes a later readiness milestone',
        detail: `True available ${t.trueAvailableDate}, ready-for-service ${t.readyForServiceDate}.`
      });
    }
    if (t.status === 'Leased' && (!t.leaseStart || !t.leaseEnd)) {
      exceptions.push({
        key: `${t.trailerKey}::missing-dates`,
        trailerKey: t.trailerKey,
        trailerId: t.trailerId,
        trailerName: t.trailerName,
        type: 'Conflicting or missing critical dates',
        detail: 'Leased status with an incomplete lease start/end date.'
      });
    }
  }
  return exceptions;
}

router.get('/', (req, res) => {
  const computed = computeExceptions();
  const resolutions = db.prepare('SELECT * FROM exception_resolutions').all();
  const resMap = new Map(resolutions.map((r) => [r.exception_key, r]));

  const merged = computed.map((e) => ({
    ...e,
    status: resMap.get(e.key)?.status || 'open',
    note: resMap.get(e.key)?.note || null,
    resolvedBy: resMap.get(e.key)?.resolved_by || null,
    resolvedAt: resMap.get(e.key)?.resolved_at || null
  }));
  res.json({ exceptions: merged });
});

router.put('/:key/resolve', requireEditor, (req, res) => {
  const { note, status } = req.body || {};
  const now = new Date().toISOString();
  const finalStatus = status === 'reopened' ? 'reopened' : 'resolved';

  const existing = db.prepare('SELECT * FROM exception_resolutions WHERE exception_key = ?').get(req.params.key);
  if (existing) {
    db.prepare(`
      UPDATE exception_resolutions SET status = ?, note = ?, resolved_by = ?, resolved_at = ? WHERE exception_key = ?
    `).run(finalStatus, note || null, req.user.email, now, req.params.key);
  } else {
    db.prepare(`
      INSERT INTO exception_resolutions (exception_key, status, note, resolved_by, resolved_at, created_at)
      VALUES (?,?,?,?,?,?)
    `).run(req.params.key, finalStatus, note || null, req.user.email, now, now);
  }
  res.json({ ok: true });
});

export default router;
