import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const basePromise = loader.loadAsync('./assets/players/base/Superhero_Male_FullBody.gltf');
const hairCache = new Map();
const portraitCache = new Map();
const pending = new Map();
let renderer = null;
let canvas = null;
const WIDTH = 176;
const HEIGHT = 210;
const MAX_CACHE = 180;

function getRenderer() {
  if (renderer) return renderer;
  canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: false, powerPreference: 'low-power', preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  return renderer;
}
function loadHairAsset(file) {
  if (!file) return Promise.resolve(null);
  if (!hairCache.has(file)) hairCache.set(file, loader.loadAsync(`./assets/players/hairstyles/${file}.gltf`));
  return hairCache.get(file);
}
function loadHair(style) {
  const file = ({ shaved:'Hair_Buzzed', fade:'Hair_Buzzed', short:'Hair_SimpleParted', curly:'Hair_SimpleParted', wavy:'Hair_SimpleParted', long:'Hair_Long', braids:'Hair_Buns', twists:'Hair_Buns', afro:'Hair_Buzzed' })[style];
  return loadHairAsset(file);
}
function hairColorHex(value) {
  return ({ black:'#171515', dark:'#211b1a', brown:'#493027', blond:'#b58a4d', auburn:'#8b3f26', grey:'#777b82' })[value] || '#211b1a';
}
function attachHair(model, sourceScene, color) {
  if (!sourceScene) return;
  const bones = new Map();
  model.traverse(node => { if (node.isBone && node.name) bones.set(node.name, node); });
  sourceScene.scene.traverse(source => {
    if (!source.isSkinnedMesh) return;
    const linked = source.skeleton.bones.map(bone => bones.get(bone.name));
    if (linked.some(bone => !bone)) return;
    const material = Array.isArray(source.material) ? source.material.map(item => item.clone()) : source.material.clone();
    const materials = Array.isArray(material) ? material : [material];
    materials.forEach(item => item.color?.set(color));
    const hair = new THREE.SkinnedMesh(source.geometry.clone(), material);
    hair.name = 'P27_SystemPortrait_Hair';
    hair.position.copy(source.position);
    hair.quaternion.copy(source.quaternion);
    hair.scale.copy(source.scale);
    hair.bind(new THREE.Skeleton(linked, source.skeleton.boneInverses.map(matrix => matrix.clone())), source.bindMatrix.clone());
    hair.userData.p27PortraitOwnedGeometry = true;
    hair.frustumCulled = false;
    model.add(hair);
  });
}
function safeColor(value, fallback) { return /^#[0-9a-f]{6}$/i.test(String(value||'')) ? value : fallback; }
function signature(player) {
  const a = player.appearance || {};
  return JSON.stringify([player.id, player.clubId, player.number, a.skinTone, a.bodyBuild, a.hairStyle, a.hairColor, a.faceShape, a.eyeShape, a.kitColors, a.kitDesign, a.kitVariant, a.facialHair]);
}
function addShirtNumber(model, value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 99) return null;
  const decal = document.createElement('canvas');
  decal.width = 128;
  decal.height = 128;
  const context = decal.getContext('2d');
  if (!context) return null;
  context.clearRect(0, 0, decal.width, decal.height);
  context.font = '900 88px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.lineWidth = 12;
  context.strokeStyle = 'rgba(8,16,28,.88)';
  context.strokeText(String(number), 64, 67);
  context.fillStyle = '#ffffff';
  context.fillText(String(number), 64, 67);
  const texture = new THREE.CanvasTexture(decal);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map:texture, transparent:true, depthTest:false, depthWrite:false, toneMapped:false });
  const sprite = new THREE.Sprite(material);
  sprite.name = 'P27_SystemPortrait_ShirtNumber';
  sprite.position.set(0, 1.075, 0.17);
  sprite.scale.set(0.19, 0.19, 1);
  sprite.renderOrder = 4;
  sprite.userData.p27PortraitOwnedDecal = true;
  model.add(sprite);
  return sprite;
}
function remember(key, value) {
  portraitCache.delete(key);
  portraitCache.set(key, value);
  while (portraitCache.size > MAX_CACHE) portraitCache.delete(portraitCache.keys().next().value);
}
export async function renderSystemPlayerPortrait3D(player) {
  const key = signature(player || {});
  if (portraitCache.has(key)) {
    const cached = portraitCache.get(key);
    portraitCache.delete(key); portraitCache.set(key, cached);
    return cached;
  }
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    const activeRenderer = getRenderer();
    const [base, hairSource, beardSource] = await Promise.all([
      basePromise,
      loadHair(player?.appearance?.hairStyle).catch(() => null),
      player?.appearance?.facialHair === 'beard' ? loadHairAsset('Hair_Beard').catch(() => null) : Promise.resolve(null)
    ]);
    const model = cloneSkeleton(base.scene);
    model.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      const recolor = source => {
        const mat = source.clone();
        const name = String(mat.name || '').toLowerCase();
        if (/hair/.test(name)) mat.color?.set(hairColorHex(player?.appearance?.hairColor));
        if (/superhero|shirt|jersey|cloth/.test(name)) mat.color?.set(safeColor(player?.appearance?.kitColors?.primary, '#2865a8'));
        return mat;
      };
      node.material = Array.isArray(node.material) ? node.material.map(recolor) : recolor(node.material);
    });
    const hairTint = hairColorHex(player?.appearance?.hairColor);
    attachHair(model, hairSource, hairTint);
    attachHair(model, beardSource, hairTint);
    const shirtNumberDecal = addShirtNumber(model, player?.number);
    const faceShape = player?.appearance?.faceShape || 'oval';
    const faceScale = {
      oval: [0.98, 1.04, 1], round: [1.08, 0.98, 1],
      angular: [0.94, 1.06, 1], long: [0.96, 1.12, 1],
      square: [1.08, 1.02, 1]
    }[faceShape] || [1, 1, 1];
    const bodyBuild = player?.appearance?.bodyBuild || 'athletic';
    const bodyShape = ({
      strong: { torso:1.07, shoulders:1.055, neck:0.96 },
      lean: { torso:0.95, shoulders:0.965, neck:1.035 },
      athletic: { torso:1, shoulders:1.015, neck:1 }
    })[bodyBuild] || { torso:1, shoulders:1, neck:1 };
    const eyeShapeScale = ({ almond:[1,0.96,1], round:[0.97,1.06,1], 'deep-set':[0.96,0.92,1], hooded:[1.02,0.91,1] })[player?.appearance?.eyeShape] || [1,1,1];
    model.traverse(node => {
      if (node.name === 'Eyes') node.scale.multiply(new THREE.Vector3(...eyeShapeScale));
      if (!node.isBone) return;
      if (node.name === 'Head') node.scale.multiply(new THREE.Vector3(...faceScale));
      if (node.name === 'spine_02') node.scale.x *= bodyShape.torso;
      if (node.name === 'spine_03') node.scale.x *= bodyShape.shoulders;
      if (node.name === 'neck_01') node.scale.y *= bodyShape.neck;
    });
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 1.78 / Math.max(0.001, size.y);
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    const scene = new THREE.Scene();
    const clubAccent = new THREE.Color(safeColor(player?.appearance?.kitColors?.accent, '#78b8ff'));
    scene.background = new THREE.Color('#17283d').lerp(clubAccent, 0.16);
    scene.add(model);
    scene.add(new THREE.HemisphereLight(0xe7f1ff, 0x172033, 1.75));
    const keyLight = new THREE.DirectionalLight(0xfff2e4, 2.1);
    keyLight.position.set(-2.8, 4.2, 3.5); scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(clubAccent, 0.8);
    rimLight.position.set(2.4, 2.8, -2.5); scene.add(rimLight);
    // Tight chest-up framing: prioritize face and kit identity in compact DLS-style player cards.
    const camera = new THREE.PerspectiveCamera(29, WIDTH / HEIGHT, 0.1, 20);
    camera.position.set(0, 1.53, 2.45);
    camera.lookAt(0, 1.43, 0);
    activeRenderer.render(scene, camera);
    let uri;
    try { uri = canvas.toDataURL('image/webp', 0.82); }
    catch { uri = canvas.toDataURL('image/png'); }
    scene.remove(model);
    model.traverse(node => {
      if (node.userData?.p27PortraitOwnedDecal) {
        node.material?.map?.dispose?.();
        node.material?.dispose?.();
      }
      if (node.isSkinnedMesh) {
        if (node.userData?.p27PortraitOwnedGeometry) node.geometry?.dispose?.();
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach(mat => mat?.dispose?.());
      }
    });
    remember(key, uri);
    return uri;
  })().finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
