import test from 'node:test';
import assert from 'node:assert/strict';
import { CareerManager } from '../src/career-manager.js';
import { createAccountRecoveryAdapters, hasAccountRecoveryData, readAccountRecoveryArchives } from '../src/account-recovery-adapters.js';
import { restoreAccountSnapshot } from '../src/account-recovery.js';
class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}
const revision = 'a'.repeat(64);
const snapshot = () => ({
  schemaVersion: 1,
  profile: { identity: { displayName: 'Rova', number: 10, preferredFoot: 'right', role: 'MID' }, appearance: { kit: 'emerald' }, progression: { level: 1, experience: 0, coins: 250, trainingPoints: 0, attributes: { pace: 55 } }, appliedMatchIds: [] },
  progression: { level: 4, experience: 20, coins: 900, trainingPoints: 2, attributes: { pace: 70, shooting: 50, passing: 50, defense: 45, stamina: 55, control: 50 }, processedMatchIds: ['online-1'] },
  career: { totals: { matches: 1 }, matches: [{ matchId: 'career-1' }] },
  playerCareer: { totals: { matches: 2 }, matches: [{ matchId: 'player-1' }] },
  seasonStats: { totals: { matches: 2, goals: 1 }, matches: [{ matchId: 'player-1', result: 'win', goals: 1 }], processedMatchIds: ['player-1'] },
  contract: { wallet: 400, clubId: 'club-a', contract: null, offers: [], history: [], loanOffers: [{ id: 'loan-a' }], loanHistory: [] }
});
function makeStores(storage) {
  const profileStore = {
    storage, key: 'football-rp-online.player-profile.v1',
    profile: { identity: { displayName: 'Local' }, appearance: {}, progression: {}, appliedMatchIds: [] },
    save(value) { this.profile = structuredClone(value); storage.setItem(this.key, JSON.stringify(this.profile)); return true; },
    load() { this.profile = JSON.parse(storage.getItem(this.key)); return this.profile; }
  };
  const seasonStatsStore = {
    storage, key: 'football-rp-online.player-season-stats.v1', totals: { matches: 0 }, matches: [], processedMatchIds: [],
    snapshot() { return { totals: this.totals, matches: this.matches, processedMatchIds: this.processedMatchIds }; },
    save() { storage.setItem(this.key, JSON.stringify(this.snapshot())); return true; },
    load() { const v=JSON.parse(storage.getItem(this.key)); this.totals=v.totals; this.matches=v.matches; this.processedMatchIds=v.processedMatchIds; }
  };
  const careerManager = new CareerManager({ storage, initialCoins: 2500 });
  return { profileStore, seasonStatsStore, careerManager };
}
const preview = () => ({ ready: true, reason: 'EXPLICIT_RESTORE_CONFIRMATION_REQUIRED', revision, snapshot: snapshot() });

test('P27 adapters : restaure les deux stores et trois archives distinctes', async () => {
  const storage = new MemoryStorage(), stores = makeStores(storage);
  storage.setItem(stores.profileStore.key, JSON.stringify(stores.profileStore.profile));
  storage.setItem(stores.seasonStatsStore.key, JSON.stringify(stores.seasonStatsStore.snapshot()));
  const result = await restoreAccountSnapshot({ preview: preview(), currentRevision: revision, confirmed: true, adapters: createAccountRecoveryAdapters(stores) });
  assert.equal(result.ok, true);
  assert.equal(stores.profileStore.profile.progression.level, 4);
  assert.deepEqual(stores.profileStore.profile.appliedMatchIds, ['online-1']);
  assert.equal(stores.seasonStatsStore.totals.goals, 1);
  const archives = readAccountRecoveryArchives(storage);
  assert.equal(archives.onlineCareer.matches[0].matchId, 'career-1');
  assert.equal(archives.playerCareer.matches[0].matchId, 'player-1');
  assert.deepEqual(archives.transferCareer.loanOffers, [{ id: 'loan-a' }]);
});
test('P27 adapters : rollbacke les stores et archives après un échec ultérieur', async () => {
  const storage = new MemoryStorage(), stores = makeStores(storage);
  storage.setItem(stores.profileStore.key, JSON.stringify(stores.profileStore.profile));
  storage.setItem(stores.seasonStatsStore.key, JSON.stringify(stores.seasonStatsStore.snapshot()));
  const adapters = createAccountRecoveryAdapters(stores);
  const result = await restoreAccountSnapshot({ preview: preview(), currentRevision: revision, confirmed: true, adapters: [...adapters.slice(0,4), { ...adapters[4], apply() { throw new Error('disk failure'); } }] });
  assert.equal(result.reason, 'RESTORE_APPLY_FAILED');
  assert.equal(result.rolledBack, true);
  assert.equal(stores.profileStore.profile.identity.displayName, 'Local');
  assert.equal(readAccountRecoveryArchives(storage), null);
});
test('P27 adapters : conserve exactement la copie de secours lors du rollback', async () => {
  const storage = new MemoryStorage(), stores = makeStores(storage), key = stores.profileStore.key;
  storage.setItem(key, JSON.stringify(stores.profileStore.profile));
  storage.setItem(key + '.backup', '{"sentinel":"backup"}');
  const adapters = createAccountRecoveryAdapters(stores);
  const result = await restoreAccountSnapshot({ preview: preview(), currentRevision: revision, confirmed: true, adapters: [...adapters.slice(0,4), { ...adapters[4], apply() { throw new Error('stop'); } }] });
  assert.equal(result.rolledBack, true);
  assert.equal(storage.getItem(key + '.backup'), '{"sentinel":"backup"}');
});

test('P27 adapters : bloque la récupération si une archive locale existe déjà', () => {
  const storage = new MemoryStorage();
  assert.equal(hasAccountRecoveryData(storage), false);
  storage.setItem('football-rp-online.account-archive.player-career.v1', JSON.stringify({ schemaVersion: 1, data: {} }));
  assert.equal(hasAccountRecoveryData(storage), true);
  storage.removeItem('football-rp-online.account-archive.player-career.v1');
  storage.setItem('football-rp-online.account-archive.transfer-career.v1.backup', JSON.stringify({ schemaVersion: 1, data: {} }));
  assert.equal(hasAccountRecoveryData(storage), true);
  assert.equal(hasAccountRecoveryData({ getItem() { throw new Error('storage unavailable'); } }), true);
});
