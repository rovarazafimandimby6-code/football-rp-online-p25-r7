-- P27 identity foundation.
-- The player identity registry is intentionally separate from accounts:
-- a local career can reserve its FRP identity before Google is linked.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS p27_player_identities (
  account_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL UNIQUE
    CHECK (player_id GLOB 'FRP-[0-9][0-9][0-9][0-9][0-9][0-9]'),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS p27_local_profile_credentials (
  local_profile_key TEXT PRIMARY KEY,
  account_id TEXT NOT NULL
    REFERENCES p27_player_identities(account_id) ON DELETE CASCADE,
  proof_hash TEXT
    CHECK (proof_hash IS NULL OR length(proof_hash) = 64),
  created_at TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0
    CHECK (is_primary IN (0, 1)),
  UNIQUE (account_id, local_profile_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS p27_one_primary_local_profile
  ON p27_local_profile_credentials(account_id)
  WHERE is_primary = 1;

CREATE INDEX IF NOT EXISTS p27_local_profiles_by_account
  ON p27_local_profile_credentials(account_id, created_at);

CREATE TABLE IF NOT EXISTS p27_accounts (
  id TEXT PRIMARY KEY,
  username TEXT,
  display_name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  passwordless INTEGER NOT NULL DEFAULT 0
    CHECK (passwordless IN (0, 1)),
  player_id TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS p27_accounts_username_unique
  ON p27_accounts(username)
  WHERE username IS NOT NULL;

CREATE INDEX IF NOT EXISTS p27_accounts_by_player
  ON p27_accounts(player_id)
  WHERE player_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS p27_account_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL
    REFERENCES p27_accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS p27_sessions_by_account
  ON p27_account_sessions(account_id, expires_at);

CREATE INDEX IF NOT EXISTS p27_sessions_by_expiry
  ON p27_account_sessions(expires_at);

CREATE TABLE IF NOT EXISTS p27_google_identity_links (
  account_id TEXT PRIMARY KEY
    REFERENCES p27_player_identities(account_id) ON DELETE RESTRICT,
  google_subject TEXT NOT NULL UNIQUE,
  linked_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS p27_google_identity_audit (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL
    REFERENCES p27_player_identities(account_id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('google_linked', 'google_transferred')),
  previous_subject TEXT,
  new_subject TEXT,
  occurred_at TEXT NOT NULL,
  CHECK (
    (event_type = 'google_linked' AND previous_subject IS NULL AND new_subject IS NULL)
    OR
    (event_type = 'google_transferred'
      AND previous_subject IS NOT NULL
      AND new_subject IS NOT NULL
      AND previous_subject <> new_subject)
  )
);

CREATE INDEX IF NOT EXISTS p27_google_identity_audit_by_account
  ON p27_google_identity_audit(account_id, occurred_at);

CREATE TABLE IF NOT EXISTS p27_google_oidc_transactions (
  state_hash TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  binding_hash TEXT NOT NULL,
  purpose TEXT NOT NULL
    CHECK (purpose IN ('link', 'login', 'transaction')),
  account_id TEXT
    REFERENCES p27_player_identities(account_id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  CHECK (
    (purpose = 'link' AND account_id IS NOT NULL)
    OR
    (purpose IN ('login', 'transaction') AND account_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS p27_oidc_transactions_by_expiry
  ON p27_google_oidc_transactions(expires_at);
