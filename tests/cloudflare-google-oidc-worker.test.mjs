import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker from "../src/cloudflare/worker.js";
import { D1GoogleOidcTransactionRepository } from "../src/cloudflare/google-oidc-transaction-repository.js";
import { D1PasswordlessAccountRepository } from "../src/cloudflare/passwordless-account-repository.js";
import { D1GoogleIdentityRepository } from "../src/cloudflare/google-identity-repository.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const binding = "browser-binding-secret-value-123456789";
const clientId = "p27-client.apps.googleusercontent.com";
const clientSecret = "test-secret-not-for-production";
const redirectUri = "https://p27.example.test/api/auth/google/callback";

class TransactionD1 {
  constructor() { this.rows = new Map(); this.prunedTransactions = 0; }
  async batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
  prepare(sql) {
    const db = this;
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async first() {
        db.lastQuery = { sql, values: this.values };
        if (sql.includes("RETURNING attempt_count")) return { attempt_count: 1 };
        if (sql.includes("FROM p27_account_sessions")) return db.sessionRow || null;
        if (sql.includes("FROM p27_google_oidc_transactions")) return db.rows.get(this.values[0]) || null;
        return null;
      },
      async run() {
        const v = this.values;
        if (sql.startsWith("DELETE FROM p27_rate_limit_buckets")) return { meta: { changes: 0 } };
        if (sql.startsWith("DELETE FROM p27_google_oidc_transactions")) {
          if (sql.includes("state_hash = ?")) {
            const existed = db.rows.delete(v[0]);
            return { meta: { changes: existed ? 1 : 0 } };
          }
          db.prunedTransactions++;
          return { meta: { changes: 0 } };
        }
        if (sql.startsWith("INSERT INTO p27_google_oidc_transactions")) {
          db.rows.set(v[0], {
            state_hash: v[0], nonce: v[1], code_verifier: v[2],
            binding_hash: v[3], purpose: v[4], account_id: v[5],
            session_token_hash: v[6], expires_at: v[7],
          });
          return { meta: { changes: 1 } };
        }
        throw new Error("UNSUPPORTED_TEST_QUERY");
      },
    };
  }
}

const env = () => ({
  P27_DB: new TransactionD1(),
  GOOGLE_CLIENT_ID: clientId,
  GOOGLE_CLIENT_SECRET: clientSecret,
  GOOGLE_REDIRECT_URI: redirectUri,
});

test("Google login start creates a PKCE S256 authorization URL and secure browser cookie", async () => {
  const settings = env();
  const response = await worker.fetch(new Request("https://p27.example.test/api/auth/google/login/start", {
    method: "POST",
  }), settings);
  assert.equal(response.status, 200);
  const body = await response.json();
  const authorization = new URL(body.authorizationUrl);
  assert.equal(authorization.origin, "https://accounts.google.com");
  assert.equal(authorization.pathname, "/o/oauth2/v2/auth");
  assert.equal(authorization.searchParams.get("client_id"), clientId);
  assert.equal(authorization.searchParams.get("redirect_uri"), redirectUri);
  assert.equal(authorization.searchParams.get("response_type"), "code");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.match(authorization.searchParams.get("code_challenge"), /^[A-Za-z0-9_-]{43}$/);
  assert.match(authorization.searchParams.get("state"), /^[A-Za-z0-9_-]{43}$/);
  assert.match(authorization.searchParams.get("nonce"), /^[A-Za-z0-9_-]{43}$/);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(settings.P27_DB.rows.size, 1);
  assert.equal(settings.P27_DB.prunedTransactions, 1);
  assert.equal([...settings.P27_DB.rows.values()][0].purpose, "login");
});

test("Google link start rejects unauthenticated callers before creating a transaction", async () => {
  const settings = env();
  const response = await worker.fetch(new Request("https://p27.example.test/api/auth/google/link/start", {
    method: "POST",
  }), settings);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "SESSION_EXPIRED");
  assert.equal(settings.P27_DB.rows.size, 0);
});

test("Google OIDC endpoints fail closed when OAuth secrets are absent", async () => {
  const response = await worker.fetch(new Request("https://p27.example.test/api/auth/google/login/start", {
    method: "POST",
  }), { P27_DB: new TransactionD1() });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "GOOGLE_OIDC_NOT_CONFIGURED");
});

test("Google callback rejects a missing browser binding and mismatched callback URL", async () => {
  const settings = env();
  const noCookie = await worker.fetch(new Request(
    redirectUri + "?code=authorization-code-value&state=" + "s".repeat(43),
  ), settings);
  assert.equal(noCookie.status, 400);
  assert.equal((await noCookie.json()).error, "GOOGLE_OIDC_TRANSACTION_INVALID");

  const wrongPath = await worker.fetch(new Request(
    "https://p27.example.test/api/auth/google/other?code=authorization-code-value&state=" + "s".repeat(43),
  ), settings);
  assert.equal(wrongPath.status, 501);
});

test("D1 OIDC transaction emits the RFC 7636 base64url SHA-256 challenge", async () => {
  const db = new TransactionD1();
  const repo = new D1GoogleOidcTransactionRepository(db);
  const tx = await repo.create({ sessionBinding: binding, purpose: "login" });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tx.codeVerifier));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  const expected = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  assert.equal(tx.codeChallenge, expected);
  assert.match(tx.codeChallenge, /^[A-Za-z0-9_-]{43}$/);
});

test("Google link start requires proof of the existing local player profile", async () => {
  const settings = env();
  const accountId = "123e4567-e89b-42d3-a456-426614174000";
  settings.P27_DB.sessionRow = {
    id: accountId, username: "p27-test", display_name: "FRP-123456",
    passwordless: 1, player_id: "FRP-123456", created_at: "2026-11-25T00:00:00.000Z",
  };
  const response = await worker.fetch(new Request("https://p27.example.test/api/auth/google/link/start", {
    method: "POST",
    headers: { authorization: "Bearer " + "t".repeat(43), "content-type": "application/json" },
    body: JSON.stringify({ localProfileKey: "123e4567-e89b-42d3-a456-426614174001", localProofSecret: "x".repeat(64) }),
  }), settings);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "LOCAL_PROFILE_PROOF_INVALID");
  assert.equal(settings.P27_DB.rows.size, 0);
});

test("Google link OIDC transaction stores only the originating session token hash", async () => {
  const db = new TransactionD1();
  const repository = new D1GoogleOidcTransactionRepository(db);
  const sessionTokenHash = "a".repeat(64);
  const created = await repository.create({
    accountId: "123e4567-e89b-42d3-a456-426614174000",
    sessionBinding: binding,
    sessionTokenHash,
    purpose: "link",
  });
  const row = [...db.rows.values()][0];
  assert.equal(row.session_token_hash, sessionTokenHash);
  assert.equal(row.session_token_hash.includes(binding), false);
  const consumed = await repository.consume({ state: created.state, sessionBinding: binding });
  assert.equal(consumed.sessionTokenHash, sessionTokenHash);
  assert.equal(db.rows.size, 0);
});

test("Google link OIDC transaction refuses missing session hash and login session binding", async () => {
  const repository = new D1GoogleOidcTransactionRepository(new TransactionD1());
  await assert.rejects(
    repository.create({
      accountId: "123e4567-e89b-42d3-a456-426614174000",
      sessionBinding: binding,
      purpose: "link",
    }),
    /INVALID_OIDC_SESSION_TOKEN_HASH/,
  );
  await assert.rejects(
    repository.create({ sessionBinding: binding, sessionTokenHash: "a".repeat(64), purpose: "login" }),
    /OIDC_LOGIN_MUST_NOT_SPECIFY_ACCOUNT/,
  );
});

test("passwordless repository hashes bearer tokens and checks the exact live session", async () => {
  const db = new TransactionD1();
  const accountId = "123e4567-e89b-42d3-a456-426614174000";
  const fixedNow = 1_800_000_000_000;
  const repository = new D1PasswordlessAccountRepository(db, { now: () => fixedNow });
  const token = "p27-session-token-value-that-is-not-stored-raw";
  const tokenHash = await repository.hashSessionToken(token);
  assert.match(tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(tokenHash, token);
  db.sessionRow = { token_hash: tokenHash };
  assert.equal(await repository.isSessionHashActive(tokenHash, accountId), true);
  assert.match(db.lastQuery.sql, /token_hash = \? AND account_id = \? AND expires_at > \?/);
  assert.deepEqual(db.lastQuery.values, [tokenHash, accountId, fixedNow]);
  db.sessionRow = null;
  assert.equal(await repository.isSessionHashActive(tokenHash, accountId), false);
});

test("Google identity link is atomically conditioned on the initiating live P27 session", async () => {
  const accountId = "123e4567-e89b-42d3-a456-426614174000";
  const sessionTokenHash = "b".repeat(64);
  let sessionActive = false;
  const db = {
    prepare(sql) {
      return {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
      };
    },
    async batch(statements) {
      assert.match(statements[0].sql, /INSERT INTO p27_google_identity_links[\s\S]*SELECT[\s\S]*EXISTS/);
      assert.match(statements[0].sql, /p27_account_sessions WHERE token_hash = \?/);
      assert.equal(statements[0].values[3], sessionTokenHash);
      assert.equal(statements[0].values[4], accountId);
      return sessionActive
        ? [{ meta: { changes: 1 } }, { meta: { changes: 1 } }]
        : [{ meta: { changes: 0 } }, { meta: { changes: 0 } }];
    },
  };
  const repository = new D1GoogleIdentityRepository(db);
  const args = {
    accountId, googleSubject: "google-subject-12345678",
    googleIdentityVerified: true, sessionTokenHash,
  };
  await assert.rejects(repository.linkInitialForActiveSession(args), /SESSION_EXPIRED/);
  sessionActive = true;
  const linked = await repository.linkInitialForActiveSession(args);
  assert.equal(linked.accountId, accountId);
});
