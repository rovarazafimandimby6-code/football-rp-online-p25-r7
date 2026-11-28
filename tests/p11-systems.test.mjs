import test from 'node:test';
import assert from 'node:assert/strict';
import { updateStamina, staminaSpeedFactor } from '../src/stamina.js';
import { SnapshotBuffer } from '../src/network-sync.js';

test('P11: la stamina diminue au sprint et reste bornée', () => {
  const p = { stamina: 1 };
  updateStamina(p, 1, { sprinting: true });
  assert.ok(p.stamina < 1 && p.stamina >= 0);
});

test('P11: la stamina récupère au repos sans dépasser 1', () => {
  const p = { stamina: 0.4 };
  updateStamina(p, 1, { sprinting: false });
  assert.ok(p.stamina > 0.4 && p.stamina <= 1);
});

test('P23: une endurance élevée réduit la perte de stamina au sprint', () => {
  const low = { stamina: 1 }; const high = { stamina: 1 };
  updateStamina(low, 1, { sprinting: true, endurance: 25 });
  updateStamina(high, 1, { sprinting: true, endurance: 90 });
  assert.ok(high.stamina > low.stamina);
});

test('P23: une endurance élevée accélère la récupération', () => {
  const low = { stamina: 0.4 }; const high = { stamina: 0.4 };
  updateStamina(low, 1, { endurance: 25 });
  updateStamina(high, 1, { endurance: 90 });
  assert.ok(high.stamina > low.stamina);
});

test('P11: les deltas invalides ne modifient pas la stamina', () => {
  const p = { stamina: 0.6 };
  updateStamina(p, NaN, { sprinting: true });
  assert.equal(p.stamina, 0.6);
});

test('P11: le facteur de vitesse respecte les limites prévues', () => {
  assert.equal(staminaSpeedFactor(0), 0.72);
  assert.equal(staminaSpeedFactor(1), 1);
  assert.equal(staminaSpeedFactor(9), 1);
});

test('P11: le tampon rejette les snapshots invalides et les séquences anciennes', () => {
  const b = new SnapshotBuffer();
  assert.equal(b.push('p1', { time: 1, x: 0, z: 0, sequence: 2 }), true);
  assert.equal(b.push('p1', { time: 2, x: 1, z: 1, sequence: 1 }), false);
  assert.equal(b.push('p1', { time: 3, x: NaN, z: 1 }), false);
});

test('P11: interpolation spatiale entre deux snapshots', () => {
  const b = new SnapshotBuffer({ interpolationDelay: 0 });
  b.push('p1', { time: 0, x: 0, z: 0, facing: 0, sequence: 1 });
  b.push('p1', { time: 2, x: 10, z: 4, facing: 1, sequence: 2 });
  const p = b.sample('p1', 1);
  assert.equal(p.x, 5);
  assert.equal(p.z, 2);
  assert.equal(p.facing, 0.5);
});

test('P11: l’interpolation d’angle prend le chemin le plus court', () => {
  const b = new SnapshotBuffer({ interpolationDelay: 0 });
  b.push('p1', { time: 0, x: 0, z: 0, facing: 3.1, sequence: 1 });
  b.push('p1', { time: 1, x: 0, z: 0, facing: -3.1, sequence: 2 });
  const p = b.sample('p1', 0.5);
  assert.ok(Math.abs(Math.abs(p.facing) - Math.PI) < 0.05);
});

test('P11: suppression et vidage du tampon', () => {
  const b = new SnapshotBuffer();
  b.push('p1', { time: 0, x: 0, z: 0, sequence: 1 });
  b.remove('p1');
  assert.equal(b.sample('p1', 1), null);
  b.push('p2', { time: 0, x: 0, z: 0, sequence: 1 });
  b.clear();
  assert.equal(b.sample('p2', 1), null);
});
