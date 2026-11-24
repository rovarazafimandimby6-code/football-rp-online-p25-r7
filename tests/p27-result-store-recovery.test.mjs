import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonResultStore } from '../server/result-store.js';

function result(roomId, finalizedAt, score = { blue:1, red:0 }) {
  return { roomId, phase:'fulltime', finalizedAt, score, teams:{ blue:{ id:'club-a' }, red:{ id:'club-b' } } };
}

test('P27 résultats persistés : remplacement idempotent et rechargement après redémarrage', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'p27-results-reload-'));
  try {
    const first = new JsonResultStore(directory);
    first.save(result('room-stable', 1000));
    first.save(result('room-stable', 2000, { blue:2, red:1 }));
    const restarted = new JsonResultStore(directory);
    assert.equal(restarted.readAll().length, 1);
    assert.equal(restarted.get('room-stable').finalizedAt, 2000);
    assert.deepEqual(restarted.get('room-stable').score, { blue:2, red:1 });
  } finally { rmSync(directory, { recursive:true, force:true }); }
});

test('P27 résultats persistés : limite de rétention et pagination cohérentes après rechargement', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'p27-results-retention-'));
  try {
    const store = new JsonResultStore(directory, { maxResults:2 });
    store.save(result('room-1', 100));
    store.save(result('room-2', 200));
    store.save(result('room-3', 300));
    const restarted = new JsonResultStore(directory, { maxResults:2 });
    const page = restarted.page({ limit:1, offset:0 });
    assert.equal(page.pagination.total, 2);
    assert.equal(page.results[0].roomId, 'room-3');
    assert.equal(page.pagination.hasMore, true);
    assert.equal(restarted.get('room-1'), null);
  } finally { rmSync(directory, { recursive:true, force:true }); }
});

test('P27 résultats persistés : une archive JSON corrompue bloque explicitement la lecture', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'p27-results-corrupt-'));
  try {
    const store = new JsonResultStore(directory);
    writeFileSync(store.file, '{invalid-json');
    assert.throws(() => store.readAll(), /RESULT_STORE_CORRUPT/);
    assert.throws(() => store.page(), /RESULT_STORE_CORRUPT/);
  } finally { rmSync(directory, { recursive:true, force:true }); }
});
