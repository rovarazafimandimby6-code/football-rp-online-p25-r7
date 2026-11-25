import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineAccountClient } from '../src/online-account-client.js';

test('P27 profil cloud : GET et PUT utilisent uniquement la session persistante', async () => {
  const calls = [];
  const client = new OnlineAccountClient({
    baseUrl: 'https://game.example',
    storage: null,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ profile: { identity: { displayName: 'Rova' }, appearance: { kit: 'emerald' } } }) };
    }
  });
  client.token = 'account-token-with-more-than-32-characters';
  await client.getProfile();
  await client.saveProfile({ identity: { displayName: 'Rova' }, appearance: { kit: 'crimson' }, progression: { coins: 999 } });
  assert.equal(calls[0].options.headers.authorization, `Bearer ${client.token}`);
  assert.equal(calls[1].options.headers.authorization, `Bearer ${client.token}`);
  assert.equal(JSON.parse(calls[1].options.body).profile.progression.coins, 999);
});

test('P27 profil cloud : refuse la synchronisation sans compte connecté', async () => {
  const client = new OnlineAccountClient({ storage: null, fetchImpl: async () => { throw new Error('SHOULD_NOT_FETCH'); } });
  await assert.rejects(() => client.getProfile(), /NOT_AUTHENTICATED/);
  await assert.rejects(() => client.saveProfile({}), /NOT_AUTHENTICATED/);
});


test('P27 récupération cloud : charge un snapshot serveur authentifié et vérifie sa révision', async () => {
  const calls = [];
  const snapshot = { schemaVersion: 1, player: { playerId: 'FRP-123456' }, progression: { level: 3 } };
  const client = new OnlineAccountClient({
    baseUrl: 'https://game.example',
    storage: null,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => ({
        snapshot, revision: 'a'.repeat(64), authority: 'server-confirmed',
        restorePolicy: 'server-snapshot-is-read-only; never-overwrite-newer-local-data'
      }) };
    }
  });
  client.token = 'account-token-with-more-than-32-characters';
  const result = await client.getAccountSnapshot();
  assert.equal(result.snapshot.player.playerId, 'FRP-123456');
  assert.equal(result.revision, 'a'.repeat(64));
  assert.equal(calls[0].url, 'https://game.example/api/account/snapshot');
  assert.equal(calls[0].options.headers.authorization, `Bearer ${client.token}`);
});

test('P27 récupération cloud : refuse snapshot invalide et compte absent', async () => {
  const invalid = new OnlineAccountClient({
    storage: null,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ snapshot: { schemaVersion: 1 }, revision: 'bad', authority: 'client' }) })
  });
  invalid.token = 'account-token-with-more-than-32-characters';
  await assert.rejects(() => invalid.getAccountSnapshot(), /INVALID_ACCOUNT_SNAPSHOT/);
  const anonymous = new OnlineAccountClient({ storage: null, fetchImpl: async () => { throw new Error('SHOULD_NOT_FETCH'); } });
  await assert.rejects(() => anonymous.getAccountSnapshot(), /NOT_AUTHENTICATED/);
});
