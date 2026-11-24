/** Presets de caméra mobile, séparés du moteur Three.js pour être testables. */
export const CAMERA_PRESETS = Object.freeze({
  touchline: Object.freeze({ label: 'Ligne de touche', height: 22, distance: 31, fov: 49, width: 1.0, angle: 0.12 }),
  broadcast: Object.freeze({ label: 'Diffusion TV', height: 20, distance: 34, fov: 49, width: 0.96, angle: 0.24 }),
  close: Object.freeze({ label: 'Rapprochée', height: 19, distance: 27, fov: 50, width: 0.78, angle: 0.18 }),
  tactical: Object.freeze({ label: 'Tactique', height: 35, distance: 53, fov: 43, width: 1.28, angle: 0.42 }),
  spectator: Object.freeze({ label: 'Spectateur', height: 31, distance: 49, fov: 46, width: 1.18, angle: 0.34 })
});

export function resolveCameraMode(mode) {
  return mode === 'player' || Object.hasOwn(CAMERA_PRESETS, mode) ? mode : 'broadcast';
}
