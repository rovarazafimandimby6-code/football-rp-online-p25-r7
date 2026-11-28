const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAYER_ID_RE = /^FRP-[0-9]{6}$/;
const ROLES = new Set(["GK", "DEF", "MID", "FWD"]);
const RESULTS = new Set(["win", "draw", "loss"]);
const STAT_COLUMNS = Object.freeze({
  goals: "goals", assists: "assists", shots: "shots", passes: "passes",
  completedPasses: "completed_passes", tackles: "tackles", interceptions: "interceptions", saves: "saves",
});
const EMPTY_TOTALS = Object.freeze({
  matches: 0, minutesPlayedMs: 0, wins: 0, draws: 0, losses: 0,
  goals: 0, assists: 0, shots: 0, passes: 0, completedPasses: 0,
  tackles: 0, interceptions: 0, saves: 0, cleanSheets: 0, playerOfMatch: 0,
});
const safeCount = value => Number.isFinite(Number(value))
  ? Math.max(0, Math.min(1_000_000_000, Math.floor(Number(value)))) : 0;
const clean = (value, max = 64) => String(value ?? "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, max);
const safeRating = value => value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
  ? null : Math.round(Math.max(1, Math.min(10, Number(value))) * 10) / 10;

function accountIdOrThrow(value) {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new Error("INVALID_ACCOUNT_ID");
  return value;
}
function playerIdOrThrow(value) {
  if (typeof value !== "string" || !PLAYER_ID_RE.test(value)) throw new Error("INVALID_PLAYER_ID");
  return value;
}
function normalizeTotals(row) {
  if (!row) return { ...EMPTY_TOTALS, revision: 0, updatedAt: null, averageRating: null };
  const totals = { ...EMPTY_TOTALS };
  for (const [key, column] of Object.entries({
    matches: "matches", minutesPlayedMs: "minutes_played_ms", wins: "wins", draws: "draws", losses: "losses",
    goals: "goals", assists: "assists", shots: "shots", passes: "passes", completedPasses: "completed_passes",
    tackles: "tackles", interceptions: "interceptions", saves: "saves", cleanSheets: "clean_sheets", playerOfMatch: "player_of_match",
  })) totals[key] = safeCount(row[column]);
  const ratedMatches = safeCount(row.rated_matches);
  return {
    ...totals, revision: safeCount(row.revision),
    updatedAt: Number.isFinite(Number(row.updated_at)) ? Number(row.updated_at) : null,
    averageRating: ratedMatches ? Math.round((Number(row.rating_sum) / ratedMatches) * 10) / 10 : null,
  };
}
function mapMatch(row) {
  return {
    matchId: row.match_id, result: row.result, finalizedAt: Number(row.finalized_at),
    playerName: row.player_name, teamName: row.team_name, clubName: row.club_name,
    opponent: row.opponent, role: row.role, minutesPlayedMs: Number(row.minutes_played_ms),
    rating: row.rating === null ? null : Number(row.rating),
    cleanSheet: Number(row.clean_sheet) === 1, playerOfMatch: Number(row.player_of_match) === 1,
    stats: Object.fromEntries(Object.entries(STAT_COLUMNS).map(([field, column]) => [field, Number(row[column])])),
  };
}
function pageOptions(options = {}) {
  const limit = Number.isSafeInteger(options.limit) ? Math.max(1, Math.min(100, options.limit)) : 50;
  const beforeFinalizedAt = options.before?.finalizedAt;
  const beforeMatchId = options.before?.matchId;
  const hasCursor = Number.isSafeInteger(beforeFinalizedAt) && beforeFinalizedAt >= 0 &&
    typeof beforeMatchId === "string" && beforeMatchId.length > 0 && beforeMatchId.length <= 64;
  if (options.before && !hasCursor) throw new Error("INVALID_CAREER_CURSOR");
  return { limit, hasCursor, beforeFinalizedAt, beforeMatchId };
}

/** Internal authority repository. Never expose recordFinalizedMatch to client routes. */
export class D1PlayerCareerRepository {
  constructor(db, { now = () => Date.now() } = {}) {
    if (!db || typeof db.prepare !== "function") throw new Error("D1_DATABASE_BINDING_REQUIRED");
    this.db = db;
    this.now = now;
  }
  normalizeMatch(input = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_CAREER_MATCH");
    const rawMatchId = typeof input.matchId === "string" ? input.matchId.trim() : "";
    const matchId = clean(rawMatchId, 64);
    if (!matchId || rawMatchId.length > 64 || !RESULTS.has(input.result)) throw new Error("INVALID_CAREER_MATCH");
    const finalizedAt = Number.isSafeInteger(input.finalizedAt) && input.finalizedAt >= 0 ? input.finalizedAt : this.now();
    const stats = Object.fromEntries(Object.keys(STAT_COLUMNS).map(field => [field, safeCount(input.stats?.[field])]));
    stats.completedPasses = Math.min(stats.passes, stats.completedPasses);
    return {
      matchId, result: input.result, finalizedAt, playerName: clean(input.name, 24),
      teamName: clean(input.teamName, 48), clubName: clean(input.clubName || input.teamName, 48),
      opponent: clean(input.opponent, 48), role: ROLES.has(input.role) ? input.role : "MID",
      minutesPlayedMs: Math.min(600_000, safeCount(input.minutesPlayedMs)), rating: safeRating(input.rating),
      cleanSheet: input.cleanSheet === true, playerOfMatch: input.playerOfMatch === true, stats,
    };
  }
  async recordFinalizedMatch(accountId, playerId, input = {}) {
    accountIdOrThrow(accountId);
    playerIdOrThrow(playerId);
    const match = this.normalizeMatch(input);
    const identity = await this.db.prepare(
      "SELECT 1 AS valid FROM p27_player_identities WHERE account_id = ? AND player_id = ?"
    ).bind(accountId, playerId).first();
    if (!identity) throw new Error("PLAYER_IDENTITY_MISMATCH");
    const result = await this.db.prepare(
      "INSERT INTO p27_player_career_matches (" +
      "account_id, player_id, match_id, result, finalized_at, player_name, team_name, club_name, opponent, role, " +
      "minutes_played_ms, rating, clean_sheet, player_of_match, goals, assists, shots, passes, completed_passes, tackles, interceptions, saves" +
      ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING"
    ).bind(
      accountId, playerId, match.matchId, match.result, match.finalizedAt, match.playerName,
      match.teamName, match.clubName, match.opponent, match.role, match.minutesPlayedMs,
      match.rating, match.cleanSheet ? 1 : 0, match.playerOfMatch ? 1 : 0,
      match.stats.goals, match.stats.assists, match.stats.shots, match.stats.passes,
      match.stats.completedPasses, match.stats.tackles, match.stats.interceptions, match.stats.saves,
    ).run();
    const inserted = Number(result?.meta?.changes) === 1;
    if (!inserted) {
      const existing = await this.db.prepare(
        "SELECT account_id FROM p27_player_career_matches WHERE player_id = ? AND match_id = ?"
      ).bind(playerId, match.matchId).first();
      if (!existing || existing.account_id !== accountId) throw new Error("CAREER_MATCH_IDENTITY_CONFLICT");
    }
    return { duplicate: !inserted, career: await this.get(accountId) };
  }
  async get(accountId, options = {}) {
    accountIdOrThrow(accountId);
    const { limit, hasCursor, beforeFinalizedAt, beforeMatchId } = pageOptions(options);
    const totalsRow = await this.db.prepare("SELECT * FROM p27_player_career_totals WHERE account_id = ?").bind(accountId).first();
    const query = hasCursor
      ? "SELECT * FROM p27_player_career_matches WHERE account_id = ? AND (finalized_at < ? OR (finalized_at = ? AND match_id < ?)) ORDER BY finalized_at DESC, match_id DESC LIMIT ?"
      : "SELECT * FROM p27_player_career_matches WHERE account_id = ? ORDER BY finalized_at DESC, match_id DESC LIMIT ?";
    const rows = hasCursor
      ? await this.db.prepare(query).bind(accountId, beforeFinalizedAt, beforeFinalizedAt, beforeMatchId, limit + 1).all()
      : await this.db.prepare(query).bind(accountId, limit + 1).all();
    const descending = (rows?.results || []).slice(0, limit);
    const hasMore = (rows?.results || []).length > limit;
    const oldest = descending.at(-1);
    const matches = descending.map(mapMatch).reverse();
    const totals = normalizeTotals(totalsRow);
    return {
      totals, matches,
      currentForm: hasCursor ? [] : matches.slice(-5).map(match => ({
        matchId: match.matchId, result: match.result, rating: match.rating, finalizedAt: match.finalizedAt,
      })),
      averageRating: totals.averageRating,
      nextCursor: hasMore && oldest ? { finalizedAt: Number(oldest.finalized_at), matchId: oldest.match_id } : null,
    };
  }
  async getPlayerCareer(playerId, options = {}) {
    playerIdOrThrow(playerId);
    const { limit, hasCursor, beforeFinalizedAt, beforeMatchId } = pageOptions(options);
    const totalsRow = await this.db.prepare("SELECT * FROM p27_player_public_career_totals WHERE player_id = ?").bind(playerId).first();
    const query = hasCursor
      ? "SELECT * FROM p27_player_career_matches WHERE player_id = ? AND (finalized_at < ? OR (finalized_at = ? AND match_id < ?)) ORDER BY finalized_at DESC, match_id DESC LIMIT ?"
      : "SELECT * FROM p27_player_career_matches WHERE player_id = ? ORDER BY finalized_at DESC, match_id DESC LIMIT ?";
    const rows = hasCursor
      ? await this.db.prepare(query).bind(playerId, beforeFinalizedAt, beforeFinalizedAt, beforeMatchId, limit + 1).all()
      : await this.db.prepare(query).bind(playerId, limit + 1).all();
    const descending = (rows?.results || []).slice(0, limit);
    const hasMore = (rows?.results || []).length > limit;
    const oldest = descending.at(-1);
    const matches = descending.map(mapMatch).reverse();
    const latest = descending[0];
    const clubRows = await this.db.prepare(
      "SELECT club_name, COUNT(*) AS appearances, MIN(finalized_at) AS first_match_at, MAX(finalized_at) AS last_match_at " +
      "FROM p27_player_career_matches WHERE player_id = ? AND club_name <> '' GROUP BY club_name ORDER BY last_match_at DESC"
    ).bind(playerId).all();
    const totals = normalizeTotals(totalsRow);
    return {
      player: latest ? { name: latest.player_name, role: latest.role, clubName: latest.club_name } : null,
      totals, matches,
      clubHistory: (clubRows?.results || []).map(row => ({
        clubName: row.club_name, appearances: Number(row.appearances),
        firstMatchAt: Number(row.first_match_at), lastMatchAt: Number(row.last_match_at),
      })),
      currentForm: hasCursor ? [] : matches.slice(-5).map(match => ({
        matchId: match.matchId, result: match.result, rating: match.rating, finalizedAt: match.finalizedAt,
      })),
      averageRating: totals.averageRating,
      nextCursor: hasMore && oldest ? { finalizedAt: Number(oldest.finalized_at), matchId: oldest.match_id } : null,
    };
  }
}
