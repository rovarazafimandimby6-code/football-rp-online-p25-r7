import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerProfileStore } from '../src/player-profile.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test('P15 : récompense de match créditée au profil et persistée', () => {
  const storage = memoryStorage();
  const profile = new PlayerProfileStore(storage, 'p15-profile');
  const beforeCoins = profile.profile.progression.coins;
  const beforeXp = profile.profile.progression.experience;
  profile.grantMatchRewards({ experience: 30, coins: 6 });
  assert.equal(profile.profile.progression.coins, beforeCoins + 6);
  assert.equal(profile.profile.progression.experience, beforeXp + 30);
  const restored = new PlayerProfileStore(storage, 'p15-profile');
  assert.equal(restored.profile.progression.coins, beforeCoins + 6);
  assert.equal(restored.profile.progression.experience, beforeXp + 30);
});

test('P15 : passage de niveau à partir des récompenses de match', () => {
  const profile = new PlayerProfileStore(memoryStorage(), 'p15-level');
  profile.profile.progression.experience = 90;
  profile.save();
  profile.grantMatchRewards({ experience: 20, coins: 5 });
  assert.equal(profile.profile.progression.level, 2);
  assert.equal(profile.profile.progression.experience, 10);
  assert.equal(profile.profile.progression.trainingPoints, 2);
});
