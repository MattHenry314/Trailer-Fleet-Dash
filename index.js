import * as m001 from './001_schema_migrations_bootstrap.js';
import * as m002 from './002_owner_transfer_mhenry.js';

// Add new migrations here, in order. Each module exports `id` and `up(db)`.
const MIGRATIONS = [m001, m002];

export function runMigrations(db) {
  // 001 creates schema_migrations itself, so run it unconditionally first.
  m001.up(db);

  const applied = new Set(db.prepare('SELECT id FROM schema_migrations').all().map((r) => r.id));
  const results = [];

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) {
      results.push({ id: migration.id, status: 'already applied' });
      continue;
    }
    migration.up(db);
    db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(migration.id, new Date().toISOString());
    results.push({ id: migration.id, status: 'applied' });
  }
  return results;
}
