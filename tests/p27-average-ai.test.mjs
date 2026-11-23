import test from 'node:test';
import assert from 'node:assert/strict';
import { averageAiShouldAct, averageAiAim, averageAiMovement } from '../src/average-ai.js';

const player = { id: 'human-avatar-1' };

test('P27 IA moyenne : les décisions sont stables pour un joueur et une fenêtre donnée', () => {
  assert.equal(averageAiShouldAct(player, 4_000, 'pass', 0.5), averageAiShouldAct(player, 4_000, 'pass', 0.5));
  assert.notEqual(averageAiShouldAct(player, 4_000, 'pass', 0), true);
  assert.equal(averageAiShouldAct(player, 4_000, 'pass', 1), true);
});

test('P27 IA moyenne : les passes et tirs ont une marge d’imprécision bornée', () => {
  const facing = 1.2;
  const aim = averageAiAim(player, 4_000, facing, 'shoot');
  assert.ok(Math.abs(aim - facing) <= 0.23);
  assert.notEqual(aim, facing);
});

test('P27 IA moyenne : déplacement plus lent et légèrement imparfait, sans sprint', () => {
  const move = averageAiMovement(player, 4_000, 1, 0);
  assert.ok(Math.hypot(move.x, move.z) >= 0.75 && Math.hypot(move.x, move.z) <= 0.77);
  assert.ok(move.z !== 0, 'la trajectoire comporte une petite dérive');
});

test('P27 IA moyenne : un bot standard n’est pas forcé d’utiliser le profil de remplacement', () => {
  const move = averageAiMovement({ id: 'ordinary' }, 0, 0, 0);
  assert.ok(Number.isFinite(move.x) && Number.isFinite(move.z));
});
