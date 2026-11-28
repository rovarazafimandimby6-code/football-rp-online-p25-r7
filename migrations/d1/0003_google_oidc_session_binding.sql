-- Bind an in-flight Google link to the exact P27 session that initiated it.
-- Only a SHA-256 token digest is persisted; the bearer token is never stored here.
ALTER TABLE p27_google_oidc_transactions
  ADD COLUMN session_token_hash TEXT
  CHECK (session_token_hash IS NULL OR length(session_token_hash) = 64);
