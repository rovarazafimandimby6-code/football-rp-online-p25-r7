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

test('P20 : les filets animés utilisent un buffer dynamique sans recalcul de normales', () => {
  assert.match(fieldSource, /if \(this\.goalPulse > 0\.001\)/);
  assert.match(fieldSource, /backNetGeo\.attributes\.position\.setUsage\(THREE\.DynamicDrawUsage\)/);
  assert.doesNotMatch(fieldSource, /computeVertexNormals\(\)/);
  assert.match(fieldSource, /else if \(this\.netAnimating\)/);
  assert.match(fieldSource, /attr\.array\.set\(panel\.base\)/);
});

test('P20 : les fanions de corner sont légers et les réglages avancés restent différés', () => {
  assert.match(fieldSource, /this\.cornerFlags/);
  assert.match(fieldSource, /Math\.sin\(this\.elapsed \* 2\.2/);
  assert.match(sceneSource, /resolveRenderProfile\(level/);
  assert.match(mainSource, /Les options détaillées seront ajoutées après la finalisation des écrans principaux/);
});


test('P27 : la pelouse gagne en relief par bandes de tonte sans augmenter la géométrie', () => {
  assert.match(fieldSource, /const stripes = 24/);
  assert.match(fieldSource, /createLinearGradient\(i \* sw/);
  assert.match(fieldSource, /Fines traces de tonte transversales/);
  assert.match(fieldSource, /tex\.anisotropy = 4/);
});

test('P27 : les lignes du terrain partagent un matériau unique', () => {
  assert.match(fieldSource, /this\.lineMaterial \|\| \(this\.lineMaterial = new THREE\.MeshBasicMaterial/);
});


test('P27 : les rectangles de lignes réutilisent leurs géométries et les filets partagent leur matériau', () => {
  assert.match(fieldSource, /this\.lineGeometryCache = new Map\(\)/);
  assert.match(fieldSource, /horizontalGeometry = this\.lineGeometryCache\.get/);
  assert.match(fieldSource, /verticalGeometry = this\.lineGeometryCache\.get/);
  assert.match(fieldSource, /this\.netMaterial \|\| \(this\.netMaterial = new THREE\.MeshBasicMaterial/);
  assert.match(fieldSource, /map: createNetTexture\(\)/);
});


test('P27 : les géométries statiques du stade sont mutualisées entre meshes identiques', () => {
  assert.match(fieldSource, /this\.sharedGeometryCache = new Map\(\)/);
  assert.match(fieldSource, /getSharedGeometry\(key, create\)/);
  assert.match(fieldSource, /getSharedGeometry\('technical-seat'/);
  assert.match(fieldSource, /getSharedGeometry\('stand-tier-side'/);
  assert.match(fieldSource, /getSharedGeometry\('floodlight-pole'/);
  assert.match(fieldSource, /getSharedGeometry\('floodlight-head'/);
  assert.match(fieldSource, /endStandGeometries = \[0, 1\]\.map/);
});


test('P27 : le remplacement des extensions et décorations du club libère leurs ressources GPU', () => {
  assert.match(fieldSource, /function disposeGroupResources\(group\)/);
  assert.match(fieldSource, /disposeGroupResources\(this\.clubExpansionGroup\)/);
  assert.match(fieldSource, /disposeGroupResources\(this\.clubBannerGroup\)/);
  assert.match(fieldSource, /const geometries = new Set\(\)/);
  assert.match(fieldSource, /const materials = new Set\(\)/);
  assert.match(fieldSource, /material\.dispose\(\)/);
  assert.match(fieldSource, /geometry\.dispose\(\)/);
});


test('P27 : la foule du stade adapte sa densité et sa géométrie au profil mobile', () => {
  assert.match(sceneSource, /this\.scene\.userData\.renderQuality = profile\.quality/);
  assert.match(fieldSource, /const lowEndCrowd = this\.scene\.userData\?\.renderQuality === 'low'/);
  assert.match(fieldSource, /const count = lowEndCrowd \? 240 : 420/);
  assert.match(fieldSource, /lowEndCrowd \? 8 : 10/);
  assert.match(fieldSource, /lowEndCrowd \? 6 : 8/);
});


test('P27 stade : les deux cages partagent les géométries statiques sans partager les filets déformables', () => {
  const goalBuilder = fieldSource.slice(fieldSource.indexOf('  buildGoal(side) {'), fieldSource.indexOf('  buildStadium() {'));
  for (const key of ['goal-front-post','goal-crossbar','goal-back-post','goal-top-support','goal-top-net','goal-side-net']) {
    assert.ok(goalBuilder.includes(`getSharedGeometry('${key}'`), `géométrie partagée attendue : ${key}`);
  }
  assert.ok(goalBuilder.includes('this.goalPostMaterial || (this.goalPostMaterial = new THREE.MeshLambertMaterial'));\n  assert.ok(goalBuilder.includes('const backNetGeo = new THREE.PlaneGeometry'));
  assert.ok(goalBuilder.includes('this.netPanels.push({ mesh: backNet, base:'));
});
