-- Persistent progression state and idempotent authoritative match reward ledger.
CREATE TABLE IF NOT EXISTS p27_player_progression (
  account_id TEXT PRIMARY KEY REFERENCES p27_accounts(id) ON DELETE CASCADE,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 99),
  experience INTEGER NOT NULL DEFAULT 0 CHECK (experience BETWEEN 0 AND 1000000000),
  coins INTEGER NOT NULL DEFAULT 250 CHECK (coins BETWEEN 0 AND 1000000000),
  training_points INTEGER NOT NULL DEFAULT 0 CHECK (training_points BETWEEN 0 AND 100000),
  attributes_json TEXT NOT NULL CHECK (json_valid(attributes_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS p27_progression_match_events (
  account_id TEXT NOT NULL REFERENCES p27_accounts(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL,
  experience_awarded INTEGER NOT NULL CHECK (experience_awarded >= 0),
  coins_awarded INTEGER NOT NULL CHECK (coins_awarded >= 0),
  applied_at TEXT NOT NULL,
  PRIMARY KEY (account_id, match_id)
);
CREATE INDEX IF NOT EXISTS p27_progression_events_by_account
  ON p27_progression_match_events(account_id, applied_at DESC);
