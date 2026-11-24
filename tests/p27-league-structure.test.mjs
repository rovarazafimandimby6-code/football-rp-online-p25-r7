import test from 'node:test';
import assert from 'node:assert/strict';
import { LEAGUE_DIVISIONS, CONFERENCE_NAMES, TOTAL_LEAGUE_CLUBS, normalizeDivision, normalizeConference } from '../src/league-structure.js';

test('P27 pyramide : cinq championnats totalisent 156 places', () => {
  assert.deepEqual(LEAGUE_DIVISIONS.map(item => [item.id, item.name, item.targetClubs]), [
    ['D1', 'Premier League', 16],
    ['D2', 'Ligue 2', 20],
    ['D3', 'National League', 24],
    ['D4', 'Regional League', 32],
    ['D5', 'Challenger League', 64]
  ]);
  assert.equal(TOTAL_LEAGUE_CLUBS, 156);
});

test('P27 conférences : noms français et effectifs cohérents', () => {
  assert.deepEqual(CONFERENCE_NAMES.D4, ['Nord', 'Sud']);
  assert.deepEqual(CONFERENCE_NAMES.D5, ['Nord', 'Sud', 'Est', 'Ouest']);
  assert.equal(CONFERENCE_NAMES.D4.length * 16, 32);
  assert.equal(CONFERENCE_NAMES.D5.length * 16, 64);
});

test('P27 migration : l’ancienne division amateur est reconnue comme Challenger League', () => {
  assert.equal(normalizeDivision('AMATEUR'), 'D5');
  assert.equal(normalizeConference('D5', 'Nord'), 'Nord');
  assert.equal(normalizeConference('D4', 'Est'), null);
});

test('P27 géographie : les conférences D4 suivent la région nord/sud des villes malgaches', async () => {
  const { conferenceForClub } = await import('../src/league-structure.js');
  assert.equal(conferenceForClub({ division: 'D4', city: 'Antsiranana' }), 'Nord');
  assert.equal(conferenceForClub({ division: 'D4', city: 'Antananarivo' }), 'Sud');
  assert.equal(conferenceForClub({ division: 'D4', city: 'Mahajanga' }), 'Nord');
  assert.equal(conferenceForClub({ division: 'D4', city: 'Fianarantsoa' }), 'Sud');
});

test('P27 géographie : les conférences D5 distinguent les quatre façades régionales', async () => {
  const { conferenceForClub } = await import('../src/league-structure.js');
  assert.equal(conferenceForClub({ division: 'D5', city: 'Antsiranana' }), 'Nord');
  assert.equal(conferenceForClub({ division: 'D5', city: 'Toamasina' }), 'Est');
  assert.equal(conferenceForClub({ division: 'D5', city: 'Toliara' }), 'Sud');
  assert.equal(conferenceForClub({ division: 'D5', city: 'Mahajanga' }), 'Ouest');
  assert.equal(conferenceForClub({ division: 'D5', city: 'Morondava' }), 'Ouest');
});

test('P27 géographie : une conférence explicite prévaut et les villes inconnues restent non classées', async () => {
  const { conferenceForClub } = await import('../src/league-structure.js');
  assert.equal(conferenceForClub({ division: 'D5', city: 'Toamasina', conference: 'Nord' }), 'Nord');
  assert.equal(conferenceForClub({ division: 'D5', city: 'Weston' }), null);
  assert.equal(conferenceForClub({ division: 'D4', city: 'Ville inconnue' }), null);
  assert.equal(conferenceForClub({ division: 'D3', city: 'Antsiranana' }), null);
});

import { DEFAULT_CLUBS } from '../src/club-manager.js';
import { auditClubCatalog } from '../src/club-catalog-validation.js';

test('P27 catalogue complet : 156 clubs uniques et répartition exacte par division', () => {
  const audit = auditClubCatalog(DEFAULT_CLUBS);
  assert.equal(DEFAULT_CLUBS.length, 156);
  assert.equal(audit.totalClubs, 156);
  assert.equal(audit.complete, true, JSON.stringify(audit.issues.slice(0, 20)));
  assert.deepEqual(audit.divisionCounts, { D1:16, D2:20, D3:24, D4:32, D5:64 });
  assert.deepEqual(audit.conferenceCounts.D4, { Nord:16, Sud:16 });
  assert.deepEqual(audit.conferenceCounts.D5, { Nord:16, Sud:16, Est:16, Ouest:16 });
});

test('P27 effectifs initiaux : les nouveaux clubs gardent des places pour les joueurs humains', () => {
  const expanded = DEFAULT_CLUBS.filter(club => club.id.startsWith('p27-'));
  assert.equal(expanded.length, 140);
  assert.ok(expanded.every(club => club.capacity === 12 && club.initialRosterSize >= 8 && club.initialRosterSize <= 12));
  assert.ok(expanded.some(club => club.initialRosterSize < 12));
});
