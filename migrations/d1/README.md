# P27 D1 migrations

This directory is intentionally empty of SQL migrations during the bootstrap stage.

The first schema migration will be added only after the current JSON stores, their invariants, uniqueness rules, and transactional boundaries have been mapped. Do not create a production D1 database or apply migrations yet.

Migration requirements:

- versioned, forward-only SQL files with explicit rollback/export notes;
- normalized tables for accounts, player identities, profiles, progression, careers, contracts, transfers, clubs, competitions, and results;
- unique constraints for account IDs, player IDs, and Google OIDC subjects;
- revision columns and idempotency keys for synchronization and match-result processing;
- no single oversized JSON row for an entire domain store;
- local D1 migration tests before any account is connected.
