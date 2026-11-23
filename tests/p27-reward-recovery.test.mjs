import test from 'node:test';
import assert from 'node:assert/strict';
import { CareerManager } from '../src/career-manager.js';
import { PlayerProfileStore } from '../src/player-profile.js';

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

test('P27 récompenses : récupère XP et crédits si la carrière a été sauvegardée avant le profil', () => {
  const careerStorage = storage();
  const profileStorage = storage();
  const career = new CareerManager({ storage: careerStorage, storageKey: 'recovery-career', initialCoins: 100 });
  const profile = new PlayerProfileStore(profileStorage, 'recovery-profile');

  const first = career.recordMatch({ matchId: 'online-room-001', result: 'win', goals: 2, assists: 1 });
  assert.equal(profile.profile.progression.experience, 0);
  assert.equal(profile.profile.progression.coins, 250);

  // Simule une fermeture forcée après la sauvegarde carrière, avant la sauvegarde profil.
  const restoredCareer = new CareerManager({ storage: careerStorage, storageKey: 'recovery-career' });
  const restoredProfile = new PlayerProfileStore(profileStorage, 'recovery-profile');
  const retry = restoredCareer.recordMatch({ matchId: 'online-room-001', result: 'loss', goals: 99 });

  assert.equal(retry.duplicate, true);
  assert.equal(retry.recoverable, true);
  assert.equal(retry.experience, first.experience);
  assert.equal(retry.coins, first.coins);

  const applied = restoredProfile.grantMatchRewards({ ...retry, matchId: 'online-room-001' });
  assert.equal(applied.duplicate, false);
  assert.equal(restoredProfile.profile.progression.experience, first.experience);
  assert.equal(restoredProfile.profile.progression.coins, 250 + first.coins);

  const repeated = restoredProfile.grantMatchRewards({ ...retry, matchId: 'online-room-001' });
  assert.equal(repeated.duplicate, true);
  assert.equal(restoredProfile.profile.progression.experience, first.experience);
  assert.equal(restoredProfile.profile.progression.coins, 250 + first.coins);
});

test('P27 récompenses : le registre de profil survit au rechargement et bloque un second crédit', () => {
  const s = storage();
  const profile = new PlayerProfileStore(s, 'profile-reward-ledger');
  profile.grantMatchRewards({ matchId: 'local-match-002', experience: 75, coins: 20 });
  const restored = new PlayerProfileStore(s, 'profile-reward-ledger');
  const duplicate = restored.grantMatchRewards({ matchId: 'local-match-002', experience: 500, coins: 500 });
  assert.equal(duplicate.duplicate, true);
  assert.equal(restored.profile.progression.experience, 75);
  assert.equal(restored.profile.progression.coins, 270);
});
