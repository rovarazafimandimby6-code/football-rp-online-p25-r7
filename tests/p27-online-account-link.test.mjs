import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineMatchClient } from '../src/online-client.js';

test('P27 liaison compte : le jeton de compte authentifie la liaison au salon sans remplacer le jeton de match', async () => {
  const calls = [];
  const client = new OnlineMatchClient({
    baseUrl: 'https://game.example',
    accountTokenProvider: () => 'persistent-account-token',
    storage: null,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ token: 'room-token', playerId: 'player-1', team: 'blue' }) };
    }
  });
  await client.joinRoom('abcdef123456', { displayName: 'Rova' });
  assert.equal(calls[0].options.headers.authorization, 'Bearer persistent-account-token');
  assert.equal(client.token, 'room-token');
  assert.equal(client.playerId, 'player-1');
});

test('P27 liaison compte : un invité rejoint sans envoyer de jeton de compte', async () => {
  let headers;
  const client = new OnlineMatchClient({
    baseUrl: 'https://game.example', accountTokenProvider: () => null, storage: null,
    fetchImpl: async (_url, options) => { headers = options.headers; return { ok: true, status: 200, json: async () => ({ token: 'room-token', playerId: 'player-2' }) }; }
  });
  await client.joinRoom('abcdef123456');
  assert.equal(headers.authorization, undefined);
});
