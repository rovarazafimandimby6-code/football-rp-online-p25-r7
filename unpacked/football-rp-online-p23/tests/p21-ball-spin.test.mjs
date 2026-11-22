import test from 'node:test';
import assert from 'node:assert/strict';
import { shotSpin, spinAcceleration } from '../src/gameplay-tuning.js';
import { PhysicsEngine } from '../src/physics.js';

const player = (extra = {}) => ({
  preferredFoot: 'right',
  attributes: { shooting: 80, control: 75 },
  ...extra
});

test('P21: l’effet de tir dépend de la direction demandée et reste borné', () => {
  const p = player();
  assert.ok(shotSpin(p, 'right', 0.9, 1) > 0);
  assert.ok(shotSpin(p, 'right', 0.9, -1) < 0);
  assert.ok(Math.abs(shotSpin(p, 'right', 1, 8)) <= 0.95);
  assert.equal(shotSpin(p, 'right', 0.9, 0), 0);
});

test('P21: le pied faible réduit l’effet technique', () => {
  const p = player();
  assert.ok(shotSpin(p, 'right', 0.8, 1) > shotSpin(p, 'left', 0.8, 1));
});

test('P21: accélération latérale bornée et nulle sans spin', () => {
  const velocity = { x: 20, z: 0 };
  assert.deepEqual(spinAcceleration(velocity, 0), { x: 0, z: -0 });
  const curve = spinAcceleration(velocity, 1);
  assert.ok(Number.isFinite(curve.x) && Number.isFinite(curve.z));
  assert.ok(Math.hypot(curve.x, curve.z) <= 4.2);
});

test('P21: le moteur applique le spin et le fait décroître pendant le vol', () => {
  const engine = new PhysicsEngine();
  const ball = {
    pos: { x: 0, y: 1, z: 0 },
    vel: { x: 12, y: 0, z: 0 },
    spin: 0.8,
    owner: null,
    syncVisual() {}
  };
  const initialSpin = ball.spin;
  engine.stepBall(ball, [], 0.1);
  assert.ok(ball.vel.z < 0);
  assert.ok(ball.spin < initialSpin && ball.spin > 0);
});
