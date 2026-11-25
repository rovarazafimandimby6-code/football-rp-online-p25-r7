import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonAccountStore } from '../server/account-store.js';

const accountId = '123e4567-e89b-42d3-a456-426614174000';

function withStore(run, options = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'p27-passwordless-account-'));
  try { return run(new JsonAccountStore(directory, options), directory); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

test('passwordless session reuses the reserved account ID without credentials', () => withStore(store => {
  const session = store.issuePasswordlessSession(accountId, { playerId: 'FRP-675757' });
  assert.equal(session.account.id, accountId);
  assert.equal(session.account.playerId, 'FRP-675757');
  assert.equal(session.account.passwordless, true);
  assert.equal(store.resolve(session.token).id, accountId);
  assert.equal(store.login({ username: 'p27-123e4567-e89', password: 'anything-long-enough' }), null);
}));

test('passwordless account can issue a fresh session after server restart', () => withStore((store, directory) => {
  const first = store.issuePasswordlessSession(accountId, { playerId: 'FRP-675757' });
  const restarted = new JsonAccountStore(directory);
  const second = restarted.issuePasswordlessSession(accountId, { playerId: 'FRP-675757' });
  assert.equal(restarted.resolve(first.token), null);
  assert.equal(restarted.resolve(second.token).id, accountId);
}));

test('passwordless session rejects account or player identity mismatches', () => withStore(store => {
  assert.throws(() => store.issuePasswordlessSession('not-an-account-id'), /INVALID_ACCOUNT_ID/);
  assert.throws(() => store.issuePasswordlessSession(accountId, { playerId: 'FRP-123' }), /INVALID_PLAYER_ID/);
  store.issuePasswordlessSession(accountId, { playerId: 'FRP-675757' });
  assert.throws(() => store.issuePasswordlessSession(accountId, { playerId: 'FRP-111111' }), /PLAYER_ID_MISMATCH/);
}));

test('passwordless persistence contains no recoverable password or raw session token', () => withStore((store, directory) => {
  const session = store.issuePasswordlessSession(accountId, { playerId: 'FRP-675757' });
  const persisted = readFileSync(path.join(directory, 'accounts.json'), 'utf8');
  assert.equal(persisted.includes(session.token), false);
  assert.equal(persisted.includes('unreachablePassword'), false);
  assert.equal(persisted.includes('passwordless'), true);
}));
