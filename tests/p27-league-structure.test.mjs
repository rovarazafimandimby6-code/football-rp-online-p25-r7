import test from 'node:test';
import assert from 'node:assert/strict';
import { LEAGUE_DIVISIONS, CONFERENCE_NAMES, TOTAL_LEAGUE_CLUBS, normalizeDivision, normalizeConference } from '../src/league-structure.js';

test('P27 pyramide : cinq championnats totalisent 156 places', () => {
  assert.deepEqual(LEAGUE_DIVISIONS.map(item => [item.id, item.name, item.targetClubs]), [
    ['D1', 'Premier League', 16],
    ['D2', 'Ligue 2', 20],
    ['D3', 'National League', 24],
    ['D4', 'Challenger League', 32],
    ['D5', 'Regional League', 64]
  ]);
  assert.equal(TOTAL_LEAGUE_CLUBS, 156);
});

test('P27 conférences : noms français et effectifs cohérents', () => {
  assert.deepEqual(CONFERENCE_NAMES.D4, ['A', 'B']);
  assert.deepEqual(CONFERENCE_NAMES.D5, ['A', 'B', 'C', 'D']);
  assert.equal(CONFERENCE_NAMES.D4.length * 16, 32);
  assert.equal(CONFERENCE_NAMES.D5.length * 16, 64);
});

test('P27 migration : l’ancienne division amateur est reconnue comme Regional League', () => {
  assert.equal(normalizeDivision('AMATEUR'), 'D5');
  assert.equal(normalizeConference('D5', 'A'), 'A');
  assert.equal(normalizeConference('D4', 'C'), null);
});

test('P27 conférences D4 : affectations explicites indépendantes des villes', async () => {
  const { conferenceForClub } = await import('../src/league-structure.js');
  assert.equal(conferenceForClub({ division: 'D4', city: 'Antsiranana', conference:'A' }), 'A');
  assert.equal(conferenceForClub({ division: 'D4', city: 'Antananarivo', conference:'B' }), 'B');
  assert.equal(conferenceForClub({ division: 'D4', city: 'Mahajanga' }), null);
  assert.equal(conferenceForClub({ division: 'D4', city: 'Fianarantsoa' }), null);
});

test('P27 conférences D5 : quatre groupes explicitement affectés', async () => {
  const { conferenceForClub } = await import('../src/league-structure.js');
  assert.equal(conferenceForClub({ division: 'D5', city: 'Antsiranana', conference:'A' }), 'A');
  assert.equal(conferenceForClub({ division: 'D5', city: 'Toamasina', conference:'B' }), 'B');
  assert.equal(conferenceForClub({ division: 'D5', city: 'Toliara', conference:'C' }), 'C');
  assert.equal(conferenceForClub({ division: 'D5', city: 'Mahajanga', conference:'D' }), 'D');
  assert.equal(conferenceForClub({ division: 'D5', city: 'Morondava' }), null);
});

test('P27 conférences : seule une affectation explicite est utilisée', async () => {
  const { conferenceForClub } = await import('../src/league-structure.js');
  assert.equal(conferenceForClub({ division: 'D5', city: 'Toamasina', conference: 'A' }), 'A');
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
  assert.deepEqual(audit.conferenceCounts.D4, { A:16, B:16 });
  assert.deepEqual(audit.conferenceCounts.D5, { A:16, B:16, C:16, D:16 });
});

test('P27 effectifs initiaux : les nouveaux clubs gardent des places pour les joueurs humains', () => {
  const expanded = DEFAULT_CLUBS.filter(club => club.id.startsWith('p27-'));
  assert.equal(expanded.length, 140);
  assert.ok(expanded.every(club => club.capacity === 12 && club.initialRosterSize >= 8 && club.initialRosterSize <= 12));
  assert.ok(expanded.some(club => club.initialRosterSize < 12));
});
