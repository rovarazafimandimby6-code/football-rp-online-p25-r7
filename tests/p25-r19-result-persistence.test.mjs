import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonResultStore } from '../server/result-store.js';
import { RoomManager } from '../server/room-manager.js';

function tempStore(options) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'fpro-results-'));
  return { directory, store: new JsonResultStore(directory, options), cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

test('R19: les résultats finalisés survivent à la reconstruction du gestionnaire', () => {
  const fixture = tempStore();
  try {
    const manager = new RoomManager({ now: () => 123456, resultStore: fixture.store });
    const created = manager.create();
    const room = manager.rooms.get(created.id);
    room.phase = 'fulltime'; room.elapsedMs = 300000; room.score.blue = 2; room.score.red = 1;
    const finalized = manager.finalizeResult(room);
    const restartedManager = new RoomManager({ resultStore: new JsonResultStore(fixture.directory) });
    assert.deepEqual(restartedManager.getResult(created.id), JSON.parse(JSON.stringify(finalized)));
    assert.equal(restartedManager.listResults().length, 1);
  } finally { fixture.cleanup(); }
});

test('R19: le stockage remplace un résultat du même match sans créer de doublon', () => {
  const fixture = tempStore();
  try {
    fixture.store.save({ roomId: 'abc', phase: 'fulltime', finalizedAt: 1, score: { blue: 1, red: 0 } });
    fixture.store.save({ roomId: 'abc', phase: 'fulltime', finalizedAt: 2, score: { blue: 2, red: 0 } });
    assert.equal(fixture.store.list().length, 1);
    assert.equal(fixture.store.get('abc').score.blue, 2);
  } finally { fixture.cleanup(); }
});

test('R19: l’historique applique une limite sûre et refuse un résultat incomplet', () => {
  const fixture = tempStore({ maxResults: 2 });
  try {
    for (let i = 1; i <= 3; i++) fixture.store.save({ roomId: `room${i}`, phase: 'fulltime', finalizedAt: i, score: { blue: i, red: 0 } });
    assert.deepEqual(fixture.store.list({ limit: 1 }).map(row => row.roomId), ['room3']);
    assert.deepEqual(fixture.store.list({ limit: 99 }).map(row => row.roomId), ['room3', 'room2']);
    assert.throws(() => fixture.store.save({ roomId: 'bad', phase: 'playing' }), /INVALID_RESULT/);
  } finally { fixture.cleanup(); }
});

test('R20: la pagination expose des pages stables et un curseur de continuation', () => {
  const fixture = tempStore();
  try {
    for (let i = 1; i <= 5; i++) fixture.store.save({ roomId: `page-${i}`, phase: 'fulltime', finalizedAt: i, score: { blue: i, red: 0 } });
    const first = fixture.store.page({ limit: 2, offset: 0 });
    assert.deepEqual(first.results.map(row => row.roomId), ['page-5', 'page-4']);
    assert.deepEqual(first.pagination, { limit: 2, offset: 0, total: 5, hasMore: true, nextOffset: 2 });
    const second = fixture.store.page({ limit: 2, offset: first.pagination.nextOffset });
    assert.deepEqual(second.results.map(row => row.roomId), ['page-3', 'page-2']);
    assert.equal(second.pagination.hasMore, true);
    const last = fixture.store.page({ limit: 2, offset: 4 });
    assert.deepEqual(last.results.map(row => row.roomId), ['page-1']);
    assert.equal(last.pagination.nextOffset, null);
  } finally { fixture.cleanup(); }
});

test('R20: le stockage refuse les scores, identifiants et horodatages invalides', () => {
  const fixture = tempStore();
  try {
    const valid = { roomId: 'valid-room', phase: 'fulltime', finalizedAt: 10, score: { blue: 1, red: 0 } };
    assert.throws(() => fixture.store.save({ ...valid, score: { blue: -1, red: 0 } }), /INVALID_RESULT/);
    assert.throws(() => fixture.store.save({ ...valid, score: { blue: 1.5, red: 0 } }), /INVALID_RESULT/);
    assert.throws(() => fixture.store.save({ ...valid, roomId: '   ' }), /INVALID_RESULT/);
    assert.throws(() => fixture.store.save({ ...valid, finalizedAt: Number.NaN }), /INVALID_RESULT/);
    assert.equal(fixture.store.list().length, 0);
  } finally { fixture.cleanup(); }
});
