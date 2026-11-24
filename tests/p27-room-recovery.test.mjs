import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonRoomStore } from '../server/room-store.js';
import { RoomManager } from '../server/room-manager.js';

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
