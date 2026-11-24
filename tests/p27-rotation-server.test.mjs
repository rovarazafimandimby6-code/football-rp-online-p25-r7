import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../server/room-manager.js';

test('P27 rotations serveur : un joueur authentifié fait entrer un réserviste de son équipe à la mi-temps', () => {
  const manager = new RoomManager();
  const created = manager.create();
  const joined = manager.join(created.id, { displayName: 'Capitaine test' });
  const room = manager.rooms.get(created.id);
  room.phase = 'halftime';
  room.elapsedMs = 30 * 60 * 1000;
  assert.equal(manager.publicState(room).rotationAvailable, true);
  const outgoing = [...room.players.values()].find(player => player.team === joined.team && player.isOnPitch !== false && player.isBot);
  const incoming = [...room.players.values()].find(player => player.team === joined.team && player.isOnPitch === false && player.isBot);
  assert.ok(outgoing);
  assert.ok(incoming);
  const outgoingSlot = outgoing.slot;
  const result = manager.rotate(created.id, joined.token, { outgoingId: outgoing.id, incomingId: incoming.id });
  assert.equal(result.rotated, true);
  assert.equal(room.players.get(outgoing.id).isOnPitch, false);
  assert.equal(room.players.get(incoming.id).isOnPitch, true);
  assert.equal(room.players.get(incoming.id).slot, outgoingSlot);
  assert.equal([...room.players.values()].filter(player => player.team === joined.team && player.isOnPitch !== false).length, 5);
});

test('P27 rotations serveur : refuse le jeton invalide et les réservistes adverses', () => {
  const manager = new RoomManager();
  const created = manager.create();
  const joined = manager.join(created.id, { displayName: 'Joueur test' });
  const room = manager.rooms.get(created.id);
  room.phase = 'halftime';
  const outgoing = [...room.players.values()].find(player => player.team === joined.team && player.isOnPitch !== false && player.isBot);
  const enemyReserve = [...room.players.values()].find(player => player.team !== joined.team && player.isOnPitch === false && player.isBot);
  assert.throws(() => manager.rotate(created.id, 'invalid-token', { outgoingId: outgoing.id, incomingId: enemyReserve.id }), /UNAUTHORIZED/);
  assert.throws(() => manager.rotate(created.id, joined.token, { outgoingId: outgoing.id, incomingId: enemyReserve.id }), /INVALID_ROTATION_PAIR/);
});
