import test from "node:test";
import assert from "node:assert/strict";
import { D1PlayerProgressionRepository } from "../src/cloudflare/player-progression-repository.js";

const accountId = "123e4567-e89b-42d3-a456-426614174000";

class ProgressionD1 {
  constructor() { this.rows = new Map(); this.events = new Map(); }
  prepare(sql) {
    const db = this;
    return {
      values: [], bind(...values) { this.values = values; return this; },
      async first() {
        if (sql.startsWith("SELECT 1 AS applied")) return db.events.has(this.values[0] + ":" + this.values[1]) ? { applied: 1 } : null;
        if (sql.startsWith("SELECT level")) return db.rows.get(this.values[0]) || null;
        if (sql.startsWith("SELECT match_id")) return { results: [...db.events.values()].filter(x => x.account_id === this.values[0]).sort((a,b) => a.applied_at.localeCompare(b.applied_at)).map(x => ({ match_id: x.match_id })) };
        throw new Error("UNEXPECTED_FIRST_QUERY");
      },
      async all() {
        if (sql.startsWith("SELECT match_id")) return { results: [...db.events.values()].filter(x => x.account_id === this.values[0]).sort((a,b) => a.applied_at.localeCompare(b.applied_at)).map(x => ({ match_id: x.match_id })) };
        throw new Error("UNEXPECTED_ALL_QUERY");
      },
      async run() {
        if (sql.startsWith("INSERT INTO p27_player_progression")) {
          if (!db.rows.has(this.values[0])) db.rows.set(this.values[0], { level:1, experience:0, coins:250, training_points:0, attributes_json:this.values[1], revision:1 });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("UPDATE p27_player_progression")) {
          const [level, experience, coins, training, attrs, updatedAt, id, revision, guardId, matchId] = this.values;
          const row = db.rows.get(id);
          if (!row || row.revision !== revision || (guardId && db.events.has(guardId + ":" + matchId))) return { meta: { changes: 0 } };
          db.rows.set(id, { level, experience, coins, training_points:training, attributes_json:attrs, revision:revision+1, updated_at:updatedAt });
          return { meta: { changes: 1 } };
        }
        throw new Error("UNEXPECTED_RUN_QUERY");
      },
    };
  }
  async batch(statements) {
    const beforeRows = structuredClone(this.rows), beforeEvents = structuredClone(this.events);
    const first = await statements[0].run();
    const second = statements[1];
    if (first.meta.changes === 1) {
      const [account_id, match_id, experience_awarded, coins_awarded, applied_at] = second.values;
      this.events.set(account_id + ":" + match_id, { account_id, match_id, experience_awarded, coins_awarded, applied_at });
    }
    return [first, { meta: { changes: first.meta.changes } }];
  }
}

const fixedNow = () => Date.parse("2026-11-25T12:00:00.000Z");

test("D1 progression starts with the same default attributes and revision zero", async () => {
  const repository = new D1PlayerProgressionRepository(new ProgressionD1(), { now: fixedNow });
  const result = await repository.get(accountId);
  assert.equal(result.revision, 0);
  assert.equal(result.progression.level, 1);
  assert.equal(result.progression.coins, 250);
  assert.equal(result.progression.attributes.pace, 55);
});

test("D1 progression applies a match reward once and records its idempotency key", async () => {
  const repository = new D1PlayerProgressionRepository(new ProgressionD1(), { now: fixedNow });
  const reward = await repository.grantMatchReward(accountId, { matchId: "match-001", result: "win", minutesPlayedMs: 60000, rating: 8 });
  assert.equal(reward.duplicate, false);
  assert.equal(reward.reward.experience, 56);
  assert.equal(reward.reward.coins, 42);
  assert.equal(reward.revision, 2);
  const duplicate = await repository.grantMatchReward(accountId, { matchId: "match-001", result: "win", minutesPlayedMs: 60000, rating: 8 });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.reward.experience, 0);
  assert.equal(duplicate.progression.coins, 292);
});

test("D1 progression training checks points, coins, and attribute cap", async () => {
  const repository = new D1PlayerProgressionRepository(new ProgressionD1(), { now: fixedNow });
  const result = await repository.spend(accountId, "pace", 1, "training");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "INSUFFICIENT_RESOURCES");
  await assert.rejects(repository.spend(accountId, "unknown", 1), /INVALID_ATTRIBUTE/);
});

test("D1 progression rejects malformed account IDs and invalid match rewards", async () => {
  const repository = new D1PlayerProgressionRepository(new ProgressionD1(), { now: fixedNow });
  await assert.rejects(repository.get("bad"), /INVALID_ACCOUNT_ID/);
  await assert.rejects(repository.grantMatchReward(accountId, { matchId: "", result: "win" }), /INVALID_MATCH_REWARD/);
});

test("D1 progression concurrent commands use compare-and-swap and never overwrite newer values", async () => {
  const db = new ProgressionD1();
  const repository = new D1PlayerProgressionRepository(db, { now: fixedNow });
  const results = await Promise.all([
    repository.spend(accountId, "pace", 1, "practice"),
    repository.spend(accountId, "pace", 1, "practice"),
    repository.spend(accountId, "pace", 1, "practice"),
  ]);
  assert.equal(results.every(result => result.ok), true);
  const current = await repository.get(accountId);
  assert.equal(current.progression.attributes.pace, 58);
  assert.equal(current.progression.coins, 10);
  assert.equal(current.progression.experience, 75);
  assert.equal(current.revision, 4);
});

test("D1 progression grants the same match reward only once under concurrent retries", async () => {
  const db = new ProgressionD1();
  const repository = new D1PlayerProgressionRepository(db, { now: fixedNow });
  const attempts = await Promise.all([
    repository.grantMatchReward(accountId, { matchId: "match-concurrent", result: "win", minutesPlayedMs: 90_000, rating: 7 }),
    repository.grantMatchReward(accountId, { matchId: "match-concurrent", result: "win", minutesPlayedMs: 90_000, rating: 7 }),
  ]);
  assert.equal(attempts.filter(item => item.duplicate === false).length, 1);
  assert.equal(attempts.filter(item => item.duplicate === true).length, 1);
  const current = await repository.get(accountId);
  assert.equal(current.progression.coins, 290);
  assert.equal(current.progression.experience, 59);
  assert.equal(current.revision, 2);
  assert.equal(db.events.size, 1);
});

test("D1 progression rejects overlong match IDs instead of truncating idempotency keys", async () => {
  const repository = new D1PlayerProgressionRepository(new ProgressionD1(), { now: fixedNow });
  await assert.rejects(
    repository.grantMatchReward(accountId, { matchId: "x".repeat(65), result: "win" }),
    /INVALID_MATCH_REWARD/,
  );
});

test("D1 progression treats an omitted rating as neutral instead of the minimum score", async () => {
  const repository = new D1PlayerProgressionRepository(new ProgressionD1(), { now: fixedNow });
  const result = await repository.grantMatchReward(accountId, { matchId: "match-neutral-rating", result: "draw" });
  assert.equal(result.reward.experience, 35);
  assert.equal(result.reward.coins, 28);
});
