import express from 'express';
import { issueToken, roleForEmail } from '../auth.js';

const router = express.Router();

// Sign-in is email-based (no password) for this reference implementation.
// This satisfies "require sign-in to identify the user" while keeping the
// project runnable out of the box. Swap in a real identity provider
// (Supabase Auth, Auth0, Microsoft Entra, etc.) before production use -
// see README "Authentication hardening" section.
router.post('/login', (req, res) => {
  const { email } = req.body || {};
  if (!email || !String(email).includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required to sign in.' });
  }
  const token = issueToken(email);
  const role = roleForEmail(email);
  res.json({ token, email: String(email).trim().toLowerCase(), role });
});

router.get('/me', (req, res) => {
  res.json({ email: req.user.email, role: req.user.role });
});

export default router;
