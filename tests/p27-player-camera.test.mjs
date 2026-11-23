import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_CAMERA_PROFILES, resolvePlayerCameraPose, resolvePlayerCameraProfile } from '../src/player-camera.js';

const player = (role = 'MID', facing = 0, x = 0, z = 0) => ({ role, facing, pos: { x, z } });

test('P27 caméra RP : chaque grande famille de poste possède un profil dédié', () => {
  for (const role of ['GK', 'DEF', 'MID', 'FWD']) assert.ok(PLAYER_CAMERA_PROFILES[role]);
  assert.notEqual(resolvePlayerCameraProfile('GK').distance, resolvePlayerCameraProfile('FWD').distance);
  assert.notEqual(resolvePlayerCameraProfile('MID').lookAhead, resolvePlayerCameraProfile('DEF').lookAhead);
  assert.equal(resolvePlayerCameraProfile('unknown'), PLAYER_CAMERA_PROFILES.MID);
});

test('P27 caméra RP : la caméra reste derrière le joueur et suit son orientation', () => {
  const north = resolvePlayerCameraPose(player('MID', 0), null);
  const east = resolvePlayerCameraPose(player('MID', Math.PI / 2), null);
  assert.ok(north.z < 0, 'face au nord (+Z), la caméra reste derrière (-Z)');
  assert.ok(east.x < 0, 'face à l’est (+X), la caméra reste derrière (-X)');
  assert.equal(north.targetZ > 0, true);
});

test('P27 caméra RP : un ballon derrière le joueur ne détourne pas la caméra', () => {
  const withoutBall = resolvePlayerCameraPose(player('FWD', 0), null);
  const behind = resolvePlayerCameraPose(player('FWD', 0), { pos: { x: 0, z: -8 } });
  assert.equal(behind.ballWeight, 0);
  assert.equal(behind.targetX, withoutBall.targetX);
  assert.equal(behind.targetZ, withoutBall.targetZ);
});

test('P27 caméra RP : le ballon visible n’influence le regard que de façon limitée', () => {
  const pose = resolvePlayerCameraPose(player('MID', 0), { pos: { x: 4, z: 12 } });
  assert.ok(pose.ballWeight > 0);
  assert.ok(pose.ballWeight <= PLAYER_CAMERA_PROFILES.MID.ballInfluence);
  const far = resolvePlayerCameraPose(player('MID', 0), { pos: { x: 4, z: 80 } });
  assert.equal(far.ballWeight, 0);
});

test('P27 caméra RP : le zoom est borné et rapproche réellement la caméra', () => {
  const far = resolvePlayerCameraPose(player('DEF'), null, { zoom: 0 });
  const close = resolvePlayerCameraPose(player('DEF'), null, { zoom: 100 });
  const farDistance = Math.hypot(far.x, far.z);
  const closeDistance = Math.hypot(close.x, close.z);
  assert.ok(closeDistance < farDistance);
  assert.equal(resolvePlayerCameraPose(player('DEF'), null, { zoom: 1000 }).x, close.x);
});
