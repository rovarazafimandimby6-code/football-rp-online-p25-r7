import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('P27 serveur : readiness contrôle les secrets et stockages, puis SIGTERM flush les salons actifs', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'p27-server-lifecycle-'));
  const envPaths = {
    RESULTS_DIR:'results',
    CAREERS_DIR:'careers',
    PLAYER_PROGRESSION_DIR:'progression',
    PLAYER_PROFILES_DIR:'profiles',
    COMPETITIONS_DIR:'competitions',
    TRANSFERS_DIR:'transfers',
    FINANCES_DIR:'finances',
    CLUB_ROSTERS_DIR:'rosters',
    SYSTEM_TRANSFERS_DIR:'system-transfers',
    ROOMS_DIR:'rooms',
    ACCOUNTS_DIR:'accounts',
    PLAYER_IDENTITIES_DIR:'player-identities',
    GOOGLE_OIDC_TRANSACTIONS_DIR:'google-oidc-transactions',
    GOOGLE_IDENTITIES_DIR:'google-identities',
    P27_BACKUPS_DIR:'backups',
  };
  const original = Object.fromEntries([...Object.keys(envPaths), 'P27_ADMIN_TOKEN'].map(key => [key, process.env[key]]));
  let server, shutdownP27Server, manager;
  try {
    for (const [key, directory] of Object.entries(envPaths)) process.env[key] = path.join(root, directory);
    process.env.P27_ADMIN_TOKEN = 'p27-lifecycle-test-secret-0123456789abcdef';
    ({ server, shutdownP27Server, manager } = await import('../server/index.js'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'live');
    const readiness = await fetch(`${base}/readyz`);
    assert.equal(readiness.status, 200);
    const ready = await readiness.json();
    assert.equal(ready.status, 'ready');
    assert.equal(ready.storage.length, 15);
    assert.equal(server.maxHeaderSize, 16 * 1024);
    assert.equal(server.headersTimeout, 15_000);
    assert.equal(server.requestTimeout, 30_000);
    assert.equal(server.keepAliveTimeout, 5_000);
    assert.equal(server.maxRequestsPerSocket, 1_000);

    const oversized = await fetch(`${base}/api/rooms`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x'.repeat(9_000) })
    });
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).error, 'BODY_TOO_LARGE');
    const malformed = await fetch(`${base}/api/rooms`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{invalid-json'
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error, 'INVALID_JSON');

    process.env.P27_ADMIN_TOKEN = 'too-short';
    const missingSecret = await fetch(`${base}/readyz`);
    assert.equal(missingSecret.status, 503);
    assert.ok((await missingSecret.json()).errors.includes('P27_ADMIN_TOKEN_MISSING_OR_TOO_SHORT'));
    process.env.P27_ADMIN_TOKEN = 'p27-lifecycle-test-secret-0123456789abcdef';

    const blockedDirectory = path.join(root, 'rooms-is-a-file');
    writeFileSync(blockedDirectory, 'not a directory');
    process.env.ROOMS_DIR = blockedDirectory;
    const unavailableStorage = await fetch(`${base}/readyz`);
    assert.equal(unavailableStorage.status, 503);
    assert.ok((await unavailableStorage.json()).errors.includes('STORAGE_NOT_WRITABLE:ROOMS_DIR'));
    process.env.ROOMS_DIR = path.join(root, 'rooms');

    const room = manager.create({ name: 'Arrêt propre' });
    manager.join(room.id, { displayName: 'Joueur de test' });
    const report = await shutdownP27Server();
    assert.deepEqual(report, { saved: 1, failed: [] });
    assert.equal(server.listening, false);
    const persisted = JSON.parse(readFileSync(path.join(root, 'rooms', 'active-rooms.json'), 'utf8'));
    assert.equal(persisted.rooms.length, 1);
    assert.equal(persisted.rooms[0].id, room.id);
    assert.equal(persisted.rooms[0].phase, 'playing');
  } finally {
    if (server?.listening && shutdownP27Server) await shutdownP27Server();
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});
