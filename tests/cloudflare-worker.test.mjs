import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/cloudflare/worker.js";

const request = (path, init) => new Request("https://p27-cloudflare.test" + path, init);

test("Cloudflare bootstrap exposes a live health endpoint", async () => {
  const response = await worker.fetch(request("/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    status: "live",
    service: "football-rp-online-p27-cloudflare",
    stage: "local-player-identity",
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
  const body = await response.json();
  assert.equal(body.storage, "d1-connected");
  assert.equal(body.stage, "local-player-identity");
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

test("local player identity routes fail closed when D1 is not configured", async () => {
  const response = await worker.fetch(request("/api/player-identities/reserve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      localProfileKey: "11111111-1111-4111-8111-111111111111",
      localProofSecret: "a".repeat(64),
    }),
  }), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "D1_BINDING_MISSING");
});

test("D1 account routes fail closed when persistent storage is missing", async () => {
  const response = await worker.fetch(request("/api/accounts/me"), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "D1_BINDING_MISSING");
});


test("unified personal shop API requires D1 and an authenticated account", async () => {
  const missingDb = await worker.fetch(request("/api/shop?shop=player"), {});
  assert.equal(missingDb.status,503);
  assert.equal((await missingDb.json()).error,"D1_BINDING_MISSING");

  const db = { prepare() { return { bind() { return this; }, first: async () => null }; }, batch: async () => [] };
  const anonymousRead = await worker.fetch(request("/api/shop?shop=player"), { P27_DB:db });
  assert.equal(anonymousRead.status,401);
  assert.equal((await anonymousRead.json()).error,"SESSION_EXPIRED");

  const anonymousPurchase = await worker.fetch(request("/api/shop/purchase",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({shop:"player",itemId:"boots-standard",purchaseId:"p27-test-purchase"})
  }),{P27_DB:db});
  assert.equal(anonymousPurchase.status,401);
  assert.equal((await anonymousPurchase.json()).error,"SESSION_EXPIRED");
});

test("player shop routes require configured D1 storage and an authenticated account", async () => {
  const missingDb = await worker.fetch(request("/api/shop/player/catalog"), {});
  assert.equal(missingDb.status, 503);
  assert.equal((await missingDb.json()).error, "D1_BINDING_MISSING");

  const db = { prepare() { return { bind() { return this; }, first: async () => null }; }, batch: async () => [] };
  const anonymous = await worker.fetch(request("/api/shop/player/inventory"), { P27_DB: db });
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).error, "SESSION_EXPIRED");
});

test("player shop write routes require an authenticated account before processing commands", async () => {
  const response = await worker.fetch(request("/api/shop/player/purchase", {
    method: "POST",
    headers: { origin: "https://attacker.example", "content-type": "application/json" },
    body: JSON.stringify({ itemId: "boots-standard", purchaseId: "purchase-1" }),
  }), { P27_DB: { prepare() { return { bind() { return this; }, first: async () => null }; }, batch: async () => [] } });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "SESSION_EXPIRED");
});
