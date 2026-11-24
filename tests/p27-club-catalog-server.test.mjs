import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CLUBS } from '../src/club-manager.js';
import { resolveMatchClub } from '../server/club-catalog.js';

test('P27 catalogue serveur : les 156 clubs sont résolus avec leur division et leur localisation canonique', () => {
  assert.equal(DEFAULT_CLUBS.length, 156);
  for (const club of DEFAULT_CLUBS) {
    const resolved = resolveMatchClub(club.id);
    assert.equal(resolved.id, club.id);
    assert.equal(resolved.division, club.division);
    assert.ok(resolved.location.city);
    assert.ok(resolved.location.country);
    assert.match(resolved.location.countryCode, /^[A-Z]{2}$/);
    if (club.division === 'D4' || club.division === 'D5') assert.ok(resolved.conference);
    else assert.equal(resolved.conference, null);
  }
});

test('P27 localisation serveur : le pays de la ville ne se confond pas avec le profil de recrutement', () => {
  const club = resolveMatchClub('manparis-sporting');
  assert.equal(club.city, 'Manchester / Paris');
  assert.equal(club.countryCode, 'FR');
  assert.deepEqual(club.location, { city:'Manchester', country:'Royaume-Uni', countryCode:'GB' });
  assert.equal(Object.isFrozen(club.location), true);
});

test('P27 identité serveur : les métadonnées sportives et visuelles sont exposées sans mutation', () => {
  const club = resolveMatchClub('antsiranana-north-fc');
  assert.equal(club.division, 'D5');
  assert.equal(club.conference, 'Nord');
  assert.ok(club.kitDesign);
  assert.ok(club.reputation >= 1 && club.reputation <= 100);
  assert.equal(Object.isFrozen(club), true);
  assert.equal(Object.isFrozen(club.colors), true);
  assert.throws(() => resolveMatchClub('unknown-club'), /INVALID_CLUB/);
});

test('P27 catalogue serveur : les affectations de saison actualisent les divisions dans les équipes de match', () => {
  const club=DEFAULT_CLUBS.find(item=>item.id==='antsiranana-north-fc');
  const updated={...club,division:'D4',conference:'Nord'};
  const resolved=resolveMatchClub(club.id,new Map([[club.id,updated]]));
  assert.equal(resolved.division,'D4');
  assert.equal(resolved.conference,'Nord');
  assert.equal(resolved.name,club.name);
  assert.equal(resolved.roster.length,resolveMatchClub(club.id).roster.length);
});
