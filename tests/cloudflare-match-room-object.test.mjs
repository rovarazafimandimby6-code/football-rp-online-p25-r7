import test from "node:test";
import assert from "node:assert/strict";
import { P27MatchRoomDurableObject } from "../src/cloudflare/match-room-object.js";

function makeState(storage = new Map(), name = "a1b2c3d4e5f6") {
  const api = {
    async get(key) { return storage.get(key); },
    async put(key, value) { storage.set(key, structuredClone(value)); },
    async delete(key) { return storage.delete(key); },
    async setAlarm(value) { api.alarmAt = value; },
  };
  return {
    id: { name },
    storage: api,
    blockConcurrencyWhile(callback) { return callback(); },
    backing: storage,
  };
}

function request(path, method = "GET", body = null) {
  return new Request(`https://match-object.test${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

function stopTimer(object) {
  if (object.timer) clearTimeout(object.timer);
  object.timer = null;
}

test("Durable Object creates a room under its deterministic 12-hex name", async () => {
  const state = makeState();
  const object = new P27MatchRoomDurableObject(state, {});
  const response = await object.fetch(request("/internal/create", "POST", {
    roomId: "a1b2c3d4e5f6", name: "Test match", durationMinutes: 3,
  }));
  assert.equal(response.status, 201);
  const room = await response.json();
  assert.equal(room.id, "a1b2c3d4e5f6");
  assert.equal(room.phase, "lobby");
  assert.ok(state.backing.has("room-checkpoint"));
  stopTimer(object);
});

test("Durable Object joins a human, starts 5v5 coverage, and persists a secret-free checkpoint", async () => {
  const state = makeState();
  const object = new P27MatchRoomDurableObject(state, {});
  await object.fetch(request("/internal/create", "POST", { roomId: "a1b2c3d4e5f6" }));
  const response = await object.fetch(request("/internal/join", "POST", {
    displayName: "Joueur test", preferredTeam: "blue",
  }));
  assert.equal(response.status, 200);
  const joined = await response.json();
  assert.equal(typeof joined.token, "string");
  assert.ok(joined.token.length >= 16);
  assert.equal(joined.state.phase, "playing");
  const checkpoint = state.backing.get("room-checkpoint");
  const savedHuman = checkpoint.players.find(player => player.id === joined.playerId);
  assert.ok(savedHuman.tokenHash);
  assert.equal(Object.hasOwn(savedHuman, "token"), false);
  assert.equal(JSON.stringify(checkpoint).includes(joined.token), false);
  stopTimer(object);
});

test("Durable Object authenticates sequenced input and does not expose player tokens in state", async () => {
  const state = makeState();
  const object = new P27MatchRoomDurableObject(state, {});
  await object.fetch(request("/internal/create", "POST", { roomId: "a1b2c3d4e5f6" }));
  const joined = await (await object.fetch(request("/internal/join", "POST", {}))).json();
  const input = await object.fetch(request("/internal/input", "POST", {
    token: joined.token, input: { sequence: 0, x: 0.2, z: 0.1, sprint: false },
  }));
  assert.equal(input.status, 200);
  assert.equal((await input.json()).accepted, true);
  const stateResponse = await object.fetch(request("/internal/state"));
  const publicState = await stateResponse.json();
  assert.equal(JSON.stringify(publicState).includes(joined.token), false);
  stopTimer(object);
});

test("Durable Object restores its checkpoint and requires reconnect before human control resumes", async () => {
  const storage = new Map();
  const firstState = makeState(storage);
  const first = new P27MatchRoomDurableObject(firstState, {});
  await first.fetch(request("/internal/create", "POST", { roomId: "a1b2c3d4e5f6" }));
  const joined = await (await first.fetch(request("/internal/join", "POST", {}))).json();
  stopTimer(first);

  const secondState = makeState(storage);
  const second = new P27MatchRoomDurableObject(secondState, {});
  await second.ready;
  stopTimer(second);
  const room = second.manager.rooms.get("a1b2c3d4e5f6");
  const player = room.players.get(joined.playerId);
  assert.equal(room.phase, "playing");
  assert.equal(player.connected, false);
  assert.equal(player.aiControlled, true);

  const reconnect = await second.fetch(request("/internal/reconnect", "POST", { token: joined.token }));
  assert.equal(reconnect.status, 200);
  assert.equal((await reconnect.json()).reconnected, true);
  stopTimer(second);
});


test("Durable Object WebSocket authenticates once and accepts sequenced player input", async () => {
  const state = makeState();
  const object = new P27MatchRoomDurableObject(state, {});
  await object.fetch(request("/internal/create", "POST", { roomId: "a1b2c3d4e5f6" }));
  const joined = await (await object.fetch(request("/internal/join", "POST", {}))).json();
  const sent = [];
  const socket = {
    attachment: null,
    serializeAttachment(value) { this.attachment = structuredClone(value); },
    deserializeAttachment() { return this.attachment ? structuredClone(this.attachment) : null; },
    send(value) { sent.push(JSON.parse(value)); },
    close(code, reason) { this.closed = { code, reason }; },
  };
  await object.webSocketMessage(socket, JSON.stringify({
    v: 1, type: "hello", roomId: "a1b2c3d4e5f6", token: joined.token,
    afterSequence: -1, afterEventId: 0,
  }));
  assert.equal(sent[0].type, "welcome");
  assert.equal(sent[0].playerId, joined.playerId);
  assert.equal(sent[1].type, "snapshot");
  assert.equal(JSON.stringify(sent).includes(joined.token), false);
  const before = object.manager.rooms.get("a1b2c3d4e5f6").players.get(joined.playerId).lastInputSequence;
  await object.webSocketMessage(socket, JSON.stringify({
    v: 1, type: "input", sequence: before + 1, x: 0.1, z: 0.2,
    sprint: false, action: null,
  }));
  assert.equal(sent.at(-1).type, "ack");
  assert.equal(sent.at(-1).sequence, before + 1);
  stopTimer(object);
});

test("Durable Object WebSocket rejects a reused input sequence", async () => {
  const state = makeState();
  const object = new P27MatchRoomDurableObject(state, {});
  await object.fetch(request("/internal/create", "POST", { roomId: "a1b2c3d4e5f6" }));
  const joined = await (await object.fetch(request("/internal/join", "POST", {}))).json();
  const sent = [];
  const socket = {
    attachment: null,
    serializeAttachment(value) { this.attachment = structuredClone(value); },
    deserializeAttachment() { return this.attachment ? structuredClone(this.attachment) : null; },
    send(value) { sent.push(JSON.parse(value)); },
    close(code, reason) { this.closed = { code, reason }; },
  };
  await object.webSocketMessage(socket, JSON.stringify({
    v: 1, type: "hello", roomId: "a1b2c3d4e5f6", token: joined.token,
    afterSequence: -1, afterEventId: 0,
  }));
  const input = { v: 1, type: "input", sequence: 0, x: 0, z: 0, sprint: false, action: null };
  await object.webSocketMessage(socket, JSON.stringify(input));
  await object.webSocketMessage(socket, JSON.stringify(input));
  assert.equal(sent.at(-1).type, "error");
  assert.equal(sent.at(-1).code, "STALE_INPUT");
  assert.equal(sent.at(-1).fatal, true);
  assert.equal(socket.closed.code, 1008);
  stopTimer(object);
});


test("finalized account match writes idempotent career and progression outbox events", async () => {
  const state = makeState();
  const object = new P27MatchRoomDurableObject(state, {});
  await object.fetch(request("/internal/create", "POST", { roomId: "a1b2c3d4e5f6" }));
  const accountId = "123e4567-e89b-42d3-a456-426614174000";
  const joined = await (await object.fetch(request("/internal/join", "POST", {
    accountId, careerPlayerId: "FRP-123456", displayName: "Carrière test",
  }))).json();
  const careerWrites = [];
  const progressionWrites = [];
  const resultWrites = [];
  object.careerRepository = {
    async recordFinalizedMatch(account, player, match) { careerWrites.push({ account, player, match }); },
  };
  object.progressionRepository = {
    async grantMatchReward(account, reward) { progressionWrites.push({ account, reward }); },
  };
  object.repository = {
    async recordFinalizedResult(roomId, result) { resultWrites.push({ roomId, result }); },
  };
  const result = {
    roomId: "a1b2c3d4e5f6", phase: "fulltime", finalizedAt: 1_700_000_000_000,
    score: { blue: 2, red: 0 }, outcome: "blue",
    awards: { playerOfMatch: { playerId: joined.playerId } },
    players: [{
      playerId: joined.playerId, team: "blue", role: "FWD", name: "Carrière test",
      rating: 8.2, minutesPlayedMs: 120_000,
      stats: { goals: 1, assists: 0, shots: 2, passes: 4, completedPasses: 3, tackles: 0 },
    }],
  };
  object.stores.results.save(result);
  await object._syncFinalizedResult();
  await object._syncFinalizedResult();
  assert.equal(careerWrites.length, 1);
  assert.equal(progressionWrites.length, 1);
  assert.equal(resultWrites.length, 2);
  assert.equal(careerWrites[0].account, accountId);
  assert.equal(careerWrites[0].player, "FRP-123456");
  assert.equal(careerWrites[0].match.result, "win");
  assert.equal(careerWrites[0].match.playerOfMatch, true);
  assert.equal(progressionWrites[0].reward.matchId, result.roomId);
  assert.equal(state.backing.get("career-outbox-complete"), true);
  assert.equal(state.backing.get("finalized-result-synced"), true);
  stopTimer(object);
});


test("WebSocket delta batches preserve event order without advancing past undelivered events", async () => {
  const state = makeState();
  const object = new P27MatchRoomDurableObject(state, {});
  await object.fetch(request("/internal/create", "POST", { roomId: "a1b2c3d4e5f6" }));
  const joined = await (await object.fetch(request("/internal/join", "POST", {}))).json();
  const sent = [];
  const socket = {
    attachment: null,
    serializeAttachment(value) { this.attachment = structuredClone(value); },
    deserializeAttachment() { return this.attachment ? structuredClone(this.attachment) : null; },
    send(value) { sent.push(JSON.parse(value)); },
    close(code, reason) { this.closed = { code, reason }; },
  };
  await object.webSocketMessage(socket, JSON.stringify({
    v: 1, type: "hello", roomId: "a1b2c3d4e5f6", token: joined.token,
    afterSequence: -1, afterEventId: 0,
  }));
  const events = Array.from({ length: 25 }, (_, index) => ({ id: index + 1, type: "test" }));
  object.manager.get = () => ({
    sequence: 99, eventCursor: 25, events, phase: "playing", players: [],
  });
  state.getWebSockets = () => [socket];

  await object._broadcastSockets();
  let delta = sent.at(-1);
  assert.equal(delta.type, "delta");
  assert.deepEqual(delta.events.map(event => event.id), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.equal(delta.eventCursor, 20);
  assert.equal(socket.attachment.lastEventId, 20);

  await object._broadcastSockets();
  delta = sent.at(-1);
  assert.deepEqual(delta.events.map(event => event.id), [21, 22, 23, 24, 25]);
  assert.equal(delta.eventCursor, 25);
  assert.equal(socket.attachment.lastEventId, 25);
  stopTimer(object);
});


test("WebSocket size limiting preserves event order and advances only through transmitted events", async () => {
  const state = makeState();
  const object = new P27MatchRoomDurableObject(state, {});
  object._scheduleTick = () => {};
  try {
  await object.fetch(request("/internal/create", "POST", { roomId: "a1b2c3d4e5f6" }));
  const joined = await (await object.fetch(request("/internal/join", "POST", {}))).json();
  const sent = [];
  const socket = {
    attachment: null,
    serializeAttachment(value) { this.attachment = structuredClone(value); },
    deserializeAttachment() { return this.attachment ? structuredClone(this.attachment) : null; },
    send(value) { sent.push(JSON.parse(value)); },
    close(code, reason) { this.closed = { code, reason }; },
  };
  await object.webSocketMessage(socket, JSON.stringify({
    v: 1, type: "hello", roomId: "a1b2c3d4e5f6", token: joined.token,
    afterSequence: -1, afterEventId: 0,
  }));
  stopTimer(object);
  object.manager.get = () => ({
    sequence: 101, eventCursor: 20, phase: "playing", players: [],
    events: Array.from({ length: 20 }, (_, index) => ({ id: index + 1, type: "test", detail: "x".repeat(100) })),
    padding: "x".repeat(15000),
  });
  state.getWebSockets = () => [socket];
  await object._broadcastSockets();
  const delta = sent.at(-1);
  assert.equal(delta.type, "delta");
  assert.ok(delta.events.length > 0 && delta.events.length < 20);
  assert.deepEqual(delta.events.map(event => event.id),
    Array.from({ length: delta.events.length }, (_, index) => index + 1));
  assert.equal(delta.eventCursor, delta.events.at(-1).id);
  assert.equal(socket.attachment.lastEventId, delta.events.at(-1).id);
  } finally {
    stopTimer(object);
  }
});


test("finalized match outbox retries a reward failure without losing career or duplicating reward", async () => {
  const state = makeState();
  const object = new P27MatchRoomDurableObject(state, {});
  await object.fetch(request("/internal/create", "POST", { roomId: "a1b2c3d4e5f6" }));
  const accountId = "123e4567-e89b-42d3-a456-426614174000";
  const joined = await (await object.fetch(request("/internal/join", "POST", {
    accountId, careerPlayerId: "FRP-123456", displayName: "Reprise outbox",
  }))).json();
  const result = {
    roomId: "a1b2c3d4e5f6", phase: "fulltime", finalizedAt: 1_700_000_000_000,
    score: { blue: 1, red: 0 }, outcome: "blue", awards: {},
    players: [{
      playerId: joined.playerId, team: "blue", role: "MID", name: "Reprise outbox",
      rating: 7.4, minutesPlayedMs: 90_000,
      stats: { goals: 0, assists: 0, shots: 1, passes: 10, completedPasses: 8, tackles: 1 },
    }],
  };
  object.stores.results.save(result);
  const careerMatches = new Map();
  const rewardLedger = new Map();
  let rewardAttempts = 0;
  object.careerRepository = {
    async recordFinalizedMatch(account, player, match) {
      careerMatches.set(account + ":" + match.matchId, { player, match });
      return { duplicate: careerMatches.size > 1 };
    },
  };
  object.progressionRepository = {
    async grantMatchReward(account, reward) {
      rewardAttempts++;
      if (rewardAttempts === 1) throw new Error("TEMPORARY_D1_FAILURE");
      const key = account + ":" + reward.matchId;
      if (!rewardLedger.has(key)) rewardLedger.set(key, reward);
      return { duplicate: rewardLedger.size > 1 };
    },
  };
  object.repository = { async recordFinalizedResult() {} };

  await assert.rejects(object._syncFinalizedResult(), /TEMPORARY_D1_FAILURE/);
  assert.equal(careerMatches.size, 1);
  assert.equal(rewardLedger.size, 0);
  assert.equal(state.backing.get("career-outbox-complete"), undefined);
  assert.ok(state.backing.has("career-outbox"));

  await object._syncFinalizedResult();
  assert.equal(careerMatches.size, 1);
  assert.equal(rewardAttempts, 2);
  assert.equal(rewardLedger.size, 1);
  assert.equal(state.backing.get("career-outbox-complete"), true);
  assert.equal(state.backing.get("finalized-result-synced"), true);
  assert.equal(state.backing.has("career-outbox"), false);
  stopTimer(object);
});
