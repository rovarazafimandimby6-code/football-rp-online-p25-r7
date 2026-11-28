import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyCareerIngestSignature } from "../src/cloudflare/career-ingest-auth.js";
import worker from "../src/cloudflare/worker.js";
const secret = "p27-test-secret-with-at-least-thirty-two-characters";
const body = JSON.stringify({ accountId: "123e4567-e89b-42d3-a456-426614174000", playerId: "FRP-123456", match: { matchId: "room00000001", result: "win", stats: {} } });
const signed = (raw = body, timestamp = Math.floor(Date.now() / 1000)) => "t=" + timestamp + ",v1=" + createHmac("sha256", secret).update(timestamp + "." + raw).digest("hex");
const request = (path, init) => new Request("https://p27-cloudflare.test" + path, init);
test("career ingest HMAC accepts exact body and rejects altered body", async () => {
  const signature = signed();
  assert.equal(await verifyCareerIngestSignature(secret, body, signature, Math.floor(Date.now() / 1000)), true);
  assert.equal(await verifyCareerIngestSignature(secret, body + " ", signature, 1_800_000_000), false);
});
test("career ingest HMAC rejects stale timestamps, malformed headers, and weak secrets", async () => {
  assert.equal(await verifyCareerIngestSignature(secret, body, signed(body, 1_799_999_000), 1_800_000_000), false);
  assert.equal(await verifyCareerIngestSignature(secret, body, "invalid", 1_800_000_000), false);
  assert.equal(await verifyCareerIngestSignature("short", body, signed(), 1_800_000_000), false);
});
test("career ingest route fails closed until its server secret is configured", async () => {
  const response = await worker.fetch(request("/internal/matches/career", { method: "POST", headers: { "content-type": "application/json" }, body }), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "MATCH_INGEST_NOT_CONFIGURED");
});
test("career ingest route rejects invalid signatures before accessing D1", async () => {
  const response = await worker.fetch(request("/internal/matches/career", { method: "POST", headers: { "content-type": "application/json", "x-p27-signature": signed(body + "tampered") }, body }), { P27_MATCH_INGEST_SECRET: secret });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "MATCH_INGEST_UNAUTHORIZED");
});
test("career ingest route authenticates server before enforcing D1 identity", async () => {
  const response = await worker.fetch(request("/internal/matches/career", { method: "POST", headers: { "content-type": "application/json", "x-p27-signature": signed() }, body }), {
    P27_MATCH_INGEST_SECRET: secret,
    P27_DB: { prepare() { return { bind() { return this; }, first: async () => null }; } },
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "PLAYER_IDENTITY_MISMATCH");
});
test("ordinary clients still cannot POST career records through account route", async () => {
  const response = await worker.fetch(request("/api/career", { method: "POST", headers: { "content-type": "application/json" }, body }), { P27_MATCH_INGEST_SECRET: secret });
  assert.equal(response.status, 405);
});
