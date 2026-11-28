import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { D1PlayerSeasonStatsRepository } from "../src/cloudflare/player-season-stats-repository.js";

const accountId = "123e4567-e89b-42d3-a456-426614174000";
const otherAccountId = "123e4567-e89b-42d3-a456-426614174002";
const playerId = "FRP-123456";
const migration = readFileSync(fileURLToPath(new URL("../migrations/d1/0007_player_season_stats.sql", import.meta.url)), "utf8");

class SqliteD1 {
  constructor(db) { this.db = db; }
  prepare(sql) {
    const statement = this.db.prepare(sql);
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async first() { return statement.get(...this.values) ?? null; },
      async all() { return { results: statement.all(...this.values) }; },
      async run() { const result = statement.run(...this.values); return { meta: { changes: Number(result.changes) } }; },
    };
  }
  close() { this.db.close(); }
}
function createRepository() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;" +
    "CREATE TABLE p27_accounts (id TEXT PRIMARY KEY);" +
    "CREATE TABLE p27_player_identities (account_id TEXT PRIMARY KEY REFERENCES p27_accounts(id), player_id TEXT NOT NULL UNIQUE);" +
    "INSERT INTO p27_accounts (id) VALUES ('" + accountId + "');" +
    "INSERT INTO p27_accounts (id) VALUES ('" + otherAccountId + "');" +
    "INSERT INTO p27_player_identities (account_id, player_id) VALUES ('" + accountId + "', '" + playerId + "');");
  sqlite.exec(migration);
  const db = new SqliteD1(sqlite);
  return { db, repository: new D1PlayerSeasonStatsRepository(db, { now: () => 1_800_000_000_000 }) };
}
const matchInput = (overrides = {}) => ({
  matchId: "season-match-0001", result: "win", finalizedAt: 1_800_000_000_000,
  role: "FWD", minutesPlayedMs: 60_000, rating: 8.5, cleanSheet: true, playerOfMatch: true,
  opponent: "FC Rival",
  stats: { goals: 2, assists: 1, shots: 4, passes: 20, completedPasses: 17, tackles: 2, interceptions: 1, saves: 0 },
  ...overrides,
});

test("season ledger records an official match and updates only that season aggregate", async () => {
  const { db, repository } = createRepository();
  try {
    const result = await repository.recordFinalizedMatch(accountId, playerId, "season-2026", matchInput());
    assert.equal(result.duplicate, false);
    assert.equal(result.totals.matches, 1);
    assert.equal(result.totals.wins, 1);
    assert.equal(result.totals.goals, 2);
    assert.equal(result.totals.averageRating, 8.5);
    assert.equal(result.match.stats.completedPasses, 17);
    const nextSeason = await repository.get(accountId, "season-2027");
    assert.equal(nextSeason.totals, null);
    assert.equal(nextSeason.matches.length, 0);
  } finally { db.close(); }
});

test("duplicate official season match never changes aggregate twice", async () => {
  const { db, repository } = createRepository();
  try {
    await repository.recordFinalizedMatch(accountId, playerId, "season-2026", matchInput());
    const duplicate = await repository.recordFinalizedMatch(accountId, playerId, "season-2026",
      matchInput({ result: "loss", stats: { goals: 99 } }));
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.totals.matches, 1);
    assert.equal(duplicate.totals.goals, 2);
    assert.equal(duplicate.match.result, "win");
  } finally { db.close(); }
});

test("season ledger rejects mismatched account and player identities", async () => {
  const { db, repository } = createRepository();
  try {
    await assert.rejects(
      repository.recordFinalizedMatch(otherAccountId, playerId, "season-2026", matchInput()),
      /PLAYER_IDENTITY_MISMATCH/
    );
  } finally { db.close(); }
});

test("season history paginates stably and clamps invalid statistics", async () => {
  const { db, repository } = createRepository();
  try {
    await repository.recordFinalizedMatch(accountId, playerId, "season-2026", matchInput({
      matchId: "season-match-0001", finalizedAt: 100, minutesPlayedMs: 900_000,
      stats: { goals: -5, passes: 2, completedPasses: 99 },
    }));
    await repository.recordFinalizedMatch(accountId, playerId, "season-2026", matchInput({
      matchId: "season-match-0002", finalizedAt: 200, rating: null,
    }));
    const first = await repository.get(accountId, "season-2026", { limit: 1 });
    assert.equal(first.matches.length, 1);
    assert.equal(first.matches[0].matchId, "season-match-0002");
    assert.deepEqual(first.nextCursor, { finalizedAt: 200, matchId: "season-match-0002" });
    const second = await repository.get(accountId, "season-2026", { limit: 1, before: first.nextCursor });
    assert.equal(second.matches[0].matchId, "season-match-0001");
    assert.equal(second.matches[0].minutesPlayedMs, 600_000);
    assert.equal(second.matches[0].stats.goals, 0);
    assert.equal(second.matches[0].stats.completedPasses, 2);
    assert.equal(second.nextCursor, null);
  } finally { db.close(); }
});
