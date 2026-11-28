-- Matchmaking index and immutable finalized-result ledger.
-- The Durable Object remains authoritative for live room state; D1 is the
-- cross-room discovery index and durable, idempotent result archive.

CREATE TABLE IF NOT EXISTS p27_match_rooms (
  room_id TEXT PRIMARY KEY CHECK (length(room_id) = 12 AND room_id NOT GLOB '*[^0-9a-f]*'),
  object_name TEXT NOT NULL UNIQUE CHECK (length(object_name) BETWEEN 1 AND 128),
  phase TEXT NOT NULL CHECK (phase IN ('lobby', 'playing', 'halftime', 'fulltime', 'closed')),
  mode TEXT NOT NULL DEFAULT 'friendly' CHECK (mode IN ('friendly', 'career', 'competition')),
  room_name TEXT NOT NULL DEFAULT '' CHECK (length(room_name) <= 64),
  duration_minutes INTEGER NOT NULL DEFAULT 5 CHECK (duration_minutes BETWEEN 3 AND 5),
  blue_humans INTEGER NOT NULL DEFAULT 0 CHECK (blue_humans BETWEEN 0 AND 7),
  red_humans INTEGER NOT NULL DEFAULT 0 CHECK (red_humans BETWEEN 0 AND 7),
  max_humans INTEGER NOT NULL DEFAULT 14 CHECK (max_humans = 14),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  CHECK (expires_at >= created_at)
);

CREATE INDEX IF NOT EXISTS idx_p27_match_rooms_discovery
  ON p27_match_rooms(phase, updated_at DESC, expires_at);

CREATE TABLE IF NOT EXISTS p27_match_results (
  room_id TEXT PRIMARY KEY CHECK (length(room_id) = 12 AND room_id NOT GLOB '*[^0-9a-f]*'),
  result_hash TEXT NOT NULL CHECK (length(result_hash) = 64),
  result_json TEXT NOT NULL CHECK (length(result_json) <= 65536),
  finalized_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_p27_match_results_finalized
  ON p27_match_results(finalized_at DESC, room_id DESC);
