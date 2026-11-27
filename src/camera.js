import * as THREE from 'three';
import { rolePresentation } from './role-presentation.js';
import { resolvePlayerCameraPose } from './player-camera.js';

/** Caméra de retransmission : suit le ballon avec anticipation et conserve
 * une marge de lecture autour de l'action, y compris sur les écrans étroits. */
export { CAMERA_PRESETS } from './camera-presets.js';
import { CAMERA_PRESETS, resolveCameraMode } from './camera-presets.js';

export class BroadcastCamera {
  constructor(camera, mode = 'broadcast') {
    this.mode = resolveCameraMode(mode);
    this.camera = camera;
    this.camera.fov = CAMERA_PRESETS[this.mode]?.fov ?? (this.mode === 'spectator' ? 46 : 65);
    this.camera.updateProjectionMatrix();
    this.lookTarget = new THREE.Vector3(0, 0.45, 0);
    this.camPos = new THREE.Vector3(0, 27, 42);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.lookTarget);
    this.lastFocus = new THREE.Vector3();
    this.initialized = false;
    this.desiredCamPos = new THREE.Vector3();
    this.desiredLookTarget = new THREE.Vector3();
    this.zoom = 55; // P27 : zoom partagé entre les vues TV et personnelle
    this.transition = null;
    this.transitionLookTarget = new THREE.Vector3();
  }

  setZoom(value) {
    const numeric = Number(value);
    this.zoom = THREE.MathUtils.clamp(Number.isFinite(numeric) ? numeric : 55, 0, 100);
    return this.zoom;
  }

  setMode(mode) {
    if (mode !== 'player' && mode !== 'bench' && mode !== 'spectator' && !CAMERA_PRESETS[mode]) return false;
    if (mode === this.mode) return true;
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.lookTarget.clone(),
      elapsed: 0,
      duration: 0.32
    };
    this.mode = mode;
    this.camera.fov = CAMERA_PRESETS[mode]?.fov ?? (mode === 'spectator' ? 46 : 65);
    this.camera.updateProjectionMatrix();
    return true;
  }

  update(ball, activePlayer, dt) {
    if (this.mode === 'bench') {
      this.updateBenchCamera(ball, activePlayer, dt);
      this.applyTransition(dt);
      return;
    }
    if (this.mode === 'player') {
      this.updatePlayerCamera(ball, activePlayer, dt);
      this.applyTransition(dt);
      return;
    }
    if (this.mode === 'spectator') {
      this.updateSpectatorCamera(ball, dt);
      this.applyTransition(dt);
      return;
    }
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
    this.initialized = true;
    this.applyTransition(dt);
  }

  /** Smoothly blend camera mode changes instead of snapping between viewpoints. */
  applyTransition(dt) {
    if (!this.transition) return;
    const frameDelta = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, 0.05) : 0;
    this.transition.elapsed = Math.min(this.transition.duration, this.transition.elapsed + frameDelta);
    const linear = this.transition.elapsed / this.transition.duration;
    const blend = linear * linear * (3 - 2 * linear);
    this.camera.position.lerpVectors(this.transition.fromPosition, this.camPos, blend);
    this.transitionLookTarget.lerpVectors(this.transition.fromTarget, this.lookTarget, blend);
    this.camera.lookAt(this.transitionLookTarget);
    if (linear >= 1) this.transition = null;
  }


  /** Vue spectateur panoramique : lecture des deux équipes et de l'espace collectif. */
  updateSpectatorCamera(ball, dt) {
    const focusX = THREE.MathUtils.clamp(Number(ball?.pos?.x) || 0, -13, 13) * 0.42;
    const focusZ = THREE.MathUtils.clamp(Number(ball?.pos?.z) || 0, -25, 25) * 0.28;
    const frameDelta = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, 0.05) : 0;
    const smooth = 1 - Math.exp(-2.1 * frameDelta);
    const zoomFactor = 1.12 - (this.zoom / 100) * 0.22;
    const desiredX = focusX;
    const desiredY = 34 * zoomFactor;
    const desiredZ = 49 * zoomFactor + focusZ;
    this.camPos.x += (desiredX - this.camPos.x) * smooth;
    this.camPos.y += (desiredY - this.camPos.y) * smooth;
    this.camPos.z += (desiredZ - this.camPos.z) * smooth;
    this.lookTarget.x += (focusX - this.lookTarget.x) * smooth;
    this.lookTarget.y += (0.35 - this.lookTarget.y) * smooth;
    this.lookTarget.z += (focusZ - this.lookTarget.z) * smooth;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.lookTarget);
    this.initialized = true;
  }

  /** Vue spectateur depuis la ligne de touche lorsque le joueur est remplaçant. */
  updateBenchCamera(ball, player, dt) {
    const side = player?.team === 'red' ? 1 : -1;
    const focusX = Number.isFinite(ball?.pos?.x) ? ball.pos.x : 0;
    const focusZ = Number.isFinite(ball?.pos?.z) ? ball.pos.z : 0;
    const frameDelta = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, 0.05) : 0;
    const smooth = 1 - Math.exp(-2.8 * frameDelta);
    const desiredX = THREE.MathUtils.clamp(focusX * 0.42, -15, 15);
    const desiredY = 18;
    const desiredZ = side * 37;
    this.camPos.x += (desiredX - this.camPos.x) * smooth;
    this.camPos.y += (desiredY - this.camPos.y) * smooth;
    this.camPos.z += (desiredZ - this.camPos.z) * smooth;
    this.lookTarget.x += (focusX - this.lookTarget.x) * smooth;
    this.lookTarget.y += (0.45 - this.lookTarget.y) * smooth;
    this.lookTarget.z += (focusZ - this.lookTarget.z) * smooth;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.lookTarget);
    this.initialized = true;
  }

  /** Caméra personnelle : elle reste ancrée au footballeur, jamais au ballon seul. */
  updatePlayerCamera(ball, activePlayer, dt) {
    if (!activePlayer?.pos) return;
    const pose = resolvePlayerCameraPose(activePlayer, ball, { zoom: this.zoom, aspect: this.camera.aspect || 1.7 });
    if (Math.abs(this.camera.fov - pose.fov) > 0.01) {
      this.camera.fov = pose.fov;
      this.camera.updateProjectionMatrix();
    }
    this.desiredCamPos.set(pose.x, pose.y, pose.z);
    this.desiredLookTarget.set(pose.targetX, pose.targetY, pose.targetZ);
    const frameDelta = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, 0.05) : 0;
    const smooth = 1 - Math.exp(-5.4 * frameDelta);
    if (!this.initialized) {
      this.camPos.copy(this.desiredCamPos);
      this.lookTarget.copy(this.desiredLookTarget);
      this.initialized = true;
    } else {
      this.camPos.lerp(this.desiredCamPos, smooth);
      this.lookTarget.lerp(this.desiredLookTarget, smooth);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.lookTarget);
    this.applyTransition(dt);
  }
}
