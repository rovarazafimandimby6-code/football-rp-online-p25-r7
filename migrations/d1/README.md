# P27 D1 migrations

SQL migrations are applied in CI against Wrangler's local SQLite-backed D1 emulator. CI does not create or modify a production database.

## Schema history

- `0001_identity.sql`: local player identity reservations, accounts and passwordless sessions.
- `0002_rate_limits.sql`: D1-backed throttling for identity and authentication attempts; client addresses are stored only as hashes.
- `0003_google_oidc_session_binding.sql`: binds an in-flight Google account-link operation to the initiating P27 session using its SHA-256 token hash.
- `0004_player_profiles.sql`: versioned player profile snapshots.
- `0005_player_progression.sql`: persistent player attributes and progression spending.
- `0006_player_career.sql`: append-only finalized-match history, private and public aggregate totals, indexes and atomic aggregate-maintenance triggers.

## Career write boundary

The Worker exposes authenticated private career reads at `GET /api/career` and public career reads at `GET /api/players/{FRP-ID}/career`. Client writes to `/api/career` are rejected.

`D1PlayerCareerRepository.recordFinalizedMatch()` is an internal trusted-authority operation. It validates the account/player identity pair and inserts each match idempotently. The repository and schema are a persistence foundation only: the current Node `RoomManager` finalizer has not yet been connected to a Cloudflare Durable Object match authority or to this D1 write operation. Consequently, live online match results are not yet automatically persisted into Cloudflare career history.

## Rules

- Add forward-only, versioned SQL files. Do not edit a migration after it has been applied to a shared or production database.
- Preserve unique constraints and foreign keys; test duplicate identities, duplicate match IDs and deletion behavior.
- Use explicit revisions and idempotency keys for later synchronization and match-result tables.
- Never store a whole domain store in one JSON row or exceed D1's 2 MB row limit.
- Keep canonical match history separate from temporary logs and cache retention.
- Do not create a production D1 database, add secrets, or apply migrations remotely without the owner's explicit action.
