import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonRoomStore } from '../server/room-store.js';
import { JsonResultStore } from '../server/result-store.js';
import { RoomManager } from '../server/room-manager.js';
import { JsonProgressionStore } from '../server/progression-store.js';

function temporaryDirectory(prefix) { return mkdtempSync(path.join(os.tmpdir(), prefix)); }

test('P27 salons persistés : reprise du match, état du terrain et reconnexion humaine après redémarrage', () => {
  const directory = temporaryDirectory('p27-room-restart-');
  try {
    let now = 1_000;
    const roomStore = new JsonRoomStore(directory);
    const first = new RoomManager({ now: () => now, roomStore });
    const created = first.create({ name: 'Reprise contrôlée' });
    const joined = first.join(created.id, { displayName: 'Joueur persistant', accountId: 'account-restart' });
    const live = first.rooms.get(created.id);
    assert.equal(live.phase, 'playing');
    live.elapsedMs = 12_000;
    live.startedAt = now - 12_000;
    live.score.blue = 2;
    live.ball.x = 8.5;
    live.ball.z = -3.25;
    live.players.get(joined.playerId).stats.goals = 1;
    assert.equal(first.persistRoom(live), true);

    now = 9_000;
    const restarted = new RoomManager({ now: () => now, roomStore: new JsonRoomStore(directory) });
    const restored = restarted.rooms.get(created.id);
    assert.ok(restored);
    assert.equal(restored.phase, 'playing');
    assert.equal(restored.elapsedMs, 12_000);
    assert.equal(restored.score.blue, 2);
    assert.equal(restored.ball.x, 8.5);
    assert.equal(restored.ball.z, -3.25);
    const human = restored.players.get(joined.playerId);
    assert.equal(human.connected, false);
    assert.equal(human.aiControlled, true);
    assert.equal(human.stats.goals, 1);

    const reconnect = restarted.reconnect(created.id, joined.token);
    assert.equal(reconnect.reconnected, true);
    assert.equal(restored.players.get(joined.playerId).connected, true);
    assert.equal(restarted.get(created.id).players.find(player => player.id === joined.playerId).token, undefined);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('P27 salons persistés : la mi-temps reprend avec son temps restant sans compter l’arrêt serveur', () => {
  const directory = temporaryDirectory('p27-room-halftime-');
  try {
    let now = 5_000;
    const roomStore = new JsonRoomStore(directory);
    const first = new RoomManager({ now: () => now, roomStore });
    const created = first.create();
    first.join(created.id, { displayName: 'Joueur' });
    const live = first.rooms.get(created.id);
    live.phase = 'halftime';
    live.period = 1;
    live.elapsedMs = 150_000;
    live.startedAt = now - live.elapsedMs;
    live.halftimeUntil = now + 3_500;
    first.persistRoom(live);

    now += 2_000;
    const restarted = new RoomManager({ now: () => now, roomStore: new JsonRoomStore(directory) });
    const restored = restarted.rooms.get(created.id);
    assert.equal(restored.phase, 'halftime');
    assert.equal(restored.elapsedMs, 150_000);
    assert.equal(restored.halftimeUntil - now, 3_500);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('P27 salons persistés : un checkpoint JSON corrompu bloque explicitement le démarrage', () => {
  const directory = temporaryDirectory('p27-room-corrupt-');
  try {
    const store = new JsonRoomStore(directory);
    writeFileSync(store.file, '{broken-json');
    assert.throws(() => new RoomManager({ now: () => 2, roomStore: store }), /ROOM_STORE_CORRUPT/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('P27 salons persistés : les identifiants de joueurs dupliqués invalident le checkpoint', () => {
  const directory = temporaryDirectory('p27-room-duplicate-');
  try {
    const store = new JsonRoomStore(directory);
    store.save({
      id: 'room-duplicate', phase: 'playing', elapsedMs: 0, updatedAt: 1,
      score: { blue: 0, red: 0 },
      players: [
        { id: 'same-player', team: 'blue', slot: 0 },
        { id: 'same-player', team: 'red', slot: 0 },
      ],
    });
    assert.throws(() => new RoomManager({ now: () => 2, roomStore: store }), /ROOM_STORE_CORRUPT/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('P27 salons persistés : le tick serveur produit automatiquement un checkpoint périodique', () => {
  const directory = temporaryDirectory('p27-room-periodic-');
  try {
    let now = 1_000;
    const roomStore = new JsonRoomStore(directory);
    const first = new RoomManager({ now: () => now, roomStore });
    const created = first.create();
    first.join(created.id, { displayName: 'Joueur périodique' });
    now = 2_250;
    first.tick(0.05);
    const saved = roomStore.readAll().find(room => room.id === created.id);
    assert.ok(saved);
    assert.equal(saved.phase, 'playing');
    assert.equal(saved.elapsedMs, 1_250);
    const restarted = new RoomManager({ now: () => now, roomStore: new JsonRoomStore(directory) });
    assert.equal(restarted.get(created.id).elapsedMs, 1_250);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('P27 salons persistés : le plafond de salons refuse une nouvelle sauvegarde sans évincer un match', () => {
  const directory = temporaryDirectory('p27-room-capacity-');
  try {
    const store = new JsonRoomStore(directory, { maxRooms: 1 });
    const snapshot = id => ({ id, phase: 'lobby', elapsedMs: 0, updatedAt: 1, score: { blue: 0, red: 0 }, players: [] });
    store.save(snapshot('room-one'));
    assert.throws(() => store.save(snapshot('room-two')), /ROOM_STORE_CAPACITY_EXCEEDED/);
    assert.deepEqual(store.readAll().map(room => room.id), ['room-one']);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('P27 salons persistés : un checkpoint ancien est supprimé si le résultat final existe déjà', () => {
  const directory = temporaryDirectory('p27-room-finalized-');
  try {
    const roomStore = new JsonRoomStore(path.join(directory, 'rooms'));
    const resultStore = new JsonResultStore(path.join(directory, 'results'));
    roomStore.save({
      id: 'room-already-finalized', phase: 'playing', elapsedMs: 100_000, updatedAt: 1,
      score: { blue: 1, red: 0 }, players: [],
    });
    resultStore.save({
      roomId: 'room-already-finalized', phase: 'fulltime', finalizedAt: 2,
      score: { blue: 1, red: 0 }, teams: { blue: { id: 'club-a' }, red: { id: 'club-b' } },
    });
    const manager = new RoomManager({ now: () => 3, roomStore, resultStore });
    assert.equal(manager.rooms.has('room-already-finalized'), false);
    assert.deepEqual(roomStore.readAll(), []);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('P27 salons persistés : le flush de fermeture sauvegarde tous les salons actifs et ignore les salons terminés', () => {
  const directory = temporaryDirectory('p27-room-shutdown-flush-');
  try {
    const roomStore = new JsonRoomStore(directory);
    const manager = new RoomManager({ roomStore });
    const first = manager.create({ name: 'Salon un' });
    manager.join(first.id, { displayName: 'Joueur un' });
    const second = manager.create({ name: 'Salon deux' });
    manager.join(second.id, { displayName: 'Joueur deux' });
    const report = manager.persistAllRooms();
    assert.deepEqual(report, { saved: 2, failed: [] });
    assert.deepEqual(roomStore.readAll().map(room => room.id).sort(), [first.id, second.id].sort());
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('P27 salons persistés : le flush rapporte un échec de stockage sans masquer le salon concerné', () => {
  const directory = temporaryDirectory('p27-room-shutdown-failure-');
  try {
    const roomStore = new JsonRoomStore(directory);
    const manager = new RoomManager({ roomStore });
    const room = manager.create();
    manager.join(room.id, { displayName: 'Joueur' });
    roomStore.saveMany = () => { throw new Error('DISK_UNAVAILABLE'); };
    const report = manager.persistAllRooms();
    assert.equal(report.saved, 0);
    assert.deepEqual(report.failed, [{ roomId: room.id, reason: 'DISK_UNAVAILABLE' }]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});


test('P27 salons persistés : un tick regroupe les checkpoints de plusieurs matchs en une seule écriture', () => {
  const directory = temporaryDirectory('p27-room-batch-');
  try {
    let now = 1_000;
    const roomStore = new JsonRoomStore(directory);
    const manager = new RoomManager({ now: () => now, roomStore });
    const first = manager.create({ name: 'Match batch 1' });
    manager.join(first.id, { displayName: 'Joueur 1' });
    const second = manager.create({ name: 'Match batch 2' });
    manager.join(second.id, { displayName: 'Joueur 2' });
    let writes = 0;
    const saveMany = roomStore.saveMany.bind(roomStore);
    roomStore.saveMany = snapshots => { writes++; return saveMany(snapshots); };
    now += 1_250;
    manager.tick(0.05);
    assert.equal(writes, 1);
    assert.equal(roomStore.readAll().length, 2);
    assert.ok(roomStore.readAll().every(room => room.phase === 'playing'));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('P27 salons persistés : un lot invalide ne modifie aucun checkpoint existant', () => {
  const directory = temporaryDirectory('p27-room-batch-invalid-');
  try {
    const store = new JsonRoomStore(directory);
    const valid = { id: 'room-kept', phase: 'lobby', elapsedMs: 0, updatedAt: 1, score: { blue: 0, red: 0 }, players: [] };
    store.save(valid);
    const invalid = { ...valid, id: 'room-invalid', score: { blue: -1, red: 0 } };
    assert.throws(() => store.saveMany([valid, invalid]), /INVALID_ROOM_CHECKPOINT/);
    assert.deepEqual(store.readAll().map(room => room.id), ['room-kept']);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('P27 salons persistés : saveMany respecte le plafond global sans écriture partielle', () => {
  const directory = temporaryDirectory('p27-room-batch-capacity-');
  try {
    const store = new JsonRoomStore(directory, { maxRooms: 2 });
    const snapshot = id => ({ id, phase: 'lobby', elapsedMs: 0, updatedAt: 1, score: { blue: 0, red: 0 }, players: [] });
    store.save(snapshot('room-one'));
    assert.throws(() => store.saveMany([snapshot('room-two'), snapshot('room-three')]), /ROOM_STORE_CAPACITY_EXCEEDED/);
    assert.deepEqual(store.readAll().map(room => room.id), ['room-one']);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});


test('P27 simulation : plusieurs dizaines de salons avancent ensemble sans perte d état ni joueur', () => {
  let now = 100_000;
  const manager = new RoomManager({ now: () => now });
  const rooms = [];
  for (let index = 0; index < 30; index++) {
    const created = manager.create({ name: `Stress ${index + 1}` });
    manager.join(created.id, { displayName: `Humain ${index + 1}` });
    const room = manager.rooms.get(created.id);
    assert.equal(room.phase, 'playing');
    assert.equal(room.players.size, 24);
    rooms.push({ id: created.id, sequence: room.sequence });
  }

  for (let frame = 0; frame < 20; frame++) {
    now += 50;
    manager.tick(0.05);
  }

  assert.equal(manager.rooms.size, 30);
  for (const entry of rooms) {
    const room = manager.rooms.get(entry.id);
    assert.ok(room.sequence > entry.sequence);
    assert.equal(room.players.size, 24);
    assert.ok(Number.isFinite(room.ball.x) && Number.isFinite(room.ball.z));
    for (const player of room.players.values()) {
      assert.ok(Number.isFinite(player.x) && Number.isFinite(player.z));
      assert.ok(Number.isFinite(player.input.x) && Number.isFinite(player.input.z));
    }
  }
});

test('P27 salons persistés : un salon inactif nettoie aussi une déconnexion horodatée à zéro', () => {
  let now = 0;
  const manager = new RoomManager({ now: () => now, roomTtlMs: 60 * 60_000, disconnectGraceMs: 20_000 });
  const created = manager.create({ name: 'Déconnexion à zéro' });
  const room = manager.rooms.get(created.id);
  room.phase = 'lobby';
  room.players.clear();
  room.players.set('human-at-zero', {
    id: 'human-at-zero', team: 'blue', slot: 0, isBot: false,
    connected: false, aiControlled: true, disconnectedAt: 0,
  });

  now = 20_001;
  manager.tick(0);
  assert.equal(manager.rooms.has(created.id), false);
});

test('P27 résultat final : un coup de sifflet non finalisé survit au redémarrage et termine sa sauvegarde', () => {
  const directory = temporaryDirectory('p27-room-fulltime-recovery-');
  try {
    let now = 50_000;
    const roomDirectory = path.join(directory, 'rooms');
    const resultDirectory = path.join(directory, 'results');
    const progressionDirectory = path.join(directory, 'progression');
    const roomStore = new JsonRoomStore(roomDirectory);
    const resultStore = new JsonResultStore(resultDirectory);
    const progressionStore = new JsonProgressionStore(progressionDirectory);
    const first = new RoomManager({ now: () => now, roomStore, resultStore, progressionStore });
    const created = first.create({ name: 'Finalisation récupérable' });
    const joined = first.join(created.id, { displayName: 'Joueur carrière', accountId: 'account-final-recovery' });
    const room = first.rooms.get(created.id);
    const player = room.players.get(joined.playerId);
    player.matchTimePlayedMs = 90_000;
    player.stats.goals = 1;
    room.phase = 'fulltime';
    room.elapsedMs = room.durationMinutes * 60_000;
    room.score = { blue: 1, red: 0 };

    progressionStore.persist = () => { throw new Error('DISK_FULL'); };
    assert.equal(first.tryFinalizeResult(room), false);
    assert.equal(resultStore.get(created.id), null);
    const checkpoint = roomStore.readAll().find(item => item.id === created.id);
    assert.equal(checkpoint.phase, 'fulltime');
    assert.equal(checkpoint.score.blue, 1);

    now += 5_000;
    const recoveredProgression = new JsonProgressionStore(progressionDirectory);
    const restarted = new RoomManager({
      now: () => now,
      roomStore: new JsonRoomStore(roomDirectory),
      resultStore: new JsonResultStore(resultDirectory),
      progressionStore: recoveredProgression,
    });
    assert.equal(restarted.rooms.get(created.id).phase, 'fulltime');
    restarted.tick(0);
    assert.equal(restarted.getResult(created.id).score.blue, 1);
    assert.ok(recoveredProgression.get('account-final-recovery').processedMatchIds.includes(created.id));
    assert.deepEqual(new JsonRoomStore(roomDirectory).readAll(), []);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
