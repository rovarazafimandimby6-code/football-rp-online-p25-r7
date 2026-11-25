import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { RoomManager } from '../server/room-manager.js';

// Deterministic CI workload guard. Timings are diagnostic only and do not
// represent production hosting capacity.
test('P27 workload: 32 simultaneous rooms remain coherent for 60 ticks', () => {
  const manager = new RoomManager({ now: () => 1_000 });
  const roomIds = [];

  for (let index = 0; index < 32; index++) {
    const room = manager.create({ name: `Charge contrôlée ${index + 1}` });
    manager.join(room.id, { displayName: `Test ${index + 1}` });
    roomIds.push(room.id);
  }

  const started = performance.now();
  for (let tick = 0; tick < 60; tick++) manager.tick(1 / 20);
  const elapsedMs = performance.now() - started;

  assert.equal(manager.rooms.size, 32);
  for (const roomId of roomIds) {
    const room = manager.rooms.get(roomId);
    assert.ok(room, `room ${roomId} disappeared`);
    assert.equal(room.phase, 'playing');
    assert.equal(room.sequence, 60);
    assert.equal(room.players.size, 14);
    assert.ok(Number.isFinite(room.ball.x) && Number.isFinite(room.ball.z));
    for (const player of room.players.values()) {
      assert.ok(Number.isFinite(player.x) && Number.isFinite(player.z));
      assert.ok(Number.isFinite(player.input.x) && Number.isFinite(player.input.z));
    }
  }

  console.log(`P27 workload diagnostic: 32 rooms, 448 player slots, 60 ticks in ${elapsedMs.toFixed(1)} ms on this CI runner`);
});
