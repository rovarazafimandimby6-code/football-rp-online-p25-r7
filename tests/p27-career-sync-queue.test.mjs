import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JsonCareerSyncQueue } from '../server/career-sync-queue.js';

const accountId = '123e4567-e89b-42d3-a456-426614174000';
const event = (overrides = {}) => ({
  accountId, playerId: 'FRP-123456', matchId: 'room-0001',
  payload: { matchId: 'room-0001', result: 'win', stats: { goals: 1 } },
  ...overrides,
});
function withQueue(run, options) {
  const directory = mkdtempSync(path.join(tmpdir(), 'p27-career-outbox-'));
  try { return run(new JsonCareerSyncQueue(directory, options), directory); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

test('outbox persists pending finalized matches across process restarts', () => withQueue((queue, directory) => {
  queue.enqueue(event());
  const restarted = new JsonCareerSyncQueue(directory);
  assert.equal(restarted.pendingCount, 1);
  assert.equal(restarted.listPending()[0].payload.result, 'win');
}));

test('outbox enqueue is idempotent and never replaces an existing match result', () => withQueue(queue => {
  queue.enqueue(event());
  const duplicate = queue.enqueue(event({ payload: { matchId: 'room-0001', result: 'loss' } }));
  assert.equal(duplicate.duplicate, true);
  assert.equal(queue.listPending()[0].payload.result, 'win');
}));

test('outbox rejects identity collisions and malformed identities', () => withQueue(queue => {
  queue.enqueue(event());
  assert.throws(() => queue.enqueue(event({ playerId: 'FRP-999999' })), /CAREER_SYNC_IDENTITY_CONFLICT/);
  assert.throws(() => queue.enqueue(event({ playerId: 'human-not-frp' })), /INVALID_CAREER_SYNC_EVENT/);
}));

test('acknowledgement removes only the matching event and survives restart', () => withQueue((queue, directory) => {
  queue.enqueue(event());
  assert.equal(queue.acknowledge(accountId, 'room-0001').acknowledged, true);
  assert.equal(new JsonCareerSyncQueue(directory).pendingCount, 0);
}));

test('queue capacity fails closed without dropping pending events', () => withQueue(queue => {
  queue.maxPending = 100;
  for (let i = 0; i < 100; i++) queue.enqueue(event({ matchId: 'room-' + String(i).padStart(4, '0'), payload: { matchId: 'room-' + String(i).padStart(4, '0'), result: 'draw' } }));
  assert.throws(() => queue.enqueue(event({ matchId: 'overflow', payload: { matchId: 'overflow', result: 'win' } })), /CAREER_SYNC_QUEUE_FULL/);
  assert.equal(queue.pendingCount, 100);
}));
