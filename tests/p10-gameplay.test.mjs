import test from 'node:test';
import assert from 'node:assert/strict';
import { firstTouchRetention, dribbleLead, dribbleTouchOffset, skillAccuracy, dominantFootFactor, strikeFoot, tackleControlScore, goalkeeperSaveReach } from '../src/gameplay-tuning.js';
import { predictGoalkeeperIntercept } from '../src/goalkeeper.js';
import { classifyTackle } from '../src/referee.js';
import { gaitProfile } from '../src/animation-tuning.js';
import { chooseRenderProfile } from '../src/performance-tuning.js';

const player = (extra={}) => ({ team:'blue', facing:0, pos:{x:0,z:0}, vel:{x:0,z:0}, attributes:{control:80,passing:85,shooting:70}, preferredFoot:'right', ...extra });

test('P10.2: meilleure maîtrise = amorti de première touche plus court', () => {
  const skilled = firstTouchRetention(player(), 8, 0.5);
  const weak = firstTouchRetention(player({attributes:{control:20}}), 8, 0.5);
  assert.ok(skilled < weak);
});
test('P10.2: conduite de balle bornée et influencée par contrôle', () => {
  assert.ok(dribbleLead(player(), 7) > dribbleLead(player({attributes:{control:20}}), 7));
  assert.ok(dribbleLead(player(), 100) <= 1.12);
});
test('P10.2: précision de passe pénalisée par pression et pied faible', () => {
  const p = player();
  assert.ok(skillAccuracy(p, 'passing', 0, 'right') > skillAccuracy(p, 'passing', 1, 'left'));
  assert.equal(dominantFootFactor(p, 'right'), 1);
  assert.equal(dominantFootFactor(p, 'left'), 0.88);
  assert.equal(strikeFoot(p, {pos:{x:1,z:0}}), 'right');
});
test('P10.3: profil de foulée varie selon vitesse et fatigue', () => {
  const fresh = gaitProfile(8, 1, 2);
  const tired = gaitProfile(8, 0.2, 2);
  assert.equal(fresh.running, true);
  assert.ok(fresh.strideAmplitude > tired.strideAmplitude);
  assert.ok(Math.abs(fresh.lateralLean) <= 0.22);
});
test('P10.4: gardien anticipe la trajectoire latérale', () => {
  const result = predictGoalkeeperIntercept({pos:{x:-20,z:0},vel:{x:-8,z:5}}, player(), 1);
  assert.ok(result.danger);
  assert.ok(result.z > 0);
  assert.ok(Math.abs(result.z) <= 3.5);
});
test('P10.4: contact arrière à vitesse élevée est sifflé', () => {
  const victim = player({team:'red', facing:0});
  const tackler = player({team:'blue', pos:{x:0,z:-1}});
  assert.equal(classifyTackle({tackler,victim,distance:1,closingSpeed:5}).foul, true);
});
test('P10.4: duel régulier n’est pas automatiquement sifflé', () => {
  const victim = player({team:'red', facing:0});
  const tackler = player({team:'blue', pos:{x:1,z:0}});
  assert.equal(classifyTackle({tackler,victim,distance:1,closingSpeed:3}).foul, false);
});
test('P10.5: profil graphique réduit les coûts sur appareil modeste', () => {
  const low = chooseRenderProfile({hardwareConcurrency:4,deviceMemory:2,pixelRatio:2});
  const high = chooseRenderProfile({hardwareConcurrency:8,deviceMemory:8,pixelRatio:2});
  assert.equal(low.tier,'low'); assert.equal(low.shadows,false); assert.ok(low.pixelRatio < high.pixelRatio);
});

test('dribble: les touches alternent selon le pied préféré et restent bornées', () => {
  const right = { preferredFoot: 'right', attributes: { control: 70 } };
  const left = { preferredFoot: 'left', attributes: { control: 70 } };
  const r = dribbleTouchOffset(right, 0.5, 6);
  const l = dribbleTouchOffset(left, 0.5, 6);
  assert.ok(r.lateral > 0);
  assert.ok(l.lateral < 0);
  assert.ok(Math.abs(r.lateral) <= 0.16);
  assert.ok(r.forward >= 0 && r.forward <= 0.045);
});


test('R7: un bon défenseur gagne plus facilement le duel contre un porteur moyen', () => {
  const strong = player({ attributes: { defense: 88, tackling: 90 } });
  const weak = player({ attributes: { defense: 30, tackling: 25 } });
  const carrier = player({ team: 'red', attributes: { control: 55 } });
  assert.ok(tackleControlScore(strong, carrier, 0.8, 5) > tackleControlScore(weak, carrier, 0.8, 5));
  assert.ok(tackleControlScore(strong, carrier, 1.8, 5) < tackleControlScore(strong, carrier, 0.5, 5));
});

test('R7: les réflexes du gardien augmentent la portée de prise et un tir rapide la réduit', () => {
  const elite = player({ role: 'GK', attributes: { reflexes: 92, handling: 88 } });
  const average = player({ role: 'GK', attributes: { reflexes: 45, handling: 50 } });
  assert.ok(goalkeeperSaveReach(1.5, elite, 5) > goalkeeperSaveReach(1.5, average, 5));
  assert.ok(goalkeeperSaveReach(1.5, elite, 18) < goalkeeperSaveReach(1.5, elite, 5));
  assert.ok(goalkeeperSaveReach(1.5, elite, 5) <= 1.85);
});
