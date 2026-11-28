import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePassOption, scorePassOptionWithRequest } from '../src/ai.js';

const player = (team, x, z, specialty = 'balanced') => ({ team, pos: { x, z }, specialty, attributes: { passing: 65, vision: 65, control: 65 } });

test('P27 appel de balle : une demande ne rend pas valide une passe entre équipes opposées', () => {
  const passer = player('blue', 0, 0);
  assert.equal(scorePassOption(passer, player('red', 5, 0), [], 1), -Infinity);
});

test('P27 appel de balle : une option de passe raisonnable reste évaluée par espace et ligne', () => {
  const passer = player('blue', 0, 0);
  const mate = player('blue', 8, 0, 'runner');
  const openLane = scorePassOption(passer, mate, [], 1);
  const blockedLane = scorePassOption(passer, mate, [{ pos: { x: 4, z: 0 } }], 1);
  assert.ok(Number.isFinite(openLane));
  assert.ok(blockedLane < openLane);
});

test('P27 appel de balle : un partenaire appelé reste soumis aux limites de distance et de possession', () => {
  const passer = player('blue', 0, 0);
  assert.equal(scorePassOption(passer, player('blue', 40, 0), [], 1), -Infinity);
  assert.equal(scorePassOption(passer, passer, [], 1), -Infinity);
});

test('P27 appel de balle : le joueur appelé est favorisé uniquement parmi les lignes déjà acceptables', () => {
  const passer = player('blue', 0, 0);
  const called = player('blue', 8, 0, 'runner');
  const other = player('blue', 6, 5);
  const baseCalled = scorePassOption(passer, called, [], 1);
  const baseOther = scorePassOption(passer, other, [], 1);
  assert.ok(scorePassOptionWithRequest(passer, called, [], 1, called) > baseCalled);
  assert.equal(scorePassOptionWithRequest(passer, other, [], 1, called), baseOther);
  const unsafeOpponents = [{ pos: { x: 4, z: 0 } }, { pos: { x: 5, z: 0.1 } }, { pos: { x: 6, z: -0.1 } }];
  const unsafeBase = scorePassOption(passer, called, unsafeOpponents, 1);
  assert.ok(unsafeBase <= -0.25);
  assert.equal(scorePassOptionWithRequest(passer, called, unsafeOpponents, 1, called), unsafeBase);
});