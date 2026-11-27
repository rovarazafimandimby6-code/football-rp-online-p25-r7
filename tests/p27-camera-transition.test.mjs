import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BroadcastCamera } from '../src/camera.js';

test('P27 caméra : un changement de preset démarre une transition sans saut instantané', () => {
  const camera = new THREE.PerspectiveCamera(49, 16 / 9, 0.1, 300);
  const rig = new BroadcastCamera(camera, 'broadcast');
  const initial = camera.position.clone();
  assert.equal(rig.setMode('tactical'), true);
  assert.ok(rig.transition);
  assert.equal(rig.transition.duration, 0.32);
  const ball = { pos: { x: 8, z: 12 }, vel: { x: 2, z: 1 }, owner: null };
  const player = { role: 'MID', team: 'blue', pos: { x: 5, z: 10 } };
  rig.update(ball, player, 1 / 60);
  assert.ok(camera.position.distanceTo(initial) < 2, 'la caméra doit quitter progressivement son ancien cadrage');
  assert.ok(rig.transition.elapsed > 0);
});

test('P27 caméra : les modes invalides sont refusés et un preset identique ne relance pas la transition', () => {
  const camera = new THREE.PerspectiveCamera(49, 16 / 9, 0.1, 300);
  const rig = new BroadcastCamera(camera, 'broadcast');
  assert.equal(rig.setMode('unknown'), false);
  assert.equal(rig.setMode('broadcast'), true);
  assert.equal(rig.transition, null);
});

test('P27 caméra : la transition se termine après sa durée sans accumulation', () => {
  const camera = new THREE.PerspectiveCamera(49, 16 / 9, 0.1, 300);
  const rig = new BroadcastCamera(camera, 'broadcast');
  rig.setMode('tactical');
  const ball = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, owner: null };
  const player = { role: 'MID', team: 'blue', pos: { x: 0, z: 0 } };
  for (let i = 0; i < 30; i++) rig.update(ball, player, 1 / 60);
  assert.equal(rig.transition, null);
});


test('P27 caméra personnelle : une transition avance une seule fois par frame', () => {
  const camera = new THREE.PerspectiveCamera(49, 16 / 9, 0.1, 300);
  const rig = new BroadcastCamera(camera, 'broadcast');
  rig.setMode('player');
  const ball = { pos: { x: 2, z: 4 }, vel: { x: 0, z: 0 }, owner: null };
  const player = { role: 'MID', team: 'blue', pos: { x: 1, y: 0, z: 2 }, facing: 0 };
  for (let i = 0; i < 10; i++) rig.update(ball, player, 1 / 60);
  assert.ok(rig.transition, 'la transition de 0,32 s ne doit pas se terminer en 10 frames');
  assert.ok(Math.abs(rig.transition.elapsed - 10 / 60) < 1e-9, 'le temps doit avancer de 1/60 s par frame');
});
