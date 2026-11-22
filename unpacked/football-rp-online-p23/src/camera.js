import * as THREE from 'three';
import { rolePresentation } from './role-presentation.js';

/** Caméra de retransmission : suit le ballon avec anticipation et conserve
 * une marge de lecture autour de l'action, y compris sur les écrans étroits. */
export { CAMERA_PRESETS } from './camera-presets.js';
import { CAMERA_PRESETS, resolveCameraMode } from './camera-presets.js';

export class BroadcastCamera {
  constructor(camera, mode = 'broadcast') {
    this.mode = resolveCameraMode(mode);
    this.camera = camera;
    this.camera.fov = CAMERA_PRESETS[this.mode].fov;
    this.camera.updateProjectionMatrix();
    this.lookTarget = new THREE.Vector3(0, 0.45, 0);
    this.camPos = new THREE.Vector3(0, 27, 42);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.lookTarget);
    this.lastFocus = new THREE.Vector3();
    this.initialized = false;
    this.zoom = 55; // P25 : cadrage de référence Diffusion TV
  }

  setZoom(value) {
    const numeric = Number(value);
    this.zoom = THREE.MathUtils.clamp(Number.isFinite(numeric) ? numeric : 55, 0, 100);
    return this.zoom;
  }

  setMode(mode) {
    if (!CAMERA_PRESETS[mode]) return false;
    this.mode = mode;
    this.camera.fov = CAMERA_PRESETS[mode].fov;
    this.camera.updateProjectionMatrix();
    return true;
  }

  update(ball, activePlayer, dt) {
    const preset = CAMERA_PRESETS[this.mode];
    const role = rolePresentation(activePlayer?.role);
    const aspect = this.camera.aspect || 1.7;
    const narrowScreen = aspect < 1.55;
    const ballSpeed = Math.hypot(ball.vel?.x || 0, ball.vel?.z || 0);

    // L'action reste le point focal, avec une légère anticipation dans le sens du jeu.
    const lead = Math.min(2.8, ballSpeed * 0.075);
    const vx = ball.vel?.x || 0;
    const vz = ball.vel?.z || 0;
    const playerWeight = ball.owner && activePlayer && ball.owner === activePlayer ? role.playerWeight : role.playerWeight * 0.72;
    const focusX = ball.pos.x * (1 - playerWeight) + (activePlayer?.pos.x || ball.pos.x) * playerWeight + Math.sign(vx) * lead;
    const focusZ = ball.pos.z * 0.84 + (activePlayer?.pos.z || ball.pos.z) * 0.16 + Math.sign(vz) * lead * 0.45;

    const nearGoal = Math.max(0, (Math.abs(ball.pos.x) - 16) / 12);
    const baseHeight = preset.height + (narrowScreen ? 2.5 : 0) + (role.cameraHeight - 25) * 0.12;
    const baseDistance = preset.distance + (narrowScreen ? 5 : 0) + (role.cameraDistance - 40) * 0.18;
    // 55 % est le cadrage de référence P25 ; les extrêmes restent modérés pour préserver la lecture du jeu.
    const zoomFactor = 1.18 - (this.zoom / 100) * 0.38;
    const desiredY = (baseHeight - nearGoal * (narrowScreen ? 1.8 : 2.8)) * zoomFactor;
    const desiredZ = THREE.MathUtils.clamp((focusZ * 0.42 + baseDistance - nearGoal * 1.8) * zoomFactor, narrowScreen ? 24 : 20, narrowScreen ? 62 : 58);
    const desiredX = THREE.MathUtils.clamp(focusX * role.cameraWidth * preset.width * 0.72, -19, 19);

    // Lissage exponentiel indépendant du framerate.
    const frameDelta = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, 0.05) : 0;
    const smooth = 1 - Math.exp(-(activePlayer?.role === 'GK' ? 3.1 : 4.0) * frameDelta);
    const sideOffset = preset.angle * (activePlayer?.team === 'red' ? -1 : 1) * 5;
    this.camPos.x += (desiredX + sideOffset - this.camPos.x) * smooth;
    this.camPos.y += (desiredY - this.camPos.y) * smooth;
    this.camPos.z += (desiredZ - this.camPos.z) * smooth;
    this.lookTarget.x += (focusX - this.lookTarget.x) * smooth;
    this.lookTarget.y += (0.45 - this.lookTarget.y) * smooth;
    this.lookTarget.z += (focusZ - this.lookTarget.z) * smooth;

    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.lookTarget);
  }
}
