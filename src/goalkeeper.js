import { PITCH } from './pitch.js';

/** Predict the ball's crossing point at the goalkeeper line (bounded, deterministic). */
export function predictGoalkeeperIntercept(ball, goalkeeper, attackDirection, horizon = 0.85) {
  const goalX = attackDirection > 0 ? -PITCH.HALF_L + 1.15 : PITCH.HALF_L - 1.15;
  const vx = Number.isFinite(ball?.vel?.x) ? ball.vel.x : 0;
  const vz = Number.isFinite(ball?.vel?.z) ? ball.vel.z : 0;
  let t = Math.abs(vx) > 0.15 ? (goalX - ball.pos.x) / vx : 0;
  t = Math.max(0, Math.min(horizon, t));
  const predictedZ = ball.pos.z + vz * t;
  const z = Math.max(-PITCH.GOAL_W * 0.46, Math.min(PITCH.GOAL_W * 0.46, predictedZ));
  const danger = Math.abs(ball.pos.x - goalX) < 15 && ball.pos.x * attackDirection < goalX * attackDirection + 15;
  return { x: danger ? goalX + attackDirection * 0.65 : goalX, z, interceptTime: t, danger };
}
