import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalPlayerProfile, LOCAL_PLAYER_PROFILE_STORAGE_KEY } from '../src/local-player-profile.js';
function memoryStorage() { const values = new Map(); return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) }; }
test('creates an offline local player profile without password or account credentials', () => {
  const storage = memoryStorage(); const store = new LocalPlayerProfile({ storage, now: () => '2026-11-25T08:00:00.000Z', idFactory: () => '675757' });
  const profile = store.create({ displayName: '  Rova   Player  ' });
  assert.equal(profile.id, 'FRP-675757'); assert.match(profile.localProfileKey, /^[0-9a-f-]{36}$/); assert.equal(profile.identityStatus, 'local-pending'); assert.match(profile.localProofSecret, /^[a-f0-9]{64}$/); assert.equal(profile.displayName, 'Rova Player');
  assert.deepEqual(profile.cloudSync, { status: 'not-linked', googleLinked: false }); assert.equal(store.load().id, profile.id);
  assert.equal(Object.hasOwn(profile, 'password'), false); assert.equal(Object.hasOwn(profile, 'username'), false); assert.equal(Object.hasOwn(profile, 'email'), false);
  assert.equal(storage.getItem(LOCAL_PLAYER_PROFILE_STORAGE_KEY).includes('password'), false);
});
test('prevents accidental duplicate local profile creation', () => { const store = new LocalPlayerProfile({ storage: memoryStorage(), idFactory: () => '000001' }); store.create({ displayName: 'Player' }); assert.throws(() => store.create({ displayName: 'Second Player' }), { message: 'LOCAL_PROFILE_ALREADY_EXISTS' }); });
test('updates display name without changing local identity or cloud-link state', () => {
  let n = 0; const store = new LocalPlayerProfile({ storage: memoryStorage(), now: () => '2026-11-25T08:00:0' + n++ + '.000Z', idFactory: () => '000001' });
  const initial = store.create({ displayName: 'Player One' }); const updated = store.update({ displayName: 'Player Two', id: 'attacker-id', cloudSync: { googleLinked: true } });
  assert.equal(updated.id, initial.id); assert.equal(updated.displayName, 'Player Two'); assert.deepEqual(updated.cloudSync, { status: 'not-linked', googleLinked: false });
});
test('rejects blank names and handles missing storage', () => {
  const store = new LocalPlayerProfile({ storage: memoryStorage() }); assert.throws(() => store.create({ displayName: '   ' }), { message: 'INVALID_PLAYER_DISPLAY_NAME' });
  assert.equal(new LocalPlayerProfile({ storage: null }).load(), null); assert.throws(() => new LocalPlayerProfile({ storage: null }).create({ displayName: 'Player' }), { message: 'LOCAL_PROFILE_STORAGE_UNAVAILABLE' });
});
test('clears only the device-local profile', () => { const storage = memoryStorage(); const store = new LocalPlayerProfile({ storage, idFactory: () => '000001' }); store.create({ displayName: 'Player' }); assert.equal(store.clear(), true); assert.equal(store.load(), null); });

test('server reservation replaces provisional number and retries idempotently', async () => {
  const store = new LocalPlayerProfile({ storage: memoryStorage(), idFactory: () => '111111' });
  const initial = store.create({ displayName: 'Player' }); let calls = 0;
  const fetchImpl = async (_url, options) => { calls++; assert.equal(JSON.parse(options.body).localProfileKey, initial.localProfileKey); assert.equal(JSON.parse(options.body).localProofSecret, initial.localProofSecret); return { ok: true, json: async () => ({ accountId: '123e4567-e89b-42d3-a456-426614174099', playerId: 'FRP-675757', reserved: true }) }; };
  const first = await store.reserveWithServer({ fetchImpl }); const second = await store.reserveWithServer({ fetchImpl });
  assert.equal(first.id, 'FRP-675757'); assert.equal(first.accountId, '123e4567-e89b-42d3-a456-426614174099'); assert.equal(first.identityStatus, 'reserved'); assert.equal(second.id, first.id); assert.equal(calls, 2);
});

test('migrates an existing local profile by adding a device-held proof secret', () => { const storage = memoryStorage(); const profile = { id: 'FRP-123456', localProfileKey: '123e4567-e89b-42d3-a456-426614174000', displayName: 'Player' }; storage.setItem(LOCAL_PLAYER_PROFILE_STORAGE_KEY, JSON.stringify({ version: 1, profile })); const loaded = new LocalPlayerProfile({ storage }).load(); assert.match(loaded.localProofSecret, /^[a-f0-9]{64}$/); assert.equal(JSON.parse(storage.getItem(LOCAL_PLAYER_PROFILE_STORAGE_KEY)).profile.localProofSecret, loaded.localProofSecret); });

test('adopts a trusted cloud identity on a new device without changing its FRP ID', () => {
  const store = new LocalPlayerProfile({ storage: memoryStorage(), now: () => '2026-11-25T09:00:00.000Z' });
  const profile = store.adoptFromServer({
    accountId: '123e4567-e89b-42d3-a456-426614174099', playerId: 'FRP-675757',
    localProfileKey: '123e4567-e89b-42d3-a456-426614174098',
    localProofSecret: 'b'.repeat(64), createdAt: '2026-11-25T08:00:00.000Z'
  });
  assert.equal(profile.id, 'FRP-675757');
  assert.equal(profile.identityStatus, 'reserved');
  assert.deepEqual(profile.cloudSync, { status: 'linked', googleLinked: true });
  assert.equal(store.load().localProofSecret, 'b'.repeat(64));
  assert.throws(() => store.adoptFromServer({}), { message: 'LOCAL_PROFILE_ALREADY_EXISTS' });
});
