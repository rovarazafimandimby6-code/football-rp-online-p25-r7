import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { GoogleWorkerJwksCache, verifyGoogleWorkerIdToken } from "../src/cloudflare/google-id-token-verifier.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const clientId = "p27-client.apps.googleusercontent.com";
const nonce = "nonce-value-that-is-long-enough-123456";
const subject = "google-subject-123456";
const now = 1_800_000_000_000;

function encode(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function fixture(overrides = {}, { headerKid = "test-key-1" } = {}) {
  const pair = await crypto.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256",
  }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  Object.assign(jwk, { kid: "test-key-1", use: "sig", alg: "RS256" });
  const claims = {
    iss: "https://accounts.google.com", aud: clientId, sub: subject, nonce,
    iat: Math.floor(now / 1000) - 10, exp: Math.floor(now / 1000) + 3600,
    ...overrides,
  };
  const header = encode({ alg: "RS256", kid: headerKid, typ: "JWT" });
  const payload = encode(claims);
  const signingInput = header + "." + payload;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(signingInput));
  let binary = "";
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  const token = signingInput + "." + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  let fetches = 0;
  const cache = new GoogleWorkerJwksCache({
    now: () => now,
    fetchImpl: async () => {
      fetches += 1;
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200, headers: { "cache-control": "public, max-age=3600" },
      });
    },
  });
  return { token, cache, getFetches: () => fetches };
}

test("Cloudflare verifier accepts a valid Google RS256 ID token", async () => {
  const f = await fixture();
  const identity = await verifyGoogleWorkerIdToken(f.token, {
    clientId, expectedNonce: nonce, jwksCache: f.cache, now: () => now,
  });
  assert.equal(identity.googleSubject, subject);
  assert.equal(identity.issuer, "https://accounts.google.com");
  assert.equal(identity.audience, clientId);
  assert.equal(f.getFetches(), 1);
});

test("JWKS cache reuses keys and refreshes for an unknown kid", async () => {
  const f = await fixture();
  await verifyGoogleWorkerIdToken(f.token, { clientId, expectedNonce: nonce, jwksCache: f.cache, now: () => now });
  await verifyGoogleWorkerIdToken(f.token, { clientId, expectedNonce: nonce, jwksCache: f.cache, now: () => now });
  assert.equal(f.getFetches(), 1);
  const unknown = await fixture({}, { headerKid: "unknown-key" });
  await assert.rejects(
    verifyGoogleWorkerIdToken(unknown.token, {
      clientId, expectedNonce: nonce, jwksCache: unknown.cache, now: () => now,
    }),
    /GOOGLE_ID_TOKEN_SIGNING_KEY_UNKNOWN/,
  );
  assert.equal(unknown.getFetches(), 2);
});

test("Cloudflare verifier rejects wrong audience, issuer, nonce, expiry and signature", async () => {
  for (const [overrides, expected] of [
    [{ aud: "another-client" }, "GOOGLE_ID_TOKEN_AUDIENCE_INVALID"],
    [{ iss: "https://attacker.example" }, "GOOGLE_ID_TOKEN_ISSUER_INVALID"],
    [{ nonce: "different-nonce-value-123456789" }, "GOOGLE_ID_TOKEN_NONCE_INVALID"],
    [{ exp: Math.floor(now / 1000) - 600 }, "GOOGLE_ID_TOKEN_EXPIRED"],
  ]) {
    const f = await fixture(overrides);
    await assert.rejects(
      verifyGoogleWorkerIdToken(f.token, { clientId, expectedNonce: nonce, jwksCache: f.cache, now: () => now }),
      new RegExp(expected),
    );
  }
  const f = await fixture();
  const signatureParts = f.token.split(".");
  signatureParts[2] = (signatureParts[2][0] === "A" ? "B" : "A") + signatureParts[2].slice(1);
  await assert.rejects(
    verifyGoogleWorkerIdToken(signatureParts.join("."), {
      clientId, expectedNonce: nonce, jwksCache: f.cache, now: () => now,
    }),
    /GOOGLE_ID_TOKEN_SIGNATURE_INVALID/,
  );
});

test("JWKS rejects malformed or ambiguous key sets", async () => {
  const cache = new GoogleWorkerJwksCache({
    fetchImpl: async () => new Response(JSON.stringify({ keys: [
      { kty: "RSA", use: "sig", alg: "RS256", kid: "duplicate", n: "a", e: "AQAB" },
      { kty: "RSA", use: "sig", alg: "RS256", kid: "duplicate", n: "b", e: "AQAB" },
    ] }), { status: 200 }),
  });
  await assert.rejects(cache.getKeys(), /GOOGLE_JWKS_INVALID/);
});

test("Cloudflare verifier rejects a token that is not yet valid", async () => {
  const f = await fixture({ nbf: Math.floor(now / 1000) + 600 });
  await assert.rejects(
    verifyGoogleWorkerIdToken(f.token, {
      clientId, expectedNonce: nonce, jwksCache: f.cache, now: () => now,
    }),
    /GOOGLE_ID_TOKEN_NOT_YET_VALID/,
  );
});
