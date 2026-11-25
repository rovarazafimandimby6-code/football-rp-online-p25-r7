import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonCareerStore } from '../server/career-store.js';
import { CareerStoreSyncQueue } from '../server/career-sync-queue.js';

const accountId = '123e4567-e89b-42d3-a456-426614174000';
const playerId = 'FRP-123456';
const input = {
  matchId: 'room-atomic-01', result: 'win', finalizedAt: 1_800_000_000_000,
  name: 'Joueur test', role: 'MID', clubName: 'Club test', teamName: 'Club test',
  opponent: 'Club adverse', minutesPlayedMs: 120_000, rating: 8.2,
  cleanSheet: true, playerOfMatch: true,
  stats: { goals: 1, assists: 0, shots: 2, passes: 12, completedPasses: 10, tackles: 1, interceptions: 0, saves: 0 }
};
function fixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'p27-career-outbox-'));
  return { directory, store: new JsonCareerStore(directory), cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}
function record(store) {
  return store.recordFinalizedMatch(accountId, playerId, input, {
    syncEvent: { accountId, playerId, matchId: input.matchId, payload: input }
  });
}

test('finalized player career, account career and cloud outbox persist in one transaction', () => {
  const f = fixture();
  try {
    const result = record(f.store);
    assert.equal(result.duplicate, false);
    assert.equal(result.playerCareer.totals.matches, 1);
    assert.equal(result.career.totals.matches, 1);
    assert.equal(f.store.pendingCloudMatchCount, 1);
    const restored = new JsonCareerStore(f.directory);
    const queue = new CareerStoreSyncQueue(restored);
    assert.equal(restored.getPlayerCareer(playerId).totals.matches, 1);
    assert.equal(restored.get(accountId).totals.matches, 1);
    assert.equal(queue.pendingCount, 1);
    assert.equal(queue.listDue({ now: input.finalizedAt }).length, 1);
  } finally { f.cleanup(); }
});

test('disk failure rolls back both career views and the outbox together', () => {
  const f = fixture();
  try {
    const persist = f.store.persist.bind(f.store);
    f.store.persist = () => { throw new Error('DISK_FULL'); };
    assert.throws(() => record(f.store), /DISK_FULL/);
    assert.equal(f.store.getPlayerCareer(playerId).totals.matches, 0);
    assert.equal(f.store.get(accountId).totals.matches, 0);
    assert.equal(f.store.pendingCloudMatchCount, 0);
    const restored = new JsonCareerStore(f.directory);
    assert.equal(restored.getPlayerCareer(playerId).totals.matches, 0);
    assert.equal(restored.get(accountId).totals.matches, 0);
    assert.equal(restored.pendingCloudMatchCount, 0);
    f.store.persist = persist;
  } finally { f.cleanup(); }
});

test('duplicate finalized match does not increment careers or enqueue twice', () => {
  const f = fixture();
  try {
    record(f.store);
    const duplicate = record(f.store);
    assert.equal(duplicate.duplicate, true);
    assert.equal(f.store.getPlayerCareer(playerId).totals.matches, 1);
    assert.equal(f.store.get(accountId).totals.matches, 1);
    assert.equal(f.store.pendingCloudMatchCount, 1);
  } finally { f.cleanup(); }
});

test('integrated outbox retains retries and removes an event only after acknowledgement', () => {
  const f = fixture();
  try {
    record(f.store);
    const now = input.finalizedAt;
    const queue = new CareerStoreSyncQueue(f.store, { now: () => now });
    const retry = queue.markAttempt(accountId, input.matchId);
    assert.equal(retry.attempts, 1);
    assert.equal(retry.retryAt, now + 30_000);
    assert.equal(queue.listDue({ now }).length, 0);
    assert.equal(new JsonCareerStore(f.directory).pendingCloudMatchCount, 1);
    assert.equal(queue.acknowledge(accountId, input.matchId).acknowledged, true);
    assert.equal(queue.pendingCount, 0);
    assert.equal(new JsonCareerStore(f.directory).pendingCloudMatchCount, 0);
  } finally { f.cleanup(); }
});
