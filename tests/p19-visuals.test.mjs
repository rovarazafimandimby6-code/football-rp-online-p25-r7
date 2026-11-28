import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fieldSource = await readFile(new URL('../src/field.js', import.meta.url), 'utf8');
const gameSource = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
const pitchSource = await readFile(new URL('../src/pitch.js', import.meta.url), 'utf8');

test('P19 : le terrain possède les arcs de penalty et les quatre drapeaux de corner', () => {
  assert.match(fieldSource, /RingGeometry\(9\.05, 9\.18/);
  assert.match(fieldSource, /buildCornerFlags\(\)/);
  assert.match(fieldSource, /PITCH\.HALF_L, PITCH\.HALF_W/);
});

test('P19 : les zones techniques et les gradins derrière les cages sont intégrés au stade', () => {
  assert.match(fieldSource, /buildTechnicalAreas\(\)/);
  assert.match(fieldSource, /Gradins derrière les deux cages/);
  assert.match(fieldSource, /new THREE\.BoxGeometry\(9\.4, 0\.16, 2\.15\)/);
});

test('P19 : les filets arrière sont subdivisés et animés après un but', () => {
  assert.match(fieldSource, /PlaneGeometry\(PITCH\.GOAL_W, h, 10, 6\)/);
  assert.match(fieldSource, /triggerGoal\(\)/);
  assert.match(fieldSource, /backNetGeo\.attributes\.position\.setUsage\(THREE\.DynamicDrawUsage\)/);
  assert.doesNotMatch(fieldSource, /computeVertexNormals\(\)/);
  assert.match(gameSource, /this\.field\.triggerGoal\(/);
  assert.match(gameSource, /this\.field\.update\(dt\)/);
});

test('P19 : les dimensions du terrain restent cohérentes et les matchs gardent leurs limites', () => {
  assert.match(pitchSource, /L: 56, W: 34, HALF_L: 28, HALF_W: 17/);
  assert.match(gameSource, /this\.match\.stepClock\(clockDt, posTeam\)/);
});
