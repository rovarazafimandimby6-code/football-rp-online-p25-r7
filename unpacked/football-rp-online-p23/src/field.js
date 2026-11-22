import * as THREE from 'three';

export { PITCH } from './pitch.js';
import { PITCH } from './pitch.js';

function createGrassTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const stripes = 20;
  const sw = canvas.width / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#267a3d' : '#318b45';
    ctx.fillRect(i * sw, 0, sw + 1, canvas.height);
  }

  // Micro-texture naturelle légère
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let i = 0; i < 5200; i++) {
    const x = (i * 193) % 1024;
    const y = (i * 317) % 512;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(205,235,174,0.10)' : 'rgba(7,45,18,0.09)';
    ctx.fillRect(x, y, 1 + (i % 2), 3 + (i % 4));
  }
  const edgeShade = ctx.createLinearGradient(0, 0, 0, 512);
  edgeShade.addColorStop(0, 'rgba(0,0,0,0.10)');
  edgeShade.addColorStop(0.5, 'rgba(255,255,255,0.015)');
  edgeShade.addColorStop(1, 'rgba(0,0,0,0.10)');
  ctx.fillStyle = edgeShade;
  ctx.fillRect(0, 0, 1024, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createNetTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(245, 252, 255, 0.72)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 64; i += 16) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 64); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(64, i); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 3);
  return tex;
}

export class FieldBuilder {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.floodlightBulbs = [];
    this.crowdMesh = null;
    this.netPanels = [];
    this.cornerFlags = [];
    this.goalPulse = 0;
    this.netAnimating = false;
    this.elapsed = 0;
    this.build();
    scene.add(this.group);
  }

  build() {
    // Pourtour stade (piste / pelouse extérieure)
    const outerGeo = new THREE.PlaneGeometry(PITCH.L + 24, PITCH.W + 22);
    const outerMat = new THREE.MeshLambertMaterial({ color: 0x1e5c31 });
    const outer = new THREE.Mesh(outerGeo, outerMat);
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.02;
    outer.receiveShadow = true;
    this.group.add(outer);

    // Pelouse principale en 3D
    const turfGeo = new THREE.PlaneGeometry(PITCH.L, PITCH.W);
    const turfMat = new THREE.MeshStandardMaterial({ map: createGrassTexture(), roughness: 0.92, metalness: 0.0 });
    const turf = new THREE.Mesh(turfGeo, turfMat);
    turf.rotation.x = -Math.PI / 2;
    turf.receiveShadow = true;
    this.group.add(turf);

    this.buildLines();
    this.buildCornerFlags();
    this.buildTechnicalAreas();
    this.buildGoal(-1);
    this.buildGoal(1);
    this.buildStadium();
  }

  addLineRect(x, z, w, d, thickness = 0.14) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xf6fff7 });
    const y = 0.015;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(w, thickness), mat);
    top.rotation.x = -Math.PI / 2;
    top.position.set(x, y, z - d / 2);

    const bot = new THREE.Mesh(new THREE.PlaneGeometry(w, thickness), mat);
    bot.rotation.x = -Math.PI / 2;
    bot.position.set(x, y, z + d / 2);

    const left = new THREE.Mesh(new THREE.PlaneGeometry(thickness, d), mat);
    left.rotation.x = -Math.PI / 2;
    left.position.set(x - w / 2, y, z);

    const right = new THREE.Mesh(new THREE.PlaneGeometry(thickness, d), mat);
    right.rotation.x = -Math.PI / 2;
    right.position.set(x + w / 2, y, z);

    this.group.add(top, bot, left, right);
  }

  buildLines() {
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf6fff7 });
    const y = 0.016;

    // Lignes extérieures
    this.addLineRect(0, 0, PITCH.L, PITCH.W, 0.16);

    // Ligne médiane
    const mid = new THREE.Mesh(new THREE.PlaneGeometry(0.16, PITCH.W), lineMat);
    mid.rotation.x = -Math.PI / 2;
    mid.position.set(0, y, 0);
    this.group.add(mid);

    // Cercle central et point d'engagement
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.75, 4.92, 40), lineMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, y, 0);
    this.group.add(ring);

    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.24, 16), lineMat);
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(0, y + 0.002, 0);
    this.group.add(spot);

    // Surfaces de réparation, surfaces de but et points de penalty
    for (const dir of [-1, 1]) {
      const boxW = 9.2;
      const boxD = 18.0;
      this.addLineRect(dir * (PITCH.HALF_L - boxW / 2), 0, boxW, boxD);

      const sixW = 3.8;
      const sixD = 9.6;
      this.addLineRect(dir * (PITCH.HALF_L - sixW / 2), 0, sixW, sixD);

      const penSpot = new THREE.Mesh(new THREE.CircleGeometry(0.2, 14), lineMat);
      penSpot.rotation.x = -Math.PI / 2;
      penSpot.position.set(dir * (PITCH.HALF_L - 6.6), y + 0.002, 0);
      this.group.add(penSpot);
    }

    // Arcs de penalty (9,15 m) orientés vers le centre du terrain.
    for (const dir of [-1, 1]) {
      const arc = new THREE.Mesh(new THREE.RingGeometry(9.05, 9.18, 48, 1, dir < 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI), lineMat);
      arc.rotation.x = -Math.PI / 2;
      arc.position.set(dir * (PITCH.HALF_L - 6.6), y, 0);
      this.group.add(arc);
    }

    // Arcs de corner
    const corners = [
      [-PITCH.HALF_L, -PITCH.HALF_W, 0],
      [PITCH.HALF_L, -PITCH.HALF_W, -Math.PI / 2],
      [PITCH.HALF_L, PITCH.HALF_W, Math.PI],
      [-PITCH.HALF_L, PITCH.HALF_W, Math.PI / 2]
    ];
    for (const [cx, cz, rot] of corners) {
      const arc = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.1, 12, 1, 0, Math.PI / 2), lineMat);
      arc.rotation.x = -Math.PI / 2;
      arc.rotation.z = rot;
      arc.position.set(cx, y, cz);
      this.group.add(arc);
    }
  }

  buildCornerFlags() {
    const poleMat = new THREE.MeshLambertMaterial({ color: 0xf4f5f7 });
    const flagMats = [new THREE.MeshLambertMaterial({ color: 0x2878f0 }), new THREE.MeshLambertMaterial({ color: 0xe4473d })];
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(0.62, -0.16); shape.lineTo(0, -0.42); shape.closePath();
    const flagGeo = new THREE.ShapeGeometry(shape);
    for (const [x, z, colorIndex] of [[-PITCH.HALF_L,-PITCH.HALF_W,0],[-PITCH.HALF_L,PITCH.HALF_W,1],[PITCH.HALF_L,-PITCH.HALF_W,1],[PITCH.HALF_L,PITCH.HALF_W,0]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.35, 6), poleMat);
      pole.position.set(x, 0.675, z);
      const flagPivot = new THREE.Group();
      flagPivot.position.set(x, 1.27, z);
      const flag = new THREE.Mesh(flagGeo, flagMats[colorIndex]);
      flagPivot.add(flag);
      this.cornerFlags.push({ pivot: flagPivot, phase: this.cornerFlags.length * 1.7 });
      this.group.add(pole, flagPivot);
    }
  }

  buildTechnicalAreas() {
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x26343c });
    const seatMat = new THREE.MeshLambertMaterial({ color: 0x687987 });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x17232b });
    for (const side of [-1, 1]) {
      const x = side * 8.2;
      const z = side * (PITCH.HALF_W + 5.4);
      const base = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.28, 2.0), baseMat);
      base.position.set(x, 0.14, z);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.16, 2.15), roofMat);
      roof.position.set(x, 2.05, z);
      const back = new THREE.Mesh(new THREE.BoxGeometry(9.2, 1.75, 0.12), seatMat);
      back.position.set(x, 1.05, z - side * 0.92);
      this.group.add(base, roof, back);
      for (let n = -3; n <= 3; n++) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.22, 0.55), seatMat);
        seat.position.set(x + n * 1.2, 0.62, z);
        this.group.add(seat);
      }
    }
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xdce8e5 });
    for (const side of [-1, 1]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(12, 0.025, 0.08), lineMat);
      line.position.set(0, 0.025, side * (PITCH.HALF_W + 2.8));
      this.group.add(line);
    }
  }

  triggerGoal() {
    // Le moteur d'événements ne fournit pas encore le côté exact de la cage :
    // les deux filets reçoivent donc une impulsion discrète et cohérente.
    this.goalPulse = 1;
    this.netAnimating = true;
  }

  update(dt) {
    const step = Math.max(0, Math.min(Number(dt) || 0, 0.05));
    this.elapsed += step;
    this.goalPulse = Math.max(0, this.goalPulse - step * 1.8);
    // Les filets ne sont recalculés que pendant l'impulsion d'un but.
    if (this.goalPulse > 0.001) {
      for (const panel of this.netPanels) {
        const attr = panel.mesh.geometry.attributes.position;
        const amplitude = this.goalPulse * 0.22;
        for (let i = 0; i < attr.count; i++) {
          const x = panel.base[i * 3];
          const y = panel.base[i * 3 + 1];
          const wave = Math.sin(this.elapsed * 24 - y * 3 + x * 1.7) * amplitude;
          attr.setZ(i, panel.base[i * 3 + 2] + wave);
        }
        attr.needsUpdate = true;
        panel.mesh.geometry.computeVertexNormals();
      }
    } else if (this.netAnimating) {
      // Retour exact à la position initiale, une seule fois à la fin de l'impulsion.
      for (const panel of this.netPanels) {
        const attr = panel.mesh.geometry.attributes.position;
        attr.array.set(panel.base);
        attr.needsUpdate = true;
        panel.mesh.geometry.computeVertexNormals();
      }
      this.netAnimating = false;
    }
    // Animation très légère des fanions, indépendante de la physique du match.
    for (const flag of this.cornerFlags) {
      flag.pivot.rotation.z = Math.sin(this.elapsed * 2.2 + flag.phase) * 0.055;
    }
  }

  buildGoal(side) {
    const g = new THREE.Group();
    const xLine = side * PITCH.HALF_L;
    const xBack = side * (PITCH.HALF_L + PITCH.GOAL_D);
    const hw = PITCH.GOAL_W / 2;
    const h = PITCH.GOAL_H;

    const postMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const postGeo = new THREE.CylinderGeometry(0.085, 0.085, h, 10);

    const leftPost = new THREE.Mesh(postGeo, postMat);
    leftPost.position.set(xLine, h / 2, -hw);
    const rightPost = new THREE.Mesh(postGeo, postMat);
    rightPost.position.set(xLine, h / 2, hw);

    const barGeo = new THREE.CylinderGeometry(0.085, 0.085, PITCH.GOAL_W + 0.16, 10);
    const crossbar = new THREE.Mesh(barGeo, postMat);
    crossbar.rotation.x = Math.PI / 2;
    crossbar.position.set(xLine, h, 0);

    // Cadre arrière léger
    const supportMat = new THREE.MeshLambertMaterial({ color: side < 0 ? 0x2a76f0 : 0xe0483f });
    for (const sz of [-hw, hw]) {
      const backPost = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, h, 8), supportMat);
      backPost.position.set(xBack, h / 2, sz);
      const topSide = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, PITCH.GOAL_D, 8), supportMat);
      topSide.rotation.z = Math.PI / 2;
      topSide.position.set((xLine + xBack) / 2, h, sz);
      g.add(backPost, topSide);
    }

    // Filets
    const netMat = new THREE.MeshBasicMaterial({
      map: createNetTexture(),
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    // Panneau arrière subdivisé : sa maille vibre brièvement après un but.
    const backNetGeo = new THREE.PlaneGeometry(PITCH.GOAL_W, h, 10, 6);
    const backNet = new THREE.Mesh(backNetGeo, netMat);
    backNet.position.set(xBack, h / 2, 0);
    backNet.rotation.y = Math.PI / 2;
    this.netPanels.push({ mesh: backNet, base: backNetGeo.attributes.position.array.slice(), side });

    const topNet = new THREE.Mesh(new THREE.PlaneGeometry(PITCH.GOAL_D, PITCH.GOAL_W), netMat);
    topNet.position.set((xLine + xBack) / 2, h, 0);
    topNet.rotation.x = Math.PI / 2;

    const sideNetL = new THREE.Mesh(new THREE.PlaneGeometry(PITCH.GOAL_D, h), netMat);
    sideNetL.position.set((xLine + xBack) / 2, h / 2, -hw);
    const sideNetR = new THREE.Mesh(new THREE.PlaneGeometry(PITCH.GOAL_D, h), netMat);
    sideNetR.position.set((xLine + xBack) / 2, h / 2, hw);

    g.add(leftPost, rightPost, crossbar, backNet, topNet, sideNetL, sideNetR);
    this.group.add(g);
  }

  buildStadium() {
    // Panneaux publicitaires autour du terrain
    const boardMat = new THREE.MeshLambertMaterial({ color: 0x153024 });
    const accentMat = new THREE.MeshLambertMaterial({ color: 0x26754e });
    const northBoard = new THREE.Mesh(new THREE.BoxGeometry(PITCH.L + 8, 1.0, 0.35), boardMat);
    northBoard.position.set(0, 0.5, -PITCH.HALF_W - 3.2);
    const northStrip = new THREE.Mesh(new THREE.BoxGeometry(PITCH.L + 7.5, 0.28, 0.4), accentMat);
    northStrip.position.set(0, 0.72, -PITCH.HALF_W - 3.2);

    const westBoard = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.0, PITCH.W + 6.4), boardMat);
    westBoard.position.set(-PITCH.HALF_L - 4.2, 0.5, 0);
    const eastBoard = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.0, PITCH.W + 6.4), boardMat);
    eastBoard.position.set(PITCH.HALF_L + 4.2, 0.5, 0);

    this.group.add(northBoard, northStrip, westBoard, eastBoard);

    // Tribunes nord, ouest et est (sud ouvert pour ne jamais gêner la caméra broadcast)
    const standMat = new THREE.MeshLambertMaterial({ color: 0x2a3540 });
    const tierColors = [0x374757, 0x435669, 0x4f647a];
    for (let t = 0; t < 3; t++) {
      const mat = new THREE.MeshLambertMaterial({ color: tierColors[t] });
      const nTier = new THREE.Mesh(new THREE.BoxGeometry(PITCH.L + 16, 1.3, 2.4), mat);
      nTier.position.set(0, 1.1 + t * 1.25, -PITCH.HALF_W - 5.4 - t * 2.3);
      this.group.add(nTier);

      const wTier = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, PITCH.W + 10), mat);
      wTier.position.set(-PITCH.HALF_L - 6.2 - t * 2.3, 1.1 + t * 1.25, -1);
      const eTier = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, PITCH.W + 10), mat);
      eTier.position.set(PITCH.HALF_L + 6.2 + t * 2.3, 1.1 + t * 1.25, -1);
      this.group.add(wTier, eTier);
    }

    // Public stylisé en silhouettes humanoïdes instanciées : deux draw calls
    // pour les torses et les têtes, au lieu de 420 blocs rectangulaires.
    const count = 420;
    const torsoGeo = new THREE.SphereGeometry(0.5, 10, 8);
    const torsoMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const crowd = new THREE.InstancedMesh(torsoGeo, torsoMat, count);
    const headGeo = new THREE.SphereGeometry(0.5, 8, 6);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const crowdHeads = new THREE.InstancedMesh(headGeo, headMat, count);
    const dummy = new THREE.Object3D();
    const headDummy = new THREE.Object3D();
    const palette = [
      new THREE.Color(0x398bff), new THREE.Color(0xff524a),
      new THREE.Color(0xf6d55c), new THREE.Color(0xeaf4f4),
      new THREE.Color(0x63d48c), new THREE.Color(0x7d55bd)
    ];
    const skinPalette = [
      new THREE.Color(0x8d5524), new THREE.Color(0xb8794d),
      new THREE.Color(0xd5a078), new THREE.Color(0x6f432d)
    ];
    let idx = 0;
    const addSpectator = (x, y, z, rotation = 0) => {
      if (idx >= count) return;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rotation, 0);
      dummy.scale.set(0.72, 1.05 + (idx % 3) * 0.08, 0.62);
      dummy.updateMatrix();
      crowd.setMatrixAt(idx, dummy.matrix);
      crowd.setColorAt(idx, palette[idx % palette.length]);

      headDummy.position.set(x, y + 0.59 + (idx % 3) * 0.035, z);
      headDummy.rotation.set(0, rotation, 0);
      headDummy.scale.set(0.28, 0.3, 0.28);
      headDummy.updateMatrix();
      crowdHeads.setMatrixAt(idx, headDummy.matrix);
      crowdHeads.setColorAt(idx, skinPalette[idx % skinPalette.length]);
      idx++;
    };

    // Rangées principales derrière la touche.
    for (let tier = 0; tier < 3; tier++) {
      const y = 2.15 + tier * 1.25;
      const z = -PITCH.HALF_W - 5.3 - tier * 2.3;
      for (let x = -PITCH.HALF_L - 5; x <= PITCH.HALF_L + 5 && idx < count; x += 1.45) {
        if ((idx + tier) % 5 !== 0) addSpectator(x + ((idx % 3) - 1) * 0.15, y, z);
      }
    }
    // Gradins latéraux, deux rangées par côté.
    for (const side of [-1, 1]) {
      for (let tier = 0; tier < 2; tier++) {
        for (let z = -PITCH.HALF_W - 2; z <= PITCH.HALF_W + 2 && idx < count; z += 1.35) {
          addSpectator(side * (PITCH.HALF_L + 6.3 + tier * 2.3), 2.15 + tier * 1.25, z, side < 0 ? Math.PI / 2 : -Math.PI / 2);
        }
      }
    }
    // Petites tribunes derrière les cages, en conservant l'ouverture sud basse.
    for (const end of [-1, 1]) {
      for (let tier = 0; tier < 2; tier++) {
        for (let z = -PITCH.HALF_W - 2; z <= PITCH.HALF_W + 2 && idx < count; z += 1.35) {
          addSpectator(end * (PITCH.HALF_L + 5.6 + tier * 2.2), 2.05 + tier * 1.2, z, end < 0 ? Math.PI / 2 : -Math.PI / 2);
        }
      }
    }
    crowd.count = idx;
    crowdHeads.count = idx;
    crowd.instanceMatrix.needsUpdate = true;
    crowdHeads.instanceMatrix.needsUpdate = true;
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
    if (crowdHeads.instanceColor) crowdHeads.instanceColor.needsUpdate = true;
    this.crowdMesh = crowd;
    this.crowdHeads = crowdHeads;
    this.group.add(crowd, crowdHeads);

    // Liserés de gradins et bandeaux supérieurs pour donner une lecture architecturale au stade.
    const rimMat = new THREE.MeshLambertMaterial({ color: 0x182632 });
    const rimNorth = new THREE.Mesh(new THREE.BoxGeometry(PITCH.L + 22, 0.42, 0.72), rimMat);
    rimNorth.position.set(0, 5.05, -PITCH.HALF_W - 11.2);
    const rimWest = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.42, PITCH.W + 18), rimMat);
    rimWest.position.set(-PITCH.HALF_L - 12.2, 5.05, -1);
    const rimEast = rimWest.clone();
    rimEast.position.x *= -1;
    this.group.add(rimNorth, rimWest, rimEast);

    // Auvent fin au-dessus des tribunes : lecture de stade plus nette sans
    // alourdir le rendu (trois meshes statiques, aucun update par frame).
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x111d27, roughness: 0.72, metalness: 0.12 });
    const canopyNorth = new THREE.Mesh(new THREE.BoxGeometry(PITCH.L + 24, 0.32, 3.2), canopyMat);
    canopyNorth.position.set(0, 6.15, -PITCH.HALF_W - 11.6);
    const canopyWest = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.32, PITCH.W + 22), canopyMat);
    canopyWest.position.set(-PITCH.HALF_L - 12.2, 6.15, -1);
    const canopyEast = canopyWest.clone();
    canopyEast.position.x *= -1;
    this.group.add(canopyNorth, canopyWest, canopyEast);

    // 4 pylônes d'éclairage de stade
    const poleMat = standMat;
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffe6 });
    const pylonPos = [
      [-PITCH.HALF_L - 14, -PITCH.HALF_W - 14],
      [PITCH.HALF_L + 14, -PITCH.HALF_W - 14],
      [-PITCH.HALF_L - 14, PITCH.HALF_W + 14],
      [PITCH.HALF_L + 14, PITCH.HALF_W + 14]
    ];
    for (const [px, pz] of pylonPos) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 18, 8), poleMat);
      pole.position.set(px, 9, pz);
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.72, 0.42), bulbMat);
      head.position.set(px, 18, pz);
      head.lookAt(0, 0, 0);
      this.floodlightBulbs.push(head);
      this.group.add(pole, head);
    }

    // Gradins derrière les deux cages : deux niveaux bas ferment l'enceinte.
    for (const end of [-1, 1]) {
      for (let tier = 0; tier < 2; tier++) {
        const stand = new THREE.Mesh(
          new THREE.BoxGeometry(2.8, 1.0, PITCH.W + 15 + tier * 3),
          new THREE.MeshLambertMaterial({ color: tier === 0 ? 0x354958 : 0x43596a })
        );
        stand.position.set(end * (PITCH.HALF_L + 7.2 + tier * 2.2), 1.0 + tier * 1.0, 0);
        this.group.add(stand);
      }
    }
  }
}