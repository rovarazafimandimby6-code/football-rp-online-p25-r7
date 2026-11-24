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
  assert.ok(Math.abs(aim - facing) <= 0.40);
  assert.notEqual(aim, facing);
});

test('P27 IA moyenne : déplacement plus lent et légèrement imparfait, sans sprint', () => {
  const move = averageAiMovement(player, 4_000, 1, 0);
  assert.ok(Math.hypot(move.x, move.z) >= 0.69 && Math.hypot(move.x, move.z) <= 0.71);
  assert.ok(move.z !== 0, 'la trajectoire comporte une dérive visible mais limitée');
});

test('P27 IA moyenne : un bot standard n’est pas forcé d’utiliser le profil de remplacement', () => {
  const move = averageAiMovement({ id: 'ordinary' }, 0, 0, 0);
  assert.ok(Number.isFinite(move.x) && Number.isFinite(move.z));
});

test('P27 IA moyenne : le profil reste nettement sous la vitesse humaine normale', () => {
  const move = averageAiMovement(player, 9_000, 1, 0);
  assert.ok(Math.hypot(move.x, move.z) < 0.71);
  assert.ok(Math.hypot(move.x, move.z) > 0.69);
});

test('P27 IA moyenne : une visée peut être franchement imparfaite sans devenir aléatoire', () => {
  const facing = 0.4;
  const aim = averageAiAim(player, 9_000, facing, 'pass');
  assert.ok(Math.abs(aim - facing) <= 0.40);
  assert.ok(Number.isFinite(aim));
});

test('P27 IA moyenne : les probabilités produisent des hésitations régulières, pas une IA parfaite', () => {
  let acted = 0;
  const sampleSize = 500;
  for (let i = 0; i < sampleSize; i++) {
    if (averageAiShouldAct({ id: `sample-${i}` }, 12_000, 'tackle', 0.40)) acted++;
  }
  const rate = acted / sampleSize;
  assert.ok(rate > 0.32 && rate < 0.48, `taux observé inattendu : ${rate}`);
});
