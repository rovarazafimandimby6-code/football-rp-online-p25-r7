import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePassOption, getSupportTarget, getDefensiveShapeTarget, decisionAttributeFactor, TeamAI, createTeamRoster } from '../src/ai.js';

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

test('P27: les appels offensifs choisissent un couloir moins occupé par les défenseurs', () => {
  const runner = player('runner', 'blue', 0, -4, 'runner');
  runner.homePos = { x: 0, z: -4 };
  const carrier = player('carrier', 'blue', 1, 0, 'playmaker');
  const defenders = [
    player('def-1', 'red', 9, -4),
    player('def-2', 'red', 10, -7),
    player('def-3', 'red', 8, -1)
  ];
  const target = getSupportTarget(runner, carrier, [runner, carrier, ...defenders], 1);
  assert.ok(target.x > carrier.pos.x, 'le coureur doit attaquer la profondeur');
  assert.ok(target.z > 0, 'le coureur doit exploiter le couloir opposé devenu libre');
  assert.ok(target.z <= 15 && target.z >= -15, 'la course doit rester dans les limites du terrain');
});

test('P27: le meneur se rend disponible derrière le porteur et le défenseur de couverture garde sa ligne', () => {
  const carrier = player('carrier', 'blue', 8, 2, 'runner');
  const playmaker = player('maker', 'blue', 2, 7, 'playmaker');
  const cover = player('cover', 'blue', -8, -5, 'cover');
  cover.homePos = { x: -8, z: -5 };
  const opponents = [player('opponent', 'red', 5, 7)];
  const players = [carrier, playmaker, cover, ...opponents];
  const makerTarget = getSupportTarget(playmaker, carrier, players, 1);
  const coverTarget = getSupportTarget(cover, carrier, players, 1);
  assert.ok(makerTarget.x < carrier.pos.x, 'le meneur doit offrir une solution en retrait');
  assert.ok(coverTarget.x < carrier.pos.x, 'le joueur de couverture ne doit pas dépasser le porteur');
  assert.ok(Math.abs(coverTarget.z - cover.homePos.z) < 2, 'le joueur de couverture conserve son couloir');
});

test('P27: les attributs de passe et de vision influencent la qualité des options sans garantir la réussite', () => {
  const receiver = player('receiver', 'blue', 10, 1, 'runner');
  const opponents = [player('marker', 'red', 5, 8)];
  const novice = player('novice', 'blue', 0, 0);
  const playmaker = player('playmaker', 'blue', 0, 0, 'playmaker');
  novice.attributes = { passing: 25, vision: 25 };
  playmaker.attributes = { passing: 92, vision: 94 };
  assert.ok(scorePassOption(playmaker, receiver, opponents) > scorePassOption(novice, receiver, opponents),
    'un passeur avec une meilleure vision et qualité de passe évalue mieux la même solution');
});

test('P27: la qualité de décision offensive reste bornée pour les attributs extrêmes', async () => {

  const weak = player('weak', 'blue', 0, 0);
  const elite = player('elite', 'blue', 0, 0);
  weak.attributes = { shooting: 1, composure: 1 };
  elite.attributes = { shooting: 99, composure: 99 };
  assert.ok(decisionAttributeFactor(weak, 'shooting', 'composure') >= 0.78);
  assert.ok(decisionAttributeFactor(elite, 'shooting', 'composure') <= 1.28);
  assert.ok(decisionAttributeFactor(elite, 'shooting', 'composure') > decisionAttributeFactor(weak, 'shooting', 'composure'));
});

test('P27: le bloc défensif protège la profondeur côté but et conserve les couloirs', () => {
  const defender = player('defender', 'blue', -10, -7, 'balanced');
  defender.homePos = { x: -10, z: -7 };
  const carrier = player('carrier', 'red', 8, -3, 'runner');
  const farRunner = player('runner', 'red', 14, 8, 'runner');

  const target = getDefensiveShapeTarget(defender,
    { pos: { x: 9, z: -2 } }, [carrier, farRunner], 1, 'balanced');
  assert.ok(target.x < carrier.pos.x, 'le défenseur reste du côté de son but par rapport au porteur');
  assert.ok(target.z > -17 && target.z < 17, 'la position reste dans le terrain');
  assert.ok(target.z < 0, 'le défenseur ne quitte pas son couloir pour suivre le joueur éloigné');
});

test('P27: le bloc défensif se replie davantage avec une mentalité prudente', async () => {

  const defender = player('defender', 'blue', -5, 4);
  defender.homePos = { x: -5, z: 4 };
  const carrier = player('carrier', 'red', 10, 3);
  const ball = { pos: { x: 10, z: 3 } };
  const balanced = getDefensiveShapeTarget(defender, ball, [carrier], 1, 'balanced');
  const defensive = getDefensiveShapeTarget(defender, ball, [carrier], 1, 'defensive');
  assert.ok(defensive.x < balanced.x, 'le bloc prudent doit reculer davantage');
});
