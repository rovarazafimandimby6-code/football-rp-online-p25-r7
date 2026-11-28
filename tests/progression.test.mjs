import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerProfileStore, validateProfile } from '../src/player-profile.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) };
}

test('profil: normalisation des champs et protection des valeurs hors limites', () => {
  const p = validateProfile({ identity: { displayName: '<script>alert(1)</script>', number: 999, role: 'HACK' }, progression: { coins: -50, attributes: { pace: 120 } } });
  assert.equal(p.identity.displayName.includes('<'), false);
  assert.equal(p.identity.number, 99);
  assert.equal(p.identity.role, 'MID');
  assert.equal(p.progression.coins, 0);
  assert.equal(p.progression.attributes.pace, 99);
});

test('profil: sauvegarde et rechargement local', () => {
  const storage = memoryStorage();
  const first = new PlayerProfileStore(storage);
  first.updateIdentity({ displayName: 'Rova', number: 7 });
  const second = new PlayerProfileStore(storage);
  assert.equal(second.profile.identity.displayName, 'Rova');
  assert.equal(second.profile.identity.number, 7);
});

test('progression: passage de niveau attribue points et monnaie', () => {
  const store = new PlayerProfileStore(memoryStorage());
  const before = store.profile.progression.coins;
  const result = store.addExperience(100);
  assert.equal(result.level, 2);
  assert.equal(result.trainingPoints, 2);
  assert.equal(result.coins, before + 50);
});

test('entraînement: dépense les ressources et respecte le plafond attribut', () => {
  const store = new PlayerProfileStore(memoryStorage());
  store.addExperience(100);
  const trained = store.train('pace', 1);
  assert.equal(trained.ok, true);
  assert.equal(store.profile.progression.attributes.pace, 56);
  assert.equal(store.train('unknown', 1).ok, false);
});

test('progression: niveau maximal ne stocke pas une expérience inutilisable', () => {
  const store = new PlayerProfileStore(memoryStorage());
  store.save({ ...store.profile, progression: { ...store.profile.progression, level: 99, experience: 5000 } });
  assert.equal(store.profile.progression.experience, 0);
  store.addExperience(10000);
  assert.equal(store.profile.progression.level, 99);
  assert.equal(store.profile.progression.experience, 0);
});


test('entraînement encadré : consomme les points de niveau et les crédits sans créer d’expérience', () => {
  const store = new PlayerProfileStore(memoryStorage());
  store.addExperience(100);
  const beforeXp = store.profile.progression.experience;
  const beforeCoins = store.profile.progression.coins;
  const result = store.train('passing', 2);
  assert.equal(result.ok, true);
  assert.equal(result.spentCoins, 80);
  assert.equal(store.profile.progression.trainingPoints, 0);
  assert.equal(store.profile.progression.attributes.passing, 52);
  assert.equal(store.profile.progression.experience, beforeXp);
  assert.equal(store.profile.progression.coins, beforeCoins - 80);
});

test('entraînement encadré : refuse une séance sans points ou crédits suffisants sans modifier le profil', () => {
  const store = new PlayerProfileStore(memoryStorage());
  const before = structuredClone(store.profile.progression);
  const result = store.train('defense', 1);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'insufficient-resources');
  assert.deepEqual(store.profile.progression, before);
});

test('entraînement encadré : refuse de dépasser le plafond de 99', () => {
  const store = new PlayerProfileStore(memoryStorage());
  store.addExperience(100);
  store.save({ ...store.profile, progression: { ...store.profile.progression, attributes: { ...store.profile.progression.attributes, stamina: 98 } } });
  const result = store.train('stamina', 2);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'attribute-cap');
  assert.equal(store.profile.progression.attributes.stamina, 98);
});
