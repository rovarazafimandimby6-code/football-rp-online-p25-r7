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
