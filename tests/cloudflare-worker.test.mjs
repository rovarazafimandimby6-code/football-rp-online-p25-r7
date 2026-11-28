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
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "ORIGIN_NOT_ALLOWED");
});

test("Cloudflare API allows the Capacitor Android origin with credentialed CORS", async () => {
  const response = await worker.fetch(request("/health", { headers: { origin: "capacitor://localhost" } }), {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "capacitor://localhost");
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
});

test("Cloudflare API answers Android CORS preflight without reaching D1", async () => {
  const response = await worker.fetch(request("/api/player-identities/reserve", {
    method: "OPTIONS",
    headers: {
      origin: "https://localhost",
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,content-type",
    },
  }), {});
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://localhost");
  assert.match(response.headers.get("access-control-allow-methods") || "", /POST/);
  assert.match(response.headers.get("access-control-allow-headers") || "", /Authorization/);
});

test("Cloudflare API rejects unconfigured browser origins", async () => {
  const response = await worker.fetch(request("/health", { headers: { origin: "https://attacker.example" } }), {});
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "ORIGIN_NOT_ALLOWED");
});

test("match room gateway never trusts client-supplied account or career identity", async () => {
  const forwarded = [];
  const stub = {
    async fetch(input, init = {}) {
      const url = typeof input === "string" ? input : input.url;
      const body = init.body ? JSON.parse(init.body) : null;
      forwarded.push({ url, method: init.method || "GET", body });
      return new Response(JSON.stringify({ ok: true, url, body }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    },
  };
  const env = {
    P27_DB: { prepare() { return { bind() { return this; }, first: async () => null }; }, batch: async () => [] },
    P27_MATCH_ROOMS: {
      idFromName(name) { return name; },
      get(name) { assert.match(name, /^[a-f0-9]{12}$/); return stub; },
    },
  };
  const response = await worker.fetch(request("/api/rooms/a1b2c3d4e5f6/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Joueur test",
      accountId: "attacker-controlled-account",
      careerPlayerId: "FRP-999999",
    }),
  }), env);
  assert.equal(response.status, 200);
  const call = forwarded.at(-1);
  assert.equal(call.url, "https://match-room.internal/internal/join");
  assert.equal(call.body.accountId, null);
  assert.equal(call.body.careerPlayerId, null);
  assert.equal(call.body.displayName, "Joueur test");
});

test("match room gateway creates a server-generated room ID and ignores client identity fields", async () => {
  const forwarded = [];
  const stub = {
    async fetch(input, init = {}) {
      const body = init.body ? JSON.parse(init.body) : null;
      forwarded.push({ url: typeof input === "string" ? input : input.url, body });
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    },
  };
  const env = {
    P27_DB: { prepare() { return { bind() { return this; }, first: async () => null }; }, batch: async () => [] },
    P27_MATCH_ROOMS: {
      idFromName(name) { return name; },
      get(name) { assert.match(name, /^[a-f0-9]{12}$/); return stub; },
    },
  };
  const response = await worker.fetch(request("/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Match amical",
      accountId: "forged-account",
      careerPlayerId: "FRP-000000",
    }),
  }), env);
  assert.equal(response.status, 201);
  assert.equal(forwarded.length, 1);
  assert.equal(forwarded[0].url, "https://match-room.internal/internal/create");
  assert.match(forwarded[0].body.roomId, /^[a-f0-9]{12}$/);
  assert.equal(forwarded[0].body.name, "Match amical");
});

test("match room gateway rejects expired authenticated sessions before joining", async () => {
  let objectRequested = false;
  const env = {
    P27_DB: { prepare() { return { bind() { return this; }, first: async () => null }; }, batch: async () => [] },
    P27_MATCH_ROOMS: {
      idFromName(name) { return name; },
      get() { objectRequested = true; throw new Error("SHOULD_NOT_REACH_MATCH_ROOM"); },
    },
  };
  const response = await worker.fetch(request("/api/rooms/a1b2c3d4e5f6/join", {
    method: "POST",
    headers: {
      authorization: "Bearer " + "x".repeat(48),
      "content-type": "application/json",
    },
    body: JSON.stringify({ displayName: "Joueur" }),
  }), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "SESSION_EXPIRED");
  assert.equal(objectRequested, false);
});

test("match room routes fail closed when the D1 binding is missing", async () => {
  const response = await worker.fetch(request("/api/rooms"), {
    P27_MATCH_ROOMS: {
      idFromName(name) { return name; },
      get() { throw new Error("SHOULD_NOT_REACH_MATCH_ROOM"); },
    },
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "D1_BINDING_MISSING");
});

test("default Cloudflare entrypoint rejects untrusted origins before match room mutations", async () => {
  let objectRequested = false;
  const response = await (await import("../src/cloudflare/worker.js")).default.fetch(
    request("/api/rooms", {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Match hostile" }),
    }),
    {
      P27_DB: { prepare() { return { bind() { return this; }, first: async () => null }; }, batch: async () => [] },
      P27_MATCH_ROOMS: {
        idFromName(name) { return name; },
        get() { objectRequested = true; throw new Error("SHOULD_NOT_REACH_MATCH_ROOM"); },
      },
    },
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "ORIGIN_NOT_ALLOWED");
  assert.equal(objectRequested, false);
});


test("account recovery snapshot route is read-only and requires a D1-backed session", async () => {
  const wrongMethod = await worker.fetch(request("/api/account/snapshot", { method: "POST" }), {});
  assert.equal(wrongMethod.status, 405);
  assert.equal((await wrongMethod.json()).error, "METHOD_NOT_ALLOWED");

  const missingDb = await worker.fetch(request("/api/account/snapshot"), {});
  assert.equal(missingDb.status, 503);
  assert.equal((await missingDb.json()).error, "D1_BINDING_MISSING");

  const db = {
    prepare() { return { bind() { return this; }, first: async () => null }; },
    batch: async () => [],
  };
  const anonymous = await worker.fetch(request("/api/account/snapshot"), { P27_DB: db });
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).error, "SESSION_EXPIRED");
});
