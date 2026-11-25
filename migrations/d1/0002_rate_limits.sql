-- D1-backed request throttling for the public local-player identity endpoints.
CREATE TABLE IF NOT EXISTS p27_rate_limit_buckets (
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  window_started_at INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL CHECK (attempt_count > 0),
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (scope, subject_hash)
);

CREATE INDEX IF NOT EXISTS p27_rate_limit_expiry
  ON p27_rate_limit_buckets(expires_at);
