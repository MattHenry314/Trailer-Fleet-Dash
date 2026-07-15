import express from 'express';
import { db } from '../db.js';
import { requireOwner } from '../auth.js';

const router = express.Router();

router.get('/', requireOwner, (req, res) => {
  res.json({ editors: db.prepare('SELECT * FROM editor_users ORDER BY added_at ASC').all() });
});

router.post('/', requireOwner, (req, res) => {
  const { email, role } = req.body || {};
  if (!email || !['owner', 'editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'email and a valid role (owner/editor/viewer) are required.' });
  }
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO editor_users (email, role, added_by, added_at) VALUES (?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET role = excluded.role, added_by = excluded.added_by, added_at = excluded.added_at
  `).run(String(email).trim().toLowerCase(), role, req.user.email, now);
  res.json({ ok: true });
});

router.delete('/:email', requireOwner, (req, res) => {
  db.prepare('DELETE FROM editor_users WHERE email = ?').run(req.params.email.toLowerCase());
  res.json({ ok: true });
});

export default router;
