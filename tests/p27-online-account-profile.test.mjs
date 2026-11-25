import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const snapshotRevision = snapshot => createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
const completeRecoverySnapshot = () => ({
  schemaVersion: 1,
  player: { playerId: 'FRP-123456', createdAt: '2026-01-01T00:00:00.000Z' },
  profile: {
    schemaVersion: 1,
    identity: { displayName: 'Rova', number: 10, preferredFoot: 'right', role: 'MID' },
    appearance: { kit: 'emerald', skinTone: 'medium', hairStyle: 'short', hairColor: 'dark', bodyBuild: 'athletic' }
  },
  progression: {
    level: 4, experience: 20, coins: 500, trainingPoints: 2,
    attributes: { pace: 55, shooting: 50, passing: 50, defense: 45, stamina: 55, control: 50 },
    processedMatchIds: []
  },
  career: { totals: { matches: 3 }, matches: [] },
  playerCareer: { player: null, totals: { matches: 3 }, matches: [] },
  seasonStats: { totals: { matches: 3 }, matches: [], processedMatchIds: [] },
  contract: { playerId: 'human-test', wallet: 2500, clubId: null, contract: null, offers: [], history: [], loanOffers: [], loanHistory: [], transferWindowOpen: false }
});

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
        snapshot, revision: snapshotRevision(snapshot), authority: 'server-confirmed',
        restorePolicy: 'server-snapshot-is-read-only; never-overwrite-newer-local-data'
      }) };
    }
  });
  client.token = 'account-token-with-more-than-32-characters';
  const result = await client.getAccountSnapshot();
  assert.equal(result.snapshot.player.playerId, 'FRP-123456');
  assert.equal(result.revision, snapshotRevision(snapshot));
  assert.equal(calls[0].url, 'https://game.example/api/account/snapshot');
  assert.equal(calls[0].options.headers.authorization, `Bearer ${client.token}`);
});

test('P27 récupération cloud : refuse un snapshot dont le contenu ne correspond pas à sa révision SHA-256', async () => {
  const client = new OnlineAccountClient({
    storage: null,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({
      snapshot: { schemaVersion: 1, progression: { level: 99 } },
      revision: snapshotRevision({ schemaVersion: 1, progression: { level: 1 } }),
      authority: 'server-confirmed'
    }) })
  });
  client.token = 'account-token-with-more-than-32-characters';
  await assert.rejects(() => client.getAccountSnapshot(), /INVALID_ACCOUNT_SNAPSHOT_REVISION/);
});

test('P27 récupération cloud : prévisualise sans écrire quand le nouvel appareil est vierge', async () => {
  const snapshot = completeRecoverySnapshot();
  const client = new OnlineAccountClient({
    storage: null,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ snapshot, revision: snapshotRevision(snapshot), authority: 'server-confirmed', generatedAt: '2026-11-25T07:00:00.000Z' }) })
  });
  client.token = 'account-token-with-more-than-32-characters';
  client.account = { id: 'account-123', playerId: 'FRP-123456' };
  const outbox = { status: () => ({ pending: 0 }) };
  const preview = await client.previewAccountRecovery({
    outbox,
    localState: { profile: false, career: false, progression: false, seasonStats: false }
  });
  assert.equal(preview.ready, true);
  assert.equal(preview.reason, 'EXPLICIT_RESTORE_CONFIRMATION_REQUIRED');
  assert.equal(preview.playerId, 'FRP-123456');
  assert.equal(preview.snapshot.career.totals.matches, 3);
});


test('P27 récupération cloud : bloque une sauvegarde dont des sections de carrière manquent', async () => {
  const snapshot = completeRecoverySnapshot();
  delete snapshot.seasonStats;
  const client = new OnlineAccountClient({
    storage: null,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ snapshot, revision: snapshotRevision(snapshot), authority: 'server-confirmed' }) })
  });
  client.token = 'account-token-with-more-than-32-characters';
  client.account = { id: 'account-123', playerId: 'FRP-123456' };
  const preview = await client.previewAccountRecovery({
    outbox: { status: () => ({ pending: 0 }) },
    localState: { profile: false, career: false, progression: false, seasonStats: false }
  });
  assert.equal(preview.ready, false);
  assert.equal(preview.reason, 'SNAPSHOT_INCOMPLETE');
  assert.deepEqual(preview.missingSections, ['seasonStats']);
});

test('P27 récupération cloud : bloque les changements locaux en attente et les données déjà présentes', async () => {
  const snapshot = completeRecoverySnapshot();
  const client = new OnlineAccountClient({
    storage: null,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ snapshot, revision: snapshotRevision(snapshot), authority: 'server-confirmed' }) })
  });
  client.token = 'account-token-with-more-than-32-characters';
  client.account = { id: 'account-123', playerId: 'FRP-123456' };
  const localState = { profile: false, career: false, progression: false, seasonStats: false };
  const pending = await client.previewAccountRecovery({ outbox: { status: () => ({ pending: 2 }) }, localState });
  assert.equal(pending.ready, false);
  assert.equal(pending.reason, 'LOCAL_CHANGES_PENDING');
  const existing = await client.previewAccountRecovery({
    outbox: { status: () => ({ pending: 0 }) },
    localState: { ...localState, career: true }
  });
  assert.equal(existing.ready, false);
  assert.equal(existing.reason, 'LOCAL_DATA_PRESENT');
});

test('P27 récupération cloud : refuse une identité locale ou un compte qui ne correspond pas au joueur du snapshot', async () => {
  const snapshot = { schemaVersion: 1, player: { playerId: 'FRP-123456' } };
  const client = new OnlineAccountClient({
    storage: null,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ snapshot, revision: snapshotRevision(snapshot), authority: 'server-confirmed' }) })
  });
  client.token = 'account-token-with-more-than-32-characters';
  client.account = { id: 'account-123', playerId: 'FRP-123456' };
  const mismatch = await client.previewAccountRecovery({
    localIdentity: { accountId: 'other-account', id: 'FRP-123456' },
    outbox: { status: () => ({ pending: 0 }) },
    localState: { profile: false, career: false, progression: false, seasonStats: false }
  });
  assert.equal(mismatch.ready, false);
  assert.equal(mismatch.reason, 'LOCAL_IDENTITY_MISMATCH');
  const unlinkedLocalIdentity = await client.previewAccountRecovery({
    localIdentity: { id: 'FRP-123456', identityStatus: 'local-pending' },
    outbox: { status: () => ({ pending: 0 }) },
    localState: { profile: false, career: false, progression: false, seasonStats: false }
  });
  assert.equal(unlinkedLocalIdentity.ready, false);
  assert.equal(unlinkedLocalIdentity.reason, 'LOCAL_IDENTITY_MISMATCH');
  client.account.playerId = 'FRP-999999';
  const wrongAccount = await client.previewAccountRecovery({
    outbox: { status: () => ({ pending: 0 }) },
    localState: { profile: false, career: false, progression: false, seasonStats: false }
  });
  assert.equal(wrongAccount.ready, false);
  assert.equal(wrongAccount.reason, 'ACCOUNT_PLAYER_ID_MISMATCH');
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


test('P27 synchronisation : met en file uniquement identité et apparence, puis confirme après PUT', async () => {
  const { PlayerSyncOutbox } = await import('../src/player-sync-outbox.js');
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  let n = 0;
  const outbox = new PlayerSyncOutbox({ storage, operationIdFactory: () => 'profile-sync-operation-' + (++n) });
  const calls = [];
  const client = new OnlineAccountClient({
    baseUrl: 'https://game.example', storage: null,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ profile: { identity: { displayName: 'Rova' }, appearance: { kit: 'crimson' } } }) };
    }
  });
  client.token = 'account-token-with-more-than-32-characters';
  client.account = { id: 'account-123', playerId: 'FRP-123456' };
  const localIdentity = { accountId: 'account-123', id: 'FRP-123456' };
  const operation = client.enqueueProfileSnapshot({
    identity: { displayName: 'Rova', role: 'FWD' },
    appearance: { kit: 'crimson' },
    progression: { level: 99, coins: 999999 }
  }, outbox);
  assert.equal(operation.type, 'profile_snapshot');
  assert.equal(Object.hasOwn(operation.payload, 'progression'), false);
  const result = await client.syncPendingProfileSnapshots(outbox, { localIdentity });
  assert.deepEqual(result, { uploaded: 1, remaining: 0, blocked: 0 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://game.example/api/profile');
  assert.equal(calls[0].options.headers.authorization, `Bearer ${client.token}`);
  assert.equal(outbox.status().state, 'synced');
});

test('P27 synchronisation : conserve les opérations si le serveur refuse le PUT', async () => {
  const { PlayerSyncOutbox } = await import('../src/player-sync-outbox.js');
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  const outbox = new PlayerSyncOutbox({ storage, operationIdFactory: () => 'profile-sync-operation-failure' });
  const client = new OnlineAccountClient({
    storage: null,
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ error: 'SERVER_UNAVAILABLE' }) })
  });
  client.token = 'account-token-with-more-than-32-characters';
  client.account = { id: 'account-123', playerId: 'FRP-123456' };
  client.enqueueProfileSnapshot({ identity: { displayName: 'Rova' }, appearance: {} }, outbox);
  await assert.rejects(() => client.syncPendingProfileSnapshots(outbox, { localIdentity: { accountId: 'account-123', id: 'FRP-123456' } }), /SERVER_UNAVAILABLE/);
  assert.equal(outbox.status().pending, 1);
  assert.equal(outbox.pending()[0].attempts, 1);
});


test('P27 carrière cloud : utilise une réponse authentifiée et valide sa structure', async () => {
  const calls = [];
  const client = new OnlineAccountClient({
    baseUrl: 'https://game.example', storage: null,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ career: { totals: { matches: 2, goals: 1 }, matches: [{ matchId: 'm1' }] } }) };
    }
  });
  client.token = 'account-token-with-more-than-32-characters';
  const result = await client.getCareer();
  assert.equal(result.career.totals.matches, 2);
  assert.equal(calls[0].url, 'https://game.example/api/career');
  assert.equal(calls[0].options.headers.authorization, `Bearer ${client.token}`);
  const invalid = new OnlineAccountClient({ storage: null, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ career: {} }) }) });
  invalid.token = client.token;
  await assert.rejects(() => invalid.getCareer(), /INVALID_CAREER_RESPONSE/);
});


test('P27 session Google : reprend une session HttpOnly via cookie sans exposer de bearer token', async () => {
  const calls = [];
  const client = new OnlineAccountClient({
    baseUrl: 'https://game.example',
    storage: null,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ account: { id: 'account-123', playerId: 'FRP-123456' } }) };
    }
  });
  const account = await client.resumeCookieSession();
  assert.equal(account.id, 'account-123');
  assert.equal(client.hasSession, true);
  assert.equal(client.token, null);
  assert.equal(calls[0].url, 'https://game.example/api/accounts/me');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.headers.authorization, undefined);
});

test('P27 session Google : refuse une réponse /me invalide et reste anonyme', async () => {
  const client = new OnlineAccountClient({
    storage: null,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ account: {} }) })
  });
  await assert.rejects(() => client.resumeCookieSession(), /INVALID_ACCOUNT_SESSION/);
  assert.equal(client.hasSession, false);
});


test('P27 session Google : les lectures et écritures de compte acceptent la session HttpOnly', async () => {
  const calls = [];
  const client = new OnlineAccountClient({
    baseUrl: 'https://game.example', storage: null,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/api/accounts/me')) return { ok: true, status: 200, json: async () => ({ account: { id: 'account-123' } }) };
      if (url.endsWith('/api/career')) return { ok: true, status: 200, json: async () => ({ career: { totals: {}, matches: [] } }) };
      if (url.endsWith('/api/account/snapshot')) { const snapshot = { schemaVersion: 1 }; return { ok: true, status: 200, json: async () => ({ snapshot, revision: snapshotRevision(snapshot), authority: 'server-confirmed' }) }; }
      if (url.endsWith('/api/profile')) return { ok: true, status: 200, json: async () => ({ profile: {} }) };
      return { ok: true, status: 200, json: async () => ({ progression: {} }) };
    }
  });
  await client.resumeCookieSession();
  await client.getProfile();
  await client.getCareer();
  await client.getAccountSnapshot();
  await client.saveProfile({ identity: { displayName: 'Rova' }, appearance: {} });
  await client.getProgression();
  assert.equal(calls.length, 6);
  for (const call of calls.slice(1)) {
    assert.equal(call.options.credentials, 'same-origin');
    assert.equal(call.options.headers.authorization, undefined);
  }
});

test('P27 progression cloud : valide les champs et bornes avant utilisation', async () => {
  const progression = {
    level: 4, experience: 25, coins: 420, trainingPoints: 3,
    attributes: { pace: 60, shooting: 50, passing: 51, defense: 45, stamina: 56, control: 52 },
    processedMatchIds: ['room-123']
  };
  const client = new OnlineAccountClient({
    baseUrl: 'https://game.example', storage: null,
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://game.example/api/progression');
      assert.equal(options.headers.authorization, `Bearer ${client.token}`);
      return { ok: true, status: 200, json: async () => ({ progression }) };
    }
  });
  client.token = 'account-token-with-more-than-32-characters';
  const result = await client.getProgression();
  assert.deepEqual(result.progression, progression);

  const invalid = new OnlineAccountClient({
    storage: null,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({
      progression: { ...progression, level: 100 }
    }) })
  });
  invalid.token = client.token;
  await assert.rejects(() => invalid.getProgression(), /INVALID_PROGRESSION_RESPONSE/);
});

test('P27 session Google : logout révoque aussi une session portée par cookie', async () => {
  const calls = [];
  const client = new OnlineAccountClient({
    baseUrl: 'https://game.example', storage: null,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => (url.endsWith('/api/accounts/me') ? { account: { id: 'account-123' } } : { loggedOut: true }) };
    }
  });
  await client.resumeCookieSession();
  assert.equal(await client.logout(), true);
  assert.equal(calls[1].url, 'https://game.example/api/accounts/logout');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.credentials, 'same-origin');
  assert.equal(client.hasSession, false);
});


test('P27 synchronisation : bloque tout envoi si le compte ne correspond pas au profil local', async () => {
  const { PlayerSyncOutbox } = await import('../src/player-sync-outbox.js');
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  const outbox = new PlayerSyncOutbox({ storage, operationIdFactory: () => 'profile-sync-operation-identity' });
  let requests = 0;
  const client = new OnlineAccountClient({ storage: null, fetchImpl: async () => { requests++; throw new Error('SHOULD_NOT_FETCH'); } });
  client.token = 'account-token-with-more-than-32-characters';
  client.account = { id: 'another-account', playerId: 'FRP-999999' };
  client.enqueueProfileSnapshot({ identity: { displayName: 'Rova' }, appearance: {} }, outbox);
  await assert.rejects(() => client.syncPendingProfileSnapshots(outbox, { localIdentity: { accountId: 'local-account', id: 'FRP-123456' } }), /ACCOUNT_LOCAL_IDENTITY_MISMATCH/);
  assert.equal(requests, 0);
  assert.equal(outbox.status().pending, 1);
});


test('P27 synchronisation automatique : conserve les changements hors ligne puis les envoie après liaison du bon compte', async () => {
  const { PlayerSyncOutbox } = await import('../src/player-sync-outbox.js');
  const { ProfileSyncCoordinator } = await import('../src/profile-sync-coordinator.js');
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  const outbox = new PlayerSyncOutbox({ storage, operationIdFactory: (() => { let i = 0; return () => 'profile-coordinator-op-' + (++i).toString().padStart(8, '0'); })() });
  const calls = [];
  const client = new OnlineAccountClient({
    baseUrl: 'https://game.example', storage: null,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ profile: { identity: { displayName: 'Rova' }, appearance: { kit: 'crimson' } } }) };
    }
  });
  let profile = { identity: { displayName: 'Rova', number: 9, role: 'FWD' }, appearance: { kit: 'crimson' }, progression: { coins: 999 } };
  const localIdentity = { id: 'FRP-123456', accountId: 'account-123' };
  const coordinator = new ProfileSyncCoordinator({ accountClient: client, outbox, getProfile: () => profile, getLocalIdentity: () => localIdentity });
  coordinator.enqueueCurrentProfile();
  assert.deepEqual(await coordinator.flush(), { uploaded: 0, remaining: 1, blocked: 0, skipped: true });
  assert.equal(calls.length, 0);
  client.account = { id: 'account-123', playerId: 'FRP-123456' };
  client.cookieSession = true;
  assert.deepEqual(await coordinator.flush(), { uploaded: 1, remaining: 0, blocked: 0 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(JSON.parse(calls[0].options.body).profile.progression, undefined);
});

test('P27 synchronisation automatique : ne transmet jamais une file au compte Google différent', async () => {
  const { PlayerSyncOutbox } = await import('../src/player-sync-outbox.js');
  const { ProfileSyncCoordinator } = await import('../src/profile-sync-coordinator.js');
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  const outbox = new PlayerSyncOutbox({ storage, operationIdFactory: () => 'profile-coordinator-op-mismatch' });
  let requests = 0;
  const client = new OnlineAccountClient({ storage: null, fetchImpl: async () => { requests++; throw new Error('SHOULD_NOT_FETCH'); } });
  client.account = { id: 'other-account', playerId: 'FRP-999999' };
  client.cookieSession = true;
  const coordinator = new ProfileSyncCoordinator({
    accountClient: client, outbox,
    getProfile: () => ({ identity: { displayName: 'Rova' }, appearance: {} }),
    getLocalIdentity: () => ({ id: 'FRP-123456', accountId: 'local-account' })
  });
  coordinator.enqueueCurrentProfile();
  assert.deepEqual(await coordinator.flush(), { uploaded: 0, remaining: 1, blocked: 1, skipped: true, reason: 'ACCOUNT_LOCAL_IDENTITY_MISMATCH' });
  assert.equal(requests, 0);
  assert.equal(outbox.status().pending, 1);
});
