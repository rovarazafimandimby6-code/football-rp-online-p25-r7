import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROTATION_RULES_V1,
  validateMatchSheet,
  validateRotation,
  applyRotation,
} from '../src/rotation-rules.js';
import { toVirtualMatchSeconds } from '../src/match.js';

const squad = (team = 'blue') => ({
  starters: Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, team, slotIndex: i })),
  substitutes: Array.from({ length: 3 }, (_, i) => ({ id: `b${i}`, team })),
});

test('P27 rotation V1 : feuille 5v5 avec 2 à 5 remplaçants', () => {
  assert.equal(validateMatchSheet(squad()).ok, true);
  assert.equal(validateMatchSheet({ starters: squad().starters, substitutes: squad().substitutes.slice(0,2) }).code, 'invalid-substitutes-count');
  assert.equal(validateMatchSheet({ starters: squad().starters, substitutes: Array.from({ length: 8 }, (_, i) => ({ id: `b${i}` })) }).code, 'invalid-substitutes-count');
  assert.equal(ROTATION_RULES_V1.playersOnPitchPerTeam, 5);
  assert.equal(ROTATION_RULES_V1.minimumSubstitutesPerTeam, 3);
  assert.equal(ROTATION_RULES_V1.maximumSubstitutesPerTeam, 7);
  assert.equal(validateMatchSheet({starters:squad().starters,substitutes:Array.from({length:7},(_,i)=>({id:`seven-${i}`}))}).ok,true);
});

test('P27 rotation V1 : refuse les doublons et les joueurs sans identifiant', () => {
  const valid = squad();
  assert.equal(validateMatchSheet({ starters: valid.starters, substitutes: [{ id: 's0' }, ...valid.substitutes.slice(1)] }).code, 'duplicate-player');
  assert.equal(validateMatchSheet({ starters: valid.starters, substitutes: [{}, ...valid.substitutes.slice(1)] }).code, 'invalid-player');
});

test('P27 rotation V1 : un remplaçant qui n’a jamais joué peut entrer dès le début', () => {
  const result = validateRotation({
    phase: 'halftime',
    elapsedMatchSeconds: 0,
    outgoing: { id: 'starter', team: 'blue' },
    incoming: { id: 'reserve', team: 'blue', lastSubstitutedOutAt: null },
  });
  assert.equal(result.ok, true);
});

test('P27 rotation V1 : changements illimités aux arrêts de jeu, sans contrainte de poste', () => {
  const outgoing = { id: 's1', team: 'blue', role: 'DEF' };
  const incoming = { id: 'b1', team: 'blue', role: 'FWD' };
  assert.equal(validateRotation({ phase: 'stoppage', elapsedMatchSeconds: 1200, outgoing, incoming }).ok, true);
  assert.equal(validateRotation({ phase: 'playing', elapsedMatchSeconds: 1200, outgoing, incoming }).code, 'not-a-stoppage');
});

test('P27 rotation V1 : un joueur sorti attend 10 minutes de temps de match avant de revenir', () => {
  const outgoing = { id: 's1', team: 'blue' };
  const returning = { id: 'b1', team: 'blue', lastSubstitutedOutAt: 1200 };
  assert.equal(validateRotation({ phase: 'stoppage', elapsedMatchSeconds: 1799, outgoing, incoming: returning }).code, 'return-cooldown');
  assert.equal(validateRotation({ phase: 'stoppage', elapsedMatchSeconds: 1800, outgoing, incoming: returning }).ok, true);
});

test('P27 rotation V1 : interdit un échange entre équipes et un joueur absent de la feuille', () => {
  assert.equal(validateRotation({ phase: 'stoppage', elapsedMatchSeconds: 1000, outgoing: { id: 'a', team: 'blue' }, incoming: { id: 'b', team: 'red' } }).code, 'different-teams');
  const players = [{ id: 'a', team: 'blue' }, { id: 'b', team: 'blue' }];
  assert.equal(validateRotation({ phase: 'stoppage', elapsedMatchSeconds: 1000, outgoing: players[0], incoming: { id: 'outside', team: 'blue' }, teamPlayers: players }).code, 'player-not-in-match-sheet');
});

test('P27 rotation V1 : échange les joueurs sans quota et conserve le poste tactique du sortant', () => {
  const { starters, substitutes } = squad();
  const result = applyRotation({ starters, substitutes, outgoingId: 's2', incomingId: 'b0', elapsedMatchSeconds: 2400 });
  assert.equal(result.ok, true);
  assert.equal(result.starters[2].id, 'b0');
  assert.equal(result.starters[2].slotIndex, 2);
  assert.equal(result.substitutes[0].id, 's2');
  assert.equal(result.substitutes[0].lastSubstitutedOutAt, 2400);
  assert.equal(result.substitutionsUsed, null);
});


test('P27 rotations : le délai de retour de dix minutes suit l’horloge virtuelle 90 minutes en match de 3 ou 5 minutes', () => {
  const tenVirtualMinutes = 10 * 60;
  const realSecondsForFiveMinuteMatch = (tenVirtualMinutes / (90 * 60)) * (5 * 60);
  const realSecondsForThreeMinuteMatch = (tenVirtualMinutes / (90 * 60)) * (3 * 60);
  assert.ok(Math.abs(toVirtualMatchSeconds(realSecondsForFiveMinuteMatch, 150) - tenVirtualMinutes) < 1e-9);
  assert.ok(Math.abs(toVirtualMatchSeconds(realSecondsForThreeMinuteMatch, 90) - tenVirtualMinutes) < 1e-9);
  assert.equal(toVirtualMatchSeconds(300, 150), 90 * 60);
});
