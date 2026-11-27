# P27 club finance — production D1 cutover runbook

Status: **prepared, not executed**. CI validates the schema, exporter and SQL generator against synthetic fixtures. It does not validate the live `data/` directory and does not modify Cloudflare production.

## Non-negotiable cutover gates

Do not switch any club-finance reads or writes to D1 until every gate below is satisfied:

- [ ] Owner confirms the target Cloudflare account and the `p27-world` D1 database.
- [ ] Current production Node server is placed in maintenance/read-only mode for club ownership, treasury, payroll, sponsor/loan settlement and transfer-fee posting.
- [ ] A private, encrypted backup of the complete server `data/` directory and a separate D1 export are stored outside GitHub.
- [ ] The exporter dry-run reports `ok: true`, exactly 156 clubs, no issues, and counts are reviewed.
- [ ] The protected migration bundle is generated from that same frozen data snapshot.
- [ ] All D1 migrations through `0012` are applied to the intended database.
- [ ] The generated SQL is reviewed and applied once; retries are permitted only after reconciliation explains every existing row.
- [ ] Per-club owner, opening balance, final balance, every ledger entry (ID/category/amount/direction/reference/timestamp/balance-after), sponsor, loan, payroll checkpoint, transfer checkpoint and player-wage checkpoint are reconciled against the bundle.
- [ ] Foreign-key checks and duplicate/idempotency checks are clean.
- [ ] A rollback rehearsal has restored the pre-cutover backup in a separate test database.
- [ ] A separately approved deployment changes the authoritative read/write path. Never enable dual writes as a shortcut.

## 1. Freeze and back up

Stop or disable every process that can mutate club finance data before exporting. Keep ordinary player/game services running only if they cannot write any of the listed stores.

On the trusted server, create a private backup of the entire `data/` directory. Restrict permissions; do not upload this backup or the migration bundle to GitHub, chat, issue trackers or build artifacts. It contains account identifiers and financial history.

Export the target D1 database before applying migrations or import SQL. Keep both backups immutable and record their timestamps and SHA-256 checksums in the operator's private change record.

## 2. Validate and export the legacy stores

Run from the repository root on the trusted server:

```sh
node scripts/export-club-d1-migration.mjs --data-root data
```

Stop if the exit code is non-zero, `ok` is not true, the actual club count is not 156, or any issue is reported. Resolve the underlying data problem; do not edit the report or suppress checks.

Only after a clean dry-run, create the protected bundle outside the repository:

```sh
umask 077
node scripts/export-club-d1-migration.mjs --data-root data --write /secure/path/p27-club-d1-bundle.json
```

The exporter intentionally excludes passwords, password salts, session hashes and session tokens. Keep the frozen source stores and bundle together for reconciliation.

## 3. Apply schema migrations

Confirm `wrangler.toml` points to the intended D1 database. The checked-in database ID is a placeholder; replace it only with the owner's actual database ID in the deployment configuration.

After independently confirming the target, apply the versioned schema:

```sh
npx wrangler@4 d1 migrations apply p27-world --remote --config wrangler.toml
```

Confirm migrations `0001` through `0012` are recorded as applied. Do not edit or replay an already-applied migration.

## 4. Generate and inspect import SQL

Generate SQL from the validated bundle:

```sh
node scripts/build-club-d1-import-sql.mjs --bundle /secure/path/p27-club-d1-bundle.json --output /secure/path/p27-club-d1-import.sql
```

Review the SQL and its target database before execution. It uses insert-only statements; existing rows are not overwritten. Therefore, an existing row is not automatically proof of a successful import. Stop on any conflict and reconcile it explicitly.

## 5. Import and reconcile

Only after the target and backup have been confirmed:

```sh
npx wrangler@4 d1 execute p27-world --remote --config wrangler.toml --file=/secure/path/p27-club-d1-import.sql
```

Run the generated post-import queries and require zero discrepancy rows. In addition, perform a detailed comparison using the original bundle and source stores. Aggregate row counts alone are insufficient. Verify all checkpoint IDs and states, every ledger row and its calculated running balance, every owner/account foreign key, and every sponsor/loan field.

Run foreign-key validation against the target D1 database. If any row is missing, duplicated, contradictory or different from the source snapshot, keep the application on the legacy JSON stores and investigate. Do not begin dual writes.

## 6. Rollback and cutover

Before production cutover, rehearse restoring the D1 backup into a separate database and verify that the pre-cutover state is recovered. Keep the original JSON stores unchanged and authoritative throughout the rehearsal.

The actual switch is a separate deployment decision. It requires an independently reviewed implementation that routes all club ownership/finance reads and writes to D1, preserves idempotency and transaction boundaries, and has monitoring and an immediate rollback path. The current code deliberately leaves the legacy JSON stores authoritative; this runbook does not claim that production cutover is complete.

## What is needed to execute the live migration

The operator must run the dry-run and bundle export on the trusted server where the real `data/` directory exists, and must have authorized access to the intended Cloudflare D1 account. Only share the non-sensitive dry-run summary (counts and issue codes), never the raw bundle, account data, credentials or tokens.
