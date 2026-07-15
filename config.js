// Canonical owner identity for Germfree Fleet Command.
// This is the ONLY place the current owner email should be hardcoded.
// Every server-side permission check (requireOwner / requireEditor in
// auth.js) resolves role dynamically from the editor_users table, not from
// this constant directly - this constant only seeds/migrates that table.
export const OWNER_EMAIL = 'mhenry@germfree.com';

// Emails that previously held the owner role and must be demoted (not
// deleted - their historical created_by/updated_by audit entries elsewhere
// in the database are untouched by this list). Used by the startup
// migration in migrations/002_owner_transfer.js.
export const FORMER_OWNER_EMAILS = ['matthnry314@aol.com'];

// Known read-only viewer, per spec: stays a viewer unless the current
// owner explicitly promotes him.
export const KNOWN_VIEWER_EMAIL = 'nvitale10@hotmail.com';
