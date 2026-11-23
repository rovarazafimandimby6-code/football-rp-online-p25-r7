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

test('P27: le pressing IA coordonne un poursuivant et un défenseur de couverture', () => {
  const chaser = player('blue-chaser', 'blue', 0, 0, 'stopper');
  const cover = player('blue-cover', 'blue', 4, 0, 'cover');
  const line = player('blue-line', 'blue', -10, 4, 'balanced');
  const carrier = player('red-carrier', 'red', 2, 0, 'runner');
  for (const p of [chaser, cover, line, carrier]) {
    p.attributes = { pace: 60, stamina: 60, defense: 60, control: 60, passing: 60, shooting: 60 };
    p.stamina = 1;
    p.homePos = { ...p.pos };
  }
  const ball = { pos: { x: 2, z: 0 }, owner: carrier };
  const ai = new TeamAI();
  ai.update([chaser, cover, line, carrier], ball, 0.1, {
    aiPass() {}, aiShoot() {}, tryTackle() {}
  });
  assert.ok(chaser.vel.x > 0, 'le joueur le plus proche doit presser le porteur');
  assert.ok(cover.vel.x < 0, 'le deuxième joueur doit fermer la ligne de passe');
  assert.ok(line.vel.x > 0, 'le troisième joueur doit conserver sa ligne plutôt que converger sur le ballon');
});
