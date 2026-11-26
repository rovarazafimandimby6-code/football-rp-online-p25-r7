-- Authoritative season-scoped player match history.
-- season_id is supplied only by the trusted match/season authority; clients cannot choose it.
CREATE TABLE IF NOT EXISTS p27_player_season_matches (
  account_id TEXT NOT NULL REFERENCES p27_accounts(id) ON DELETE RESTRICT,
  player_id TEXT NOT NULL REFERENCES p27_player_identities(player_id) ON DELETE RESTRICT,
  season_id TEXT NOT NULL CHECK (length(season_id) BETWEEN 1 AND 64),
  match_id TEXT NOT NULL CHECK (length(match_id) BETWEEN 1 AND 64),
  result TEXT NOT NULL CHECK (result IN ('win', 'draw', 'loss')),
  finalized_at INTEGER NOT NULL CHECK (finalized_at >= 0),
  role TEXT NOT NULL CHECK (role IN ('GK', 'DEF', 'MID', 'FWD')),
  minutes_played_ms INTEGER NOT NULL DEFAULT 0 CHECK (minutes_played_ms BETWEEN 0 AND 600000),
  rating REAL CHECK (rating IS NULL OR rating BETWEEN 1 AND 10),
  clean_sheet INTEGER NOT NULL DEFAULT 0 CHECK (clean_sheet IN (0, 1)),
  player_of_match INTEGER NOT NULL DEFAULT 0 CHECK (player_of_match IN (0, 1)),
  goals INTEGER NOT NULL DEFAULT 0 CHECK (goals >= 0),
  assists INTEGER NOT NULL DEFAULT 0 CHECK (assists >= 0),
  shots INTEGER NOT NULL DEFAULT 0 CHECK (shots >= 0),
  passes INTEGER NOT NULL DEFAULT 0 CHECK (passes >= 0),
  completed_passes INTEGER NOT NULL DEFAULT 0 CHECK (completed_passes BETWEEN 0 AND passes),
  tackles INTEGER NOT NULL DEFAULT 0 CHECK (tackles >= 0),
  interceptions INTEGER NOT NULL DEFAULT 0 CHECK (interceptions >= 0),
  saves INTEGER NOT NULL DEFAULT 0 CHECK (saves >= 0),
  opponent TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (account_id, season_id, match_id),
  UNIQUE (player_id, season_id, match_id)
);
CREATE INDEX IF NOT EXISTS p27_season_matches_by_account
  ON p27_player_season_matches(account_id, season_id, finalized_at DESC, match_id DESC);
CREATE INDEX IF NOT EXISTS p27_season_matches_by_player
  ON p27_player_season_matches(player_id, season_id, finalized_at DESC, match_id DESC);

CREATE TABLE IF NOT EXISTS p27_player_season_totals (
  account_id TEXT NOT NULL REFERENCES p27_accounts(id) ON DELETE RESTRICT,
  player_id TEXT NOT NULL REFERENCES p27_player_identities(player_id) ON DELETE RESTRICT,
  season_id TEXT NOT NULL CHECK (length(season_id) BETWEEN 1 AND 64),
  matches INTEGER NOT NULL DEFAULT 0,
  minutes_played_ms INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  shots INTEGER NOT NULL DEFAULT 0,
  passes INTEGER NOT NULL DEFAULT 0,
  completed_passes INTEGER NOT NULL DEFAULT 0,
  tackles INTEGER NOT NULL DEFAULT 0,
  interceptions INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  clean_sheets INTEGER NOT NULL DEFAULT 0,
  player_of_match INTEGER NOT NULL DEFAULT 0,
  rating_sum REAL NOT NULL DEFAULT 0,
  rated_matches INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, season_id),
  UNIQUE (player_id, season_id)
);

-- Aggregates are changed only by inserting a unique official match event.
CREATE TRIGGER IF NOT EXISTS p27_season_match_insert_totals
AFTER INSERT ON p27_player_season_matches
BEGIN
  INSERT INTO p27_player_season_totals (
    account_id, player_id, season_id, matches, minutes_played_ms, wins, draws, losses,
    goals, assists, shots, passes, completed_passes, tackles, interceptions, saves,
    clean_sheets, player_of_match, rating_sum, rated_matches, revision, updated_at
  ) VALUES (
    NEW.account_id, NEW.player_id, NEW.season_id, 1, NEW.minutes_played_ms,
    CASE WHEN NEW.result = 'win' THEN 1 ELSE 0 END,
    CASE WHEN NEW.result = 'draw' THEN 1 ELSE 0 END,
    CASE WHEN NEW.result = 'loss' THEN 1 ELSE 0 END,
    NEW.goals, NEW.assists, NEW.shots, NEW.passes, NEW.completed_passes,
    NEW.tackles, NEW.interceptions, NEW.saves, NEW.clean_sheet, NEW.player_of_match,
    COALESCE(NEW.rating, 0), CASE WHEN NEW.rating IS NULL THEN 0 ELSE 1 END, 1, NEW.finalized_at
  ) ON CONFLICT(account_id, season_id) DO UPDATE SET
    matches = matches + 1, minutes_played_ms = minutes_played_ms + excluded.minutes_played_ms,
    wins = wins + excluded.wins, draws = draws + excluded.draws, losses = losses + excluded.losses,
    goals = goals + excluded.goals, assists = assists + excluded.assists,
    shots = shots + excluded.shots, passes = passes + excluded.passes,
    completed_passes = completed_passes + excluded.completed_passes,
    tackles = tackles + excluded.tackles, interceptions = interceptions + excluded.interceptions,
    saves = saves + excluded.saves, clean_sheets = clean_sheets + excluded.clean_sheets,
    player_of_match = player_of_match + excluded.player_of_match,
    rating_sum = rating_sum + excluded.rating_sum, rated_matches = rated_matches + excluded.rated_matches,
    revision = revision + 1, updated_at = excluded.updated_at;
END;
