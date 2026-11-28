import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerSyncOutbox } from '../src/player-sync-outbox.js';

function storage(initial = null) {
  const map = new Map();
  if (initial !== null) map.set('fpro.player-sync-outbox.v1', initial);
  return {
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key)
  };
}

test('sync outbox queues ordered idempotency-keyed snapshots and persists them', () => {
  let n = 0;
  const s = storage();
  const q = new PlayerSyncOutbox({ storage: s, operationIdFactory: () => 'operation-id-0000' + (++n), now: () => '2026-11-25T00:00:00.000Z' });
  const a = q.enqueue('profile_snapshot', { displayName: 'Player' });
  const b = q.enqueue('career_snapshot', { clubId: 'club-1' });
  assert.equal(a.sequence, 1);
  assert.equal(b.sequence, 2);
  assert.equal(q.pending().length, 2);
  assert.equal(new PlayerSyncOutbox({ storage: s }).pending()[0].operationId, a.operationId);
});

test('sync outbox only removes operations after a non-stale server acknowledgement', () => {
  const q = new PlayerSyncOutbox({ storage: storage(), operationIdFactory: () => 'operation-id-0001' });
  const op = q.enqueue('progression_snapshot', { level: 2 });
  assert.equal(q.acknowledge({ operationId: op.operationId, serverVersion: 3 }), true);
  assert.deepEqual(q.status(), { state: 'synced', pending: 0, serverVersion: 3, nextSequence: 2 });
  const next = q.enqueue('career_snapshot', { clubId: 'a' });
  assert.equal(q.acknowledge({ operationId: next.operationId, serverVersion: 2 }), false);
  assert.equal(q.pending().length, 1);
});

test('sync outbox keeps local pending changes instead of applying a remote overwrite', () => {
  const q = new PlayerSyncOutbox({ storage: storage(), operationIdFactory: () => 'operation-id-0001' });
  q.enqueue('profile_snapshot', { displayName: 'Local' });
  assert.equal(q.reconcileRemote({ serverVersion: 99 }).action, 'keep-local-pending');
  assert.equal(q.markAttempt('operation-id-0001'), true);
  assert.equal(q.pending()[0].attempts, 1);
});

test('sync outbox validates operation types, payload size and capacity', () => {
  const q = new PlayerSyncOutbox({ storage: storage(), operationIdFactory: () => 'operation-id-0001', maxEntries: 10 });
  assert.throws(() => q.enqueue('unknown', { a: 1 }), /TYPE_INVALID/);
  assert.throws(() => q.enqueue('profile_snapshot', 'bad'), /PAYLOAD_INVALID/);
  assert.throws(() => q.enqueue('profile_snapshot', { blob: 'x'.repeat(140000) }), /PAYLOAD_TOO_LARGE/);
});

test('sync outbox fails closed on malformed JSON instead of silently discarding pending work', () => {
  const q = new PlayerSyncOutbox({ storage: storage('{broken-json') });
  assert.throws(() => q.pending(), /STATE_CORRUPT/);
  assert.throws(() => q.enqueue('profile_snapshot', { displayName: 'New' }), /STATE_CORRUPT/);
});

test('sync outbox rejects invalid or incomplete persisted rows without filtering them away', () => {
  const invalid = { version: 1, nextSequence: 2, serverVersion: 0, operations: [
    { operationId: 'operation-id-0001', type: 'profile_snapshot', sequence: 1, payload: { name: 'A' }, createdAt: 'now', attempts: 0 },
    { operationId: 'broken', type: 'career_snapshot', sequence: 2, payload: { club: 'B' }, createdAt: 'now', attempts: 0 }
  ] };
  const q = new PlayerSyncOutbox({ storage: storage(JSON.stringify(invalid)) });
  assert.throws(() => q.status(), /STATE_CORRUPT/);
});

test('sync outbox rejects duplicate operation IDs and invalid sequence metadata', () => {
  const duplicate = { version: 1, nextSequence: 3, serverVersion: 0, operations: [
    { operationId: 'operation-id-0001', type: 'profile_snapshot', sequence: 1, payload: {}, createdAt: 'now', attempts: 0 },
    { operationId: 'operation-id-0001', type: 'career_snapshot', sequence: 2, payload: {}, createdAt: 'now', attempts: 0 }
  ] };
  assert.throws(() => new PlayerSyncOutbox({ storage: storage(JSON.stringify(duplicate)) }).pending(), /STATE_CORRUPT/);
  const badSequence = { version: 1, nextSequence: 1, serverVersion: 0, operations: [
    { operationId: 'operation-id-0001', type: 'profile_snapshot', sequence: 1, payload: {}, createdAt: 'now', attempts: 0 }
  ] };
  assert.throws(() => new PlayerSyncOutbox({ storage: storage(JSON.stringify(badSequence)) }).pending(), /STATE_CORRUPT/);
});


test('sync outbox refuses out-of-order acknowledgements and preserves the revision cursor', () => {
  let n = 0;
  const q = new PlayerSyncOutbox({
    storage: storage(),
    operationIdFactory: () => 'ordered-operation-' + (++n).toString().padStart(8, '0')
  });
  const first = q.enqueue('profile_snapshot', { displayName: 'First' });
  const second = q.enqueue('profile_snapshot', { displayName: 'Second' });

  assert.equal(q.acknowledge({ operationId: second.operationId, serverVersion: 2 }), false);
  assert.equal(q.status().serverVersion, 0);
  assert.deepEqual(q.pending().map(row => row.operationId), [first.operationId, second.operationId]);

  assert.equal(q.acknowledge({ operationId: first.operationId, serverVersion: 1 }), true);
  assert.equal(q.status().serverVersion, 1);
  assert.equal(q.acknowledge({ operationId: second.operationId, serverVersion: 2 }), true);
  assert.deepEqual(q.status(), { state: 'synced', pending: 0, serverVersion: 2, nextSequence: 3 });
});

test('sync outbox cannot acknowledge an unknown or already acknowledged operation', () => {
  const q = new PlayerSyncOutbox({ storage: storage(), operationIdFactory: () => 'ordered-operation-id-0001' });
  const op = q.enqueue('profile_snapshot', { displayName: 'Player' });
  assert.equal(q.acknowledge({ operationId: 'unknown-operation-id', serverVersion: 1 }), false);
  assert.equal(q.acknowledge({ operationId: op.operationId, serverVersion: 1 }), true);
  assert.equal(q.acknowledge({ operationId: op.operationId, serverVersion: 2 }), false);
});
