import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchState } from '../src/match.js';

test('un match standard dure exactement 5 minutes maximum', () => {
  const match = new MatchState();
  assert.equal(match.halfDuration, 150);
  assert.equal(match.halfDuration * 2, 300);
  assert.equal(match.formatClock(), '00:00');
});

test('la première période réelle de 2 min 30 correspond à 45 minutes virtuelles', () => {
  const match = new MatchState();
  assert.equal(match.stepClock(149.5, 'blue'), null);
  assert.equal(match.formatClock(), '44:51');
  assert.equal(match.stepClock(0.5, 'red'), 'halftime');
  assert.equal(match.phase, 'halftime');
});

test('la seconde période se termine à 5 minutes cumulées', () => {
  const match = new MatchState();
  match.stepClock(150, 'blue');
  match.startSecondHalf();
  assert.equal(match.period, 2);
  assert.equal(match.timeLeft, 150);
  assert.equal(match.formatClock(), '45:00');
  assert.equal(match.stepClock(150, 'red'), 'fulltime');
  assert.equal(match.phase, 'fulltime');
});

test('les statistiques de possession restent bornées à 100 %', () => {
  const match = new MatchState();
  match.totalPossessionTime.blue = 30;
  match.totalPossessionTime.red = 20;
  const possession = match.getPossessionPercent();
  assert.equal(possession.blue + possession.red, 100);
  assert.equal(possession.blue, 60);
});

test('le chronomètre ignore les deltas invalides et comptabilise le temps écoulé', () => {
  const match = new MatchState();
  match.stepClock(Number.NaN, 'blue');
  assert.equal(match.timeLeft, 150);
  match.stepClock(5, 'blue');
  assert.equal(match.timeLeft, 145);
  assert.equal(match.elapsedMatchTime, 5);
  assert.equal(match.formatClock(), '01:30');
});

test('un but ne peut être enregistré que pendant le jeu et pour une équipe valide', () => {
  const match = new MatchState();
  assert.equal(match.recordGoal('green'), false);
  assert.equal(match.recordGoal('blue'), true);
  assert.equal(match.blueScore, 1);
  assert.equal(match.recordGoal('blue'), false);
  assert.equal(match.events.at(-1).type, 'goal');
});

test('le passage en seconde période est autorisé une seule fois après la mi-temps', () => {
  const match = new MatchState();
  assert.equal(match.startSecondHalf(), false);
  match.stepClock(150, null);
  assert.equal(match.phase, 'halftime');
  assert.equal(match.startSecondHalf(), true);
  assert.equal(match.startSecondHalf(), false);
  assert.equal(match.period, 2);
});

test('le journal de match conserve les événements les plus récents sans dépasser 80 entrées', () => {
  const match = new MatchState();
  for (let i = 0; i < 100; i++) match.recordEvent('test', 'blue', String(i));
  assert.equal(match.events.length, 80);
  assert.equal(match.events[0].detail, '20');
  assert.equal(match.events.at(-1).detail, '99');
});

test('le résultat final est indisponible avant le coup de sifflet final', () => {
  const match = new MatchState();
  assert.equal(match.getResult(), null);
  match.stepClock(150, null);
  match.startSecondHalf();
  match.stepClock(150, null);
  const result = match.getResult();
  assert.equal(result.winner, null);
  assert.equal(result.durationSeconds, 300);
});

test('le temps de jeu continue pendant une célébration pour respecter le plafond de 300 secondes', () => {
  const match = new MatchState();
  match.stepClock(149, 'blue');
  assert.equal(match.recordGoal('blue'), true);
  match.stepClock(1, 'blue');
  assert.equal(match.timeLeft, 0);
  assert.equal(match.phase, 'halftime');
  assert.equal(match.elapsedMatchTime, 150);
});

test('le chronomètre ne comptabilise pas de possession au-delà du temps réglementaire', () => {
  const match = new MatchState();
  match.stepClock(149.99, 'blue');
  match.stepClock(10, 'red');
  assert.equal(match.elapsedMatchTime, 150);
  assert.ok(Math.abs(match.totalPossessionTime.red - 0.01) < 1e-9);
  assert.equal(match.timeLeft, 0);
});


test('le format 3 minutes conserve deux mi-temps de 90 secondes et un affichage virtuel sur 90 minutes', () => {
  const match = new MatchState(3);
  assert.equal(match.halfDuration, 90);
  match.stepClock(90, 'blue');
  assert.equal(match.formatClock(), '45:00');
  match.startSecondHalf();
  match.stepClock(90, 'red');
  assert.equal(match.formatClock(), '90:00');
  assert.equal(match.getResult().durationSeconds, 180);
});

test('une durée choisie en cours de match est appliquée au match suivant', () => {
  const match = new MatchState();
  assert.equal(match.setDurationMinutes(3), 'current-match');
  assert.equal(match.halfDuration, 90);
  match.stepClock(1, 'blue');
  assert.equal(match.setDurationMinutes(5), 'next-match');
  assert.equal(match.durationMinutes, 3);
  match.reset();
  assert.equal(match.durationMinutes, 5);
  assert.equal(match.halfDuration, 150);
});
