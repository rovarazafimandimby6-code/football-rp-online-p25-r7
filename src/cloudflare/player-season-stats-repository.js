const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAYER_ID_RE = /^FRP-[0-9]{6}$/;
const ROLES = new Set(["GK", "DEF", "MID", "FWD"]);
const RESULTS = new Set(["win", "draw", "loss"]);
const STAT_FIELDS = Object.freeze({
  goals: "goals", assists: "assists", shots: "shots", passes: "passes",
  completedPasses: "completed_passes", tackles: "tackles", interceptions: "interceptions", saves: "saves",
});
const safeCount = value => Number.isFinite(Number(value))
  ? Math.max(0, Math.min(1_000_000_000, Math.floor(Number(value)))) : 0;
const clean = (value, max = 64) => String(value ?? "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, max);
const safeRating = value => value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
  ? null : Math.round(Math.max(1, Math.min(10, Number(value))) * 10) / 10;

function validateIdentity(accountId, playerId) {
  if (typeof accountId !== "string" || !UUID_RE.test(accountId)) throw new Error("INVALID_ACCOUNT_ID");
  if (typeof playerId !== "string" || !PLAYER_ID_RE.test(playerId)) throw new Error("INVALID_PLAYER_ID");
}
function normalizeTotals(row) {
  if (!row) return null;
  const totals = {};
  for (const field of ["matches", "minutesPlayedMs", "wins", "draws", "losses", "goals", "assists", "shots", "passes", "completedPasses", "tackles", "interceptions", "saves", "cleanSheets", "playerOfMatch"]) {
    const column = field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    totals[field] = safeCount(row[column]);
  }
  const rated = safeCount(row.rated_matches);
  return {
    ...totals, seasonId: row.season_id, revision: safeCount(row.revision),
    updatedAt: safeCount(row.updated_at),
    averageRating: rated ? Math.round(Number(row.rating_sum) / rated * 10) / 10 : null,
  };
}
function mapMatch(row) {
  return {
    matchId: row.match_id, seasonId: row.season_id, result: row.result,
    finalizedAt: safeCount(row.finalized_at), role: row.role,
    minutesPlayedMs: safeCount(row.minutes_played_ms),
    rating: row.rating === null ? null : Number(row.rating),
    cleanSheet: Number(row.clean_sheet) === 1, playerOfMatch: Number(row.player_of_match) === 1,
    opponent: row.opponent,
    stats: Object.fromEntries(Object.entries(STAT_FIELDS).map(([field, column]) => [field, safeCount(row[column])])),
  };
}

/** Internal server-authority repository. Never expose recordFinalizedMatch to client routes. */
export class D1PlayerSeasonStatsRepository {
  constructor(db, { now = () => Date.now() } = {}) {
    if (!db || typeof db.prepare !== "function") throw new Error("D1_DATABASE_BINDING_REQUIRED");
    this.db = db;
    this.now = now;
  }

  normalizeMatch(seasonId, input = {}) {
    const season = clean(seasonId, 64);
    const matchId = clean(input.matchId, 64);
    if (!season || !matchId || !RESULTS.has(input.result)) throw new Error("INVALID_SEASON_MATCH");
    const stats = Object.fromEntries(Object.keys(STAT_FIELDS).map(field => [field, safeCount(input.stats?.[field])]));
    stats.completedPasses = Math.min(stats.passes, stats.completedPasses);
    return {
      seasonId: season, matchId, result: input.result,
      finalizedAt: Number.isSafeInteger(input.finalizedAt) && input.finalizedAt >= 0 ? input.finalizedAt : this.now(),
      role: ROLES.has(input.role) ? input.role : "MID",
      minutesPlayedMs: Math.min(600_000, safeCount(input.minutesPlayedMs)),
      rating: safeRating(input.rating), cleanSheet: input.cleanSheet === true,
      playerOfMatch: input.playerOfMatch === true, opponent: clean(input.opponent, 48), stats,
    };
  }

  async recordFinalizedMatch(accountId, playerId, seasonId, input = {}) {
    validateIdentity(accountId, playerId);
    const match = this.normalizeMatch(seasonId, input);
    const identity = await this.db.prepare(
      "SELECT player_id FROM p27_player_identities WHERE account_id = ? LIMIT 1"
    ).bind(accountId).first();
    if (!identity || identity.player_id !== playerId) throw new Error("PLAYER_IDENTITY_MISMATCH");

    const values = [
      accountId, playerId, match.seasonId, match.matchId, match.result, match.finalizedAt,
      match.role, match.minutesPlayedMs, match.rating, match.cleanSheet ? 1 : 0,
      match.playerOfMatch ? 1 : 0, match.stats.goals, match.stats.assists, match.stats.shots,
      match.stats.passes, match.stats.completedPasses, match.stats.tackles,
      match.stats.interceptions, match.stats.saves, match.opponent,
    ];
    const inserted = await this.db.prepare(`
      INSERT OR IGNORE INTO p27_player_season_matches (
        account_id, player_id, season_id, match_id, result, finalized_at, role,
        minutes_played_ms, rating, clean_sheet, player_of_match, goals, assists,
        shots, passes, completed_passes, tackles, interceptions, saves, opponent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(...values).run();
    const totalsRow = await this.db.prepare(
      "SELECT * FROM p27_player_season_totals WHERE account_id = ? AND season_id = ?"
    ).bind(accountId, match.seasonId).first();
    const historyRow = await this.db.prepare(
      "SELECT * FROM p27_player_season_matches WHERE account_id = ? AND season_id = ? AND match_id = ?"
    ).bind(accountId, match.seasonId, match.matchId).first();
    return {
      ok: true, duplicate: Number(inserted?.meta?.changes || 0) === 0,
      totals: normalizeTotals(totalsRow), match: historyRow ? mapMatch(historyRow) : null,
    };
  }

  async get(accountId, seasonId, { limit = 50, before = null } = {}) {
    if (typeof accountId !== "string" || !UUID_RE.test(accountId)) throw new Error("INVALID_ACCOUNT_ID");
    const season = clean(seasonId, 64);
    if (!season) throw new Error("INVALID_SEASON_ID");
    const pageSize = Number.isSafeInteger(limit) ? Math.max(1, Math.min(100, limit)) : 50;
    const hasCursor = before && Number.isSafeInteger(before.finalizedAt) &&
      before.finalizedAt >= 0 && typeof before.matchId === "string" && before.matchId.length > 0 && before.matchId.length <= 64;
    if (before && !hasCursor) throw new Error("INVALID_SEASON_CURSOR");
    const totalsRow = await this.db.prepare(
      "SELECT * FROM p27_player_season_totals WHERE account_id = ? AND season_id = ?"
    ).bind(accountId, season).first();
    const rows = hasCursor
      ? await this.db.prepare(`SELECT * FROM p27_player_season_matches
          WHERE account_id = ? AND season_id = ? AND
          (finalized_at < ? OR (finalized_at = ? AND match_id < ?))
          ORDER BY finalized_at DESC, match_id DESC LIMIT ?`)
        .bind(accountId, season, before.finalizedAt, before.finalizedAt, before.matchId, pageSize + 1).all()
      : await this.db.prepare(`SELECT * FROM p27_player_season_matches
          WHERE account_id = ? AND season_id = ?
          ORDER BY finalized_at DESC, match_id DESC LIMIT ?`)
        .bind(accountId, season, pageSize + 1).all();
    const matches = (rows.results || []).slice(0, pageSize).map(mapMatch);
    const hasMore = (rows.results || []).length > pageSize;
    const last = matches.at(-1);
    return {
      seasonId: season, totals: normalizeTotals(totalsRow), matches,
      nextCursor: hasMore && last ? { finalizedAt: last.finalizedAt, matchId: last.matchId } : null,
    };
  }
}
