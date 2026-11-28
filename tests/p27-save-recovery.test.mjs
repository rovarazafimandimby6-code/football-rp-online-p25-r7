import test from 'node:test';
import assert from 'node:assert/strict';
import { CareerManager } from '../src/career-manager.js';
import { PlayerProfileStore } from '../src/player-profile.js';
import { PlayerSeasonStats } from '../src/player-season-stats.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), corrupt: key => values.set(key, '{broken-json') };
}

test('P27 sauvegarde : le profil restaure le dernier instantané valide après corruption', () => {
  const storage = memoryStorage(), first = new PlayerProfileStore(storage, 'p27-profile');
  first.updateIdentity({ displayName: 'Joueur stable' }); first.updateIdentity({ displayName: 'Snapshot récent' });
  storage.corrupt('p27-profile');
  const restored = new PlayerProfileStore(storage, 'p27-profile');
  assert.equal(restored.profile.identity.displayName, 'Joueur stable');
  assert.equal(JSON.parse(storage.getItem('p27-profile')).identity.displayName, 'Joueur stable');
});

test('P27 sauvegarde : la carrière restaure contrat, portefeuille et historique cohérents', () => {
  const storage = memoryStorage(), first = new CareerManager({ storage, storageKey: 'p27-career', initialCoins: 900 });
  first.signContract({ clubId: 'club-mg', salary: 45, durationDays: 365, signedAt: '2026-01-01T00:00:00Z' });
  first.recordMatch({ result: 'win', goals: 1 }); storage.corrupt('p27-career');
  const restored = new CareerManager({ storage, storageKey: 'p27-career' });
  assert.equal(restored.clubId, 'club-mg'); assert.equal(restored.wallet, 900);
  assert.equal(restored.history.length, 1); assert.equal(restored.history[0].type, 'signing');
});

test('P27 sauvegarde : les statistiques de saison récupèrent leur dernier état complet', () => {
  const storage = memoryStorage(), first = new PlayerSeasonStats(storage, 'p27-season');
  first.recordMatch({ result: 'win', stats: { goals: 1 } }); first.recordMatch({ result: 'draw', stats: { assists: 1 } });
  storage.corrupt('p27-season');
  const restored = new PlayerSeasonStats(storage, 'p27-season'), snapshot = restored.snapshot();
  assert.equal(snapshot.totals.matches, 1); assert.equal(snapshot.totals.goals, 1);
  assert.equal(snapshot.totals.draws, 0); assert.equal(snapshot.matches.length, 1);
});

test('P27 sauvegarde : un primaire valide en JSON mais de mauvais schéma restaure la sauvegarde', () => {
  const storage = memoryStorage(), first = new PlayerProfileStore(storage, 'p27-schema');
  first.updateIdentity({ displayName: 'Profil récupérable' }); first.updateIdentity({ displayName: 'Profil suivant' });
  storage.setItem('p27-schema', JSON.stringify({ unexpected: true }));
  const restored = new PlayerProfileStore(storage, 'p27-schema');
  assert.equal(restored.profile.identity.displayName, 'Profil récupérable');
});
