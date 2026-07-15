// Bootstraps the schema_migrations ledger itself. Every other migration
// file records its id here after running, so migrations are safe to run on
// every startup (idempotent) and there's a visible, queryable history of
// what has been applied to this database.
export const id = '001_schema_migrations_bootstrap';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
}
