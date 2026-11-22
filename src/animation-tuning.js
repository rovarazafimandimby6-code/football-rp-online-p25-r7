const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** Procedural gait parameters for the existing articulated Three.js rig. */
export function gaitProfile(speed, stamina = 1, lateralSpeed = 0) {
  const fatigue = 1 - clamp(stamina, 0, 1);
  const running = speed > 5.8;
  return {
    running,
    strideRate: clamp(speed * (running ? 1.75 : 2.05), 0, 18),
    strideAmplitude: (running ? 0.78 : 0.42) * (1 - fatigue * 0.12),
    bodyLean: (running ? 0.18 : 0.07) + fatigue * 0.025,
    lateralLean: clamp(lateralSpeed * 0.035, -0.22, 0.22),
    armDrive: running ? 0.75 : 0.55
  };
}

/** Selects the animation leg from the player's dominant foot. */
export function kickingSide(preferredFoot) {
  return preferredFoot === 'left' ? 'left' : 'right';
}
