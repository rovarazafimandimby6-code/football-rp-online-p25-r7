import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/cloudflare/worker.js";

const accountId = "123e4567-e89b-42d3-a456-426614174000";
const playerId = "FRP-123456";
const token = "p27-test-session-token-that-is-long-enough-123456";
const accountRow = {
  id: accountId, username: playerId, display_name: playerId,
  passwordless: 1, player_id: playerId, created_at: "2026-11-25T00:00:00.000Z",
};
class CareerRouteD1 {
  prepare(sql) {
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async first() {
        if (sql.includes("FROM p27_account_sessions s JOIN p27_accounts a")) return accountRow;
        if (sql.startsWith("SELECT * FROM p27_player_career_totals")) return null;
        if (sql.startsWith("SELECT * FROM p27_player_public_career_totals")) return null;
        throw new Error("UNEXPECTED_D1_FIRST_QUERY: " + sql);
      },
      async all() {
        if (sql.startsWith("SELECT * FROM p27_player_career_matches")) return { results: [] };
        if (sql.startsWith("SELECT club_name, COUNT(*)")) return { results: [] };
        throw new Error("UNEXPECTED_D1_ALL_QUERY: " + sql);
      },
    };
  }
  async batch() { return []; }
}
const env = () => ({ P27_DB: new CareerRouteD1() });

test("private career route requires a valid P27 session and returns D1 career data", async () => {
  const unauthorized = await worker.fetch(new Request("https://p27.example.test/api/career"), env());
  assert.equal(unauthorized.status, 401);
  const response = await worker.fetch(new Request("https://p27.example.test/api/career", {
    headers: { authorization: "Bearer " + token },
  }), env());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.career.totals.matches, 0);
  assert.deepEqual(body.career.matches, []);
});

test("public player career route returns only the requested FRP career", async () => {
  const response = await worker.fetch(new Request("https://p27.example.test/api/players/" + playerId + "/career"), env());
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "PLAYER_NOT_FOUND");
});

test("career API refuses client-submitted match history", async () => {
  const response = await worker.fetch(new Request("https://p27.example.test/api/career", {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({ matchId: "forged", result: "win", goals: 99 }),
  }), env());
  assert.equal(response.status, 405);
  assert.equal((await response.json()).error, "METHOD_NOT_ALLOWED");
});
