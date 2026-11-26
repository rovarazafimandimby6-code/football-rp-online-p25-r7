import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('P27 API salons : le jeton joueur est privé, non mis en cache et requis pour contrôler son avatar', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'p27-room-api-auth-'));
  const envPaths = {
    RESULTS_DIR:'results', CAREERS_DIR:'careers', CAREER_SYNC_DIR:'career-sync',
    PLAYER_PROGRESSION_DIR:'progression', PLAYER_PROFILES_DIR:'profiles',
    COMPETITIONS_DIR:'competitions', TRANSFERS_DIR:'transfers', FINANCES_DIR:'finances',
    CLUB_ROSTERS_DIR:'rosters', SYSTEM_TRANSFERS_DIR:'system-transfers',
    ROOMS_DIR:'rooms', ACCOUNTS_DIR:'accounts', PLAYER_IDENTITIES_DIR:'player-identities',
    GOOGLE_OIDC_TRANSACTIONS_DIR:'google-oidc-transactions',
    GOOGLE_IDENTITIES_DIR:'google-identities', RP_CLUBS_DIR:'rp-clubs',
    RP_CLUB_CHALLENGES_DIR:'rp-club-challenges', RP_CLUB_SEASONS_DIR:'rp-club-seasons',
    P27_BACKUPS_DIR:'backups'
  };
  const keys = [...Object.keys(envPaths), 'P27_ADMIN_TOKEN'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  let server, shutdownP27Server;
  try {
    for (const [key, directory] of Object.entries(envPaths)) process.env[key] = path.join(root, directory);
    process.env.P27_ADMIN_TOKEN = 'p27-room-api-test-secret-0123456789abcdef';
    ({ server, shutdownP27Server } = await import('../server/index.js'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (url, body, token) => fetch(base + url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body || {})
    });

    const createdResponse = await post('/api/rooms', { name: 'API sécurité' });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(createdResponse.headers.get('cache-control'), 'no-store');
    assert.equal(Object.hasOwn(created, 'token'), false);

    const joinedResponse = await post(`/api/rooms/${created.id}/join`, { displayName: 'Contrôle API' });
    assert.equal(joinedResponse.status, 200);
    assert.equal(joinedResponse.headers.get('cache-control'), 'no-store');
    const joined = await joinedResponse.json();
    assert.equal(typeof joined.token, 'string');
    assert.ok(joined.token.length >= 32);
    assert.equal(Object.hasOwn(joined.state.players.find(player => player.id === joined.playerId), 'token'), false);

    const publicResponse = await fetch(`${base}/api/rooms/${created.id}`);
    assert.equal(publicResponse.status, 200);
    const publicState = await publicResponse.json();
    const publicPlayer = publicState.players.find(player => player.id === joined.playerId);
    assert.ok(publicPlayer);
    for (const field of ['token', 'accountId', 'careerPlayerId', 'input', 'lastInputSequence', 'lastSeen', 'disconnectedAt']) {
      assert.equal(Object.hasOwn(publicPlayer, field), false, `API publique expose ${field}`);
    }

    const rejected = await post(`/api/rooms/${created.id}/input`, { x: 1, z: 0, sequence: 1 }, 'invalid-room-token-0123456789');
    assert.equal(rejected.status, 401);
    assert.equal((await rejected.json()).error, 'UNAUTHORIZED');

    const accepted = await post(`/api/rooms/${created.id}/input`, { x: 0.5, z: 0, sequence: 1 }, joined.token);
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).accepted, true);

    const left = await post(`/api/rooms/${created.id}/leave`, {}, joined.token);
    assert.equal(left.status, 200);
    const resumed = await post(`/api/rooms/${created.id}/reconnect`, {}, joined.token);
    assert.equal(resumed.status, 200);
    const reconnectState = await resumed.json();
    assert.equal(reconnectState.reconnected, true);
    assert.equal(reconnectState.state.players.filter(player => player.id === joined.playerId).length, 1);
  } finally {
    if (server?.listening && shutdownP27Server) await shutdownP27Server();
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});
