import test from 'node:test';
import assert from 'node:assert/strict';
import { generateClubRoster } from '../src/club-roster.js';
import { applyDls26Reference, DLS26_ATTRIBUTE_KEYS, DLS26_GOALKEEPER_ATTRIBUTE_KEYS, DLS26_REFERENCE_PROFILES, findDls26Reference } from '../src/p27-dls26-reference.js';

test('P27 DLS 26 : catalogue de références normal cards couvrant les quatre rôles', () => {
  assert.equal(DLS26_REFERENCE_PROFILES.length, 21);
  for (const role of ['GK','DEF','MID','FWD']) {
    assert.ok(findDls26Reference(role, 'profil-test', () => 0), `aucun profil DLS 26 pour ${role}`);
  }
  assert.ok(DLS26_REFERENCE_PROFILES.every(profile => profile.cardType === 'normal' && profile.version === '13.430' && profile.verification === 'individual-player-card'));
  assert.equal(new Set(DLS26_REFERENCE_PROFILES.map(profile => profile.id)).size, DLS26_REFERENCE_PROFILES.length);
  assert.ok(DLS26_REFERENCE_PROFILES.every(profile => profile.heightCm >= 160 && profile.heightCm <= 205));
  assert.ok(DLS26_REFERENCE_PROFILES.every(profile => profile.source.startsWith('https://')));
  for (const profile of DLS26_REFERENCE_PROFILES) {
    const expectedKeys = profile.position === 'GK' ? DLS26_GOALKEEPER_ATTRIBUTE_KEYS : DLS26_ATTRIBUTE_KEYS;
    assert.deepEqual(Object.keys(profile.stats), [...expectedKeys], `statistiques incomplètes pour ${profile.id}`);
  }
});

test('P27 DLS 26 : adaptation conserve la forme statistique, la taille et les limites', () => {
  const profile = DLS26_REFERENCE_PROFILES.find(item => item.id === 'forward-pace-86');
  const adapted = applyDls26Reference(profile, { targetOverall: 70, random: () => 0.5 });
  assert.equal(adapted.stats.SPE, 82);
  assert.equal(adapted.stats.SHO, 83);
  assert.ok(adapted.heightCm >= 176 && adapted.heightCm <= 180);
  assert.equal(adapted.reference.profileId, profile.id);
  assert.ok(Object.values(adapted.stats).every(value => value >= 20 && value <= 99));
  assert.equal(DLS26_ATTRIBUTE_KEYS.length, 8);
  assert.equal(DLS26_GOALKEEPER_ATTRIBUTE_KEYS.length, 8);
});

test('P27 DLS 26 : les gardiens utilisent leurs deux statistiques spécifiques', () => {
  const profile = findDls26Reference('GK', 'Gardien réflexe', () => 0);
  const adapted = applyDls26Reference(profile, { targetOverall: 70, random: () => 0.5 });
  assert.ok(Object.hasOwn(adapted.stats, 'GKR'));
  assert.ok(Object.hasOwn(adapted.stats, 'GKH'));
  assert.ok(!Object.hasOwn(adapted.stats, 'SHO'));
});

test('P27 DLS 26 : les joueurs fictifs reçoivent une référence sans identité réelle', () => {
  const roster = generateClubRoster({
    id: 'dls26-reference-integration',
    division: 'D1',
    countryCode: 'MG',
    rating: 75,
    colors: ['#123456', '#234567', '#345678']
  }, { size: 12 });
  assert.equal(roster.length, 12);
  for (const player of roster) {
    assert.ok(player.dls26Stats && player.dls26Reference);
    assert.ok(player.heightCm >= 150 && player.heightCm <= 210);
    assert.ok(player.attributes && Object.hasOwn(player.attributes, 'pace'), 'les attributs historiques restent disponibles');
    assert.equal(player.attributes.shooting, player.dls26Stats.SHO ?? 25, 'le gameplay utilise le tir de la carte DLS');
    assert.equal(player.attributes.passing, player.dls26Stats.PAS ?? 25, 'le gameplay utilise la passe de la carte DLS');
    assert.ok(player.dls26Reference.baseOverall >= 75 && player.dls26Reference.baseOverall <= 86);
    assert.equal(player.dls26Reference.verification, 'individual-player-card');
    assert.ok(!/mbapp[eé]|hakimi|bruno fernandes|donnarumma|gabriel magalh[aã]es/i.test(player.name));
    assert.equal(player.dls26Reference.cardType, 'normal');
  }
});


test('P27 DLS 26 : les profils ajoutés correspondent aux cartes normales vérifiées', () => {
  const byId = new Map(DLS26_REFERENCE_PROFILES.map(profile => [profile.id, profile]));
  assert.equal(byId.get('forward-complete-86').stats.SHO, 96);
  assert.equal(byId.get('forward-wing-84').stats.PAS, 88);
  assert.equal(byId.get('midfielder-box-to-box-84').stats.STA, 89);
  assert.equal(byId.get('midfielder-playmaker-83').stats.PAS, 93);
  assert.equal(byId.get('defender-centre-84b').stats.TAC, 93);
  assert.equal(byId.get('goalkeeper-balanced-84').stats.GKR, 82);
  assert.equal(byId.get('goalkeeper-tall-84').heightCm, 200);
  assert.equal(byId.get('forward-finisher-84').heightCm, 174);
  assert.equal(byId.get('forward-finisher-84').stats.SPE, 77);
  assert.equal(byId.get('midfielder-controller-85').stats.SPE, 74);
  assert.equal(byId.get('midfielder-playmaker-83').stats.PAS, 92);
});
