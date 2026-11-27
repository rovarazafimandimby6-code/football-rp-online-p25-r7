import test from 'node:test';
import assert from 'node:assert/strict';
import { aiDecisionRoll } from '../src/ai.js';

test('P27 gameplay: tirages du joueur du système reproductibles à état égal', () => {
  const first = { id: 'system-17', aiDecisionSequence: 0 };
  const replay = { id: 'system-17', aiDecisionSequence: 0 };
  const sequenceA = ['shoot-trigger', 'shoot-delay', 'open-pass'].map(action => aiDecisionRoll(first, action));
  const sequenceB = ['shoot-trigger', 'shoot-delay', 'open-pass'].map(action => aiDecisionRoll(replay, action));
  assert.deepEqual(sequenceA, sequenceB);
  assert.equal(first.aiDecisionSequence, 3);
  assert.equal(replay.aiDecisionSequence, 3);
});

test('P27 gameplay: joueurs et actions distincts ne partagent pas le même tirage', () => {
  const a = { id: 'system-17' };
  const b = { id: 'system-18' };
  assert.notEqual(aiDecisionRoll(a, 'pass'), aiDecisionRoll(b, 'pass'));
  assert.notEqual(aiDecisionRoll({ id: 'system-17' }, 'pass'), aiDecisionRoll({ id: 'system-17' }, 'shoot'));
});

test('P27 gameplay: les tirages restent distribués sur une population de joueurs', () => {
  const values = Array.from({ length: 600 }, (_, i) => aiDecisionRoll({ id: `system-${i}` }, 'press'));
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.ok(average > 0.46 && average < 0.54, `moyenne anormale : ${average}`);
  assert.ok(values.every(value => value >= 0 && value < 1));
});

test('P27 gameplay: décisions de terrain sans Math.random non reproductible', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/ai.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\\.random\\(/);
  assert.match(source, /aiDecisionRoll\\(p, 'shoot-trigger'\\)/);
  assert.match(source, /aiDecisionRoll\\(p, 'pressed-pass'\\)/);
  assert.match(source, /aiDecisionRoll\\(p, 'tackle-trigger'\\)/);
});
