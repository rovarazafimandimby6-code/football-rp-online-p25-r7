-- P27 club ownership and treasury authority foundation.
-- This schema is intentionally not wired to production routes until legacy data is reconciled.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS p27_clubs (
  club_id TEXT PRIMARY KEY CHECK (length(club_id) BETWEEN 1 AND 48),
  owner_account_id TEXT REFERENCES p27_accounts(id) ON DELETE RESTRICT,
  ownership_revision INTEGER NOT NULL DEFAULT 0 CHECK (ownership_revision >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS p27_one_club_per_owner
  ON p27_clubs(owner_account_id)
  WHERE owner_account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS p27_club_ownership_events (
  club_id TEXT NOT NULL REFERENCES p27_clubs(club_id) ON DELETE RESTRICT,
  event_id TEXT NOT NULL CHECK (length(event_id) BETWEEN 1 AND 96),
  event_type TEXT NOT NULL CHECK (event_type IN ('imported','transferred','released')),
  previous_owner_account_id TEXT REFERENCES p27_accounts(id) ON DELETE RESTRICT,
  new_owner_account_id TEXT REFERENCES p27_accounts(id) ON DELETE RESTRICT,
  ownership_revision INTEGER NOT NULL CHECK (ownership_revision >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (club_id, event_id),
  CHECK (
    (event_type = 'imported' AND previous_owner_account_id IS NULL)
    OR (event_type = 'transferred' AND previous_owner_account_id IS NOT NULL
        AND new_owner_account_id IS NOT NULL
        AND previous_owner_account_id <> new_owner_account_id)
    OR (event_type = 'released' AND previous_owner_account_id IS NOT NULL
        AND new_owner_account_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS p27_club_ownership_events_by_time
  ON p27_club_ownership_events(club_id, created_at DESC);

CREATE TABLE IF NOT EXISTS p27_club_finance_accounts (
  club_id TEXT PRIMARY KEY REFERENCES p27_clubs(club_id) ON DELETE RESTRICT,
  opening_balance INTEGER NOT NULL CHECK (opening_balance BETWEEN 0 AND 1000000000000),
  balance INTEGER NOT NULL CHECK (balance BETWEEN 0 AND 1000000000000),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS p27_club_finance_entries (
  club_id TEXT NOT NULL REFERENCES p27_club_finance_accounts(club_id) ON DELETE RESTRICT,
  entry_id TEXT NOT NULL CHECK (length(entry_id) BETWEEN 1 AND 80),
  category TEXT NOT NULL CHECK (category IN (
    'sponsorship','ticketing','matchday','merchandise','transfer-income',
    'transfer-expense','wages','staff','stadium-maintenance','medical',
    'training','travel','competition-prize','loan','other','shop-purchase','shop-resale'
  )),
  amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 1000000000000),
  direction TEXT NOT NULL CHECK (direction IN ('income','expense')),
  description TEXT NOT NULL,
  reference_id TEXT,
  balance_after INTEGER NOT NULL CHECK (balance_after BETWEEN 0 AND 1000000000000),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  PRIMARY KEY (club_id, entry_id)
);

CREATE INDEX IF NOT EXISTS p27_club_finance_entries_by_time
  ON p27_club_finance_entries(club_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS p27_club_finance_entry_immutable_update
BEFORE UPDATE ON p27_club_finance_entries
BEGIN
  SELECT RAISE(ABORT, 'CLUB_FINANCE_ENTRY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS p27_club_finance_entry_immutable_delete
BEFORE DELETE ON p27_club_finance_entries
BEGIN
  SELECT RAISE(ABORT, 'CLUB_FINANCE_ENTRY_IMMUTABLE');
END;
