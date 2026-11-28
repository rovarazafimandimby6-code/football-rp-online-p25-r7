import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CAMERA_PRESETS, resolveCameraMode } from '../src/camera-presets.js';

test('P25 : la caméra Diffusion TV est le preset de référence', () => {
  assert.equal(resolveCameraMode('broadcast'), 'broadcast');
  assert.equal(CAMERA_PRESETS.broadcast.label, 'Diffusion TV');
  assert.ok(CAMERA_PRESETS.broadcast.height < 27, 'le cadrage TV doit être plus bas que l’ancienne caméra');
  assert.ok(CAMERA_PRESETS.broadcast.distance < 42, 'le cadrage TV doit rapprocher les joueurs');
});

test('P25 : le contrôleur caméra expose un zoom réglable', async () => {
  const source = await readFile(new URL('../src/camera.js', import.meta.url), 'utf8');
  assert.match(source, /setZoom\(value\)/);
  assert.match(source, /this\.zoom = 55/);
  assert.match(source, /zoomFactor/);
});

test('P25 : les noms Standard sont limités au joueur contrôlé et deux proches', async () => {
  const source = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.match(source, /distanceBall < 4\.2/);
  assert.match(source, /nearbyCount >= 2/);
  assert.match(source, /labelWidth \+ otherWidth/);
  assert.match(source, /Number\.isFinite\(this\.projVec\.x\)/);
});

test('P25 : le zoom nul reste sélectionnable et les réglages pause reprennent la valeur active', async () => {
  const camera = await readFile(new URL('../src/camera.js', import.meta.url), 'utf8');
  const ui = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');
  const game = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
  assert.match(camera, /Number\.isFinite\(numeric\) \? numeric : 55/);
  assert.match(ui, /getCameraZoom\?\.\(\) \?\? 55/);
  assert.match(game, /getCameraZoom: \(\) => this\.cam\.zoom/);
});

test('P25 : les avatars de match sont légèrement agrandis sans changer les données physiques', async () => {
  const player = await readFile(new URL('../src/player.js', import.meta.url), 'utf8');
  const field = await readFile(new URL('../src/field.js', import.meta.url), 'utf8');
  assert.match(player, /root\.scale\.setScalar\(1\.08\)/);
  assert.match(field, /PITCH\.HALF_W \+ 14/);
  assert.match(field, /CylinderGeometry\(0\.13, 0\.2, 18, 8\)/);
});

test('P25 : la mini-carte ne recouvre plus l’endurance et les anciens styles de noms sont consolidés', async () => {
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /#minimap\s*\{[^}]*top: calc\(78px/);
  assert.match(css, /#fps-badge \{ display: none; \}/);
  assert.equal((css.match(/\.p-label, \.p-label\.blue, \.p-label\.red \{/g) || []).length, 1);
});
