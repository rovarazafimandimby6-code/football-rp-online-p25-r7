-- Durable account-linked player identity and cosmetic profile snapshots.
-- Competitive progression remains in its own aggregate and is not stored here.
CREATE TABLE IF NOT EXISTS p27_player_profiles (
  account_id TEXT PRIMARY KEY
    REFERENCES p27_accounts(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  profile_json TEXT NOT NULL CHECK (json_valid(profile_json)),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS p27_player_profiles_by_updated
  ON p27_player_profiles(updated_at);
