import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { D1GoogleOidcTransactionRepository } from "../src/cloudflare/google-oidc-transaction-repository.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const accountId = "123e4567-e89b-42d3-a456-426614174000";

class FakeD1 {
  constructor() { this.rows = new Map(); }
  prepare(sql) {
    const db = this;
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async run() {
        const v = this.values;
        if (sql.startsWith("INSERT INTO p27_google_oidc_transactions")) {
          if (db.rows.has(v[0])) throw new Error("UNIQUE constraint failed");
          db.rows.set(v[0], { state_hash:v[0], nonce:v[1], code_verifier:v[2], binding_hash:v[3], purpose:v[4], account_id:v[5], expires_at:v[6] });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("DELETE FROM p27_google_oidc_transactions WHERE state_hash")) {
          const row = db.rows.get(v[0]);
          if (!row || row.binding_hash !== v[1] || row.expires_at <= v[2]) return { meta: { changes: 0 } };
          db.rows.delete(v[0]); return { meta: { changes: 1 } };
        }
        if (sql.startsWith("DELETE FROM p27_google_oidc_transactions WHERE expires_at")) {
          let changes = 0;
          for (const [key,row] of db.rows) if (row.expires_at <= v[0]) { db.rows.delete(key); changes++; }
          return { meta: { changes } };
        }
        throw new Error("UNSUPPORTED_FAKE_D1_WRITE");
      },
      async first() {
        if (!sql.includes("SELECT state_hash")) throw new Error("UNSUPPORTED_FAKE_D1_READ");
        return db.rows.get(this.values[0]) || null;
      },
    };
  }
}

const makeRepo = () => {
  const db = new FakeD1();
  let now = 1_800_000_000_000;
  return { db, repo: new D1GoogleOidcTransactionRepository(db, { now: () => now }), advance:ms => { now += ms; } };
};

test("D1 OIDC transactions are browser-bound, hashed, and single-use", async () => {
  const { db, repo } = makeRepo();
  const binding = "browser-session-binding-secret-0001";
  const tx = await repo.create({ accountId, sessionBinding: binding, purpose: "link" });
  assert.equal(tx.codeChallengeMethod, "S256");
  assert.equal(db.rows.size, 1);
  const stored = [...db.rows.values()][0];
  assert.notEqual(stored.state_hash, tx.state);
  assert.notEqual(stored.binding_hash, binding);
  assert.equal(await repo.consume({ state: tx.state, sessionBinding: "different-browser-session-binding" }), null);
  assert.equal(db.rows.size, 1);
  const consumed = await repo.consume({ state: tx.state, sessionBinding: binding });
  assert.equal(consumed.accountId, accountId);
  assert.equal(consumed.purpose, "link");
  assert.equal(consumed.nonce, tx.nonce);
  assert.equal(await repo.consume({ state: tx.state, sessionBinding: binding }), null);
  assert.equal(db.rows.size, 0);
});

test("D1 OIDC login transactions cannot be bound to an account", async () => {
  const { repo } = makeRepo();
  await assert.rejects(repo.create({ accountId, sessionBinding: "browser-session-binding-secret-0001", purpose: "login" }), /OIDC_LOGIN_MUST_NOT_SPECIFY_ACCOUNT/);
  const tx = await repo.create({ sessionBinding: "browser-session-binding-secret-0001", purpose: "login" });
  const consumed = await repo.consume({ state: tx.state, sessionBinding: "browser-session-binding-secret-0001" });
  assert.equal(consumed.purpose, "login");
  assert.equal("accountId" in consumed, false);
});

test("D1 OIDC transactions expire and can be pruned", async () => {
  const { db, repo, advance } = makeRepo();
  const tx = await repo.create({ sessionBinding: "browser-session-binding-secret-0001", purpose: "login" });
  advance(11 * 60 * 1000);
  assert.equal(await repo.consume({ state: tx.state, sessionBinding: "browser-session-binding-secret-0001" }), null);
  assert.equal(await repo.pruneExpired(), 1);
  assert.equal(db.rows.size, 0);
});
