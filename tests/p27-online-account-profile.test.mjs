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
