import { gaitProfile, kickingSide } from './animation-tuning.js';
import * as THREE from 'three';
import { KIT_PALETTES } from './player-profile.js';
import { mountHumanoidPlayer } from './player-models.js';

/**
 * Fabrique de personnage humanoïde articulé 3D (prête pour remplacement GLB/GLTF futur).
 * Orientation locale : l'avant du joueur pointe vers +Z.
 */

const SHOP_COSMETICS_KEY = 'fpro.player-shop-equipped.v1';
function withEquippedShopAppearance(appearance) {
  let equipped = {};
  try { equipped = JSON.parse(globalThis.localStorage?.getItem(SHOP_COSMETICS_KEY) || '{}') || {}; } catch {}
  const result = { ...(appearance || {}) };
  const hair = equipped.hair;
  if (hair === 'hair-standard') result.shopHairStyle = 'short';
  else if (hair === 'hair-rare') result.shopHairStyle = 'long';
  else if (hair === 'hair-premium') result.shopHairStyle = 'buns';
  return result;
}
export function createPlayerVisual({ team, isGK, number, appearance = null }) {
  const root = new THREE.Group();
  // Lisibilité à distance : légère augmentation purement visuelle, sans toucher aux collisions.
  root.scale.setScalar(1.08);

  appearance = withEquippedShopAppearance(appearance);
  const customKit = appearance?.kitColors && ['primary','secondary','accent'].every(key => /^#[0-9a-f]{6}$/i.test(appearance.kitColors[key] || '')) ? appearance.kitColors : null;
  const selectedKit = customKit || (appearance && Object.hasOwn(KIT_PALETTES, appearance.kit) ? KIT_PALETTES[appearance.kit] : null);
  const goalkeeperPalette = selectedKit && isGK ? { primary: selectedKit.accent, secondary: selectedKit.primary, accent: selectedKit.secondary } : selectedKit;
  const jerseyColor = goalkeeperPalette ? new THREE.Color(goalkeeperPalette.primary) : (isGK
    ? (team === 'blue' ? 0xf2c94c : 0x56ccf2)
    : (team === 'blue' ? 0x2676f2 : 0xe03d35));
  const shortColor = goalkeeperPalette ? new THREE.Color(goalkeeperPalette.secondary) : (team === 'blue' ? 0x123269 : 0x1b1d24);
  const sockColor = goalkeeperPalette ? new THREE.Color(goalkeeperPalette.primary) : (team === 'blue' ? 0x2676f2 : 0xe03d35);
  const skinPalette = [0x8d5524, 0xa86f45, 0xc58b62, 0xd9a074, 0xf1c27d, 0x6f432d];
  const skinByTone = { light: 0xf1c27d, olive: 0xc99a6b, tan: 0xb98255, medium: 0xa86f45, brown: 0x8d5524, dark: 0x6f432d, deep: 0x4b2e22 };
  const skinColor = appearance && skinByTone[appearance.skinTone] ? skinByTone[appearance.skinTone] : skinPalette[(Math.abs(number * 7) + (team === 'red' ? 2 : 0)) % skinPalette.length];
  const hairPalette = [0x171311, 0x332219, 0x4a2f1d, 0x5b3824, 0x201d1b];
  const hairByColor = { dark: 0x171311, brown: 0x4a2f1d, blond: 0xc6a35b };
  const hairColor = appearance && hairByColor[appearance.hairColor] ? hairByColor[appearance.hairColor] : hairPalette[(Math.abs(number * 3) + (team === 'red' ? 1 : 0)) % hairPalette.length];
  const bodyBuild = ['lean', 'athletic', 'strong'].includes(appearance?.bodyBuild) ? appearance.bodyBuild : (number % 3 === 0 ? 'strong' : number % 3 === 1 ? 'lean' : 'athletic');
  const buildScale = bodyBuild === 'strong' ? { torsoX: 1.12, torsoY: 1.02, limb: 1.08, shoulder: 1.08 } : bodyBuild === 'lean' ? { torsoX: 0.91, torsoY: 1.02, limb: 0.94, shoulder: 0.94 } : { torsoX: 1, torsoY: 1, limb: 1, shoulder: 1 };

  const matJersey = new THREE.MeshStandardMaterial({ color: jerseyColor, roughness: 0.82, metalness: 0.0 });
  const matShorts = new THREE.MeshStandardMaterial({ color: shortColor, roughness: 0.88 });
  const matSock = new THREE.MeshStandardMaterial({ color: sockColor, roughness: 0.9 });
  const matSkin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.72 });
  const matHair = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.94 });
  const matBoot = new THREE.MeshStandardMaterial({ color: 0x14171c });
  const matGlove = new THREE.MeshStandardMaterial({ color: 0xf4fff8, roughness: 0.78 });
  const matTrim = new THREE.MeshStandardMaterial({ color: goalkeeperPalette ? goalkeeperPalette.accent : (team === 'blue' ? 0xeaf4ff : 0xffe8d9) });
  const matBootSole = new THREE.MeshStandardMaterial({ color: 0x343a43, roughness: 0.76 });
  const matBootAccent = new THREE.MeshStandardMaterial({ color: team === 'blue' ? 0x9cc8ff : 0xffb4a9, roughness: 0.6 });
  const matFaceDetail = new THREE.MeshStandardMaterial({ color: 0x241b18, roughness: 0.82 });
  const matEyeWhite = new THREE.MeshStandardMaterial({ color: 0xf4f1e9, roughness: 0.62 });
  const matBootLace = new THREE.MeshStandardMaterial({ color: 0xcbd2da, roughness: 0.8 });
  const matSeam = new THREE.MeshStandardMaterial({ color: goalkeeperPalette ? goalkeeperPalette.accent : (team === 'blue' ? 0x9fc7ff : 0xffb8ad), roughness: 0.9 });

  // Ombre ronde au sol (légère et toujours visible)
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 16),
    new THREE.MeshBasicMaterial({ color: 0x05140a, transparent: true, opacity: 0.36, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.022;
  root.add(shadow);

  // Anneau d'indicateur du joueur contrôlé
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.78, 24),
    new THREE.MeshBasicMaterial({ color: 0x9af0bd, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.visible = false;
  root.add(ring);

  // Groupe corps principal (pivot au bassin)
  const body = new THREE.Group();
  body.position.y = 0.92;
  root.add(body);

  // Bassin / Short
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.25, 18, 12), matShorts);
  pelvis.scale.set(1.02, 0.56, 0.88);
  pelvis.castShadow = true;
  body.add(pelvis);

  // Torse sportif (épaules plus larges que la taille)
  // Torse anatomique en sections : taille resserrée, cage thoracique et épaules plus larges.
  const torsoProfile = [new THREE.Vector2(0.205, -0.34), new THREE.Vector2(0.225, -0.22), new THREE.Vector2(0.255, -0.02), new THREE.Vector2(0.285, 0.13), new THREE.Vector2(0.345, 0.29), new THREE.Vector2(0.315, 0.39), new THREE.Vector2(0.245, 0.43)];
  const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoProfile, 20), matJersey);
  torso.position.y = 0.39;
  torso.scale.set(buildScale.torsoX, buildScale.torsoY, 0.72);
  torso.castShadow = true;
  body.add(torso);
  // Coutures et empiècements du textile pour éviter l'aspect de simples volumes unis.
  for (const side of [-1, 1]) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.29, 0.008), matSeam);
    seam.position.set(side * 0.205, 0.405, 0.238);
    body.add(seam);
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.025, 6, 12), matTrim);
  collar.position.set(0, 0.665, 0.015);
  collar.rotation.x = Math.PI / 2;
  body.add(collar);
  // Liserés de maillot : une bande centrale et deux bandes latérales discrètes.
  const chestStripe = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.43, 0.012), matTrim);
  chestStripe.position.set(0, 0.405, 0.235);
  body.add(chestStripe);
  // Panneaux latéraux du maillot et finitions d'épaules.
  const sidePanelMat = new THREE.MeshStandardMaterial({ color: goalkeeperPalette ? goalkeeperPalette.secondary : (team === 'blue' ? 0x174b9c : 0x9f2927), roughness: 0.88 });
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.32, 0.014), sidePanelMat);
    panel.position.set(side * 0.285, 0.38, 0.015);
    body.add(panel);
    const sleeveBand = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.012, 5, 10), matTrim);
    sleeveBand.position.set(side * 0.36, 0.51, 0);
    sleeveBand.rotation.x = Math.PI / 2;
    body.add(sleeveBand);
  }

  // Motif textile propre à chaque club : les formes sont originales et pilotées par le profil du club.
  const kitDesign = ['vertical','sash','hoops','wave','pinstripes','quartered','chevron','sunburst','horizontal','diagonal','central','split','shoulder','ripple','cross','sidepanels'].includes(appearance?.kitDesign) ? appearance.kitDesign : 'central';
  const motifMat = new THREE.MeshStandardMaterial({ color: goalkeeperPalette ? goalkeeperPalette.accent : (selectedKit ? selectedKit.accent : 0xeaf4ff), roughness: 0.9, side: THREE.DoubleSide });
  const addMotif = (w,h,x,y,z,rotation=0) => { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w,h), motifMat); mesh.position.set(x,y,z); mesh.rotation.z=rotation; body.add(mesh); };
  if (kitDesign === 'vertical' || kitDesign === 'pinstripes') { const count=kitDesign==='vertical'?3:5; for(let i=0;i<count;i++) addMotif(kitDesign==='vertical'?0.075:0.022,0.39,(i-(count-1)/2)*0.105,0.405,0.244); }
  else if (kitDesign === 'sash' || kitDesign === 'diagonal') addMotif(0.18,0.58,0,0.405,0.247,kitDesign==='sash'?-0.72:0.55);
  else if (kitDesign === 'hoops' || kitDesign === 'horizontal' || kitDesign === 'ripple') { const count=kitDesign==='ripple'?4:3; for(let i=0;i<count;i++) addMotif(0.47,0.045,0,0.25+i*0.13,0.246); }
  else if (kitDesign === 'quartered' || kitDesign === 'split') { addMotif(0.22,0.42,-0.12,0.405,0.245); addMotif(0.22,0.42,0.12,0.405,0.245); }
  else if (kitDesign === 'chevron') { addMotif(0.42,0.055,0,0.43,0.25,-0.42); addMotif(0.42,0.055,0,0.43,0.25,0.42); }
  else if (kitDesign === 'sunburst') { addMotif(0.07,0.42,0,0.405,0.25); addMotif(0.32,0.045,0,0.405,0.25,0.45); addMotif(0.32,0.045,0,0.405,0.25,-0.45); }
  else if (kitDesign === 'central') addMotif(0.12,0.43,0,0.405,0.247);
  else if (kitDesign === 'shoulder') { addMotif(0.23,0.12,-0.19,0.57,0.22,-0.18); addMotif(0.23,0.12,0.19,0.57,0.22,0.18); }
  else if (kitDesign === 'cross') { addMotif(0.09,0.42,0,0.405,0.247); addMotif(0.44,0.075,0,0.43,0.247); }
  else if (kitDesign === 'sidepanels') { addMotif(0.075,0.4,-0.2,0.405,0.247); addMotif(0.075,0.4,0.2,0.405,0.247); }

  // Numéro lisible sur la poitrine et le dos ; texture actualisable si le profil change.
  const numberCanvas = document.createElement('canvas');
  numberCanvas.width = 128;
  numberCanvas.height = 128;
  const numberContext = numberCanvas.getContext('2d');
  const numberTexture = new THREE.CanvasTexture(numberCanvas);
  numberTexture.colorSpace = THREE.SRGBColorSpace;
  const numberMaterial = new THREE.MeshBasicMaterial({ map: numberTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const numberFront = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.19), numberMaterial);
  numberFront.position.set(0, 0.405, 0.247);
  const numberBack = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.25), numberMaterial);
  numberBack.position.set(0, 0.405, -0.247);
  numberBack.rotation.y = Math.PI;
  body.add(numberFront, numberBack);
  const setVisualNumber = (value) => {
    const safeNumber = Number.isInteger(value) ? Math.max(1, Math.min(99, value)) : 0;
    numberContext.clearRect(0, 0, 128, 128);
    numberContext.font = '900 78px Arial';
    numberContext.textAlign = 'center';
    numberContext.textBaseline = 'middle';
    numberContext.lineWidth = 10;
    numberContext.strokeStyle = '#101820';
    numberContext.strokeText(String(safeNumber), 64, 67);
    numberContext.fillStyle = '#ffffff';
    numberContext.fillText(String(safeNumber), 64, 67);
    numberTexture.needsUpdate = true;
  };
  setVisualNumber(number);

  // Tête + cou + cheveux
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.82;
  body.add(headGroup);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.12, 8), matSkin);
  neck.position.y = -0.06;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.185, 32, 24), matSkin);
  head.position.y = 0.08;
  // Mâchoire et pommettes : volume de visage moins sphérique et plus humain.
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.145, 20, 14), matSkin);
  jaw.position.set(0, -0.005, 0.035);
  jaw.scale.set(0.92, 0.66, 0.9);
  const faceShape = ['oval','round','angular','long','square'].includes(appearance?.faceShape) ? appearance.faceShape : 'oval';
  const faceScale = { oval:[0.94,1.08,1], round:[1.04,1.02,1], angular:[0.91,1.09,0.96], long:[0.92,1.16,1], square:[1.04,1.04,1.02] }[faceShape];
  const headWidth = (0.92 + (number % 4) * 0.035) * faceScale[0];
  head.scale.set(headWidth, (1.08 + (number % 3) * 0.025) * faceScale[1], faceScale[2]);
  jaw.scale.set(0.92 * faceScale[0], 0.66 * faceScale[1], 0.9 * faceScale[2]);
  head.castShadow = true;

  const hairStyle = ['short', 'curly', 'shaved'].includes(appearance?.hairStyle) ? appearance.hairStyle : 'short';
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 28, 18, 0, Math.PI * 2, 0, hairStyle === 'shaved' ? Math.PI * 0.34 : hairStyle === 'fade' ? Math.PI * 0.43 : Math.PI * 0.58),
    matHair
  );
  hair.position.set(0, hairStyle === 'shaved' ? 0.085 : 0.105, -0.015);
  hair.scale.set(1, hairStyle === 'shaved' ? 0.82 : 1, 1);
  hair.rotation.x = -0.18;
  // Détails du visage : yeux, nez, bouche et oreilles, orientés vers l'avant (+Z).
  const eyeGeo = new THREE.SphereGeometry(0.021, 8, 6);
  const eyeWhiteGeo = new THREE.SphereGeometry(0.023, 8, 6);
  const eyeShape = appearance?.eyeShape || 'almond';
  eyeGeo.scale(eyeShape === 'round' ? 1.12 : eyeShape === 'hooded' ? 1.05 : 1, eyeShape === 'almond' ? 0.72 : eyeShape === 'hooded' ? 0.78 : 1, 0.8);
  const leftEyeWhite = new THREE.Mesh(eyeWhiteGeo, matEyeWhite);
  const rightEyeWhite = new THREE.Mesh(eyeWhiteGeo, matEyeWhite);
  const leftEye = new THREE.Mesh(eyeGeo, matFaceDetail);
  const rightEye = new THREE.Mesh(eyeGeo, matFaceDetail);
  leftEyeWhite.position.set(-0.061, 0.105, 0.163);
  rightEyeWhite.position.set(0.061, 0.105, 0.163);
  leftEye.position.set(-0.061, 0.105, 0.183);
  rightEye.position.set(0.061, 0.105, 0.183);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 7, 6), matSkin);
  nose.position.set(0, 0.045, 0.18);
  nose.scale.set(0.72, 1.1, 0.75);
  const browGeo = new THREE.BoxGeometry(0.052, 0.012, 0.012);
  const leftBrow = new THREE.Mesh(browGeo, matHair);
  const rightBrow = new THREE.Mesh(browGeo, matHair);
  leftBrow.position.set(-0.061, 0.139, 0.165);
  rightBrow.position.set(0.061, 0.139, 0.165);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.012, 0.012), matFaceDetail);
  mouth.position.set(0, -0.015, 0.169);
  const earGeo = new THREE.SphereGeometry(0.035, 7, 6);
  const leftEar = new THREE.Mesh(earGeo, matSkin);
  const rightEar = new THREE.Mesh(earGeo, matSkin);
  leftEar.position.set(-0.178, 0.055, 0);
  rightEar.position.set(0.178, 0.055, 0);
  // Coiffures du profil personnalisé ou variations légères pour les joueurs IA.
  if (appearance?.hairStyle === 'curly' || appearance?.hairStyle === 'afro') {
    const afro = appearance.hairStyle === 'afro';
    const curlRadius = afro ? 0.073 : 0.052;
    const ringCount = afro ? 12 : 9;
    for (let i = 0; i < ringCount; i++) {
      const a = (i / ringCount) * Math.PI * 2;
      const curl = new THREE.Mesh(new THREE.SphereGeometry(curlRadius, 9, 7), matHair);
      curl.position.set(Math.cos(a) * (afro ? 0.145 : 0.125), afro ? 0.16 + Math.sin(i * 1.7) * 0.025 : 0.18 + Math.sin(i * 1.7) * 0.018, Math.sin(a) * (afro ? 0.135 : 0.12));
      headGroup.add(curl);
    }
    for (const [x,y,z] of [[-0.07,0.22,0.02],[0,0.245,0.025],[0.07,0.22,0.02]]) {
      const curl = new THREE.Mesh(new THREE.SphereGeometry(curlRadius, 9, 7), matHair);
      curl.position.set(x,y,z); headGroup.add(curl);
    }
  } else if (appearance?.hairStyle === 'fade') {
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10), matHair);
    top.scale.set(1.1, 0.58, 0.92); top.position.set(0, 0.205, -0.005); headGroup.add(top);
  } else if (appearance?.hairStyle === 'shaved') {
    // La calotte courte ci-dessus représente la coupe rasée.
  } else if (appearance?.hairStyle === 'short') {
    const shortTop = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 7), matHair);
    shortTop.scale.set(1.1, 0.55, 0.9);
    shortTop.position.set(0, 0.205, -0.015);
    headGroup.add(shortTop);
  } else if (number % 5 === 1) {
    const topHair = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 6), matHair);
    topHair.scale.set(1.15, 0.55, 0.9);
    topHair.position.set(0, 0.22, -0.015);
    headGroup.add(topHair);
  } else if (number % 5 === 2) {
    const sideHair = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.07, 0.22), matHair);
    sideHair.position.set(0, 0.19, -0.015);
    headGroup.add(sideHair);
  } else if (number % 5 === 3) {
    const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.075, 0.12), matHair);
    fringe.position.set(0, 0.16, 0.115);
    headGroup.add(fringe);
  } else if (number % 5 === 4) {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), matHair);
    bun.position.set(0, 0.16, -0.16);
    headGroup.add(bun);
  }
  headGroup.add(neck, head, jaw, hair, leftEyeWhite, rightEyeWhite, leftEye, rightEye, leftBrow, rightBrow, nose, mouth, leftEar, rightEar);

  // Bras articulés (épaule -> haut du bras -> avant-bras -> main)
  const makeArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.36, 0.62, 0);
    body.add(shoulder);

    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.085 * buildScale.shoulder, 0.075 * buildScale.shoulder, 0.22, 14), matJersey);
    sleeve.position.y = -0.1;
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.061 * buildScale.limb, 0.12, 5, 12), matSkin);
    upper.position.y = -0.22;
    shoulder.add(sleeve, upper);

    const elbow = new THREE.Group();
    elbow.position.y = -0.32;
    shoulder.add(elbow);

    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.052 * buildScale.limb, 0.16, 5, 12), matSkin);
    forearm.position.y = -0.13;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(isGK ? 0.085 : 0.055, 12, 10), isGK ? matGlove : matSkin);
    hand.position.y = -0.28;
    // Doigts simplifiés et fusionnés visuellement à la main, sans squelette supplémentaire.
    const fingers = new THREE.Group();
    const fingerMaterial = isGK ? matGlove : matSkin;
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(new THREE.CapsuleGeometry(isGK ? 0.018 : 0.012, isGK ? 0.045 : 0.035, 3, 5), fingerMaterial);
      finger.position.set((i - 1.5) * 0.024, -0.315, 0.035);
      finger.rotation.z = (i - 1.5) * 0.09;
      fingers.add(finger);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(isGK ? 0.02 : 0.013, 0.035, 3, 5), fingerMaterial);
    thumb.position.set(side * 0.055, -0.285, 0.02);
    thumb.rotation.z = side * 0.75;
    fingers.add(thumb);
    elbow.add(forearm, hand, fingers);

    return { shoulder, elbow };
  };

  // Jambes articulées (hanche -> cuisse/short -> genou -> tibia/chaussette -> chaussure)
  const makeLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.145, -0.08, 0);
    body.add(hip);

    const shortLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.1, 0.26, 12), matShorts);
    shortLeg.position.y = -0.12;
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.078 * buildScale.limb, 0.13, 5, 12), matSkin);
    thigh.position.y = -0.28;
    hip.add(shortLeg, thigh);

    const knee = new THREE.Group();
    knee.position.y = -0.4;
    hip.add(knee);

    const sock = new THREE.Mesh(new THREE.CapsuleGeometry(0.061 * buildScale.limb, 0.22, 5, 12), matSock);
    sock.position.y = -0.18;
    sock.castShadow = true;
    const sockTopBand = new THREE.Mesh(new THREE.TorusGeometry(0.061 * buildScale.limb, 0.012, 5, 10), matTrim);
    sockTopBand.position.y = -0.055;
    knee.add(sockTopBand);

    const boot = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), matBoot);
    boot.scale.set(0.075, 0.052, 0.145);
    boot.position.set(0, -0.39, 0.075);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.025, 0.245), matBootSole);
    sole.position.set(0, -0.435, 0.075);
    const bootStripe = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.018, 0.17), matBootAccent);
    bootStripe.position.set(0, -0.35, 0.075);
    const laces = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const lace = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.006, 0.009), matBootLace);
      lace.position.set(0, -0.316, 0.025 + i * 0.035);
      laces.add(lace);
    }
    const studs = new THREE.Group();
    for (const x of [-0.045, 0, 0.045]) {
      for (const z of [-0.035, 0.075]) {
        const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.01, 0.025, 5), matBoot);
        stud.position.set(x, -0.45, z);
        studs.add(stud);
      }
    }
    knee.add(sock, boot, sole, bootStripe, laces, studs);

    return { hip, knee };
  };

  const leftArm = makeArm(1);
  const rightArm = makeArm(-1);
  const leftLeg = makeLeg(1);
  const rightLeg = makeLeg(-1);
  // Variations morphologiques discrètes sans changer les dimensions de collision.
  body.scale.set((0.97 + (number % 3) * 0.03) * (bodyBuild === 'strong' ? 1.035 : bodyBuild === 'lean' ? 0.96 : 1), 0.985 + (number % 4) * 0.012, 0.98 + (number % 2) * 0.04);

  const visual = {
    root,
    ring,
    body,
    headGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    shadow,
    model: null,
    updateModel: null,
    disposed: false,
    setNumber: setVisualNumber,
    dispose() {
      this.disposed = true;
      root.userData.disposed = true;
      this.model?.dispose?.();
      numberTexture.dispose();
    }
  };
  // Chargement asynchrone : le joueur procédural reste visible tant que le GLTF
  // et les animations n'ont pas été chargés. En cas d'échec, aucun joueur ne disparaît.
  mountHumanoidPlayer({ root, fallbackBody: body, team, isGK, appearance })
    .then((modelInstance) => {
      if (!modelInstance) return;
      if (visual.disposed) { modelInstance.dispose?.(); return; }
      visual.model = modelInstance;
      visual.updateModel = modelInstance.update;
    });
  return visual;
}

export class Player {
  constructor({ id, team, number, name, role, specialty = 'balanced', slotIndex, homePos, appearance = null, attributes = null, preferredFoot = null }) {
    this.id = id;
    this.team = team;
    this.number = number;
    this.name = name;
    this.role = role; // 'GK' | 'DEF' | 'MID' | 'FWD'
    this.specialty = specialty;
    const defaults = { pace: 55, shooting: 50, passing: 50, defense: 45, stamina: 55, control: 50 };
    this.attributes = Object.fromEntries(Object.keys(defaults).map((key) => [key, Number.isFinite(Number(attributes?.[key])) ? Math.max(1, Math.min(99, Number(attributes[key]))) : defaults[key]]));
    this.preferredFoot = ['left', 'right'].includes(preferredFoot) ? preferredFoot : (number % 2 === 0 ? 'right' : 'left');
    this.slotIndex = slotIndex;
    this.homePos = { ...homePos };

    this.pos = { x: homePos.x, y: 0, z: homePos.z };
    this.vel = { x: 0, z: 0 };
    this.facing = team === 'blue' ? Math.PI / 2 : -Math.PI / 2;

    this.stamina = 1.0;
    this.decisionTimer = Math.random() * 0.25;
    this.dribblePhase = Math.random() * Math.PI * 2;
    this.isControlled = false;
    this.animState = 'idle'; // idle | walk | run | pass | shoot | control | tackle | celebrate | dive
    this.animTimer = 0;
    this.actionCooldown = 0;
    this.diveDir = 0;
    this.tackleTimer = 0;
    this.stridePhase = Math.random() * Math.PI * 2;
    this.previousVisualSpeed = 0;

    this.visual = createPlayerVisual({
      team,
      isGK: role === 'GK',
      number,
      appearance
    });
  }

  triggerAnim(state, duration = 0.32, diveDir = 0) {
    this.animState = state;
    this.animTimer = duration;
    this.diveDir = diveDir;
  }

  setNumber(number) {
    if (!Number.isInteger(number) || number < 1 || number > 99) return false;
    this.number = number;
    this.visual.setNumber(number);
    return true;
  }

  updateVisual(dt) {
    dt = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, 0.05) : 0;
    const v = this.visual;
    const now = (typeof performance !== 'undefined' && Number.isFinite(performance.now?.())) ? performance.now() : Date.now();
    const poseNodes = [v.body, v.headGroup, v.leftArm.shoulder, v.leftArm.elbow, v.rightArm.shoulder, v.rightArm.elbow, v.leftLeg.hip, v.leftLeg.knee, v.rightLeg.hip, v.rightLeg.knee];
    const previousPose = poseNodes.map((node) => ({ position: node.position.clone(), rotation: node.rotation.clone() }));
    v.root.position.set(this.pos.x, 0, this.pos.z);
    // Rotation amortie : évite les changements d'orientation instantanés.
    const angleDelta = Math.atan2(Math.sin(this.facing - v.root.rotation.y), Math.cos(this.facing - v.root.rotation.y));
    v.root.rotation.y += angleDelta * (1 - Math.exp(-12 * Math.min(dt, 0.05)));
    v.ring.visible = this.isControlled;

    const speed = Math.hypot(this.vel.x, this.vel.z);
    const acceleration = dt > 0.001 ? THREE.MathUtils.clamp((speed - this.previousVisualSpeed) / dt, -20, 20) : 0;
    this.previousVisualSpeed = speed;
    if (this.animState === 'control' || (speed > 0.6 && this.isControlled)) {
      this.dribblePhase = (this.dribblePhase + dt * (3.2 + Math.min(speed, 9) * 0.22)) % (Math.PI * 2);
    }

    if (this.animTimer > 0) {
      this.animTimer -= dt;
      if (this.animTimer <= 0) {
        this.animState = 'idle';
      }
    }

    let state = this.animState;
    if (this.animTimer <= 0) {
      if (speed > 5.8) state = 'run';
      else if (speed > 0.6) state = 'walk';
      else state = 'idle';
    }

    // Réinitialisations douces
    v.body.position.y = 0.92;
    v.body.rotation.set(0, 0, 0);
    v.leftArm.elbow.rotation.x = -0.35;
    v.rightArm.elbow.rotation.x = -0.35;
    v.headGroup.rotation.set(0, 0, 0);

    if (state === 'idle') {
      const breath = Math.sin(now * 0.004 + this.number) * 0.025;
      v.body.position.y = 0.92 + breath;
      v.leftLeg.hip.rotation.x = 0.03;
      v.rightLeg.hip.rotation.x = -0.03;
      v.leftLeg.knee.rotation.x = 0.05;
      v.rightLeg.knee.rotation.x = 0.05;
      v.leftArm.shoulder.rotation.x = 0.08;
      v.rightArm.shoulder.rotation.x = -0.08;
      v.leftArm.shoulder.rotation.z = 0.14;
      v.rightArm.shoulder.rotation.z = -0.14;
      v.headGroup.rotation.z = Math.sin(now * 0.0013 + this.number) * 0.025;
    } else if (state === 'walk' || state === 'run') {
      const turnRate = dt > 0.001 ? THREE.MathUtils.clamp(angleDelta / dt, -8, 8) : 0;
      const gait = gaitProfile(speed, this.stamina, this.vel.x, acceleration, turnRate);
      const isRun = gait.running;
      this.stridePhase += dt * gait.strideRate;
      const amp = gait.strideAmplitude;
      const s = Math.sin(this.stridePhase);
      const c = Math.cos(this.stridePhase);

      v.body.position.y = 0.92 + Math.abs(c) * (isRun ? 0.08 : 0.03);
      v.body.rotation.x = gait.bodyLean + gait.accelerationLean;
      // Inclinaison latérale discrète selon le déplacement, sans ajouter de géométrie.
      const lateral = gait.lateralLean;
      v.body.rotation.z = -lateral - gait.turnLean;

      v.leftLeg.hip.rotation.x = -s * amp;
      v.rightLeg.hip.rotation.x = s * amp;
      v.leftLeg.knee.rotation.x = Math.max(0.05, s * amp * 1.05);
      v.rightLeg.knee.rotation.x = Math.max(0.05, -s * amp * 1.05);

      v.leftArm.shoulder.rotation.x = s * amp * gait.armDrive;
      v.rightArm.shoulder.rotation.x = -s * amp * gait.armDrive;
      v.leftArm.shoulder.rotation.z = 0.16;
      v.rightArm.shoulder.rotation.z = -0.16;
      v.leftArm.elbow.rotation.x = isRun ? -0.95 : -0.45;
      v.rightArm.elbow.rotation.x = isRun ? -0.95 : -0.45;
      v.headGroup.rotation.x = isRun ? 0.035 : 0;
      v.headGroup.rotation.y = THREE.MathUtils.clamp(-this.vel.x * 0.006, -0.07, 0.07);
    } else if (state === 'pass' || state === 'shoot') {
      const power = state === 'shoot' ? 1.05 : 0.65;
      const p = 1 - Math.max(0, this.animTimer / 0.32);
      const swing = Math.sin(p * Math.PI) * power;
      v.body.rotation.x = state === 'shoot' ? -0.2 : 0.1;
      v.body.rotation.z = state === 'shoot' ? -0.08 : 0;
      const side = kickingSide(this.preferredFoot);
      const kickingLeg = side === 'left' ? v.leftLeg : v.rightLeg;
      const supportLeg = side === 'left' ? v.rightLeg : v.leftLeg;
      const kickingArm = side === 'left' ? v.leftArm : v.rightArm;
      const supportArm = side === 'left' ? v.rightArm : v.leftArm;
      kickingLeg.hip.rotation.x = -swing * 1.1;
      kickingLeg.knee.rotation.x = Math.max(0.05, (1 - p) * 0.7);
      supportLeg.hip.rotation.x = 0.2;
      kickingArm.shoulder.rotation.x = 0.4;
      supportArm.shoulder.rotation.x = -0.45;
    } else if (state === 'control') {
      v.body.position.y = 0.87;
      v.leftLeg.hip.rotation.x = -0.3;
      v.leftLeg.knee.rotation.x = 0.45;
      v.rightLeg.hip.rotation.x = 0.15;
    } else if (state === 'tackle') {
      v.body.position.y = 0.42;
      v.body.rotation.x = -0.95;
      v.body.rotation.z = this.diveDir * 0.18;
      v.rightLeg.hip.rotation.x = -0.65;
      v.rightLeg.knee.rotation.x = 0.1;
      v.leftLeg.hip.rotation.x = 0.25;
      v.leftLeg.knee.rotation.x = 0.9;
      v.leftArm.shoulder.rotation.z = 0.65;
      v.rightArm.shoulder.rotation.z = -0.65;
    } else if (state === 'celebrate') {
      const jump = Math.abs(Math.sin(now * 0.012 + this.number)) * 0.38;
      v.body.position.y = 0.92 + jump;
      v.leftArm.shoulder.rotation.x = -2.4;
      v.rightArm.shoulder.rotation.x = -2.4;
      v.leftArm.shoulder.rotation.z = 0.35;
      v.rightArm.shoulder.rotation.z = -0.35;
    } else if (state === 'dive') {
      v.body.position.y = 0.56;
      v.body.rotation.z = (this.diveDir || 1) * 1.25;
      v.leftArm.shoulder.rotation.x = -2.2;
      v.rightArm.shoulder.rotation.x = -2.2;
    }

    // Interpolation des poses pour éviter les cassures lors des transitions d'action.
    const blend = 1 - Math.exp(-Math.max(0, Math.min(dt, 0.05)) * 16);
    poseNodes.forEach((node, index) => {
      const targetPosition = node.position.clone();
      const targetRotation = node.rotation.clone();
      node.position.copy(previousPose[index].position).lerp(targetPosition, blend);
      node.rotation.x = previousPose[index].rotation.x + (targetRotation.x - previousPose[index].rotation.x) * blend;
      node.rotation.y = previousPose[index].rotation.y + (targetRotation.y - previousPose[index].rotation.y) * blend;
      node.rotation.z = previousPose[index].rotation.z + (targetRotation.z - previousPose[index].rotation.z) * blend;
    });
    v.updateModel?.(dt, state, speed, {
      progress: this.animTimer > 0 ? 1 - this.animTimer / 0.32 : 0.5,
      diveDir: this.diveDir,
      preferredFoot: this.preferredFoot,
      phase: this.dribblePhase
    });
  }
}