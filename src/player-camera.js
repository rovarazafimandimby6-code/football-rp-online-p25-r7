/** Profils de caméra personnelle pour une expérience RP centrée sur un seul footballeur. */
export const PLAYER_CAMERA_PROFILES = Object.freeze({
  GK: Object.freeze({ label: 'Gardien', height: 8.2, distance: 14.5, lookAhead: 9.2, visionRange: 34, ballInfluence: 0.12, shoulder: 0.12, fov: 66 }),
  DEF: Object.freeze({ label: 'Défenseur', height: 7.3, distance: 13.1, lookAhead: 7.8, visionRange: 29, ballInfluence: 0.15, shoulder: 0.18, fov: 65 }),
  MID: Object.freeze({ label: 'Milieu', height: 7.8, distance: 14.2, lookAhead: 9.3, visionRange: 34, ballInfluence: 0.2, shoulder: 0.2, fov: 66 }),
  FWD: Object.freeze({ label: 'Attaquant', height: 6.8, distance: 11.6, lookAhead: 8.1, visionRange: 26, ballInfluence: 0.14, shoulder: 0.16, fov: 64 })
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function resolvePlayerCameraProfile(role) {
  return PLAYER_CAMERA_PROFILES[role] || PLAYER_CAMERA_PROFILES.MID;
}

/**
 * Retourne une pose caméra déterministe. Le ballon ne peut attirer le regard
 * que s'il est devant le joueur et à portée de perception : pas de vision omnisciente.
 */
export function resolvePlayerCameraPose(player, ball, { zoom = 55, aspect = 1.7 } = {}) {
  const profile = resolvePlayerCameraProfile(player?.role);
  const x = finite(player?.pos?.x);
  const z = finite(player?.pos?.z);
  const facing = finite(player?.facing);
  const forwardX = Math.sin(facing);
  const forwardZ = Math.cos(facing);
  const rightX = Math.cos(facing);
  const rightZ = -Math.sin(facing);
  const numericZoom = clamp(finite(zoom, 55), 0, 100);
  const narrowFactor = finite(aspect, 1.7) < 1.55 ? 1.1 : 1;
  const zoomFactor = 1.22 - numericZoom / 100 * 0.38;
  const distance = profile.distance * zoomFactor * narrowFactor;
  const height = profile.height * (finite(aspect, 1.7) < 1.55 ? 1.06 : 1) * zoomFactor;

  let ballWeight = 0;
  let ballDX = 0;
  let ballDZ = 0;
  if (ball?.pos && Number.isFinite(ball.pos.x) && Number.isFinite(ball.pos.z)) {
    ballDX = ball.pos.x - x;
    ballDZ = ball.pos.z - z;
    const ballDistance = Math.hypot(ballDX, ballDZ);
    if (ballDistance > 0.001 && ballDistance <= profile.visionRange) {
      const forwardAlignment = (ballDX * forwardX + ballDZ * forwardZ) / ballDistance;
      const visibility = clamp((forwardAlignment - 0.05) / 0.95, 0, 1) * clamp(1 - ballDistance / profile.visionRange, 0, 1);
      ballWeight = profile.ballInfluence * visibility;
    }
  }

  return {
    x: x - forwardX * distance + rightX * profile.shoulder,
    y: height,
    z: z - forwardZ * distance + rightZ * profile.shoulder,
    targetX: x + forwardX * profile.lookAhead + ballDX * ballWeight,
    targetY: 1.15,
    targetZ: z + forwardZ * profile.lookAhead + ballDZ * ballWeight,
    fov: profile.fov,
    ballWeight,
    role: player?.role in PLAYER_CAMERA_PROFILES ? player.role : 'MID'
  };
}
