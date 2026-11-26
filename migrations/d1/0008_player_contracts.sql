-- Authoritative human-career contract state and immutable command history.
-- Writes are intended for a trusted server route only; no client snapshot endpoint.
CREATE TABLE IF NOT EXISTS p27_player_contract_events (
  account_id TEXT NOT NULL REFERENCES p27_accounts(id) ON DELETE RESTRICT,
  player_id TEXT NOT NULL REFERENCES p27_player_identities(player_id) ON DELETE RESTRICT,
  event_id TEXT NOT NULL CHECK (length(event_id) BETWEEN 1 AND 96),
  event_type TEXT NOT NULL CHECK (event_type IN ('signing', 'transfer', 'renewal', 'termination', 'expiry', 'loan', 'loan-return')),
  expected_revision INTEGER NOT NULL CHECK (expected_revision >= 0),
  revision INTEGER NOT NULL CHECK (revision = expected_revision + 1),
  contract_status TEXT NOT NULL CHECK (contract_status IN ('active', 'terminated', 'expired', 'free-agent')),
  club_id TEXT,
  contract_json TEXT CHECK (contract_json IS NULL OR json_valid(contract_json)),
  occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0),
  PRIMARY KEY (account_id, event_id),
  UNIQUE (account_id, revision)
);
CREATE INDEX IF NOT EXISTS p27_contract_events_by_account
  ON p27_player_contract_events(account_id, revision DESC);
CREATE TABLE IF NOT EXISTS p27_player_contracts (
  account_id TEXT PRIMARY KEY REFERENCES p27_accounts(id) ON DELETE RESTRICT,
  player_id TEXT NOT NULL UNIQUE REFERENCES p27_player_identities(player_id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  contract_status TEXT NOT NULL CHECK (contract_status IN ('active', 'terminated', 'expired', 'free-agent')),
  club_id TEXT,
  contract_json TEXT CHECK (contract_json IS NULL OR json_valid(contract_json)),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
);
-- Compare-and-swap is enforced inside SQLite so concurrent writers cannot overwrite.
CREATE TRIGGER IF NOT EXISTS p27_contract_event_revision_guard
BEFORE INSERT ON p27_player_contract_events
BEGIN
  SELECT CASE
    WHEN COALESCE((SELECT revision FROM p27_player_contracts WHERE account_id = NEW.account_id), 0) != NEW.expected_revision
    THEN RAISE(ABORT, 'CONTRACT_REVISION_CONFLICT')
  END;
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM p27_player_identities
      WHERE account_id = NEW.account_id AND player_id = NEW.player_id
    )
    THEN RAISE(ABORT, 'PLAYER_IDENTITY_MISMATCH')
  END;
END;
CREATE TRIGGER IF NOT EXISTS p27_contract_event_apply_current
AFTER INSERT ON p27_player_contract_events
BEGIN
  INSERT INTO p27_player_contracts (
    account_id, player_id, revision, contract_status, club_id, contract_json, updated_at
  ) VALUES (
    NEW.account_id, NEW.player_id, NEW.revision, NEW.contract_status,
    NEW.club_id, NEW.contract_json, NEW.occurred_at
  ) ON CONFLICT(account_id) DO UPDATE SET
    player_id = excluded.player_id,
    revision = excluded.revision,
    contract_status = excluded.contract_status,
    club_id = excluded.club_id,
    contract_json = excluded.contract_json,
    updated_at = excluded.updated_at;
END;
