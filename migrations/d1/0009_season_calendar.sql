-- Canonical server-owned competition season calendar.
CREATE TABLE IF NOT EXISTS p27_seasons (
  season_id TEXT PRIMARY KEY CHECK (length(season_id) BETWEEN 3 AND 64),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
  starts_at INTEGER NOT NULL CHECK (starts_at >= 0),
  ends_at INTEGER NOT NULL CHECK (ends_at > starts_at),
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'closed')),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS p27_one_active_season
  ON p27_seasons(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS p27_seasons_calendar ON p27_seasons(starts_at, ends_at);
CREATE TRIGGER IF NOT EXISTS p27_season_no_overlapping_calendar_insert
BEFORE INSERT ON p27_seasons
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM p27_seasons s
    WHERE NEW.starts_at < s.ends_at AND NEW.ends_at > s.starts_at
  ) THEN RAISE(ABORT, 'SEASON_CALENDAR_OVERLAP') END;
END;
CREATE TRIGGER IF NOT EXISTS p27_season_no_overlapping_calendar_update
BEFORE UPDATE OF starts_at, ends_at ON p27_seasons
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM p27_seasons s
    WHERE s.season_id != NEW.season_id
      AND NEW.starts_at < s.ends_at AND NEW.ends_at > s.starts_at
  ) THEN RAISE(ABORT, 'SEASON_CALENDAR_OVERLAP') END;
END;
CREATE TRIGGER IF NOT EXISTS p27_season_no_reopen_closed
BEFORE UPDATE OF status ON p27_seasons
WHEN OLD.status = 'closed' AND NEW.status != 'closed'
BEGIN
  SELECT RAISE(ABORT, 'SEASON_ALREADY_CLOSED');
END;
