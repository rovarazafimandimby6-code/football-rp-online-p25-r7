import test from 'node:test';
import assert from 'node:assert/strict';
import { CareerManager } from '../src/career-manager.js';
import { PlayerProfileStore } from '../src/player-profile.js';
import { PlayerSeasonStats } from '../src/player-season-stats.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    put: (key, value) => values.set(key, JSON.stringify(value))
  };
}

test('P27 identifiants de match : les identifiants trop longs sont rejetés sans troncature', () => {
  const longId = 'm'.repeat(64) + 'A';
  const profile = new PlayerProfileStore(memoryStorage(), 'profile-ids');
  const career = new CareerManager({ storage: memoryStorage(), storageKey: 'career-ids' });
  const season = new PlayerSeasonStats(memoryStorage(), 'season-ids');

  assert.deepEqual(profile.grantMatchRewards({ matchId: longId, experience: 100, coins: 20 }).reason, 'invalid-match-id');
  assert.deepEqual(career.recordMatch({ matchId: longId, result: 'win' }).reason, 'invalid-match-id');
  assert.deepEqual(season.recordMatch({ matchId: longId, result: 'win' }).reason, 'invalid-match-id');
  assert.equal(profile.profile.appliedMatchIds.length, 0);
  assert.equal(career.processedMatchIds.length, 0);
  assert.equal(season.processedMatchIds.length, 0);
});

test('P27 identifiants de match : deux identifiants valides de 64 caractères restent distincts', () => {
  const storage = memoryStorage();
  const firstId = 'm'.repeat(63) + 'A';
  const secondId = 'm'.repeat(63) + 'B';
  const profile = new PlayerProfileStore(storage, 'profile-distinct-ids');
  const career = new CareerManager({ storage, storageKey: 'career-distinct-ids' });
  const season = new PlayerSeasonStats(storage, 'season-distinct-ids');

  assert.equal(profile.grantMatchRewards({ matchId: firstId, experience: 10, coins: 1 }).duplicate, false);
  assert.equal(profile.grantMatchRewards({ matchId: secondId, experience: 20, coins: 2 }).duplicate, false);
  assert.equal(profile.profile.appliedMatchIds.length, 2);

  assert.equal(career.recordMatch({ matchId: firstId, result: 'win' }).duplicate, undefined);
  assert.equal(career.recordMatch({ matchId: secondId, result: 'draw' }).duplicate, undefined);
  assert.equal(career.processedMatchIds.length, 2);

  assert.equal(season.recordMatch({ matchId: firstId, result: 'win' }).ok, true);
  assert.equal(season.recordMatch({ matchId: secondId, result: 'draw' }).ok, true);
  assert.equal(season.processedMatchIds.length, 2);
});

test('P27 identifiants de match : la restauration filtre les identifiants invalides sans alias', () => {
  const storage = memoryStorage();
  const longId = 'x'.repeat(65);
  storage.put('profile-restore-ids', {
    schemaVersion: 1,
    identity: { displayName: 'Test', number: 10, preferredFoot: 'right', role: 'MID' },
    appearance: { kit: 'emerald' },
    progression: { level: 1, experience: 0, coins: 250, trainingPoints: 0, attributes: {} },
    appliedMatchIds: [longId, 'valid-match-01']
  });
  storage.put('career-restore-ids', {
    wallet: 500, contract: null, offers: [], history: [],
    matchRewards: [{ matchId: longId, experience: 100, coins: 20 }, { matchId: 'valid-match-01', experience: 10, coins: 2 }],
    processedMatchIds: [longId, 'valid-match-01'], nextOfferNumber: 1
  });
  storage.put('season-restore-ids', {
    totals: {}, matches: [], processedMatchIds: [longId, 'valid-match-01']
  });

  const profile = new PlayerProfileStore(storage, 'profile-restore-ids');
  const career = new CareerManager({ storage, storageKey: 'career-restore-ids' });
  const season = new PlayerSeasonStats(storage, 'season-restore-ids');
  assert.deepEqual(profile.profile.appliedMatchIds, ['valid-match-01']);
  assert.deepEqual(career.processedMatchIds, ['valid-match-01']);
  assert.deepEqual(career.matchRewards.map(item => item.matchId), ['valid-match-01']);
  assert.deepEqual(season.processedMatchIds, ['valid-match-01']);
});
