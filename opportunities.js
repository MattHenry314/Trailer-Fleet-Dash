import express from 'express';
import { db } from '../db.js';
import { requireEditor } from '../auth.js';
import { findMatch } from '../lib/matching.js';
import { OPPORTUNITY_CATEGORIES, RATE_STAGES } from '../lib/rules.js';

const router = express.Router();

function serializeOpportunity(row) {
  return {
    id: row.id,
    customer: row.customer,
    projectName: row.project_name,
    category: row.category,
    requiredStart: row.required_start,
    requiredEnd: row.required_end,
    customerRate: row.customer_rate,
    rateStage: row.rate_stage,
    status: row.status,
    assignedTrailerKey: row.assigned_trailer_key,
    recommendedStart: row.recommended_start,
    recommendedEnd: row.recommended_end,
    matchNotes: row.match_notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function applyMatchResult(id, opportunity) {
  const now = new Date().toISOString();
  const result = findMatch(opportunity);

  // Supersede any existing active assignment for this opportunity first.
  db.prepare('UPDATE assignments SET active = 0 WHERE opportunity_id = ?').run(id);

  if (result.status === 'assigned') {
    db.prepare(`
      INSERT INTO assignments (trailer_key, opportunity_id, customer, start_date, end_date, source, active, created_at)
      VALUES (?,?,?,?,?,'app',1,?)
    `).run(result.trailerKey, id, opportunity.customer, result.recommendedStart, result.recommendedEnd, now);

    db.prepare(`
      UPDATE opportunities SET status = 'assigned', assigned_trailer_key = ?, recommended_start = ?, recommended_end = ?, match_notes = ?, updated_at = ?
      WHERE id = ?
    `).run(result.trailerKey, result.recommendedStart, result.recommendedEnd, result.notes, now, id);
  } else {
    db.prepare(`
      UPDATE opportunities SET status = 'manual_review', assigned_trailer_key = NULL, recommended_start = NULL, recommended_end = NULL, match_notes = ?, updated_at = ?
      WHERE id = ?
    `).run(result.reason, now, id);
  }
  return result;
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM opportunities WHERE removed = 0 ORDER BY created_at DESC').all();
  res.json({ opportunities: rows.map(serializeOpportunity) });
});

router.post('/', requireEditor, (req, res) => {
  const { customer, projectName, category, requiredStart, requiredEnd, customerRate, rateStage } = req.body || {};

  if (!customer || !projectName || !requiredStart || !requiredEnd) {
    return res.status(400).json({ error: 'customer, projectName, requiredStart, and requiredEnd are required.' });
  }
  if (!OPPORTUNITY_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${OPPORTUNITY_CATEGORIES.join(', ')}` });
  }
  const stage = rateStage && RATE_STAGES.includes(rateStage) ? rateStage : 'unpriced';

  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO opportunities
      (customer, project_name, category, required_start, required_end, customer_rate, rate_stage, status, created_by, created_at, updated_at, removed)
    VALUES (?,?,?,?,?,?,?, 'manual_review', ?, ?, ?, 0)
  `).run(customer, projectName, category, requiredStart, requiredEnd, customerRate ?? null, stage, req.user.email, now, now);

  const id = info.lastInsertRowid;
  // Requirement: opportunity is saved even if no eligible trailer exists -
  // it is inserted above BEFORE matching runs, so it can never be lost.
  applyMatchResult(id, { customer, category, required_start: requiredStart, required_end: requiredEnd });

  const row = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id);
  res.status(201).json({ opportunity: serializeOpportunity(row) });
});

router.post('/:id/reoptimize', requireEditor, (req, res) => {
  const row = db.prepare('SELECT * FROM opportunities WHERE id = ? AND removed = 0').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Opportunity not found.' });
  const result = applyMatchResult(row.id, {
    customer: row.customer,
    category: row.category,
    required_start: row.required_start,
    required_end: row.required_end
  });
  const updated = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(row.id);
  res.json({ opportunity: serializeOpportunity(updated), matchResult: result });
});

router.put('/:id', requireEditor, (req, res) => {
  const row = db.prepare('SELECT * FROM opportunities WHERE id = ? AND removed = 0').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Opportunity not found.' });
  const { customerRate, rateStage, requiredStart, requiredEnd, acceptShiftedRecommendation } = req.body || {};
  const now = new Date().toISOString();

  const stage = rateStage && RATE_STAGES.includes(rateStage) ? rateStage : row.rate_stage;
  db.prepare(`
    UPDATE opportunities SET customer_rate = ?, rate_stage = ?, required_start = ?, required_end = ?, updated_at = ?
    WHERE id = ?
  `).run(
    customerRate !== undefined ? customerRate : row.customer_rate,
    stage,
    requiredStart || row.required_start,
    requiredEnd || row.required_end,
    now,
    row.id
  );

  let result = null;
  // Re-run matching if dates changed, or if the user explicitly accepts
  // a previously shifted recommendation as final.
  if (requiredStart || requiredEnd || acceptShiftedRecommendation) {
    const updatedRow = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(row.id);
    result = applyMatchResult(row.id, {
      customer: updatedRow.customer,
      category: updatedRow.category,
      required_start: updatedRow.required_start,
      required_end: updatedRow.required_end
    });
  }

  const finalRow = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(row.id);
  res.json({ opportunity: serializeOpportunity(finalRow), matchResult: result });
});

router.delete('/:id', requireEditor, (req, res) => {
  const row = db.prepare('SELECT * FROM opportunities WHERE id = ? AND removed = 0').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Opportunity not found.' });
  const now = new Date().toISOString();
  db.prepare('UPDATE opportunities SET removed = 1, updated_at = ? WHERE id = ?').run(now, row.id);
  // Removing an opportunity must supersede its active assignment (drops it from the active Gantt).
  db.prepare('UPDATE assignments SET active = 0 WHERE opportunity_id = ?').run(row.id);
  res.json({ removed: true, id: row.id });
});

export default router;
