import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePassOption, TeamAI, createTeamRoster } from '../src/ai.js';

const player = (id, team, x, z, specialty = 'balanced') => ({
  id, team, role: 'FWD', specialty,
  pos: { x, y: 0, z }, vel: { x: 0, z: 0 }, homePos: { x, z },
  stamina: 1, actionCooldown: 0, tackleTimer: 0, decisionTimer: 10,
  facing: Math.PI / 2, isControlled: false
});

test('P10.1: une passe en avant et vers un partenaire démarqué est valorisée', () => {
  const passer = player('p', 'blue', 0, 0);
  const forward = player('f', 'blue', 9, 2, 'runner');
  const backward = player('b', 'blue', -7, 0);
  const opponents = [player('o', 'red', 7, -8)];
  assert.ok(scorePassOption(passer, forward, opponents, 1) > scorePassOption(passer, backward, opponents, 1));
});

test('P10.1: une ligne de passe interceptable est pénalisée', () => {
  const passer = player('p', 'blue', 0, 0);
  const receiver = player('r', 'blue', 12, 0, 'finisher');
  const clear = scorePassOption(passer, receiver, [], 1);
  const blocked = scorePassOption(passer, receiver, [player('o', 'red', 6, 0)], 1);
  assert.ok(blocked < clear);
});

test('P10.1: les joueurs IA proposent des solutions au porteur humain sans prendre son contrôle', () => {
  const roster = [
    ...createTeamRoster('blue'),
    ...createTeamRoster('red')
  ].map((cfg) => ({
    ...cfg,
    pos: { ...cfg.homePos }, vel: { x: 0, z: 0 }, stamina: 1,
    actionCooldown: 0, tackleTimer: 0, decisionTimer: 10,
    facing: Math.PI / 2, isControlled: false
  }));
  const human = roster.find((p) => p.team === 'blue' && p.role === 'FWD');
  human.isControlled = true;
  const runner = roster.find((p) => p.team === 'blue' && p.specialty === 'runner');
  const startX = runner.pos.x;
  const ball = { pos: { x: human.pos.x, z: human.pos.z }, owner: human };
  const ai = new TeamAI();
  ai.update(roster, ball, 0.1, { aiPass() {}, aiShoot() {}, tryTackle() {} });
  assert.ok(runner.pos.x > startX);
  assert.equal(human.isControlled, true);
});

test('P10.1: une passe entre adversaires ou vers soi-même est invalide', () => {
  const passer = player('p', 'blue', 0, 0);
  const opponent = player('o', 'red', 5, 0);
  assert.equal(scorePassOption(passer, opponent, [], 1), -Infinity);
  assert.equal(scorePassOption(passer, passer, [], 1), -Infinity);
});
