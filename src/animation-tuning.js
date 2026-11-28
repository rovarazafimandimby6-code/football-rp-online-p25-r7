const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** Procedural gait parameters for the existing articulated Three.js rig. */
export function gaitProfile(speed, stamina = 1, lateralSpeed = 0, acceleration = 0, turnRate = 0, out = {}) {
  const fatigue = 1 - clamp(stamina, 0, 1);
  const running = speed > 5.8;
  out.running = running;
  out.strideRate = clamp(speed * (running ? 1.75 : 2.05), 0, 18);
  out.strideAmplitude = (running ? 0.78 : 0.42) * (1 - fatigue * 0.12);
  out.bodyLean = (running ? 0.18 : 0.07) + fatigue * 0.025;
  out.lateralLean = clamp(lateralSpeed * 0.035, -0.22, 0.22);
  out.armDrive = running ? 0.75 : 0.55;
  // Le corps réagit à la poussée et au freinage sans changer la physique du joueur.
  out.accelerationLean = clamp(acceleration * 0.006, -0.12, 0.12);
  // Inclinaison de changement d'appui, bornée pour éviter les poses exagérées.
  out.turnLean = clamp(turnRate * 0.018, -0.14, 0.14);
  return out;
}

/** Selects the animation leg from the player's dominant foot. */
export function kickingSide(preferredFoot) {
  return preferredFoot === 'left' ? 'left' : 'right';
}
