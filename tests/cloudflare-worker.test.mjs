import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/cloudflare/worker.js";

const request = path => new Request(`https://p27-cloudflare.test${path}`);

test("Cloudflare bootstrap exposes a live health endpoint", async () => {
  const response = await worker.fetch(request("/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    status: "live",
    service: "football-rp-online-p27-cloudflare",
    stage: "bootstrap",
  });
});

test("Cloudflare readiness fails closed when the D1 binding is missing", async () => {
  const response = await worker.fetch(request("/readyz"), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).reason, "D1_BINDING_MISSING");
});

test("Cloudflare readiness verifies the D1 binding before reporting ready", async () => {
  const env = {
    P27_DB: {
      prepare(sql) {
        assert.equal(sql, "SELECT 1 AS ok");
        return { first: async () => ({ ok: 1 }) };
      },
    },
  };
  const response = await worker.fetch(request("/readyz"), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).storage, "d1-connected");
});

test("Cloudflare readiness reports D1 failures without exposing internal errors", async () => {
  const env = {
    P27_DB: {
      prepare() {
        return { first: async () => { throw new Error("private database detail"); } };
      },
    },
  };
  const response = await worker.fetch(request("/readyz"), env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    status: "not-ready",
    reason: "D1_UNAVAILABLE",
  });
});

test("unmigrated P27 routes fail closed instead of pretending to work", async () => {
  const response = await worker.fetch(request("/api/accounts/me"), {});
  assert.equal(response.status, 501);
  assert.equal((await response.json()).error, "CLOUDFLARE_API_NOT_MIGRATED");
});
