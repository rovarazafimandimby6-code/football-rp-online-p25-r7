import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/cloudflare/worker.js";

const accountId = "123e4567-e89b-42d3-a456-426614174000";
const token = "p27-test-session-token-that-is-long-enough-123456";
const accountRow = {
  id: accountId, username: "FRP-123456", display_name: "FRP-123456",
  passwordless: 1, player_id: "FRP-123456", created_at: "2026-11-25T00:00:00.000Z",
};

class ProgressionRouteD1 {
  constructor() { this.progression = null; }
  async batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
  prepare(sql) {
    const db = this;
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async first() {
        if (sql.includes("FROM p27_account_sessions s JOIN p27_accounts a")) return accountRow;
        if (sql.startsWith("SELECT level, experience, coins, training_points")) return db.progression ? { ...db.progression } : null;
        throw new Error("UNEXPECTED_D1_FIRST_QUERY: " + sql);
      },
      async all() {
        if (sql.startsWith("SELECT match_id FROM p27_progression_match_events")) return { results: [] };
        throw new Error("UNEXPECTED_D1_ALL_QUERY: " + sql);
      },
      async run() {
        if (sql.startsWith("INSERT INTO p27_player_progression")) {
          if (!db.progression) db.progression = {
            level: 1, experience: 0, coins: 250, training_points: 0,
            attributes_json: this.values[1], revision: 1, updated_at: this.values[2],
          };
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("UPDATE p27_player_progression")) {
          const [level, experience, coins, trainingPoints, attributesJson, updatedAt, id, revision] = this.values;
          if (!db.progression || id !== accountId || db.progression.revision !== revision) return { meta: { changes: 0 } };
          db.progression = {
            level, experience, coins, training_points: trainingPoints,
            attributes_json: attributesJson, revision: revision + 1, updated_at: updatedAt,
          };
          return { meta: { changes: 1 } };
        }
        throw new Error("UNEXPECTED_D1_RUN_QUERY: " + sql);
      },
    };
  }
}

const request = (method, body, extraHeaders = {}) => new Request("https://p27.example.test/api/progression/me", {
  method,
  headers: {
    authorization: "Bearer " + token,
    ...(body ? { "content-type": "application/json" } : {}),
    ...extraHeaders,
  },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

test("progression route requires an active P27 account session", async () => {
  const response = await worker.fetch(new Request("https://p27.example.test/api/progression/me"), { P27_DB: new ProgressionRouteD1() });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "SESSION_EXPIRED");
});

test("progression route reads the D1 default without creating a row", async () => {
  const db = new ProgressionRouteD1();
  const response = await worker.fetch(request("GET"), { P27_DB: db });
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.equal(snapshot.revision, 0);
  assert.equal(snapshot.progression.level, 1);
  assert.equal(snapshot.progression.coins, 250);
  assert.equal(db.progression, null);
});

test("progression route allows authenticated practice and returns the new revision", async () => {
  const db = new ProgressionRouteD1();
  const response = await worker.fetch(request("POST", { action: "practice", attribute: "pace", amount: 1 }), { P27_DB: db });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.progression.attributes.pace, 56);
  assert.equal(result.progression.coins, 170);
  assert.equal(result.progression.experience, 25);
  assert.equal(result.revision, 2);
});

test("progression route rejects cross-origin mutations", async () => {
  const response = await worker.fetch(request("POST", { action: "practice", attribute: "pace", amount: 1 }, { origin: "https://attacker.example" }), { P27_DB: new ProgressionRouteD1() });
  assert.equal(response.status, 403);
});

test("progression route does not expose match reward submission to clients", async () => {
  const response = await worker.fetch(request("POST", { action: "grantMatchReward", attribute: "pace" }), { P27_DB: new ProgressionRouteD1() });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "INVALID_PROGRESSION_ACTION");
});

test("progression route rejects stale full-snapshot replacement instead of accepting client state", async () => {
  const db = new ProgressionRouteD1();
  const response = await worker.fetch(request("POST", {
    action: "restore",
    progression: {
      level: 1, experience: 0, coins: 999999, trainingPoints: 0,
      attributes: { pace: 55, shooting: 50, passing: 50, defense: 45, stamina: 55, control: 50 },
      processedMatchIds: [],
    },
  }), { P27_DB: db });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "INVALID_PROGRESSION_ACTION");
  assert.equal(db.progression, null);
});
