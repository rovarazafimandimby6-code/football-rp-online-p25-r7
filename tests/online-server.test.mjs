import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../server/room-manager.js';
import { OnlineMatchClient } from '../src/online-client.js';

function fillTeams(manager, roomId) {
  const joined = [];
  for (let i = 0; i < 6; i++) joined.push(manager.join(roomId, { displayName: `Joueur ${i + 1}` }));
  return joined;
}

test('P27 : les bots complètent un vrai 5 contre 5 et lancent le match dès le premier humain', () => {
  const manager = new RoomManager();
  const room = manager.create();
  const first = manager.join(room.id, { displayName: 'Humain 1' });
  assert.equal(first.state.phase, 'playing');
  assert.deepEqual(first.state.counts, { blue: 5, red: 5 });
  assert.equal(first.state.players.filter(p => p.isBot).length, 13);
  assert.equal(first.state.players.filter(p => p.team === 'blue' && p.isOnPitch !== false).length, 5);
  assert.equal(first.state.players.filter(p => p.team === 'red' && p.isOnPitch !== false).length, 5);
  assert.deepEqual(first.state.players.filter(p => p.team === 'blue' && p.isOnPitch !== false).map(p => p.role).sort(), ['DEF','FWD','FWD','GK','MID'].sort());
  assert.deepEqual(first.state.benchCounts, { blue: 2, red: 2 });
  assert.equal(first.state.players.filter(p => !p.isBot).length, 1);
});


test('P25 R12 : la liste des salons expose uniquement les métadonnées publiques et les comptes humains', () => {
  let now = 10_000;
  const manager = new RoomManager({ now: () => now, roomTtlMs: 5_000 });
  const room = manager.create({ name: 'Salon public' });
  manager.join(room.id, { displayName: 'Joueur A' });
  const listed = manager.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, room.id);
  assert.equal(listed[0].totalHumans, 1);
  assert.equal(listed[0].maxHumans, 10);
  assert.equal('token' in listed[0], false);
  now += 6_000;
  assert.equal(manager.list().length, 0);
});

test('P25 R12 : le client HTTP récupère la liste publique des salons', async () => {
  const client = new OnlineMatchClient({ baseUrl: 'https://game.example', fetchImpl: async url => ({ ok: true, json: async () => ({ rooms: [{ id: 'aabbccddeeff' }] }) }) });
  assert.deepEqual(await client.listRooms(), [{ id: 'aabbccddeeff' }]);
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

test('P27 : le temps de jeu individuel s’accumule uniquement pendant les phases jouées et figure au résultat', () => {
  let now = 10_000;
  const manager = new RoomManager({ now: () => now, disconnectGraceMs: 300_000 });
  const room = manager.create({ durationMinutes: 3 });
  const joined = manager.join(room.id, { displayName: 'Temps de jeu' });
  for (let i = 0; i < 4; i++) { now += 250; manager.tick(0.05); }
  const state = manager.get(room.id);
  const player = state.players.find(candidate => candidate.id === joined.playerId);
  assert.equal(player.matchTimePlayedMs, 1_000);
  assert.equal(player.isOnPitch, true);
  const internal = manager.rooms.get(room.id);
  const resultPlayers = manager.finalizeResult({ ...internal, phase: 'fulltime', result: null, score: { blue: 0, red: 0 } }).players;
  assert.equal(resultPlayers.find(candidate => candidate.playerId === joined.playerId).minutesPlayedMs, 1_000);
});

test('P27 : le 5 contre 5 conserve cinq avatars actifs par équipe après une déconnexion', () => {
  let now = 20_000;
  const manager = new RoomManager({ now: () => now, disconnectGraceMs: 100 });
  const room = manager.create();
  const joined = manager.join(room.id);
  now += 150;
  manager.tick(0.05);
  const state = manager.get(room.id);
  assert.deepEqual(state.counts, { blue: 5, red: 5 });
  const disconnected = state.players.find(player => player.id === joined.playerId);
  assert.equal(disconnected.aiControlled, true);
  assert.equal(disconnected.isOnPitch, true);
});

test('P27 rotations : les commandes des joueurs sur le banc sont bloquées', () => {
  const manager = new RoomManager();
  const room = manager.create();
  const joined = manager.join(room.id);
  const player = manager.rooms.get(room.id).players.get(joined.playerId);
  player.isOnPitch = false;
  assert.throws(() => manager.submitInput(room.id, joined.token, { x: 1, z: 0, sequence: 1 }), /PLAYER_ON_BENCH/);
});

test('P27 rotations : changement aux arrêts de jeu, sans quota, avec dix minutes avant retour', () => {
  const manager = new RoomManager({ now: () => 100_000, disconnectGraceMs: 300_000 });
  const room = manager.create();
  const joined = manager.join(room.id, { displayName: 'Capitaine' });
  const internal = manager.rooms.get(room.id);
  const outgoing = internal.players.get(joined.playerId);
  const incoming = [...internal.players.values()].find(p => p.team === outgoing.team && p.isOnPitch === false);
  assert.ok(incoming);
  assert.throws(() => manager.rotate(room.id, joined.token, { outgoingId: outgoing.id, incomingId: incoming.id }), /NOT_A_STOPPAGE/);
  internal.elapsedMs = 600_000;
  internal.goalPauseMs = 1_500;
  const first = manager.rotate(room.id, joined.token, { outgoingId: outgoing.id, incomingId: incoming.id });
  assert.equal(first.rotated, true);
  assert.equal(outgoing.isOnPitch, false);
  assert.equal(incoming.isOnPitch, true);
  assert.equal(first.state.counts.blue, 5);
  assert.equal(first.state.benchCounts.blue, 2);
  assert.throws(() => manager.rotate(room.id, joined.token, { outgoingId: incoming.id, incomingId: outgoing.id }), /RETURN_COOLDOWN/);
  internal.elapsedMs = 1_200_000;
  const second = manager.rotate(room.id, joined.token, { outgoingId: incoming.id, incomingId: outgoing.id });
  assert.equal(second.rotated, true);
  assert.equal(outgoing.isOnPitch, true);
  assert.equal(incoming.isOnPitch, false);
  assert.equal(second.state.counts.blue, 5);
  assert.equal(second.state.benchCounts.blue, 2);
});

test('P27 rotations : le jeton ne peut pas remplacer un joueur adverse', () => {
  const manager = new RoomManager();
  const room = manager.create();
  const joined = manager.join(room.id);
  const internal = manager.rooms.get(room.id);
  internal.goalPauseMs = 1_000;
  const outgoing = internal.players.get(joined.playerId);
  const rival = [...internal.players.values()].find(p => p.team !== outgoing.team && p.isOnPitch === false);
  assert.throws(() => manager.rotate(room.id, joined.token, { outgoingId: outgoing.id, incomingId: rival.id }), /INVALID_ROTATION_PAIR/);
});

test('client en ligne : envoie une rotation authentifiée au serveur', async () => {
  let call;
  const client = new OnlineMatchClient({ baseUrl: 'https://game.example', fetchImpl: async (url, options) => {
    call = { url, options };
    return { ok: true, json: async () => ({ rotated: true }) };
  } });
  client.roomId = 'aabbccddeeff'; client.token = 'session-token-123456';
  const result = await client.rotate({ outgoingId: 'out-1', incomingId: 'in-2' });
  assert.equal(result.rotated, true);
  assert.match(call.url, /\/rotation$/);
  assert.equal(call.options.headers.authorization, 'Bearer session-token-123456');
  assert.deepEqual(JSON.parse(call.options.body), { outgoingId: 'out-1', incomingId: 'in-2' });
});

test('serveur multijoueur : limite les équipes à cinq joueurs', () => {
  const manager = new RoomManager();
  const room = manager.create();
  for (let i = 0; i < 10; i++) manager.join(room.id);
  assert.equal(manager.get(room.id).players.length, 14);
  assert.throws(() => manager.join(room.id), /ROOM_FULL/);
});

test('serveur multijoueur : durée réglementaire plafonnée à trois minutes si demandée', () => {
  let now = 1_000;
  const manager = new RoomManager({ now: () => now, disconnectGraceMs: 300_000 });
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
    const listed = await fetch(`${base}/api/rooms`);
    assert.equal(listed.status, 200);
    assert.equal((await listed.json()).rooms[0].id, payload.id);
    const resultsPage = await fetch(`${base}/api/results?limit=5&offset=0`);
    assert.equal(resultsPage.status, 200);
    assert.deepEqual((await resultsPage.json()).pagination, { limit: 5, offset: 0, total: 0, hasMore: false, nextOffset: null });
    const invalidResultsPage = await fetch(`${base}/api/results?limit=-1`);
    assert.equal(invalidResultsPage.status, 400);
    assert.equal((await invalidResultsPage.json()).error, 'INVALID_PAGINATION');
    const joined = await fetch(`${base}/api/rooms/${payload.id}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: 'Joueur test' }) });
    assert.equal(joined.status, 200, await joined.clone().text());
    const player = await joined.json();
    const heartbeat = await fetch(`${base}/api/rooms/${payload.id}/heartbeat`, { method: 'POST', headers: { authorization: `Bearer ${player.token}` } });
    assert.equal(heartbeat.status, 200);
    assert.deepEqual(await heartbeat.json(), { alive: true, nextSequence: 1 });
    const reconnect = await fetch(`${base}/api/rooms/${payload.id}/reconnect`, { method: 'POST', headers: { authorization: `Bearer ${player.token}` } });
    assert.equal(reconnect.status, 200);
    const reconnectPayload = await reconnect.json();
    assert.equal(reconnectPayload.reconnected, true);
    assert.equal(reconnectPayload.nextSequence, 1);
    const initial = await fetch(`${base}/api/rooms/${payload.id}?sinceSequence=-1&afterEventId=0`);
    assert.equal(initial.status, 200);
    assert.equal((await initial.json()).state.id, payload.id);
    const unchanged = await fetch(`${base}/api/rooms/${payload.id}?sinceSequence=0&afterEventId=0`);
    assert.ok([200, 204].includes(unchanged.status));
    if (unchanged.status === 200) assert.equal((await unchanged.json()).state.id, payload.id);
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
  assert.deepEqual(state.counts, { blue: 5, red: 5 });
  assert.equal(state.players.filter(p => p.isBot).length, 6);
  assert.ok(first.token);
});

test('P24 : les bots reçoivent des commandes serveur et déplacent leurs avatars', () => {
  let now = 1000;
  const manager = new RoomManager({ now: () => now, disconnectGraceMs: 300_000 });
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

test('serveur multijoueur : un jeton absent ou nul ne peut jamais authentifier un bot', () => {
  const manager = new RoomManager();
  const room = manager.create();
  manager.join(room.id);
  assert.throws(() => manager.authenticate(room.id, null), /UNAUTHORIZED/);
  assert.throws(() => manager.authenticate(room.id, undefined), /UNAUTHORIZED/);
});

test('serveur multijoueur : un essai d’action invalide ne consomme pas le délai de récupération', () => {
  const manager = new RoomManager({ now: () => 10_000 });
  const room = manager.create();
  const joined = manager.join(room.id);
  const state = manager.get(room.id);
  const human = state.players.find(player => player.id === joined.playerId);
  const opponent = state.players.find(player => player.team !== human.team);
  const internalRoom = manager.rooms.get(room.id);
  const internalHuman = internalRoom.players.get(human.id);
  const internalOpponent = internalRoom.players.get(opponent.id);
  internalRoom.ball.ownerId = internalOpponent.id;
  internalOpponent.x = internalHuman.x + 8;
  assert.equal(manager.submitInput(room.id, joined.token, { x: 0, z: 0, sequence: 1, action: 'tackle' }).actionAccepted, false);
  internalOpponent.x = internalHuman.x + 1;
  internalOpponent.z = internalHuman.z;
  internalHuman.facing = Math.PI / 2;
  assert.equal(manager.submitInput(room.id, joined.token, { x: 0, z: 0, sequence: 2, action: 'tackle' }).actionAccepted, true);
});

test('serveur multijoueur : la séquence réseau doit être un entier numérique, pas une chaîne', () => {
  const manager = new RoomManager();
  const room = manager.create();
  const joined = manager.join(room.id);
  assert.throws(() => manager.submitInput(room.id, joined.token, { x: 0, z: 0, sequence: '1' }), /STALE_INPUT/);
});

test('client en ligne : la séquence de commande survit à une restauration de session', async () => {
  const values = new Map();
  const storage = { setItem: (k,v) => values.set(k,v), getItem: k => values.get(k) ?? null, removeItem: k => values.delete(k) };
  const fetchImpl = async (url) => ({ ok: true, status: 200, json: async () => url.endsWith('/join') ? { token: 'sequence-token-123456', playerId: 'player-seq' } : { accepted: true } });
  const first = new OnlineMatchClient({ baseUrl: 'https://game.example', fetchImpl, storage });
  await first.joinRoom('aabbccddeeff');
  await first.sendInput({ x: 1, z: 0 });
  await first.sendInput({ x: 0, z: 1 });
  const resumed = new OnlineMatchClient({ baseUrl: 'https://game.example', fetchImpl, storage });
  assert.equal(resumed.restoreSession(), true);
  assert.equal(resumed.sequence, 2);
  await resumed.sendInput({ x: -1, z: 0 });
  assert.equal(resumed.sequence, 3);
});

test('serveur multijoueur : un joueur qui a quitté doit se reconnecter avant de reprendre le contrôle', () => {
  let now = 5_000;
  const manager = new RoomManager({ now: () => now, disconnectGraceMs: 300_000 });
  const room = manager.create();
  const joined = manager.join(room.id);
  manager.leave(room.id, joined.token);
  assert.throws(() => manager.submitInput(room.id, joined.token, { x: 1, z: 0, sequence: 1 }), /PLAYER_DISCONNECTED/);
  now += 100;
  const heartbeat = manager.heartbeat(room.id, joined.token);
  assert.equal(heartbeat.alive, true);
  assert.equal(heartbeat.nextSequence, 1);
  assert.equal(manager.submitInput(room.id, joined.token, { x: 1, z: 0, sequence: 1 }).accepted, true);
});

import { stepRoomSimulation } from '../server/simulation.js';

test('P25 R10 : un but déclenche un arrêt de jeu sans déplacement pendant la célébration', () => {
  const manager = new RoomManager({ now: () => 20_000 });
  const room = manager.create();
  manager.join(room.id);
  const internal = manager.rooms.get(room.id);
  const player = [...internal.players.values()][0];
  const before = { x: player.x, z: player.z };
  internal.goalPauseMs = 1_800;
  player.input = { x: 1, z: 0, sprint: true };
  stepRoomSimulation(internal, 0.05);
  assert.equal(player.x, before.x);
  assert.equal(player.z, before.z);
  assert.deepEqual(player.input, { x: 0, z: 0, sprint: false });
  assert.equal(internal.goalPauseMs, 1_750);
});

test('P25 R10 : la fin de célébration replace les équipes et remet le ballon au centre', () => {
  const manager = new RoomManager({ now: () => 30_000 });
  const room = manager.create();
  manager.join(room.id);
  const internal = manager.rooms.get(room.id);
  const player = [...internal.players.values()].find(p => p.team === 'blue');
  player.x = 27; player.z = 15;
  internal.ball.x = 24; internal.ball.z = 12;
  internal.goalPauseMs = 40;
  stepRoomSimulation(internal, 0.05);
  assert.equal(internal.goalPauseMs, 0);
  assert.ok(player.x < 0);
  assert.ok(Math.abs(player.z) <= 8.5);
  assert.equal(internal.ball.x, 0);
  assert.equal(internal.ball.z, 0);
  assert.equal(internal.ball.ownerId, null);
});

test('P25 R10 : le gardien IA reste sur sa ligne lorsque le ballon est loin', () => {
  const manager = new RoomManager({ now: () => 40_000 });
  const room = manager.create();
  manager.join(room.id);
  const internal = manager.rooms.get(room.id);
  const goalkeeper = [...internal.players.values()].find(p => p.isBot && p.role === 'GK' && p.team === 'red');
  assert.ok(goalkeeper);
  internal.ball.x = 12; internal.ball.z = 10;
  const initialX = goalkeeper.x;
  manager.updateBots(internal);
  assert.ok(Math.abs(goalkeeper.x - initialX) < 0.001, 'la décision de placement ne téléporte pas le gardien');
  assert.ok(goalkeeper.input.x > 0, 'le gardien conserve sa ligne devant le but rouge');
  assert.ok(Math.abs(goalkeeper.input.z) < 1, 'le gardien suit le ballon sans quitter son couloir');
});

test('P25 R10 : un bot sous pression cherche un partenaire disponible vers l’avant', () => {
  const manager = new RoomManager({ now: () => 50_000 });
  const room = manager.create();
  manager.join(room.id);
  const internal = manager.rooms.get(room.id);
  const carrier = [...internal.players.values()].find(p => p.isBot && p.team === 'red' && p.role !== 'GK');
  const mate = [...internal.players.values()].find(p => p.isBot && p.team === 'red' && p.id !== carrier.id && p.role !== 'GK');
  const opponent = [...internal.players.values()].find(p => p.team === 'blue' && p.id !== carrier.id);
  assert.ok(carrier && mate && opponent);
  carrier.x = 0; carrier.z = 0;
  mate.x = -8; mate.z = 0;
  opponent.x = 1.2; opponent.z = 0;
  internal.ball.ownerId = carrier.id;
  internal.ball.x = carrier.x; internal.ball.z = carrier.z;
  manager.updateBots(internal);
  assert.equal(internal.ball.ownerId, null, 'la passe libère le ballon');
  assert.ok(internal.ball.vx < 0, 'la passe part vers le partenaire situé dans le sens offensif');
  assert.equal(internal.ball.lastTouchTeam, 'red');
});


test('P25 R12 : le premier polling réseau reçoit un snapshot complet même avant la première séquence', async () => {
  const client = new OnlineMatchClient({ baseUrl: 'https://game.example', fetchImpl: async url => {
    assert.match(url, /sinceSequence=-1/);
    return { ok: true, json: async () => ({ state: { sequence: 0, phase: 'playing' }, events: [], eventCursor: 0, changed: true }) };
  } });
  client.roomId = 'aabbccddeeff';
  const result = await client.pollState();
  assert.equal(result.state.sequence, 0);
  assert.equal(result.state.phase, 'playing');
});

test('P25 R13 : la reconnexion restaure le même avatar et reprend la séquence serveur', () => {
  let now = 12_000;
  const manager = new RoomManager({ now: () => now, disconnectGraceMs: 2_000 });
  const room = manager.create();
  const joined = manager.join(room.id);
  manager.submitInput(room.id, joined.token, { x: 1, z: 0, sequence: 1 });
  manager.leave(room.id, joined.token);
  now += 500;
  const resumed = manager.reconnect(room.id, joined.token);
  assert.equal(resumed.reconnected, true);
  assert.equal(resumed.nextSequence, 2);
  assert.equal(resumed.state.players.find(p => p.id === joined.playerId).connected, true);
  assert.equal(manager.submitInput(room.id, joined.token, { x: 0, z: 1, sequence: 2 }).accepted, true);
});

test('P27 : une session déconnectée au-delà du délai de grâce garde son avatar IA et peut reprendre avant la fin du match', () => {
  let now = 30_000;
  const manager = new RoomManager({ now: () => now, disconnectGraceMs: 1_000 });
  const room = manager.create();
  const joined = manager.join(room.id);
  const player = manager.rooms.get(room.id).players.get(joined.playerId);
  manager.leave(room.id, joined.token);
  now += 1_001;
  assert.equal(player.aiControlled, true);
  assert.equal(manager.get(room.id).players.some(p => p.id === joined.playerId), true);
  const resumed = manager.reconnect(room.id, joined.token);
  assert.equal(resumed.reconnected, true);
  assert.equal(player.aiControlled, false);
  assert.equal(player.connected, true);
});

test('P25 R13 : le client restaure la séquence et utilise la route dédiée de reconnexion', async () => {
  const calls = [];
  const client = new OnlineMatchClient({
    baseUrl: 'https://game.test', storage: null,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { status: 200, ok: true, json: async () => ({ alive: true, reconnected: true, nextSequence: 9, state: { sequence: 44 } }) };
    },
  });
  client.roomId = 'abcdef123456'; client.token = 'a'.repeat(32); client.playerId = 'player-1'; client.sequence = 3;
  const result = await client.reconnectSession();
  assert.equal(result.state.sequence, 44);
  assert.equal(client.sequence, 8);
  assert.match(calls[0].url, /\/reconnect$/);
  assert.equal(calls[0].options.headers.authorization, `Bearer ${client.token}`);
});


test('P25 R14 : la mi-temps suspend le jeu puis reprend la seconde période après cinq secondes', () => {
  let now = 10_000;
  const manager = new RoomManager({ now: () => now, disconnectGraceMs: 300_000 });
  const room = manager.create({ durationMinutes: 3 });
  const joined = manager.join(room.id);
  const internal = manager.rooms.get(room.id);
  const controlled = internal.players.get(joined.playerId);
  controlled.input = { x: 1, z: 0, sprint: true };

  now += 90_000;
  manager.tick(0.05);
  let state = manager.get(room.id);
  assert.equal(state.phase, 'halftime');
  assert.equal(state.period, 1);
  assert.equal(state.elapsedMs, 90_000);
  assert.equal(state.halftimeRemainingMs, 5_000);
  assert.deepEqual(controlled.input, { x: 0, z: 0, sprint: false });
  assert.throws(() => manager.submitInput(room.id, joined.token, { x: 1, z: 0, sequence: 1 }), /MATCH_NOT_PLAYING/);

  now += 4_999;
  manager.tick(0.05);
  state = manager.get(room.id);
  assert.equal(state.phase, 'halftime');
  assert.equal(state.period, 1);
  assert.equal(state.elapsedMs, 90_000);

  now += 1;
  manager.tick(0.05);
  state = manager.get(room.id);
  assert.equal(state.phase, 'playing');
  assert.equal(state.period, 2);
  assert.equal(state.elapsedMs, 90_000);
  assert.equal(state.halftimeRemainingMs, 0);
  assert.equal(state.events.some(event => event.type === 'halftime'), true);
  assert.equal(state.events.some(event => event.type === 'second-half'), true);
  assert.deepEqual(state.attackDirection, { blue: -1, red: 1 });
});

test('P25 R14 : la fin du match est calculée après la pause de mi-temps, pas pendant celle-ci', () => {
  let now = 1_000;
  const manager = new RoomManager({ now: () => now, disconnectGraceMs: 300_000 });
  const room = manager.create({ durationMinutes: 3 });
  manager.join(room.id);
  now += 90_000; manager.tick(0.05);
  now += 5_000; manager.tick(0.05);
  now += 89_999; manager.tick(0.05);
  assert.equal(manager.get(room.id).phase, 'playing');
  now += 1; manager.tick(0.05);
  assert.equal(manager.get(room.id).phase, 'fulltime');
  assert.equal(manager.get(room.id).elapsedMs, 180_000);
});

test('P25 R17 : le résultat final est figé et expose les statistiques par joueur et par équipe', () => {
  let now = 50_000;
  const manager = new RoomManager({ now: () => now, disconnectGraceMs: 300_000 });
  const room = manager.create({ durationMinutes: 3 });
  const joined = manager.join(room.id, { displayName: 'Capitaine test' });
  const internal = manager.rooms.get(room.id);
  const player = internal.players.get(joined.playerId);
  // Une action valide est comptabilisée uniquement après acceptation serveur.
  internal.ball.ownerId = player.id;
  assert.equal(manager.submitInput(room.id, joined.token, { x: 0, z: 0, sequence: 1, action: 'pass' }).actionAccepted, true);
  assert.equal(player.stats.passes, 1);
  // Une tentative impossible ne gonfle pas les statistiques.
  assert.equal(manager.submitInput(room.id, joined.token, { x: 0, z: 0, sequence: 2, action: 'shoot' }).actionAccepted, false);
  assert.equal(player.stats.shots, 0);
  now += 90_000; manager.tick(0.05);
  now += 5_000; manager.tick(0.05);
  now += 90_000; manager.tick(0.05);
  const result = manager.getResult(room.id);
  assert.equal(result.phase, 'fulltime');
  assert.equal(result.durationMs, 180_000);
  assert.equal(result.players.find(p => p.playerId === player.id).stats.passes, 1);
  assert.equal(result.teamStats[player.team].passes, 1);
  assert.equal(manager.get(room.id).result.score.blue, result.score.blue);
  assert.equal(manager.get(room.id).events.some(e => e.type === 'fulltime'), true);
  assert.throws(() => manager.getResult('ffffffffffff'), /ROOM_NOT_FOUND/);
});

test('P25 R17 : le résultat reste indisponible avant la fin réglementaire', () => {
  const manager = new RoomManager();
  const room = manager.create({ durationMinutes: 3 });
  manager.join(room.id);
  assert.throws(() => manager.getResult(room.id), /RESULT_NOT_READY/);
});


test('P27 appel de balle en ligne : un bot sert le coéquipier humain demandeur si la ligne est libre', () => {
  let now = 50_000;
  const manager = new RoomManager({ now: () => now, disconnectGraceMs: 300_000 });
  const room = manager.create();
  const joined = manager.join(room.id, { displayName: 'Appelant' });
  const internal = manager.rooms.get(room.id);
  const human = internal.players.get(joined.playerId);
  const carrier = [...internal.players.values()].find(p => p.isBot && p.team === human.team && p.role !== 'GK');
  assert.ok(carrier);
  carrier.x = 0; carrier.z = 0; carrier.lastActionAt = 0;
  human.x = 8; human.z = 0;
  for (const opponent of internal.players.values()) if (opponent.team !== human.team) { opponent.x = -20; opponent.z = 14; }
  internal.ball.ownerId = carrier.id;
  internal.ball.x = carrier.x; internal.ball.y = 0.36; internal.ball.z = carrier.z;
  const request = manager.submitInput(room.id, joined.token, { x: 0, z: 0, sequence: 1, callForPass: true });
  assert.equal(request.accepted, true);
  assert.equal(internal.events.some(event => event.type === 'call-for-pass' && event.playerId === human.id), true);
  manager.updateBots(internal);
  assert.equal(internal.ball.ownerId, null, 'le bot a exécuté une passe');
  assert.ok(internal.ball.vx > 0, 'la passe vise le partenaire humain situé devant');
  assert.equal(internal.ball.lastTouchTeam, human.team);
});

test('P27 appel de balle en ligne : le serveur borne les demandes répétées', () => {
  let now = 60_000;
  const manager = new RoomManager({ now: () => now, disconnectGraceMs: 300_000 });
  const room = manager.create();
  const joined = manager.join(room.id);
  const internal = manager.rooms.get(room.id);
  manager.submitInput(room.id, joined.token, { x: 0, z: 0, sequence: 1, callForPass: true });
  const until = internal.players.get(joined.playerId).callForPassUntil;
  now += 300;
  manager.submitInput(room.id, joined.token, { x: 0, z: 0, sequence: 2, callForPass: true });
  assert.equal(internal.players.get(joined.playerId).callForPassUntil, until);
  assert.equal(internal.events.filter(event => event.type === 'call-for-pass').length, 1);
});


test('P27 appel de balle en ligne : une demande expirée ne déclenche plus de passe', () => {
  let now = 70_000;
  const manager = new RoomManager({ now: () => now, disconnectGraceMs: 300_000 });
  const room = manager.create();
  const joined = manager.join(room.id);
  const internal = manager.rooms.get(room.id);
  const human = internal.players.get(joined.playerId);
  const carrier = [...internal.players.values()].find(p => p.isBot && p.team === human.team && p.role !== 'GK');
  carrier.x = 0; carrier.z = 0; carrier.lastActionAt = 0;
  human.x = 8; human.z = 0;
  for (const opponent of internal.players.values()) if (opponent.team !== human.team) { opponent.x = -20; opponent.z = 14; }
  internal.ball.ownerId = carrier.id;
  internal.ball.x = 0; internal.ball.y = 0.36; internal.ball.z = 0;
  manager.submitInput(room.id, joined.token, { x: 0, z: 0, sequence: 1, callForPass: true });
  now += 1_601;
  manager.updateBots(internal);
  assert.equal(internal.ball.ownerId, carrier.id, 'le bot conserve le ballon après expiration de la demande');
});

test('P27 appel de balle en ligne : une ligne bloquée ne force pas la passe au demandeur', () => {
  let now = 80_000;
  const manager = new RoomManager({ now: () => now, disconnectGraceMs: 300_000 });
  const room = manager.create();
  const joined = manager.join(room.id);
  const internal = manager.rooms.get(room.id);
  const human = internal.players.get(joined.playerId);
  const carrier = [...internal.players.values()].find(p => p.isBot && p.team === human.team && p.role !== 'GK');
  carrier.x = 0; carrier.z = 0; carrier.lastActionAt = 0;
  human.x = 8; human.z = 0;
  const blocker = [...internal.players.values()].find(p => p.team !== human.team);
  blocker.x = 4; blocker.z = 0;
  for (const opponent of internal.players.values()) if (opponent.team !== human.team && opponent.id !== blocker.id) { opponent.x = -20; opponent.z = 14; }
  internal.ball.ownerId = carrier.id;
  internal.ball.x = 0; internal.ball.y = 0.36; internal.ball.z = 0;
  manager.submitInput(room.id, joined.token, { x: 0, z: 0, sequence: 1, callForPass: true });
  manager.updateBots(internal);
  assert.equal(internal.ball.ownerId, carrier.id, 'la passe vers le demandeur est refusée si un adversaire coupe la ligne');
});

test('P27 appel de balle en ligne : quitter le salon invalide immédiatement la demande active', () => {
  let now = 90_000;
  const manager = new RoomManager({ now: () => now, disconnectGraceMs: 300_000 });
  const room = manager.create();
  const joined = manager.join(room.id);
  const internal = manager.rooms.get(room.id);
  const human = internal.players.get(joined.playerId);
  manager.submitInput(room.id, joined.token, { x: 0, z: 0, sequence: 1, callForPass: true });
  assert.ok(human.callForPassUntil > now);
  manager.leave(room.id, joined.token);
  assert.equal(human.callForPassUntil, 0);
});


test('P27 déconnexion : le même avatar passe sous IA moyenne, conserve le ballon et reste dans la simulation', () => {
  let now = 100_000;
  const manager = new RoomManager({ now: () => now, disconnectGraceMs: 500 });
  const room = manager.create();
  const joined = manager.join(room.id, { displayName: 'Joueur déconnecté' });
  const internal = manager.rooms.get(room.id);
  const player = internal.players.get(joined.playerId);
  internal.ball.ownerId = player.id;
  const beforeId = player.id;
  manager.leave(room.id, joined.token);
  assert.equal(player.aiControlled, true);
  assert.equal(player.controlMode, 'ai');
  assert.equal(internal.ball.ownerId, beforeId, 'la possession ne doit pas être perdue au changement de contrôleur');
  assert.equal(manager.get(room.id).players.find(p => p.id === beforeId).aiControlled, true);
  now += 1_000;
  manager.tick(0.05);
  assert.equal(internal.players.has(beforeId), true, 'le joueur ne doit pas être supprimé après le délai de grâce');
  assert.equal(internal.ball.ownerId, beforeId);
});

test('P27 déconnexion : la reconnexion après le délai de grâce rend le contrôle au même joueur sans doublon', () => {
  let now = 200_000;
  const manager = new RoomManager({ now: () => now, disconnectGraceMs: 100 });
  const room = manager.create();
  const joined = manager.join(room.id, { displayName: 'Retour humain' });
  const internal = manager.rooms.get(room.id);
  const player = internal.players.get(joined.playerId);
  manager.leave(room.id, joined.token);
  now += 5_000;
  const resumed = manager.reconnect(room.id, joined.token);
  assert.equal(resumed.reconnected, true);
  assert.equal(resumed.state.players.filter(p => p.id === joined.playerId).length, 1);
  assert.equal(player.connected, true);
  assert.equal(player.aiControlled, false);
  assert.equal(player.controlMode, 'human');
  assert.ok(resumed.state.events.some(event => event.type === 'control-restored' && event.playerId === joined.playerId));
});

test('P27 déconnexion : une prise en charge IA ne compte pas comme un nouveau bot et conserve les cinq slots', () => {
  let now = 300_000;
  const manager = new RoomManager({ now: () => now });
  const room = manager.create();
  const joined = manager.join(room.id);
  const internal = manager.rooms.get(room.id);
  manager.leave(room.id, joined.token);
  manager.ensureBotCoverage(internal);
  const teamPlayers = [...internal.players.values()].filter(player => player.team === internal.players.get(joined.playerId).team);
  assert.equal(teamPlayers.length, 5);
  assert.equal(teamPlayers.filter(player => player.aiControlled).length, 1);
});
