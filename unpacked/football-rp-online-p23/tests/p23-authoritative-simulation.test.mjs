import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../server/room-manager.js';
import { stepRoomSimulation } from '../server/simulation.js';

function startedRoom(now = 10_000) {
  let clock = now;
  const manager = new RoomManager({ now: () => clock });
  const room = manager.create();
  const players = [];
  for (let i = 0; i < 6; i++) players.push(manager.join(room.id, { displayName: `P${i}` }));
  return { manager, room, players, advance(ms) { clock += ms; manager.tick(0.05); }, now: () => clock };
}

test('simulation autoritaire : les joueurs avancent uniquement selon leurs entrées serveur', () => {
  const ctx = startedRoom();
  const p = ctx.players[0];
  const before = ctx.manager.get(ctx.room.id).players.find(x => x.id === p.playerId).x;
  ctx.manager.submitInput(ctx.room.id, p.token, { x: 1, z: 0, sequence: 1 });
  ctx.advance(50);
  const after = ctx.manager.get(ctx.room.id).players.find(x => x.id === p.playerId).x;
  assert.ok(after > before);
});

test('simulation autoritaire : le ballon est attaché au porteur et une frappe le libère', () => {
  const ctx = startedRoom();
  const p = ctx.players[0];
  const room = ctx.manager.rooms.get(ctx.room.id);
  room.ball.ownerId = p.playerId;
  const result = ctx.manager.submitInput(ctx.room.id, p.token, { x: 1, z: 0, action: 'shoot', sequence: 1 });
  assert.equal(result.actionAccepted, true);
  assert.equal(room.ball.ownerId, null);
  assert.ok(room.ball.vx > 0);
  assert.equal(ctx.manager.get(ctx.room.id).events.at(-1).type, 'shoot');
});

test('simulation autoritaire : tacle proche et orienté récupère le ballon', () => {
  const ctx = startedRoom();
  const room = ctx.manager.rooms.get(ctx.room.id);
  const [a, b] = ctx.players;
  const pa = room.players.get(a.playerId), pb = room.players.get(b.playerId);
  pa.x = 0; pa.z = 0; pa.facing = Math.PI / 2;
  pb.x = 1.2; pb.z = 0;
  room.ball.ownerId = pb.id;
  const result = ctx.manager.submitInput(ctx.room.id, a.token, { x: 1, z: 0, action: 'tackle', sequence: 1 });
  assert.equal(result.actionAccepted, true);
  assert.equal(room.ball.ownerId, pa.id);
});

test('simulation autoritaire : but validé, score incrémenté et ballon replacé', () => {
  const ctx = startedRoom();
  const room = ctx.manager.rooms.get(ctx.room.id);
  room.ball.x = 27.9; room.ball.y = 0.36; room.ball.z = 0;
  room.ball.vx = 10; room.ball.vy = 0; room.ball.vz = 0;
  stepRoomSimulation(room, 0.05);
  assert.equal(room.score.blue, 1);
  assert.equal(room.ball.x, 0);
  assert.equal(room.events.at(-1).type, 'goal');
});

test('simulation autoritaire : les limites du terrain empêchent les joueurs de sortir', () => {
  const ctx = startedRoom();
  const room = ctx.manager.rooms.get(ctx.room.id);
  const p = room.players.get(ctx.players[0].playerId);
  p.input = { x: 1, z: 1, sprint: true };
  p.x = 27.19; p.z = 16.19;
  stepRoomSimulation(room, 0.05);
  assert.ok(p.x <= 27.2 && p.z <= 16.2);
});

test('horloge serveur : changement de période et inversion des côtés à mi-match', () => {
  const ctx = startedRoom(1_000);
  const room = ctx.manager.rooms.get(ctx.room.id);
  const before = room.players.get(ctx.players[0].playerId).x;
  ctx.advance(150_000);
  assert.equal(room.period, 2);
  assert.equal(room.attackDirection.blue, -1);
  assert.equal(room.players.get(ctx.players[0].playerId).x, -before);
});

test('sécurité des snapshots : aucune donnée de jeton ou de présence interne ne fuit', () => {
  const ctx = startedRoom();
  const state = ctx.manager.get(ctx.room.id);
  const p = state.players[0];
  for (const forbidden of ['token', 'input', 'lastInputSequence', 'lastSeen', 'disconnectedAt', 'lastActionAt']) {
    assert.equal(forbidden in p, false);
  }
});

test('actions : un joueur sans possession ne peut pas déclencher un tir', () => {
  const ctx = startedRoom();
  const p = ctx.players[0];
  const result = ctx.manager.submitInput(ctx.room.id, p.token, { x: 0, z: 0, action: 'shoot', sequence: 1 });
  assert.equal(result.accepted, true);
  assert.equal(result.actionAccepted, false);
  assert.equal(ctx.manager.get(ctx.room.id).ball.ownerId, null);
});

test('horloge serveur : la durée de cinq minutes se termine exactement au plafond', () => {
  const ctx = startedRoom(5_000);
  ctx.advance(299_999);
  assert.equal(ctx.manager.get(ctx.room.id).phase, 'playing');
  ctx.advance(1);
  assert.equal(ctx.manager.get(ctx.room.id).phase, 'fulltime');
  assert.equal(ctx.manager.get(ctx.room.id).elapsedMs, 300_000);
});
