import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker from "../src/cloudflare/worker.js";
import { D1GoogleOidcTransactionRepository } from "../src/cloudflare/google-oidc-transaction-repository.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const binding = "browser-binding-secret-value-123456789";
const clientId = "p27-client.apps.googleusercontent.com";
const clientSecret = "test-secret-not-for-production";
const redirectUri = "https://p27.example.test/api/auth/google/callback";

class TransactionD1 {
  constructor() { this.rows = new Map(); }
  async batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
  prepare(sql) {
    const db = this;
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async first() { return null; },
      async run() {
        const v = this.values;
        if (sql.startsWith("INSERT INTO p27_google_oidc_transactions")) {
          db.rows.set(v[0], {
            state_hash: v[0], nonce: v[1], code_verifier: v[2],
            binding_hash: v[3], purpose: v[4], account_id: v[5], expires_at: v[6],
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
