import { OWNER_EMAIL, FORMER_OWNER_EMAILS, KNOWN_VIEWER_EMAIL } from '../config.js';

export const id = '002_owner_transfer_mhenry';

// This migration ONLY touches the editor_users role-allowlist table.
// It never rewrites created_by / updated_by / user / resolved_by /
// imported_by columns anywhere else in the database - those are audit
// history and must keep showing whoever actually made the change,
// including the previous owner account, if a real deployment had any.
export function up(db) {
  const now = new Date().toISOString();

  // 1) Ensure the new owner exists and is active with the owner role.
  //    Upsert so this is safe whether or not the row already existed.
  db.prepare(`
    INSERT INTO editor_users (email, role, added_by, added_at)
    VALUES (?, 'owner', 'migration:002_owner_transfer_mhenry', ?)
    ON CONFLICT(email) DO UPDATE SET role = 'owner', added_by = 'migration:002_owner_transfer_mhenry', added_at = excluded.added_at
  `).run(OWNER_EMAIL, now);

  // 2) Demote any former owner accounts still marked as owner. They are
  //    NOT deleted - the row (and any historical audit references to the
  //    email elsewhere in the database) is preserved, just no longer
  //    carries owner privileges.
  for (const formerEmail of FORMER_OWNER_EMAILS) {
    const existing = db.prepare('SELECT * FROM editor_users WHERE lower(email) = ?').get(formerEmail.toLowerCase());
    if (existing && existing.role === 'owner') {
      db.prepare(`
        UPDATE editor_users SET role = 'viewer', added_by = 'migration:002_owner_transfer_mhenry', added_at = ?
        WHERE lower(email) = ?
      `).run(now, formerEmail.toLowerCase());
    }
  }

  // 3) Known viewer stays a viewer by default - but ONLY if not already
  //    present, so a manual promotion by the owner is never undone by
  //    re-running this migration.
  const viewerExists = db.prepare('SELECT 1 FROM editor_users WHERE lower(email) = ?').get(KNOWN_VIEWER_EMAIL.toLowerCase());
  if (!viewerExists) {
    db.prepare(`
      INSERT INTO editor_users (email, role, added_by, added_at) VALUES (?, 'viewer', 'system', ?)
    `).run(KNOWN_VIEWER_EMAIL, now);
  }
}
