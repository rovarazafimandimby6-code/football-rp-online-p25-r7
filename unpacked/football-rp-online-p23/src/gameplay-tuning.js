const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
const attr = (p, key, fallback = 50) => clamp(Number(p?.attributes?.[key] ?? p?.profile?.progression?.attributes?.[key] ?? fallback), 1, 99);

/** Skill-driven ball handling shared by human and AI players. */
export function firstTouchRetention(player, ballSpeed, approach = 0) {
  const control = attr(player, 'control');
  const speedPenalty = clamp(Math.max(0, ballSpeed - 4) / 28, 0, 0.72);
  const bodyPenalty = clamp((0.35 - approach) * 0.22, 0, 0.18);
  return clamp(0.035 + (100 - control) / 100 * 0.22 + speedPenalty + bodyPenalty, 0.025, 0.82);
}

export function dribbleLead(player, speed = 0) {
  const control = attr(player, 'control');
  return clamp(0.48 + control / 100 * 0.38 + Math.max(0, speed) * 0.018, 0.48, 1.12);
}

/** Alternating foot-to-ball touch offsets for a controlled dribble. */
export function dribbleTouchOffset(player, phase, speed = 0) {
  const control = attr(player, 'control');
  const preferred = player?.preferredFoot || player?.profile?.identity?.preferredFoot || 'right';
  const footPhase = (Number.isFinite(phase) ? phase : 0) + (preferred === 'left' ? Math.PI : 0);
  const rhythm = Math.sin(footPhase);
  const intensity = clamp(0.085 + (100 - control) * 0.00045 + Math.max(0, speed) * 0.004, 0.075, 0.16);
  return {
    lateral: rhythm * intensity,
    forward: Math.max(0, Math.cos(footPhase)) * intensity * 0.28
  };
}

/** Duel de tacle : avantage défensif modulé par la maîtrise du porteur et la qualité d'approche. */
export function tackleControlScore(tackler, victim, distance = 1.2, closingSpeed = 0) {
  const defense = attr(tackler, 'defense');
  const control = attr(victim, 'control');
  const tackling = attr(tackler, 'tackling', defense);
  const rangePenalty = clamp(Math.max(0, distance - 0.45) * 0.24, 0, 0.3);
  const speedBonus = clamp(Math.max(0, closingSpeed - 2) * 0.018, 0, 0.12);
  return clamp(0.38 + (defense - 50) * 0.0035 + (tackling - 50) * 0.0025
    - (control - 50) * 0.0028 - rangePenalty + speedBonus, 0.12, 0.9);
}

/** Portée de prise du gardien : réflexes/prise en main contre vitesse du tir. */
export function goalkeeperSaveReach(distance, goalkeeper, ballSpeed = 0) {
  const reflexes = attr(goalkeeper, 'reflexes', attr(goalkeeper, 'goalkeeping', 50));
  const handling = attr(goalkeeper, 'handling', attr(goalkeeper, 'goalkeeping', 50));
  const skill = (reflexes * 0.65 + handling * 0.35) / 100;
  const reactionPenalty = clamp(Math.max(0, ballSpeed - 8) * 0.025, 0, 0.2);
  return clamp(1.05 + skill * 0.72 - reactionPenalty + Math.max(0, 2.4 - distance) * 0.08, 0.9, 1.85);
}

export function skillAccuracy(player, skill = 'passing', pressure = 0, foot = 'right') {
  const rating = attr(player, skill);
  const preferred = player?.preferredFoot || player?.profile?.identity?.preferredFoot || 'right';
  const footPenalty = foot && preferred !== foot ? 0.12 : 0;
  return clamp(0.72 + rating / 100 * 0.28 - clamp(pressure, 0, 1) * 0.2 - footPenalty, 0.48, 1);
}

export function dominantFootFactor(player, foot) {
  const preferred = player?.preferredFoot || player?.profile?.identity?.preferredFoot || 'right';
  return preferred === foot ? 1 : 0.88;
}

/** Select the contact foot from the ball's lateral position relative to body facing. */
export function strikeFoot(player, ball) {
  const dx = (ball?.pos?.x ?? player?.pos?.x ?? 0) - (player?.pos?.x ?? 0);
  const dz = (ball?.pos?.z ?? player?.pos?.z ?? 0) - (player?.pos?.z ?? 0);
  const facing = Number.isFinite(player?.facing) ? player.facing : 0;
  const lateral = dx * Math.cos(facing) - dz * Math.sin(facing);
  return lateral < 0 ? 'left' : 'right';
}


/** Controlled lateral spin for shots; technical skill and weak-foot contact reduce it. */
export function shotSpin(player, foot = 'right', power = 0.8, aimSide = 0) {
  const shooting = attr(player, 'shooting');
  const control = attr(player, 'control');
  const preferred = player?.preferredFoot || player?.profile?.identity?.preferredFoot || 'right';
  const footQuality = preferred === foot ? 1 : 0.72;
  const side = clamp(aimSide, -1, 1);
  const strength = clamp((0.18 + shooting / 160 + control / 500) * clamp(power, 0, 1) * footQuality, 0.12, 0.95);
  return clamp(side * strength, -0.95, 0.95);
}

/** Bounded Magnus-like lateral acceleration for a spinning airborne/rolling ball. */
export function spinAcceleration(velocity, spin) {
  const vx = Number.isFinite(velocity?.x) ? velocity.x : 0;
  const vz = Number.isFinite(velocity?.z) ? velocity.z : 0;
  const speed = Math.hypot(vx, vz);
  const s = clamp(spin, -1, 1);
  const magnitude = Math.min(4.2, speed * 0.16) * s;
  return { x: (vz / (speed || 1)) * magnitude, z: (-vx / (speed || 1)) * magnitude };
}
