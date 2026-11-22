import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../server/room-manager.js';
import { OnlineMatchClient } from '../src/online-client.js';

function fillTeams(manager, roomId) {
  const joined = [];
  for (let i = 0; i < 6; i++) joined.push(manager.join(roomId, { displayName: `Joueur ${i + 1}` }));
  return joined;
}

test('P24 : les bots complètent les deux équipes et permettent de lancer le match dès le premier humain', () => {
  const manager = new RoomManager();
  const room = manager.create();
  const first = manager.join(room.id, { displayName: 'Humain 1' });
  assert.equal(first.state.phase, 'playing');
  assert.deepEqual(first.state.counts, { blue: 3, red: 3 });
  assert.equal(first.state.players.filter(p => p.isBot).length, 5);
  assert.equal(first.state.players.filter(p => !p.isBot).length, 1);
});

test('serveur multijoueur : chaque jeton ne contrôle que son propre joueur', () => {
  const manager = new RoomManager();
  const room = manager.create();
  const players = fillTeams(manager, room.id);
  const own = players[0];
  assert.equal(manager.submitInput(room.id, own.token, { x: 1, z: 0, sprint: true, sequence: 1 }).accepted, true);
  assert.throws(() => manager.submitInput(room.id, 'invalid-token', { x: 0, z: 1, sequence: 1 }), /UNAUTHORIZED/);
  assert.equal(manager.get(room.id).players.find(p => p.id === own.playerId).id, own.playerId);
  assert.equal(manager.get(room.id).players.some(p => 'token' in p), false);
});

test('serveur multijoueur : rejette les entrées anciennes et non numériques', () => {
  const manager = new RoomManager();
  const room = manager.create();
  const players = fillTeams(manager, room.id);
  const token = players[0].token;
  manager.submitInput(room.id, token, { x: 0.5, z: 0, sequence: 2 });
  assert.throws(() => manager.submitInput(room.id, token, { x: 0, z: 1, sequence: 2 }), /STALE_INPUT/);
  assert.throws(() => manager.submitInput(room.id, token, { x: 'NaN', z: 0, sequence: 3 }), /INVALID_INPUT/);
});

test('serveur multijoueur : limite les équipes à cinq joueurs', () => {
  const manager = new RoomManager();
  const room = manager.create();
  for (let i = 0; i < 10; i++) manager.join(room.id);
  assert.equal(manager.get(room.id).players.length, 10);
  assert.throws(() => manager.join(room.id), /ROOM_FULL/);
});

test('serveur multijoueur : durée réglementaire plafonnée à trois minutes si demandée', () => {
  let now = 1_000;
  const manager = new RoomManager({ now: () => now });
  const room = manager.create({ durationMinutes: 3 });
  const players = fillTeams(manager, room.id);
  now += 180_000;
  for (const player of players) manager.heartbeat(room.id, player.token);
  manager.tick(0.05);
  const state = manager.get(room.id);
  assert.equal(state.phase, 'fulltime');
  assert.equal(state.elapsedMs, 180_000);
});

test('client en ligne : conserve le jeton et numérote les commandes', async () => {
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options });
    const payload = url.endsWith('/join') ? { token: 'secret', playerId: 'p1' } : { accepted: true };
    return { ok: true, json: async () => payload };
  };
  const client = new OnlineMatchClient({ baseUrl: 'https://game.example', fetchImpl: fakeFetch });
  await client.joinRoom('aabbccddeeff');
  await client.sendInput({ x: 0.5, z: -0.5 });
  assert.equal(calls[1].options.headers.authorization, 'Bearer secret');
  assert.equal(JSON.parse(calls[1].options.body).sequence, 1);
});

test('API HTTP : health check et création de salon répondent sans dépendance externe', async () => {
  const { server } = await import('../server/index.js');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Football RP Online/);
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
    const created = await fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Test local', durationMinutes: 3 }) });
    assert.equal(created.status, 201);
    const payload = await created.json();
    assert.equal(payload.durationMinutes, 3);
    assert.equal(payload.phase, 'lobby');
    const unchanged = await fetch(`${base}/api/rooms/${payload.id}?sinceSequence=0&afterEventId=0`);
    assert.equal(unchanged.status, 204);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});


test('P24 : les arrivées humaines remplacent les bots sans dépasser cinq joueurs par équipe', () => {
  const manager = new RoomManager();
  const room = manager.create();
  const first = manager.join(room.id, { displayName: 'Humain 1' });
  for (let i = 2; i <= 8; i++) manager.join(room.id, { displayName: `Humain ${i}` });
  const state = manager.get(room.id);
  assert.equal(state.players.filter(p => !p.isBot).length, 8);
  assert.ok(state.counts.blue <= 5 && state.counts.red <= 5);
  assert.equal(state.players.filter(p => p.isBot).length, 0);
  assert.ok(first.token);
});

test('P24 : les bots reçoivent des commandes serveur et déplacent leurs avatars', () => {
  let now = 1000;
  const manager = new RoomManager({ now: () => now });
  const room = manager.create();
  const joined = manager.join(room.id);
  const before = joined.state.players.filter(p => p.isBot).map(p => ({ id: p.id, x: p.x, z: p.z }));
  for (let i = 0; i < 12; i++) { now += 50; manager.tick(0.05); }
  const after = manager.get(room.id).players;
  assert.ok(before.some(p => { const q = after.find(v => v.id === p.id); return q && (q.x !== p.x || q.z !== p.z); }));
});

test('P24 : le delta réseau transmet uniquement les nouveaux événements et détecte un snapshot inchangé', () => {
  const manager = new RoomManager();
  const room = manager.create();
  manager.join(room.id);
  const initial = manager.getDelta(room.id, { afterSequence: -1, afterEventId: 0 });
  assert.equal(initial.changed, true);
  const unchanged = manager.getDelta(room.id, { afterSequence: initial.state.sequence, afterEventId: initial.eventCursor });
  assert.equal(unchanged.changed, false);
  assert.deepEqual(unchanged.events, []);
});


test('P24 : restauration de session réutilise le jeton et le joueur sans nouvel enregistrement', async () => {
  const values = new Map();
  const storage = { setItem: (k,v) => values.set(k,v), getItem: k => values.get(k) ?? null, removeItem: k => values.delete(k) };
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ token: 'session-token', playerId: 'player-42' }) });
  const first = new OnlineMatchClient({ baseUrl: 'https://example.test', fetchImpl, storage });
  await first.joinRoom('aabbccddeeff');
  const resumed = new OnlineMatchClient({ baseUrl: 'https://example.test', fetchImpl, storage });
  assert.equal(resumed.restoreSession(), true);
  assert.equal(resumed.roomId, 'aabbccddeeff');
  assert.equal(resumed.token, 'session-token');
  assert.equal(resumed.playerId, 'player-42');
});
