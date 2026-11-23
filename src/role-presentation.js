/** Presentation presets for a single human-controlled footballer. */
export const ROLE_PRESENTATION = Object.freeze({
  GK: Object.freeze({ label: 'GARDIEN', cameraHeight: 24, cameraDistance: 35, cameraWidth: 1.12, playerWeight: 0.34, joystickExponent: 1.12, joystickGain: 0.92, actions: { shoot: 'DÉGAGEMENT / PLONGEON', pass: 'RELANCE', defend: 'SORTIE / PLONGEON' } }),
  DEF: Object.freeze({ label: 'DÉFENSEUR', cameraHeight: 25, cameraDistance: 39, cameraWidth: 1.06, playerWeight: 0.24, joystickExponent: 1.04, joystickGain: 1, actions: { shoot: 'TIR / TACLE', pass: 'PASSE / PRESSION', defend: 'RELANCE LOBÉE' } }),
  MID: Object.freeze({ label: 'MILIEU', cameraHeight: 27, cameraDistance: 43, cameraWidth: 1.16, playerWeight: 0.18, joystickExponent: 0.94, joystickGain: 1.04, actions: { shoot: 'TIR', pass: 'PASSE / PRESSION', defend: 'PASSE LOBÉE' } }),
  FWD: Object.freeze({ label: 'ATTAQUANT', cameraHeight: 25, cameraDistance: 40, cameraWidth: 1.04, playerWeight: 0.16, joystickExponent: 0.88, joystickGain: 1.08, actions: { shoot: 'FRAPPE', pass: 'PASSE', defend: 'PASSE LOBÉE' } })
});

export function rolePresentation(role) {
  return ROLE_PRESENTATION[role] || ROLE_PRESENTATION.MID;
}

export function shapeJoystickVector(x, z, role) {
  const profile = rolePresentation(role);
  const length = Math.hypot(x, z);
  const raw = Math.min(1, length);
  if (raw < 0.035 || length === 0) return { x: 0, z: 0, mag: 0 };
  const magnitude = Math.min(1, Math.pow(raw, profile.joystickExponent) * profile.joystickGain);
  const scale = magnitude / length;
  return { x: x * scale, z: z * scale, mag: magnitude };
}

/** Selects the user's own blue-team avatar matching the role saved in their profile. */
export function selectRolePlayer(players, role) {
  const wanted = ROLE_PRESENTATION[role] ? role : 'FWD';
  return players.find(player => player.team === 'blue' && player.role === wanted)
    || players.find(player => player.team === 'blue' && player.slotIndex === 4)
    || players.find(player => player.team === 'blue')
    || null;
}
