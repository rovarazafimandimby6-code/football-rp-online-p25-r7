import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { D1PlayerCareerRepository } from "../src/cloudflare/player-career-repository.js";

const accountId = "123e4567-e89b-42d3-a456-426614174000";
const otherAccountId = "123e4567-e89b-42d3-a456-426614174002";
const playerId = "FRP-123456";
const migration = readFileSync(fileURLToPath(new URL("../migrations/d1/0006_player_career.sql", import.meta.url)), "utf8");

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
  return { db, repository: new D1PlayerCareerRepository(db, { now: () => 1_800_000_000_000 }) };
}
const matchInput = (overrides = {}) => ({
  matchId: "match-0001", result: "win", finalizedAt: 1_800_000_000_000,
  name: "Joueur Test", teamName: "FC Test", clubName: "FC Test", opponent: "FC Rival",
  role: "FWD", minutesPlayedMs: 60_000, rating: 8.5, cleanSheet: true, playerOfMatch: true,
  stats: { goals: 2, assists: 1, shots: 4, passes: 20, completedPasses: 17, tackles: 2, interceptions: 1, saves: 0 },
  ...overrides,
});

test("D1 migration creates append-only match history and transactional account/public aggregates", async () => {
  const { db, repository } = createRepository();
  try {
    const result = await repository.recordFinalizedMatch(accountId, playerId, matchInput());
    assert.equal(result.duplicate, false);
    assert.equal(result.career.totals.matches, 1);
    assert.equal(result.career.totals.wins, 1);
    assert.equal(result.career.totals.goals, 2);
    assert.equal(result.career.averageRating, 8.5);
    assert.equal(result.career.matches[0].stats.completedPasses, 17);
    const publicCareer = await repository.getPlayerCareer(playerId);
    assert.equal(publicCareer.player.name, "Joueur Test");
    assert.equal(publicCareer.totals.matches, 1);
    assert.equal(publicCareer.clubHistory[0].clubName, "FC Test");
    const totals = db.db.prepare("SELECT matches, revision FROM p27_player_career_totals WHERE account_id = ?").get(accountId);
    assert.deepEqual({ matches: totals.matches, revision: totals.revision }, { matches: 1, revision: 1 });
  } finally { db.close(); }
});

test("duplicate match IDs never overwrite history or award career totals twice", async () => {
  const { db, repository } = createRepository();
  try {
    await repository.recordFinalizedMatch(accountId, playerId, matchInput());
    const duplicate = await repository.recordFinalizedMatch(accountId, playerId, matchInput({ result: "loss", stats: { goals: 99 } }));
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.career.totals.matches, 1);
    assert.equal(duplicate.career.totals.goals, 2);
    assert.equal(duplicate.career.matches[0].result, "win");
  } finally { db.close(); }
});

test("career rejects account/player identity mismatches", async () => {
  const { db, repository } = createRepository();
  try {
    await assert.rejects(repository.recordFinalizedMatch(otherAccountId, playerId, matchInput()), /PLAYER_IDENTITY_MISMATCH/);
  } finally { db.close(); }
});

test("career history paginates stably and clamps invalid match statistics", async () => {
  const { db, repository } = createRepository();
  try {
    await repository.recordFinalizedMatch(accountId, playerId, matchInput({
      matchId: "match-0001", finalizedAt: 100, minutesPlayedMs: 9_000_000,
      stats: { goals: -5, passes: 2, completedPasses: 99 },
    }));
    await repository.recordFinalizedMatch(accountId, playerId, matchInput({ matchId: "match-0002", finalizedAt: 200, rating: null }));
    const first = await repository.get(accountId, { limit: 1 });
    assert.equal(first.matches.length, 1);
    assert.equal(first.matches[0].matchId, "match-0002");
    assert.deepEqual(first.nextCursor, { finalizedAt: 200, matchId: "match-0002" });
    const second = await repository.get(accountId, { limit: 1, before: first.nextCursor });
    assert.equal(second.matches[0].matchId, "match-0001");
    assert.equal(second.matches[0].minutesPlayedMs, 600_000);
    assert.equal(second.matches[0].stats.goals, 0);
    assert.equal(second.matches[0].stats.completedPasses, 2);
    assert.equal(second.nextCursor, null);
  } finally { db.close(); }
});

test("career validates account, player, match, result, and cursor inputs", async () => {
  const { db, repository } = createRepository();
  try {
    await assert.rejects(repository.get("bad"), /INVALID_ACCOUNT_ID/);
    await assert.rejects(repository.getPlayerCareer("bad"), /INVALID_PLAYER_ID/);
    await assert.rejects(repository.recordFinalizedMatch(accountId, playerId, matchInput({ result: "unknown" })), /INVALID_CAREER_MATCH/);
    await assert.rejects(repository.get(accountId, { before: { finalizedAt: -1, matchId: "x" } }), /INVALID_CAREER_CURSOR/);
  } finally { db.close(); }
});

test("career rejects overlong match IDs instead of silently truncating history identity", async () => {
  const { db, repository } = createRepository();
  try {
    await assert.rejects(
      repository.recordFinalizedMatch(accountId, playerId, matchInput({ matchId: "x".repeat(65) })),
      /INVALID_CAREER_MATCH/,
    );
  } finally { db.close(); }
});
