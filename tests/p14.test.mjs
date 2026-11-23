import test from 'node:test';
import assert from 'node:assert/strict';
import { CareerManager } from '../src/career-manager.js';
import { PlayerProfileStore } from '../src/player-profile.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('P14: contrat, portefeuille et offres sont persistés après rechargement', () => {
  const storage = memoryStorage();
  const career = new CareerManager({ storage, storageKey: 'p14-career' });
  assert.equal(career.signContract({ clubId: 'tana-fc', salary: 240, signedAt: '2026-11-22T00:00:00Z' }).ok, true);
  const offer = career.makeOffer({ fromClubId: 'toamasina', salary: 260, fee: 1200, expiresAt: '2026-12-10T00:00:00Z' });
  assert.equal(offer.ok, true);
  const restored = new CareerManager({ storage, storageKey: 'p14-career' });
  assert.equal(restored.clubId, 'tana-fc');
  assert.equal(restored.contract.salary, 240);
  assert.equal(restored.offers.get(offer.offer.id).fee, 1200);
});

test('P14: une offre peut être négociée puis transférée uniquement pendant une fenêtre', () => {
  const start = '2026-11-01T00:00:00Z';
  const end = '2026-12-01T00:00:00Z';
  const career = new CareerManager({ initialCoins: 2000, transferWindows: [{ start, end }] });
  career.signContract({ clubId: 'club-a', salary: 100, signedAt: '2026-10-01T00:00:00Z' });
  const offer = career.makeOffer({ fromClubId: 'club-b', salary: 140, fee: 500, expiresAt: '2026-11-30T00:00:00Z' });
  assert.equal(career.negotiate(offer.offer.id, { salary: 180, fee: 600 }, '2026-11-10T00:00:00Z').ok, true);
  const result = career.acceptOffer(offer.offer.id, '2026-11-15T00:00:00Z');
  assert.equal(result.ok, true);
  assert.equal(result.clubId, 'club-b');
  assert.equal(result.wallet, 1400);
  assert.equal(career.history.at(-1).type, 'transfer');
});

test('P14: transfert refusé hors fenêtre et si le budget est insuffisant', () => {
  const career = new CareerManager({ initialCoins: 10, transferWindows: [{ start: '2026-11-01', end: '2026-11-30' }] });
  career.signContract({ clubId: 'club-a', signedAt: '2026-10-01' });
  const offer = career.makeOffer({ fromClubId: 'club-b', fee: 100 });
  assert.equal(career.acceptOffer(offer.offer.id, '2026-12-02').reason, 'window-closed');
  const other = new CareerManager({ initialCoins: 10, transferWindows: [{ start: '2026-11-01', end: '2026-11-30' }] });
  other.signContract({ clubId: 'club-a', signedAt: '2026-10-01' });
  const expensive = other.makeOffer({ fromClubId: 'club-b', fee: 100 });
  assert.equal(other.acceptOffer(expensive.offer.id, '2026-11-10').reason, 'insufficient-funds');
});

test('P14: séance individuelle améliore une capacité contre des crédits et donne de l’expérience', () => {
  const storage = memoryStorage();
  const profile = new PlayerProfileStore(storage, 'p14-player');
  const before = profile.profile.progression.attributes.pace;
  const result = profile.practice('pace', 2);
  assert.equal(result.ok, true);
  assert.equal(profile.profile.progression.attributes.pace, before + 2);
  assert.equal(profile.profile.progression.coins, 90);
  assert.equal(profile.profile.progression.experience, 50);
  const restored = new PlayerProfileStore(storage, 'p14-player');
  assert.equal(restored.profile.progression.attributes.pace, before + 2);
});

test('P14: les écrans Mercato et entraînement sont connectés aux actions', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /page === 'mercato'/);
  assert.match(source, /data-action="generate-offers"/);
  assert.match(source, /data-action="accept-offer"/);
  assert.match(source, /data-action="practice-player"/);
});
