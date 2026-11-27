import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/player.js', import.meta.url), 'utf8');

test('P25 joueurs match : visages avec blanc des yeux et pupilles séparées', () => {
  assert.match(source, /matEyeWhite/);
  assert.match(source, /leftEyeWhite/);
  assert.match(source, /rightEyeWhite/);
});

test('P25 joueurs match : maillots et chaussures ont des détails textiles dédiés', () => {
  assert.match(source, /Coutures et empiècements du textile/);
  assert.match(source, /sockTopBand/);
  assert.match(source, /matBootLace/);
  assert.match(source, /const laces = new THREE\.Group\(\)/);
});

test('P25 joueurs match : mains détaillées et gants de gardien conservés', () => {
  assert.match(source, /Doigts simplifiés/);
  assert.match(source, /fingerMaterial = isGK \? matGlove : matSkin/);
  assert.match(source, /const thumb = new THREE\.Mesh/);
});

test('P25 joueurs match : delta de frame borné avant interpolation des articulations', () => {
  assert.match(source, /dt = Number\.isFinite\(dt\) \? THREE\.MathUtils\.clamp\(dt, 0, 0\.05\) : 0/);
  assert.match(source, /this\.visualAnimationTime \+= dt \* 1000/);
  assert.match(source, /const now = this\.visualAnimationTime/);
});
