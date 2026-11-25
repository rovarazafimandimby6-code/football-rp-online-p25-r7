# P27 D1 migrations

SQL migrations are applied locally in CI with Wrangler against its local SQLite-backed D1 emulator. No production database is created or modified by the workflow.

## Current schema

- 0001_identity.sql defines the first identity foundation.
- 0002_rate_limits.sql adds D1-backed request throttling for local-player identity endpoints.
- 0003_google_oidc_session_binding.sql binds an in-flight Google link to the initiating P27 session using only its SHA-256 token hash.
- Player identity reservations are separate from authenticated accounts: a local profile can reserve its FRP identity before Google association.
- Local profile credentials store only proof hashes, never raw proof secrets.
- Google subject and account ownership are unique in the database.
- OIDC state, nonce, PKCE verifier and browser-binding digests are short-lived rows; expired rows must be pruned.
- Account sessions store only token hashes and expire by timestamp.
- Identity API rate limits retain only a hash of the client address and expire after their window.

The schema intentionally does not yet include career, progression, transfers, finances, clubs, competitions, or match data. Those domains require separate audited migrations and repository adapters.

## Rules

- Add forward-only, versioned SQL files; do not edit a migration after it has been applied outside local development.
- Preserve unique constraints and foreign keys; test duplicate identities and deletion behavior.
- Use explicit revisions and idempotency keys for later synchronization and match-result tables.
- Never store a whole domain store in one JSON row or exceed D1's 2 MB row limit.
- Do not create a production D1 database or apply migrations to a remote database without the owner's explicit action.
