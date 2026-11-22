import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CAMERA_PRESETS, resolveCameraMode } from '../src/camera-presets.js';

 test('P22 : quatre vues de caméra distinctes sont disponibles', () => {
  assert.deepEqual(Object.keys(CAMERA_PRESETS), ['touchline', 'broadcast', 'close', 'tactical']);
  assert.equal(CAMERA_PRESETS.touchline.label, 'Ligne de touche');
  assert.ok(CAMERA_PRESETS.close.distance < CAMERA_PRESETS.broadcast.distance);
  assert.ok(CAMERA_PRESETS.tactical.distance > CAMERA_PRESETS.broadcast.distance);
});

test('P22 : chaque préréglage caméra possède des paramètres physiques valides', () => {
  for (const preset of Object.values(CAMERA_PRESETS)) {
    assert.ok(preset.height >= 15 && preset.height <= 40);
    assert.ok(preset.distance >= 20 && preset.distance <= 60);
    assert.ok(preset.fov >= 40 && preset.fov <= 55);
    assert.ok(preset.width >= 0.7 && preset.width <= 1.4);
  }
});

test('P22 : un mode caméra inconnu revient sans erreur à la retransmission', () => {
  assert.equal(resolveCameraMode('unknown'), 'broadcast');
  assert.equal(resolveCameraMode('close'), 'close');
});

test('P22 : la sélection caméra est accessible dans le menu et la pause', async () => {
  const [main, ui, game] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/game.js', import.meta.url), 'utf8')
  ]);
  for (const mode of Object.keys(CAMERA_PRESETS)) {
    assert.ok(main.includes(`value="${mode}"`));
    assert.ok(ui.includes(`value="${mode}"`));
  }
  assert.ok(game.includes('this.cam.setMode(mode)'));
});
