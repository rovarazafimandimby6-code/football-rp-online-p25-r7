import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runP27DeploymentPreflight } from '../server/deployment-preflight.js';

test('P27 pré-livraison : valide le secret sans le divulguer et vérifie les répertoires de persistance', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'p27-preflight-ok-'));
  try {
    const result = await runP27DeploymentPreflight({
      root,
      env: { P27_ADMIN_TOKEN: 'a'.repeat(48) },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
    assert.equal(result.checked.length, 14);
    assert.ok(result.checked.every(item => item.writable));
    assert.equal(JSON.stringify(result).includes('a'.repeat(48)), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('P27 pré-livraison : refuse un secret absent ou trop court', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'p27-preflight-secret-'));
  try {
    const result = await runP27DeploymentPreflight({ root, env: { P27_ADMIN_TOKEN: 'short' } });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('P27_ADMIN_TOKEN_MISSING_OR_TOO_SHORT'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('P27 pré-livraison : détecte un répertoire de stockage non inscriptible', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'p27-preflight-storage-'));
  try {
    const blocked = path.join(root, 'not-a-directory');
    writeFileSync(blocked, 'file');
    const result = await runP27DeploymentPreflight({
      root,
      env: { P27_ADMIN_TOKEN: 'b'.repeat(48), PLAYER_IDENTITIES_DIR: blocked },
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('STORAGE_NOT_WRITABLE:PLAYER_IDENTITIES_DIR'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
