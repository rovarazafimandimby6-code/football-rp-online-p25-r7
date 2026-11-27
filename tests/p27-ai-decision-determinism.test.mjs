import test from 'node:test';
import assert from 'node:assert/strict';
import { aiDecisionRoll, buildTeamContexts, getSpacedSupportTarget } from '../src/ai.js';

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
  assert.equal(source.includes('Math.random('), false);
  assert.match(source, /aiDecisionRoll\(p, 'shoot-trigger'\)/);
  assert.match(source, /aiDecisionRoll\(p, 'pressed-pass'\)/);
  assert.match(source, /aiDecisionRoll\(p, 'tackle-trigger'\)/);
});

test('P27 gameplay: contexte tactique partagé sépare équipes et gardiens', () => {
  const blueGK = { id: 'b-gk', team: 'blue', role: 'GK' };
  const blueField = { id: 'b-field', team: 'blue', role: 'DEF' };
  const redGK = { id: 'r-gk', team: 'red', role: 'GK' };
  const redField = { id: 'r-field', team: 'red', role: 'FWD' };
  const contexts = buildTeamContexts([blueGK, blueField, redGK, redField]);
  assert.deepEqual(contexts.blue.players.map(p => p.id), ['b-gk', 'b-field']);
  assert.deepEqual(contexts.blue.teammates.map(p => p.id), ['b-field']);
  assert.deepEqual(contexts.blue.opponents.map(p => p.id), ['r-field']);
  assert.deepEqual(contexts.red.opponents.map(p => p.id), ['b-field']);
});

test('P27 gameplay: TeamAI prépare les contextes avant la boucle des joueurs', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/ai.js', import.meta.url), 'utf8');
  const updateStart = source.indexOf('  update(players, ball, dt, actions) {');
  const updateEnd = source.indexOf('  updateGoalkeeper(', updateStart);
  const update = source.slice(updateStart, updateEnd);
  assert.match(update, /const contexts = buildTeamContexts\(players\)/);
  assert.match(update, /contexts\[p\.team\]/);
  assert.doesNotMatch(update, /players\.filter\(/);
});


test('P27 gameplay: le soutien se décale des coéquipiers proches sans sortir du terrain', () => {
  const player = {
    id: 'support-a', team: 'blue', slotIndex: 1,
    pos: { x: 4, z: 2 }, homePos: { x: 2, z: 6 }
  };
  const mate = {
    id: 'support-b', team: 'blue',
    pos: { x: 4, z: 2 }, homePos: { x: 2, z: -6 }
  };
  const target = { x: 4, z: 2 };
  const spaced = getSpacedSupportTarget(player, target, [player, mate]);
  assert.ok(Math.hypot(spaced.x - target.x, spaced.z - target.z) > 0.5);
  assert.ok(spaced.x >= -26 && spaced.x <= 26);
  assert.ok(spaced.z >= -15 && spaced.z <= 15);
  assert.deepEqual(target, { x: 4, z: 2 });
});

test('P27 gameplay: le soutien conserve sa cible si les coéquipiers sont éloignés', () => {
  const player = {
    id: 'support-a', team: 'blue', pos: { x: 0, z: 0 },
    homePos: { x: 0, z: 5 }
  };
  const mate = { id: 'support-b', team: 'blue', pos: { x: -10, z: -10 } };
  assert.deepEqual(
    getSpacedSupportTarget(player, { x: 5, z: 5 }, [player, mate]),
    { x: 5, z: 5 }
  );
});
