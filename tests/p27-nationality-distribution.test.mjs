import test from 'node:test';
import assert from 'node:assert/strict';
import { ClubManager } from '../src/club-manager.js';
import { generateClubRoster, NATIONALITY_GENERATION_WEIGHTS, RARE_NATIONALITY_CODES, SUPPORTED_NATIONALITIES } from '../src/club-roster.js';

test('P27 nationalités : diversité mondiale et proportion malgache proche de 30%', () => {
  const clubs = new ClubManager().listClubs();
  const players = clubs.flatMap(club => club.roster);
  const counts = new Map();
  for (const player of players) counts.set(player.nationality, (counts.get(player.nationality) || 0) + 1);
  const malagasyShare = (counts.get('MG') || 0) / players.length;
  assert.ok(malagasyShare >= 0.27 && malagasyShare <= 0.33, `part malgache observée: ${(malagasyShare * 100).toFixed(1)}%`);
  assert.ok(SUPPORTED_NATIONALITIES.length >= 40, 'le générateur doit couvrir au moins 40 nationalités');
  assert.ok(SUPPORTED_NATIONALITIES.every(code => /^[A-Z]{2}$/.test(code)), 'toutes les nationalités doivent utiliser un code pays ISO alpha-2 valide');
  assert.ok(SUPPORTED_NATIONALITIES.filter(code => code !== 'MG').every(code => Object.hasOwn(NATIONALITY_GENERATION_WEIGHTS, code)), 'chaque nationalité internationale doit avoir un poids de génération');
  assert.ok((counts.get('FR') || 0) > 7);
  assert.ok((counts.get('BR') || 0) > 7);
  assert.ok((counts.get('AR') || 0) > 7);
  for (const code of RARE_NATIONALITY_CODES) {
    assert.ok((counts.get(code) || 0) < 3, `${code} doit rester rare (moins de 3 joueurs)`);
  }
});


test('P27 nationalités : le plafond des pays rares est respecté dans un recrutement continental', () => {
  const nationalityCounts = new Map([['IS', 1], ['LU', 1]]);
  const recruitmentCodes = ['IS', 'LU', 'FR'];
  const roster = generateClubRoster({
    id: 'continent-rarity-audit',
    division: 'D5',
    countryCode: 'FR',
    rating: 49,
    colors: ['#123456', '#234567', '#345678'],
    recruitmentProfile: { mode: 'continent', nationalityCodes: recruitmentCodes }
  }, { size: 12, nationalityCounts });

  assert.ok(roster.every(player => recruitmentCodes.includes(player.nationality)));
  assert.ok((nationalityCounts.get('IS') || 0) <= 2, 'IS ne doit jamais dépasser deux joueurs');
  assert.ok((nationalityCounts.get('LU') || 0) <= 2, 'LU ne doit jamais dépasser deux joueurs');
});

test('P27 nationalités : chaque effectif contient des noms distincts et des codes pris en charge', () => {
  const clubs = new ClubManager().listClubs();
  const players = clubs.flatMap(club => club.roster);
  for (const club of clubs) {
    const names = club.roster.map(player => player.name.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase());
    assert.equal(new Set(names).size, names.length, `noms dupliqués dans ${club.id}`);
    assert.ok(club.roster.every(player => SUPPORTED_NATIONALITIES.includes(player.nationality)));
  }
});
