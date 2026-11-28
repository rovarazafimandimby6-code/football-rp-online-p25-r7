import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveRenderProfile } from '../src/performance-tuning.js';

const [player, field, scene, html, pkg] = await Promise.all([
  readFile(new URL('../src/player.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/field.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/scene.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8')
]);

test('P23 : les joueurs conservent un rig articulé avec membres lissés et détails de visage', () => {
  assert.match(player, /CapsuleGeometry/);
  assert.match(player, /leftBrow/);
  assert.match(player, /skinPalette/);
  assert.match(player, /bootStripe/);
  assert.match(player, /body\.scale\.set/);
  assert.match(player, /headGroup\.rotation\.y/);
});

test('P23 : les variations de morphologie, de peau et de coiffure sont déterministes', () => {
  assert.match(player, /headWidth/);
  assert.match(player, /hairPalette/);
  assert.match(player, /number % 5/);
});

test('P23 : les spectateurs utilisent des silhouettes instanciées avec têtes séparées', () => {
  assert.match(field, /crowdHeads/);
  assert.match(field, /new THREE\.SphereGeometry\(0\.5, lowEndCrowd \? 8 : 10, lowEndCrowd \? 6 : 8\)/);
  assert.match(field, /new THREE\.SphereGeometry\(0\.5, lowEndCrowd \? 6 : 8, lowEndCrowd \? 5 : 6\)/);
  assert.match(field, /new THREE\.InstancedMesh\(torsoGeo, torsoMat, count\)/);
  assert.match(field, /addSpectator/);
  assert.match(field, /const cheering = idx % 11 === 0/);
  assert.match(field, /cheering \? 0\.92/);
  assert.match(field, /crowd\.count = idx/);
});

test('P23 : les auvents du stade restent des géométries statiques peu coûteuses', () => {
  assert.match(field, /canopyNorth/);
  assert.match(field, /canopyWest/);
});

test('P23 : le profil de rendu auto reste prudent sur appareils modestes', () => {
  const low = resolveRenderProfile('auto', { hardwareConcurrency: 4, deviceMemory: 2, pixelRatio: 2.5 });
  assert.equal(low.quality, 'low');
  assert.equal(low.shadows, false);
  assert.ok(low.pixelRatio <= 1.05);
  assert.match(scene, /deviceMemory/);
});

test('P27 : la version affichée et le manifeste passent en P27', () => {
  assert.match(JSON.parse(pkg).version, /^27\.0\.0$/);
  assert.match(html, /P27 · NOUVELLE GÉNÉRATION/);
  assert.match(html, /Football RP Online — P27/);
});

test('P23 consolidation : le plafond de rendu suit le profil matériel et les réglages', async () => {
  const game = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
  assert.match(scene, /this\.targetFps = profile\.targetFps/);
  assert.match(scene, /antialias: deviceProfile\.antialias/);
  assert.match(game, /const frameInterval = 1000 \/ targetFps/);
  assert.match(game, /lastFrameAt = now/);
  assert.match(game, /const clockDt = Math\.max\(0, Number\.isFinite\(rawDt\)/);
  assert.match(game, /stepClock\(clockDt,/);
});

test('P23 consolidation : les écouteurs tactiles et HUD sont libérés à la fermeture du match', async () => {
  const controls = await readFile(new URL('../src/controls.js', import.meta.url), 'utf8');
  const ui = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');
  const game = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
  assert.match(controls, /new AbortController\(\)/);
  assert.match(controls, /dispose\(\)\s*\{[\s\S]*abortController\.abort\(\)/);
  assert.match(ui, /new AbortController\(\)/);
  assert.match(ui, /dispose\(\)\s*\{[\s\S]*abortController\.abort\(\)/);
  assert.match(game, /this\.controls\?\.dispose\?\.\(\)/);
  assert.match(game, /this\.ui\?\.dispose\?\.\(\)/);
});

test('P23 consolidation : la personnalisation du profil est appliquée au footballeur en match', async () => {
  const game = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(player, /KIT_PALETTES/);
  assert.match(player, /skinByTone/);
  assert.match(player, /hairByColor/);
  assert.match(player, /appearance\?\.hairStyle === 'curly'/);
  assert.match(player, /appearance\?\.hairStyle === 'shaved'/);
  assert.match(game, /cfg === controlledConfig \? \(callbacks\.playerAppearance \|\| \{\}\) : \{\}/);
  assert.match(game, /shopCosmeticsEnabled:true/);
  assert.match(game, /callbacks\.homeKitAppearance/);
  assert.match(game, /callbacks\.awayKitAppearance/);
  assert.match(game, /attributes: callbacks\.playerAttributes/);
  assert.match(game, /preferredFoot: callbacks\.preferredFoot/);
  assert.match(main, /playerAppearance: profileStore\.profile\.appearance/);
  assert.match(main, /playerAttributes: profileStore\.profile\.progression\.attributes/);
  assert.match(main, /preferredFoot: profileStore\.profile\.identity\.preferredFoot/);
});
