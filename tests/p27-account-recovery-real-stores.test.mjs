import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerProfileStore } from '../src/player-profile.js';
import { PlayerSeasonStats } from '../src/player-season-stats.js';
import { createAccountRecoveryAdapters, readAccountRecoveryArchives } from '../src/account-recovery-adapters.js';
import { restoreAccountSnapshot } from '../src/account-recovery.js';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}
const revision = 'c'.repeat(64);
const makeSnapshot = () => ({
  schemaVersion: 1,
  profile: {
    identity: { displayName: 'Cloud Player', number: 9, preferredFoot: 'left', role: 'FWD' },
    appearance: { kit: 'crimson', skinTone: 'dark', hairStyle: 'fade', hairColor: 'brown', bodyBuild: 'lean' },
    progression: { level: 1, experience: 0, coins: 250, trainingPoints: 0, attributes: { pace: 55 } },
    appliedMatchIds: []
  },
  progression: {
    level: 7, experience: 25, coins: 1250, trainingPoints: 4,
    attributes: { pace: 80, shooting: 75, passing: 60, defense: 40, stamina: 70, control: 72 },
    processedMatchIds: ['online-match-1']
  },
  career: { totals: { matches: 1 }, matches: [{ matchId: 'online-match-1', result: 'win' }] },
  playerCareer: { player: null, totals: { matches: 1 }, matches: [{ matchId: 'online-match-1', result: 'win' }] },
  seasonStats: {
    totals: { matches: 1, wins: 1, goals: 2 },
    matches: [{ matchId: 'online-match-1', result: 'win', goals: 2, role: 'FWD' }],
    processedMatchIds: ['online-match-1']
  },
  contract: { wallet: 600, clubId: 'club-9', contract: null, offers: [], history: [], loanOffers: [{ id: 'loan-1' }], loanHistory: [] }
});
test('adaptateurs P27 : utilisent les stores de production et restaurent leurs modèles normalisés', async () => {
  const storage = new MemoryStorage();
  const profileStore = new PlayerProfileStore(storage);
  const seasonStatsStore = new PlayerSeasonStats(storage);
  profileStore.save({ ...profileStore.profile, identity: { ...profileStore.profile.identity, displayName: 'Local Player' } });
  seasonStatsStore.recordMatch({ result: 'loss', matchId: 'local-match', stats: { goals: 0 } });
  const result = await restoreAccountSnapshot({
    preview: { ready: true, reason: 'EXPLICIT_RESTORE_CONFIRMATION_REQUIRED', revision, snapshot: makeSnapshot() },
    currentRevision: revision, confirmed: true,
    adapters: createAccountRecoveryAdapters({ profileStore, seasonStatsStore })
  });
  assert.equal(result.ok, true);
  assert.equal(profileStore.profile.identity.displayName, 'Cloud Player');
  assert.equal(profileStore.profile.progression.level, 7);
  assert.deepEqual(profileStore.profile.appliedMatchIds, ['online-match-1']);
  assert.equal(seasonStatsStore.totals.matches, 1);
  assert.equal(seasonStatsStore.totals.goals, 2);
  assert.equal(seasonStatsStore.matches[0].matchId, 'online-match-1');
  assert.equal(readAccountRecoveryArchives(storage).transferCareer.loanOffers[0].id, 'loan-1');
});
test('adaptateurs P27 : ne suppriment pas les autres clés locales', async () => {
  const storage = new MemoryStorage();
  storage.setItem('unrelated.game.preference', 'keep-me');
  const profileStore = new PlayerProfileStore(storage);
  const seasonStatsStore = new PlayerSeasonStats(storage);
  const result = await restoreAccountSnapshot({
    preview: { ready: true, reason: 'EXPLICIT_RESTORE_CONFIRMATION_REQUIRED', revision, snapshot: makeSnapshot() },
    currentRevision: revision, confirmed: true,
    adapters: createAccountRecoveryAdapters({ profileStore, seasonStatsStore })
  });
  assert.equal(result.ok, true);
  assert.equal(storage.getItem('unrelated.game.preference'), 'keep-me');
});
