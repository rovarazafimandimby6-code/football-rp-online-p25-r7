import test from 'node:test';
import assert from 'node:assert/strict';
import { ClubManager } from '../src/club-manager.js';
import { RARE_NATIONALITY_CODES, SUPPORTED_NATIONALITIES } from '../src/club-roster.js';

test('P27 nationalités : diversité mondiale et proportion malgache proche de 30%', () => {
  const clubs = new ClubManager().listClubs();
  const players = clubs.flatMap(club => club.roster);
  const counts = new Map();
  for (const player of players) counts.set(player.nationality, (counts.get(player.nationality) || 0) + 1);
  const malagasyShare = (counts.get('MG') || 0) / players.length;
  assert.ok(malagasyShare >= 0.27 && malagasyShare <= 0.33, `part malgache observée: ${(malagasyShare * 100).toFixed(1)}%`);
  assert.ok(SUPPORTED_NATIONALITIES.length >= 40, 'le générateur doit couvrir au moins 40 nationalités');
  assert.ok((counts.get('FR') || 0) > 7);
  assert.ok((counts.get('BR') || 0) > 7);
  assert.ok((counts.get('AR') || 0) > 7);
  for (const code of RARE_NATIONALITY_CODES) {
    assert.ok((counts.get(code) || 0) < 3, `${code} doit rester rare (moins de 3 joueurs)`);
  }
});

test('P27 nationalités : les noms des joueurs restent uniques à travers le catalogue', () => {
  const players = new ClubManager().listClubs().flatMap(club => club.roster);
  const names = players.map(player => player.name.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase());
  assert.equal(new Set(names).size, names.length);
});
