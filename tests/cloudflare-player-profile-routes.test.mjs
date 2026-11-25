import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/cloudflare/worker.js";

const accountId = "123e4567-e89b-42d3-a456-426614174000";
const token = "p27-test-session-token-that-is-long-enough-123456";
const accountRow = {
  id: accountId, username: "FRP-123456", display_name: "FRP-123456",
  passwordless: 1, player_id: "FRP-123456", created_at: "2026-11-25T00:00:00.000Z",
};

class ProfileRouteD1 {
  constructor() { this.profile = null; }
  prepare(sql) {
    const db = this;
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async first() {
        if (sql.includes("FROM p27_account_sessions s JOIN p27_accounts a")) return accountRow;
        if (sql.startsWith("SELECT profile_json")) return db.profile ? { ...db.profile } : null;
        if (sql.startsWith("INSERT INTO p27_player_profiles")) {
          const [id, json, updatedAt, expected] = this.values;
          if (!db.profile && expected === 0) db.profile = { profile_json: json, revision: 1, updated_at: updatedAt };
          else if (db.profile && db.profile.revision === expected) db.profile = {
            profile_json: json, revision: db.profile.revision + 1, updated_at: updatedAt,
          };
          else return null;
          return { ...db.profile };
        }
        throw new Error("UNEXPECTED_D1_QUERY");
      },
    };
  }
}

const request = (method, body) => new Request("https://p27.example.test/api/player-profile/me", {
  method,
  headers: {
    authorization: "Bearer " + token,
    ...(body ? { "content-type": "application/json" } : {}),
  },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

test("player profile route requires an active P27 account session", async () => {
  const response = await worker.fetch(new Request("https://p27.example.test/api/player-profile/me"), {
    P27_DB: new ProfileRouteD1(),
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "SESSION_EXPIRED");
});

test("player profile route reads an empty D1 snapshot without creating one", async () => {
  const db = new ProfileRouteD1();
  const response = await worker.fetch(request("GET"), { P27_DB: db });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { profile: null, revision: 0, updatedAt: null });
  assert.equal(db.profile, null);
});

test("player profile route writes a revisioned snapshot and rejects stale overwrites", async () => {
  const db = new ProfileRouteD1();
  const first = await worker.fetch(request("PUT", {
    expectedRevision: 0,
    profile: { identity: { displayName: "Rova", role: "FWD" }, appearance: { kit: "crimson" } },
  }), { P27_DB: db });
  assert.equal(first.status, 200);
  assert.equal((await first.json()).revision, 1);

  const stale = await worker.fetch(request("PUT", {
    expectedRevision: 0,
    profile: { identity: { displayName: "Ancienne version" } },
  }), { P27_DB: db });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).currentRevision, 1);
  const current = await worker.fetch(request("GET"), { P27_DB: db });
  assert.equal((await current.json()).profile.identity.displayName, "Rova");
});

test("player profile route rejects cross-origin writes", async () => {
  const req = request("PUT", { expectedRevision: 0, profile: {} });
  const headers = new Headers(req.headers);
  headers.set("origin", "https://attacker.example");
  const response = await worker.fetch(new Request(req, { headers }), { P27_DB: new ProfileRouteD1() });
  assert.equal(response.status, 403);
});
