import * as THREE from 'three';
import { PITCH } from './pitch.js';

function createBallTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 256, 128);

  // Motifs classiques de ballon visibles pendant la rotation
  ctx.fillStyle = '#182028';
  const spots = [
    [32, 32], [96, 32], [160, 32], [224, 32],
    [64, 92], [128, 92], [192, 92], [0, 92], [256, 92]
  ];
  for (const [cx, cy] of spots) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
      const r = 17;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = '#c8d2dc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 64);
  ctx.lineTo(256, 64);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Ball {
  constructor(scene) {
    this.pos = new THREE.Vector3(0, PITCH.BALL_R, 0);
    this.vel = new THREE.Vector3(0, 0, 0);
    this.lastTouchTeam = null;
    this.lastTouchPlayer = null;
    this.owner = null;
    this.spin = 0;

    const geo = new THREE.SphereGeometry(PITCH.BALL_R, 18, 14);
    const mat = new THREE.MeshLambertMaterial({ map: createBallTexture() });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(PITCH.BALL_R * 1.15, 14),
      new THREE.MeshBasicMaterial({ color: 0x041209, transparent: true, opacity: 0.4, depthWrite: false })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.025;

    scene.add(this.mesh, this.shadow);
  }

  reset(x = 0, z = 0) {
    this.pos.set(x, PITCH.BALL_R, z);
    this.vel.set(0, 0, 0);
    this.owner = null;
    this.spin = 0;
    this.lastTouchTeam = null;
    this.lastTouchPlayer = null;
    this.syncVisual(0);
  }

  kick(vx, vy, vz, player, spin = 0) {
    this.vel.set(vx, vy, vz);
    this.spin = Number.isFinite(spin) ? Math.max(-1, Math.min(1, spin)) : 0;
    this.owner = null;
    if (player) {
      this.lastTouchTeam = player.team;
      this.lastTouchPlayer = player;
    }
  }

  syncVisual(dt) {
    this.mesh.position.copy(this.pos);

    // Rotation physique cohérente avec le déplacement au sol
    const speedXZ = Math.hypot(this.vel.x, this.vel.z);
    if (speedXZ > 0.05 && dt > 0) {
      const axis = new THREE.Vector3(this.vel.z, 0, -this.vel.x).normalize();
      const angle = (speedXZ * dt) / PITCH.BALL_R;
      this.mesh.rotateOnWorldAxis(axis, angle);
    }

    const hScale = Math.max(0.55, 1 - this.pos.y * 0.12);
    this.shadow.position.set(this.pos.x, 0.025, this.pos.z);
    this.shadow.scale.setScalar(hScale);
    this.shadow.material.opacity = Math.max(0.14, 0.42 - this.pos.y * 0.06);
  }
}