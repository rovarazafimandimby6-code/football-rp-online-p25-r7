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
function loadHair(style) {
  const file = ({ shaved:'Hair_Buzzed', fade:'Hair_Buzzed', short:'Hair_SimpleParted', curly:'Hair_SimpleParted', wavy:'Hair_SimpleParted', long:'Hair_Long', braids:'Hair_Long', twists:'Hair_Long', afro:'Hair_Buzzed' })[style];
  if (!file) return Promise.resolve(null);
  if (!hairCache.has(file)) hairCache.set(file, loader.loadAsync(`./assets/players/hairstyles/${file}.gltf`));
  return hairCache.get(file);
}
function attachHair(model, sourceScene) {
  if (!sourceScene) return;
  const bones = new Map();
  model.traverse(node => { if (node.isBone && node.name) bones.set(node.name, node); });
  sourceScene.scene.traverse(source => {
    if (!source.isSkinnedMesh) return;
    const linked = source.skeleton.bones.map(bone => bones.get(bone.name));
    if (linked.some(bone => !bone)) return;
    const hair = new THREE.SkinnedMesh(source.geometry.clone(), source.material.clone());
    hair.name = 'P27_SystemPortrait_Hair';
    hair.position.copy(source.position);
    hair.quaternion.copy(source.quaternion);
    hair.scale.copy(source.scale);
    hair.bind(new THREE.Skeleton(linked, source.skeleton.boneInverses.map(matrix => matrix.clone())), source.bindMatrix.clone());
    hair.frustumCulled = false;
    model.add(hair);
  });
}
function safeColor(value, fallback) { return /^#[0-9a-f]{6}$/i.test(String(value||'')) ? value : fallback; }
function signature(player) {
  const a = player.appearance || {};
  return JSON.stringify([player.id, a.skinTone, a.bodyBuild, a.hairStyle, a.hairColor, a.faceShape, a.kitColors, a.kitDesign, a.kitVariant]);
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
    const [base, hairSource] = await Promise.all([
      basePromise,
      loadHair(player?.appearance?.hairStyle).catch(() => null)
    ]);
    const model = cloneSkeleton(base.scene);
    model.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      const recolor = source => {
        const mat = source.clone();
        const name = String(mat.name || '').toLowerCase();
        if (/hair/.test(name)) mat.color?.set(player?.appearance?.hairColor === 'blond' ? '#b58a4d' : player?.appearance?.hairColor === 'brown' ? '#493027' : '#211b1a');
        if (/superhero|shirt|jersey|cloth/.test(name)) mat.color?.set(safeColor(player?.appearance?.kitColors?.primary, '#2865a8'));
        return mat;
      };
      node.material = Array.isArray(node.material) ? node.material.map(recolor) : recolor(node.material);
    });
    attachHair(model, hairSource);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 1.78 / Math.max(0.001, size.y);
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#17283d');
    scene.add(model);
    scene.add(new THREE.HemisphereLight(0xe7f1ff, 0x172033, 1.75));
    const keyLight = new THREE.DirectionalLight(0xfff2e4, 2.1);
    keyLight.position.set(-2.8, 4.2, 3.5); scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x78b8ff, 0.8);
    rimLight.position.set(2.4, 2.8, -2.5); scene.add(rimLight);
    const camera = new THREE.PerspectiveCamera(27, WIDTH / HEIGHT, 0.1, 20);
    camera.position.set(0, 1.43, 4.2);
    camera.lookAt(0, 1.38, 0);
    activeRenderer.render(scene, camera);
    let uri;
    try { uri = canvas.toDataURL('image/webp', 0.82); }
    catch { uri = canvas.toDataURL('image/png'); }
    scene.remove(model);
    model.traverse(node => {
      if (node.isSkinnedMesh) {
        node.geometry?.dispose?.();
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
