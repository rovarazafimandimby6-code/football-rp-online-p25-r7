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
