import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { createPlayerAnimationClipMap, resolveCachedPlayerAnimationClip, isLoopingPlayerAnimation, resolvePlayerAnimationTimeScale } from './player-animation-map.js';
import { clonePlayerMaterials } from './player-materials.js';

const loader = new GLTFLoader();
const BASE_URL = './assets/players/';
let basePromise;
let animationPromise;
const hairPromises = new Map();

function loadBase() {
  if (!basePromise) basePromise = loader.loadAsync(`${BASE_URL}base/Superhero_Male_FullBody.gltf`);
  return basePromise;
}
function loadAnimations() {
  if (!animationPromise) animationPromise = loader.loadAsync(`${BASE_URL}animations/UAL1_Standard.glb`);
  return animationPromise;
}
function loadHair(style) {
  const files = { buzzed: 'Hair_Buzzed', short: 'Hair_SimpleParted', long: 'Hair_Long', buns: 'Hair_Buns', beard: 'Hair_Beard' };
  const file = files[style];
  if (!file) return Promise.resolve(null);
  if (!hairPromises.has(file)) hairPromises.set(file, loader.loadAsync(`${BASE_URL}hairstyles/${file}.gltf`));
  return hairPromises.get(file);
}

function disposePlayerModelResources(model) {
  if (!model) return;
  const ownedGeometries = new Set();
  const materials = new Set();
  model.traverse((node) => {
    if (!node.isMesh) return;
    if (node.userData?.p27OwnedGeometry && node.geometry) ownedGeometries.add(node.geometry);
    const list = Array.isArray(node.material) ? node.material : (node.material ? [node.material] : []);
    for (const material of list) materials.add(material);
  });
  for (const material of materials) material.dispose();
  for (const geometry of ownedGeometries) geometry.dispose();
}

function setKitMaterials(model, team, isGK, appearance) {
  const palette = appearance?.kitColors;
  const primary = palette?.primary || (team === 'blue' ? '#2676f2' : '#e03d35');
  const secondary = palette?.secondary || (team === 'blue' ? '#123269' : '#1b1d24');
  const accent = palette?.accent || '#f4f7fb';
  model.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const name = (material.name || '').toLowerCase();
      // Preserve skin, eyes and hair textures; recolor only garment-like materials.
      if (/shirt|jersey|cloth|suit/.test(name) && !/skin|hair|eye/.test(name)) {
        material.color?.set(isGK ? accent : primary);
        if (material.roughness !== undefined) material.roughness = 0.82;
      } else if (/short|pant|trouser/.test(name)) material.color?.set(secondary);
    }
  });
}

function attachHair(model, hairGltf) {
  if (!hairGltf?.scene) return;
  const modelBones = new Map();
  model.traverse((node) => { if (node.isBone && node.name) modelBones.set(node.name, node); });
  const sourceMesh = [];
  hairGltf.scene.traverse((node) => { if (node.isSkinnedMesh) sourceMesh.push(node); });
  for (const source of sourceMesh) {
    const bones = source.skeleton.bones.map((bone) => modelBones.get(bone.name));
    if (bones.some((bone) => !bone)) continue;
    const hair = new THREE.SkinnedMesh(source.geometry.clone(), source.material.clone());
    hair.userData.p27OwnedGeometry = true;
    hair.name = `Custom_${source.name || 'Hair'}`;
    hair.position.copy(source.position); hair.quaternion.copy(source.quaternion); hair.scale.copy(source.scale);
    hair.bind(new THREE.Skeleton(bones, source.skeleton.boneInverses.map((matrix) => matrix.clone())), source.bindMatrix.clone());
    hair.frustumCulled = false;
    model.add(hair);
  }
}

export async function mountHumanoidPlayer({ root, fallbackBody, team, isGK, appearance, onReady }) {
  try {
    const [base, animationSource] = await Promise.all([loadBase(), loadAnimations()]);
    if (root?.userData?.disposed) return null;
    const model = cloneSkeleton(base.scene);
    model.name = 'P25_Male_Humanoid';
    // SkeletonUtils clones the rig but shares source materials; isolate them before applying club colors.
    clonePlayerMaterials(model);
    model.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
    setKitMaterials(model, team, isGK, appearance);

    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const targetHeight = 1.78;
    const scale = targetHeight / Math.max(0.001, size.y);
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);

    const hairStyle = ({ shaved: 'buzzed', fade: 'buzzed', short: 'short', curly: 'short', long: 'long' })[appearance?.shopHairStyle] || ({ shaved: 'buzzed', fade: 'buzzed', short: 'short', curly: 'short', long: 'long' })[appearance?.hairStyle] || 'short';
    const hair = await loadHair(hairStyle).catch(() => null);
    attachHair(model, hair);
    if (appearance?.shopBeardStyle) {
      const beard = await loadHair('beard').catch(() => null);
      attachHair(model, beard);
    }
    // The visual may have been removed while optional hair assets were loading.
    // Release cloned materials and owned cosmetic geometry before abandoning it.
    if (root?.userData?.disposed) {
      disposePlayerModelResources(model);
      return null;
    }
    const bonesForCosmetics = new Map();
    model.traverse((node) => { if (node.isBone && node.name) bonesForCosmetics.set(node.name, node); });
    if (appearance?.shopBootStyle) {
      const premium = appearance.shopBootStyle === 'boots-premium';
      const rare = appearance.shopBootStyle === 'boots-rare';
      const color = premium ? '#d8ad55' : rare ? '#63b7ff' : '#26384f';
      for (const side of ['l','r']) {
        const foot = bonesForCosmetics.get(`foot_${side}`);
        if (!foot) continue;
        const shoe = new THREE.Group();
        shoe.name = `ShopBoot_${side}`;
        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.13,0.065,0.24), new THREE.MeshStandardMaterial({color,roughness:0.72,metalness:0.08}));
        upper.userData.p27OwnedGeometry = true;
        upper.position.set(0,-0.012,0.025);
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.135,0.018,0.245), new THREE.MeshStandardMaterial({color:'#111820',roughness:0.9}));
        sole.userData.p27OwnedGeometry = true;
        sole.position.set(0,-0.047,0.025);
        shoe.add(upper,sole); shoe.traverse((node)=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
        foot.add(shoe);
      }
    }
    if (appearance?.shopAccessoryStyle) {
      const color = appearance.shopAccessoryStyle === 'accessory-premium' ? '#d8ad55' : appearance.shopAccessoryStyle === 'accessory-rare' ? '#63b7ff' : '#e7edf4';
      for (const side of ['l','r']) {
        const arm = bonesForCosmetics.get(`lowerarm_${side}`);
        if (!arm) continue;
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.035,0.008,8,20), new THREE.MeshStandardMaterial({color,metalness:0.18,roughness:0.55}));
        band.userData.p27OwnedGeometry = true;
        band.name = `ShopWristBand_${side}`;
        band.rotation.x = Math.PI/2;
        band.position.y = 0.19;
        arm.add(band);
      }
    }

    const mixer = new THREE.AnimationMixer(model);
    const bones = new Map();
    model.traverse((node) => { if (node.isBone && node.name) bones.set(node.name, node); });
    const restRotations = new Map([...bones].map(([name, bone]) => [name, bone.rotation.clone()]));
    const restPoseEntries = [...bones].map(([name, bone]) => ({ bone, rest: restRotations.get(name) }));
    const rotate = (name, x = 0, y = 0, z = 0) => {
      const bone = bones.get(name);
      if (bone) { bone.rotation.x += x; bone.rotation.y += y; bone.rotation.z += z; }
    };
    const actions = new Map();
    for (const clip of animationSource.animations || []) actions.set(clip.name, mixer.clipAction(clip));
    const clipNames = [...actions.keys()];
    const clipMap = createPlayerAnimationClipMap(clipNames);
    let activeAction = null;
    let activeActionMode = null;
    let lastState = null;
    const play = (name, state, speed = 0) => {
      const next = actions.get(name);
      if (!next) return false;
      const looping = isLoopingPlayerAnimation(state);
      const mode = `${state}:${looping ? 'loop' : 'once'}`;
      if (next === activeAction && activeActionMode === mode) {
        // Movement speed changes continuously; update cadence without restarting the clip.
        if (looping) next.setEffectiveTimeScale(resolvePlayerAnimationTimeScale(state, speed));
        return true;
      }
      next.reset().setLoop(looping ? THREE.LoopRepeat : THREE.LoopOnce, looping ? Infinity : 1);
      next.clampWhenFinished = !looping;
      next.enabled = true;
      next.setEffectiveWeight(1);
      if (!looping) {
        const expectedDuration = ({ pass:0.34, shoot:0.38, tackle:0.42, dive:0.58, celebrate:2.0 })[state] || 0.5;
        next.setDuration(expectedDuration);
      } else {
        next.setEffectiveTimeScale(resolvePlayerAnimationTimeScale(state, speed));
      }
      next.fadeIn(0.18).play();
      if (activeAction && activeAction !== next) activeAction.fadeOut(0.18);
      activeAction = next;
      activeActionMode = mode;
      return true;
    };
    root.add(model);
    fallbackBody.visible = true;
    const update = (dt, state, speed = 0, action = {}) => {
      const safeDt = Math.min(Math.max(dt || 0, 0), 0.05);
      model.visible = true;
      fallbackBody.visible = false;
      const clipName = resolveCachedPlayerAnimationClip(clipMap, state, speed);
      const hasClip = clipName ? play(clipName, state, speed) : false;
      mixer.update(safeDt);

      if (!hasClip) {
        if (activeAction) {
          activeAction.fadeOut(0.12);
          activeAction = null;
          activeActionMode = null;
        }
        // Procedural fallback: restore the bind pose before layering this frame's gesture.
        for (let i = 0; i < restPoseEntries.length; i++) {
          const entry = restPoseEntries[i];
          entry.bone.rotation.copy(entry.rest);
        }
        const progress = THREE.MathUtils.clamp(action.progress ?? 0.5, 0, 1);
        const pulse = Math.sin(progress * Math.PI);
        const side = action.preferredFoot === 'left' ? 'l' : 'r';
        const other = side === 'l' ? 'r' : 'l';
        if (state === 'pass' || state === 'shoot') {
          const shooting = state === 'shoot';
          const power = shooting ? 1.0 : 0.62;
          const followThrough = Math.sin(Math.min(1, progress * 1.18) * Math.PI);
          rotate('pelvis', (shooting ? 0.2 : 0.12) * pulse, 0, (shooting ? -0.14 : -0.08) * pulse);
          rotate('spine_02', -0.2 * pulse, 0, -0.12 * pulse);
          rotate(`thigh_${side}`, -power * (0.72 * pulse + 0.28 * followThrough), 0, 0);
          rotate(`calf_${side}`, (shooting ? 0.95 : 0.68) * pulse, 0, 0);
          rotate(`thigh_${other}`, 0.25 * pulse, 0, 0);
          rotate(`calf_${other}`, -0.12 * pulse, 0, 0);
          rotate(`upperarm_${side}`, 0.24 * pulse, 0, -0.3 * pulse);
          rotate(`upperarm_${other}`, -0.55 * pulse, 0, 0.24 * pulse);
        } else if (state === 'control') {
          const phase = Number.isFinite(action.phase) ? action.phase : 0;
          const stride = Math.sin(phase);
          const lift = Math.max(0, Math.cos(phase));
          rotate('pelvis', 0.2 + lift * 0.12, 0, stride * 0.055);
          rotate('spine_02', -0.16 - lift * 0.06, 0, -stride * 0.045);
          rotate('thigh_l', -0.22 - stride * 0.24, 0, 0);
          rotate('calf_l', 0.18 + lift * 0.42, 0, 0);
          rotate('thigh_r', 0.08 + stride * 0.24, 0, 0);
          rotate('calf_r', 0.12 + Math.max(0, -Math.cos(phase)) * 0.38, 0, 0);
          rotate('upperarm_l', 0.18 + stride * 0.12, 0, -0.12);
          rotate('upperarm_r', -0.18 - stride * 0.12, 0, 0.12);
        } else if (state === 'tackle' || state === 'dive') {
          const direction = (action.diveDir || 1) * (state === 'dive' ? 1 : 0.45);
          rotate('pelvis', -0.72 * pulse, 0, direction * 0.9 * pulse);
          rotate('spine_02', -0.48 * pulse, 0, direction * 0.35 * pulse);
          rotate('upperarm_l', -1.25 * pulse, 0, -0.5 * pulse);
          rotate('upperarm_r', -1.25 * pulse, 0, 0.5 * pulse);
          rotate('thigh_l', -0.5 * pulse, 0, 0);
          rotate('thigh_r', 0.45 * pulse, 0, 0);
        } else if (state === 'celebrate') {
          const style = ['standard','rare','premium'].includes(action.celebrationStyle) ? action.celebrationStyle : 'standard';
          const phase = Number.isFinite(action.time) ? action.time : 0;
          const bounce = Math.max(0, Math.sin(phase * 7.5)) * 0.12;
          rotate('pelvis', -0.08 + bounce, 0, Math.sin(phase * 2.5) * 0.04);
          if (style === 'standard') {
            rotate('spine_02', -0.12 + bounce, 0, 0);
            rotate('upperarm_l', -2.1 + Math.sin(phase * 5) * 0.08, 0, -0.25);
            rotate('upperarm_r', -2.1 + Math.sin(phase * 5) * 0.08, 0, 0.25);
          } else if (style === 'rare') {
            rotate('spine_02', -0.08, 0, -0.16 * Math.sin(phase * 2));
            rotate('upperarm_l', -1.05, 0, -0.95);
            rotate('upperarm_r', -1.05, 0, 0.95);
            rotate('lowerarm_l', -0.45 * pulse, 0, -0.12);
            rotate('lowerarm_r', -0.45 * pulse, 0, 0.12);
          } else {
            rotate('spine_02', -0.18, 0, 0.12 * pulse);
            rotate('upperarm_l', -2.35, 0, -0.12);
            rotate('upperarm_r', -0.55 + Math.sin(phase * 4) * 0.08, 0, 0.95);
            rotate('lowerarm_r', -0.65 * pulse, 0, 0.15);
          }
          rotate('thigh_l', -0.12 * pulse + bounce, 0, 0);
          rotate('thigh_r', 0.12 * pulse + bounce, 0, 0);
        }
      }
      lastState = state;
    };
    onReady?.({ model, mixer, actions });
    return { model, mixer, update, dispose() {
      mixer.stopAllAction();
      root.remove(model);
      disposePlayerModelResources(model);
      mixer.uncacheRoot(model);
      fallbackBody.visible = true;
    } };
  } catch (error) {
    console.warn('P25 humanoid model unavailable; procedural fallback retained.', error);
    return null;
  }
}
