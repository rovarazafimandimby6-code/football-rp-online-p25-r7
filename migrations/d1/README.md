# P27 D1 migrations

SQL migrations are applied in CI against Wrangler's local SQLite-backed D1 emulator. CI does not create or modify a production database.

## Schema history

- `0001_identity.sql`: local player identity reservations, accounts and passwordless sessions.
- `0002_rate_limits.sql`: D1-backed throttling for identity and authentication attempts; client addresses are stored only as hashes.
- `0003_google_oidc_session_binding.sql`: binds an in-flight Google account-link operation to the initiating P27 session using its SHA-256 token hash.
- `0004_player_profiles.sql`: versioned player profile snapshots.
- `0005_player_progression.sql`: persistent player attributes and progression spending.
- `0006_player_career.sql`: append-only finalized-match history, private and public aggregate totals, indexes and atomic aggregate-maintenance triggers.
- `0007_player_season_stats.sql`: player season aggregates.
- `0008_player_contracts.sql`: player contract persistence.
- `0009_season_calendar.sql`: season calendar state.
- `0010_player_shop.sql`: player-owned shop purchases, inventory and resale journal.
- `0011_club_ownership_finance.sql`: canonical club owner references, ownership audit events, collective treasury balances and immutable finance entries.
- `0012_club_finance_contracts_checkpoints.sql`: sponsor contracts, loans, payroll checkpoints and transfer/player-wage recovery checkpoints.

## Career write boundary

The Worker exposes authenticated private career reads at `GET /api/career` and public career reads at `GET /api/players/{FRP-ID}/career`. Client writes to `/api/career` are rejected.

`D1PlayerCareerRepository.recordFinalizedMatch()` is an internal trusted-authority operation. The current Node `RoomManager` finalizer writes finalized events into the local career store and its durable cloud-sync outbox. `CareerSyncService` sends those events to the Worker route `POST /internal/matches/career`, authenticated with an HMAC signature; the Worker validates the account/player identity pair and inserts each match idempotently into D1. This relay starts only when the Node server starts and only sends when `P27_CAREER_SYNC_URL` and `P27_MATCH_INGEST_SECRET` are configured. The Worker also requires the same secret in its `P27_MATCH_INGEST_SECRET` binding and a valid `P27_DB` binding. Without all production bindings, the local career store remains the active durable source and queued events stay pending for retry. This is a server-to-server relay, not a direct client write and not a Durable Object match authority.

## Rules

- Add forward-only, versioned SQL files. Do not edit a migration after it has been applied to a shared or production database.
- Preserve unique constraints and foreign keys; test duplicate identities, duplicate match IDs and deletion behavior.
- Use explicit revisions and idempotency keys for later synchronization and match-result tables.
- Never store a whole domain store in one JSON row or exceed D1's 2 MB row limit.
- Keep canonical match history separate from temporary logs and cache retention.
- Do not create a production D1 database, add secrets, or apply migrations remotely without the owner's explicit action.

## Club ownership and treasury migration boundary

Migration `0011` and `D1ClubRepository` establish the D1 data model and repository primitives for club ownership and collective finance. Automated SQLite tests cover idempotent import, one-club-per-account ownership, optimistic ownership transfer with audit history, treasury preservation, atomic ledger posting, duplicate transaction handling and overdraft prevention.

The repository is deliberately not wired into the Cloudflare Worker or the live Node server yet. The current server remains authoritative: `managerId` is persisted in the club season/roster JSON store, while opening balances, finance ledger entries, sponsor contracts, loans, payroll schedule and transfer-finance checkpoints are persisted by the JSON finance service. A production cutover must import and reconcile all of these records before switching reads or writes.

Do not seed a club's D1 balance from its configured default budget when a legacy finance account already exists. The import operation accepts an explicit opening balance and refuses to overwrite an existing account whose owner or opening/current balance differs. The current finance account's opening balance and every ledger entry must be exported from the legacy finance store, and the final D1 balance must match the legacy balance before enabling D1 writes.

A deterministic legacy audit/export command now exists at `scripts/export-club-d1-migration.mjs`. It reads the actual server data files under `data/`, validates all 156 club records, rejects duplicate legacy account IDs and duplicate sponsor/loan/transfer/wage checkpoint IDs, resolves `managerId` against account IDs, verifies every finance ledger balance, and includes sponsor contracts, loans, payroll checkpoints, transfer-fee checkpoints and player-wage checkpoints. Run `node scripts/export-club-d1-migration.mjs --data-root data` for a read-only dry run. Only when the report is clean, create a protected export with `node scripts/export-club-d1-migration.mjs --data-root data --write /secure/path/p27-club-d1-bundle.json`. The script never writes a bundle when any validation issue exists.

The export is a validated migration package, not proof that production D1 has been populated. It includes the club-owner account IDs needed for reconciliation and financial records, but deliberately excludes account passwords, password salts, session hashes, session tokens and player identity fields from transfer-event history. The D1 import runner and remote cutover still require the live data directory and the production D1 binding/authorization. Keep the Node server as the only writer until the bundle has been imported, every row and final balance has been compared, and rollback has been rehearsed. Do not enable dual writes.


## Import SQL (validated bundle only)

After a clean export, generate the D1 import SQL without connecting to production:

```sh
node scripts/build-club-d1-import-sql.mjs --bundle /secure/path/p27-club-d1-bundle.json --output /secure/path/p27-club-d1-import.sql
```

Review the generated SQL and apply it only to the intended D1 database after confirming the account table and migrations are present. The SQL uses `INSERT OR IGNORE`; it never overwrites an existing row. This makes retries non-destructive, but it also means pre-existing conflicting rows must be detected by the post-import reconciliation rather than treated as successful imports. Compare all row counts and each club's owner, opening balance, final balance, ledger IDs/balance-after values, sponsor/loan records and scheduler checkpoints against the source bundle. Do not cut over on aggregate counts alone.

The generated SQL ends with two verification queries. The first reports imported table totals. The second compares every expected club against D1 and returns only discrepancies in owner assignment, opening/final balance, ledger-entry count, sponsor count or loan count; it must return zero rows. Keep the source bundle available for a separate detailed ledger/checkpoint comparison before cutover. The exporter and SQL builder both accept the `shop-purchase` and `shop-resale` treasury categories, and reject contradictory transfer checkpoint states (for example, `completed` while a debit or credit is still unposted).\n\nA clean CI run validates the schema and generator against fixtures, not the live 156-club production dataset. The real migration remains pending until the owner supplies an authorized, current export of the server `data/` directory and access to the intended Cloudflare D1 database. Never commit production data, password hashes, session hashes or secrets into the repository.


## Match room discovery and finalized results (migration 0013)

Migration `0013_match_room_registry.sql` adds a small D1 discovery index for match rooms and an immutable finalized-result ledger. It does not store live simulation state, player inputs, WebSocket connections or room checkpoints; those belong to the deterministic room Durable Object.

`D1MatchRoomRepository` currently provides:
- validated room metadata upserts and expiry-aware discovery queries;
- deterministic room-to-object naming using the validated 12-character room ID;
- canonical JSON hashing and a 64 KiB cap for finalized results;
- insert-once result persistence, duplicate acknowledgement and conflict rejection when a room ID is reused with different result data.

The repository is not yet wired to a Durable Object or public Worker route. Migration 0013 is forward-only and has not been applied remotely by this change. CI/local SQLite validation is required before any remote application. Do not enable matchmaking or claim live multiplayer readiness from the presence of these tables alone.
