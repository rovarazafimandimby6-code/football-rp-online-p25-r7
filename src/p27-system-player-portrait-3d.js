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
function skinToneHex(value) {
  return ({
    light:'#efc6a1', tan:'#d99d70', medium:'#b97850',
    brown:'#8b543a', dark:'#623b2d', deep:'#45291f', olive:'#c69a70'
  })[String(value || 'tan').toLowerCase()] || '#d99d70';
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
const KIT_PATTERN_INDEX = Object.freeze({
  vertical:0, sash:1, hoops:2, wave:3, pinstripes:4, quartered:5, chevron:6, sunburst:7,
  horizontal:8, diagonal:9, central:10, split:11, shoulder:12, ripple:13, cross:14, sidepanels:15
});
function applyClubKitShader(material, appearance = {}) {
  const colors = appearance.kitColors || {};
  const primary = safeColor(colors.primary, '#2865a8');
  const secondary = safeColor(colors.secondary, '#17365d');
  const accent = safeColor(colors.accent, '#f4f6fb');
  const skin = skinToneHex(appearance.skinTone);
  const design = KIT_PATTERN_INDEX[String(appearance.kitDesign || 'central')] ?? KIT_PATTERN_INDEX.central;
  material.color?.set('#ffffff');
  material.onBeforeCompile = shader => {
    shader.uniforms.p27KitPrimary = { value:new THREE.Color(primary) };
    shader.uniforms.p27KitSecondary = { value:new THREE.Color(secondary) };
    shader.uniforms.p27KitAccent = { value:new THREE.Color(accent) };
    shader.uniforms.p27KitDesign = { value:design };
    shader.uniforms.p27SkinColor = { value:new THREE.Color(skin) };
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 p27LocalPosition;'
    ).replace(
      '#include <skinning_vertex>',
      '#include <skinning_vertex>\np27LocalPosition = transformed;'
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nuniform vec3 p27KitPrimary;\nuniform vec3 p27KitSecondary;\nuniform vec3 p27KitAccent;\nuniform float p27KitDesign;\nuniform vec3 p27SkinColor;\nvarying vec3 p27LocalPosition;'
    ).replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float p27X = p27LocalPosition.x;
      float p27Y = p27LocalPosition.y;
      float p27Pattern = 0.0;
      if (p27KitDesign < 0.5) p27Pattern = step(0.5, fract((p27X + 0.28) * 18.0));
      else if (p27KitDesign < 1.5) p27Pattern = 1.0 - smoothstep(0.025, 0.055, abs(p27X - (p27Y - 1.05) * 0.68));
      else if (p27KitDesign < 2.5) p27Pattern = step(0.5, fract(p27Y * 9.0));
      else if (p27KitDesign < 3.5) p27Pattern = 1.0 - smoothstep(0.06, 0.15, abs(sin(p27Y * 23.0 + p27X * 9.0)));
      else if (p27KitDesign < 4.5) p27Pattern = 1.0 - smoothstep(0.12, 0.24, fract(abs(p27X) * 44.0));
      else if (p27KitDesign < 5.5) p27Pattern = step(0.0, p27X);
      else if (p27KitDesign < 6.5) p27Pattern = 1.0 - smoothstep(0.035, 0.075, abs(abs(p27X) - (1.45 - p27Y) * 0.72));
      else if (p27KitDesign < 7.5) p27Pattern = 1.0 - smoothstep(0.025, 0.06, abs(p27X - (p27Y - 0.9) * 0.22));
      else if (p27KitDesign < 8.5) p27Pattern = step(0.5, fract(p27Y * 9.0));
      else if (p27KitDesign < 9.5) p27Pattern = step(0.5, fract((p27X + p27Y) * 11.0));
      else if (p27KitDesign < 10.5) p27Pattern = 1.0 - smoothstep(0.07, 0.12, abs(p27X));
      else if (p27KitDesign < 11.5) p27Pattern = step(0.0, p27X);
      else if (p27KitDesign < 12.5) p27Pattern = smoothstep(1.30, 1.38, p27Y);
      else if (p27KitDesign < 13.5) p27Pattern = 1.0 - smoothstep(0.08, 0.17, abs(sin(p27Y * 22.0 + p27X * 7.0)));
      else if (p27KitDesign < 14.5) p27Pattern = max(1.0 - smoothstep(0.07, 0.12, abs(p27X)), 1.0 - smoothstep(0.025, 0.055, abs(p27Y - 1.16)));
      else p27Pattern = smoothstep(0.14, 0.20, abs(p27X));
      float p27ShirtMask = (1.0 - smoothstep(0.24, 0.32, abs(p27X))) * smoothstep(0.82, 0.96, p27Y) * (1.0 - smoothstep(1.43, 1.53, p27Y));
      vec3 p27PatternColor = mix(p27KitPrimary, p27KitSecondary, p27Pattern);
      float p27AccentLine = 1.0 - smoothstep(0.012, 0.028, abs(fract((p27X + p27Y) * 18.0) - 0.5));
      p27PatternColor = mix(p27PatternColor, p27KitAccent, p27AccentLine * 0.18);
      diffuseColor.rgb = mix(diffuseColor.rgb, p27PatternColor, p27ShirtMask * 0.94);
      // Restrict skin tint to the face and neck: the source body texture atlases skin and kit together.
      float p27FaceMask = smoothstep(1.30, 1.38, p27Y) * (1.0 - smoothstep(1.72, 1.79, p27Y)) * (1.0 - smoothstep(0.13, 0.18, abs(p27X)));
      float p27NeckMask = smoothstep(1.12, 1.20, p27Y) * (1.0 - smoothstep(1.38, 1.46, p27Y)) * (1.0 - smoothstep(0.09, 0.14, abs(p27X)));
      float p27SkinMask = max(p27FaceMask, p27NeckMask);
      diffuseColor.rgb = mix(diffuseColor.rgb, p27SkinColor, p27SkinMask * 0.72);`
    );
  };
  material.customProgramCacheKey = () => 'p27-club-kit-shader-v1';
  material.needsUpdate = true;
}
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
        if (/superhero|shirt|jersey|cloth/.test(name)) applyClubKitShader(mat, player?.appearance);
        return mat;
      };
      node.material = Array.isArray(node.material) ? node.material.map(recolor) : recolor(node.material);
    });
    const hairTint = hairColorHex(player?.appearance?.hairColor);
    attachHair(model, hairSource, hairTint);
    attachHair(model, beardSource, hairTint);
    addShirtNumber(model, player?.number);
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
