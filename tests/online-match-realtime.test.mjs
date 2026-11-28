import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineMatchClient } from '../src/online-client.js';
import { OnlineMatchBridge } from '../src/online-match-bridge.js';

class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = new Map();
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }
  addEventListener(type, callback) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(callback);
    this.listeners.set(type, listeners);
  }
  emit(type, event = {}) {
    if (type === 'open') this.readyState = 1;
    if (type === 'close') this.readyState = 3;
    for (const callback of this.listeners.get(type) || []) callback(event);
  }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  close() { this.emit('close'); }
}
FakeWebSocket.instances = [];

function createClient(fetchImpl = async () => {
  throw new Error('HTTP_SHOULD_NOT_BE_USED');
}) {
  const client = new OnlineMatchClient({
    baseUrl: 'https://match.example.test',
    fetchImpl,
    storage: null,
  });
  client.roomId = 'a1b2c3d4e5f6';
  client.token = 'test-player-token-123456';
  client.playerId = 'player-1';
  return client;
}

test('online match client switches input, heartbeat and state updates to authenticated WebSocket', async () => {
  FakeWebSocket.instances.length = 0;
  const client = createClient();
  const received = [];
  assert.equal(client.connectRealtime({
    enabled: true,
    WebSocketImpl: FakeWebSocket,
    onMessage: value => received.push(value),
  }), true);
  const socket = FakeWebSocket.instances[0];
  assert.equal(socket.url, 'wss://match.example.test/api/rooms/a1b2c3d4e5f6/socket');
  socket.emit('open');
  assert.equal(socket.sent[0].type, 'hello');
  assert.equal(socket.sent[0].token, client.token);

  socket.emit('message', { data: JSON.stringify({
    v: 1, type: 'welcome', playerId: 'player-1', nextSequence: 4,
  }) });
  assert.equal(client.realtimeConnected, true);
  assert.equal(client.sequence, 3);

  const input = await client.sendInput({ x: 0.4, z: -0.2, sprint: true, action: 'pass' });
  assert.equal(input.transport, 'websocket');
  assert.equal(socket.sent.at(-1).type, 'input');
  assert.equal(socket.sent.at(-1).sequence, 4);
  assert.equal(socket.sent.at(-1).action, 'pass');

  const heartbeat = await client.heartbeat();
  assert.equal(heartbeat.transport, 'websocket');
  assert.equal(socket.sent.at(-1).type, 'heartbeat');

  const delta = await client.pollState({ afterSequence: 4, afterEventId: 2 });
  assert.equal(delta.transport, 'websocket');
  assert.equal(delta.state, null);

  socket.emit('message', { data: JSON.stringify({
    v: 1, type: 'delta', eventCursor: 3, events: [],
    state: { sequence: 5, players: [], ball: null },
  }) });
  assert.equal(received.length, 1);
  assert.equal(received[0].state.sequence, 5);
  client.disconnectRealtime();
});

test('online match client falls back to HTTP when WebSocket is disconnected', async () => {
  FakeWebSocket.instances.length = 0;
  const calls = [];
  const client = createClient(async (url, options) => {
    calls.push({ url, options });
    return { status: 200, ok: true, async json() { return { accepted: true }; } };
  });
  client.connectRealtime({ enabled: true, WebSocketImpl: FakeWebSocket });
  const socket = FakeWebSocket.instances[0];
  socket.emit('open');
  socket.emit('message', { data: JSON.stringify({
    v: 1, type: 'welcome', playerId: 'player-1', nextSequence: 1,
  }) });
  socket.emit('close');

  const result = await client.sendInput({ x: 0, z: 0, sprint: false });
  assert.equal(result.accepted, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/rooms\/a1b2c3d4e5f6\/input$/);
  client.disconnectRealtime();
});

test('online match bridge starts realtime on join and stops HTTP polling after WebSocket welcome', async () => {
  FakeWebSocket.instances.length = 0;
  let httpCalls = 0;
  const client = createClient(async () => {
    httpCalls += 1;
    throw new Error('HTTP_POLL_SHOULD_BE_PAUSED');
  });
  const ball = {
    pos: { set() {} },
    vel: { set() {} },
  };
  const bridge = new OnlineMatchBridge({
    client, players: [], ball, realtime: true, WebSocketImpl: FakeWebSocket,
    now: () => 10_000,
  });
  bridge.bindJoin({ playerId: 'player-1' });
  const socket = FakeWebSocket.instances[0];
  assert.ok(socket, 'join should start the WebSocket transport');
  socket.emit('open');
  socket.emit('message', { data: JSON.stringify({
    v: 1, type: 'welcome', playerId: 'player-1', nextSequence: 1,
  }) });
  socket.emit('message', { data: JSON.stringify({
    v: 1, type: 'snapshot', state: { sequence: 0, players: [], ball: null },
  }) });
  assert.equal(bridge.lastState.sequence, 0);
  assert.equal(await bridge.poll(10_100), false);
  assert.equal(httpCalls, 0);
  bridge.dispose();
});
