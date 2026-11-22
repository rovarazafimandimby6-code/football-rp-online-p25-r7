import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseRenderProfile, resolveRenderProfile } from '../src/performance-tuning.js';
import { readFile } from 'node:fs/promises';

const fieldSource = await readFile(new URL('../src/field.js', import.meta.url), 'utf8');
const sceneSource = await readFile(new URL('../src/scene.js', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

test('P20 : le mode automatique limite la charge sur un appareil Android modeste', () => {
  const profile = resolveRenderProfile('auto', { hardwareConcurrency: 4, deviceMemory: 2, pixelRatio: 2.75 });
  assert.equal(profile.quality, 'low');
  assert.equal(profile.shadows, false);
  assert.equal(profile.targetFps, 30);
  assert.ok(profile.pixelRatio <= 1.05);
});

test('P20 : le mode automatique conserve un profil équilibré sur un appareil standard', () => {
  const profile = resolveRenderProfile('auto', { hardwareConcurrency: 8, deviceMemory: 8, pixelRatio: 2 });
  assert.equal(profile.quality, 'medium');
  assert.equal(profile.shadows, false);
  assert.equal(profile.targetFps, 60);
  assert.ok(profile.pixelRatio <= 1.35);
});

test('P20 : les niveaux manuels restent bornés et le profil matériel reste prudent', () => {
  assert.equal(resolveRenderProfile('low', { pixelRatio: 3 }).pixelRatio, 1);
  assert.equal(resolveRenderProfile('high', { hardwareConcurrency: 4, deviceMemory: 2 }).shadows, false);
  assert.equal(chooseRenderProfile({ hardwareConcurrency: 2, deviceMemory: 1 }).tier, 'low');
});

test('P20 : les filets ne recalculent plus leurs normales hors impulsion de but', () => {
  assert.match(fieldSource, /if \(this\.goalPulse > 0\.001\)/);
  assert.match(fieldSource, /computeVertexNormals\(\)/);
  assert.match(fieldSource, /else if \(this\.netAnimating\)/);
  assert.match(fieldSource, /attr\.array\.set\(panel\.base\)/);
});

test('P20 : les fanions de corner ont une animation légère et le mode auto est proposé', () => {
  assert.match(fieldSource, /this\.cornerFlags/);
  assert.match(fieldSource, /Math\.sin\(this\.elapsed \* 2\.2/);
  assert.match(sceneSource, /resolveRenderProfile\(level/);
  assert.match(mainSource, /value="auto"/);
});
