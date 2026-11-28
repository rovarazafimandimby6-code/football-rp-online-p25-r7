import test from 'node:test';
import assert from 'node:assert/strict';
import { gaitProfile } from '../src/animation-tuning.js';

test('P27: la foulée conserve son comportement historique sans accélération ni virage', () => {
  const gait = gaitProfile(7, 1, 0);
  assert.equal(gait.running, true);
  assert.equal(gait.accelerationLean, 0);
  assert.equal(gait.turnLean, 0);
});

test('P27: une accélération incline le corps vers l avant et un freinage vers l arrière', () => {
  const accelerating = gaitProfile(7, 1, 0, 12, 0);
  const braking = gaitProfile(7, 1, 0, -12, 0);
  assert.ok(accelerating.accelerationLean > 0);
  assert.ok(braking.accelerationLean < 0);
  assert.ok(accelerating.accelerationLean <= 0.12);
  assert.ok(braking.accelerationLean >= -0.12);
});

test('P27: les changements de direction produisent une inclinaison latérale bornée', () => {
  const left = gaitProfile(8, 0.8, 0, 0, -7);
  const right = gaitProfile(8, 0.8, 0, 0, 7);
  assert.ok(left.turnLean < 0);
  assert.ok(right.turnLean > 0);
  assert.ok(Math.abs(left.turnLean) <= 0.14);
  assert.ok(Math.abs(right.turnLean) <= 0.14);
});

test('P27: la fatigue et la vitesse continuent de moduler la foulée', () => {
  const fresh = gaitProfile(8, 1);
  const tired = gaitProfile(8, 0.2);
  assert.equal(fresh.strideRate, tired.strideRate);
  assert.ok(tired.strideAmplitude < fresh.strideAmplitude);
});

test('P27: les paramètres de foulée peuvent être réutilisés sans allocation', () => {
  const buffer = {};
  const first = gaitProfile(7, 0.9, 1, 4, 2, buffer);
  const second = gaitProfile(3, 0.4, -2, -5, -4, buffer);
  assert.equal(first, buffer);
  assert.equal(second, buffer);
  assert.equal(second.running, false);
  assert.ok(second.lateralLean < 0);
  assert.ok(second.accelerationLean < 0);
  assert.ok(second.turnLean < 0);
});
