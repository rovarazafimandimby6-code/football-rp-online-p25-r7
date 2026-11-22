import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), 'utf8'));

test('P25 humanoïde : le modèle masculin standard possède un rig de 65 os', async () => {
  const gltf = await readJson('assets/players/base/Superhero_Male_FullBody.gltf');
  assert.equal(gltf.skins?.length, 1);
  assert.equal(gltf.skins[0].joints.length, 65);
  assert.ok(gltf.meshes?.length >= 1);
  assert.ok(gltf.nodes.some((node) => node.name === 'Head'));
});

test('P25 humanoïde : les coiffures masculines riggées partagent les 65 os du personnage', async () => {
  const base = await readJson('assets/players/base/Superhero_Male_FullBody.gltf');
  const expected = base.skins[0].joints.map((index) => base.nodes[index].name);
  for (const name of ['Hair_Buzzed', 'Hair_SimpleParted', 'Hair_Long', 'Hair_Beard', 'Eyebrows_Regular']) {
    const hair = await readJson(`assets/players/hairstyles/${name}.gltf`);
    const actual = hair.skins[0].joints.map((index) => hair.nodes[index].name);
    assert.deepEqual(actual, expected, `${name} doit utiliser le même ordre de bones`);
  }
});


test('P25 humanoïde : les dépendances glTF des modèles et coiffures sont toutes présentes', async () => {
  const files = [
    'assets/players/base/Superhero_Male_FullBody.gltf',
    'assets/players/hairstyles/Hair_Buzzed.gltf',
    'assets/players/hairstyles/Hair_SimpleParted.gltf',
    'assets/players/hairstyles/Hair_Long.gltf',
    'assets/players/hairstyles/Hair_Beard.gltf',
    'assets/players/hairstyles/Eyebrows_Regular.gltf'
  ];
  for (const file of files) {
    const gltf = await readJson(file);
    for (const dependency of [...(gltf.buffers || []), ...(gltf.images || [])]) {
      if (!dependency.uri) continue;
      await access(path.join(root, path.dirname(file), dependency.uri));
    }
  }
});

test('P25 humanoïde : le chargeur GLTF et les animations standard sont raccordés au joueur', async () => {
  const player = await readFile(path.join(root, 'src/player.js'), 'utf8');
  const loader = await readFile(path.join(root, 'src/player-models.js'), 'utf8');
  assert.match(player, /mountHumanoidPlayer/);
  assert.ok(player.includes('updateModel?.(dt, state, speed, {'));
  assert.match(loader, /GLTFLoader/);
  assert.match(loader, /Idle_Loop/);
  assert.match(loader, /Walk_Loop/);
  assert.match(loader, /Jog_Fwd_Loop/);
  assert.match(loader, /Sprint_Fwd_Loop/);
  assert.doesNotMatch(loader, /Sprint_Loop/);
});


test('P25 R7 : la bibliothèque complète conserve ses 43 animations et son rig', async () => {
  const glb = await readFile(path.join(root, 'assets/players/animations/UAL1_Standard.glb'));
  assert.equal(glb.toString('ascii', 0, 4), 'glTF');
  assert.equal(glb.readUInt32LE(4), 2, 'le conteneur doit être au format GLB 2.0');
  let offset = 12;
  let document = null;
  while (offset < glb.length) {
    const chunkLength = glb.readUInt32LE(offset);
    const chunkType = glb.toString('ascii', offset + 4, offset + 8);
    offset += 8;
    if (chunkType === 'JSON') {
      document = JSON.parse(glb.toString('utf8', offset, offset + chunkLength));
      break;
    }
    offset += chunkLength;
  }
  assert.ok(document, 'le chunk JSON GLB doit être présent');
  assert.equal(document.animations?.length, 43, 'aucun clip original ne doit être supprimé');
  assert.equal(document.skins?.length, 1, 'le rig animé doit rester présent');
  const names = new Set(document.animations.map((clip) => clip.name));
  for (const name of ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Crouch_Fwd_Loop', 'Hit_Chest', 'Hit_Head']) {
    assert.ok(names.has(name), `animation manquante : ${name}`);
  }
  const base = await readJson('assets/players/base/Superhero_Male_FullBody.gltf');
  const baseJointNames = new Set(base.skins[0].joints.map((index) => base.nodes[index].name));
  const animatedNodeNames = new Set(document.nodes.map((node) => node.name).filter(Boolean));
  for (const joint of baseJointNames) {
    assert.ok(animatedNodeNames.has(joint), `articulation absente du rig animé : ${joint}`);
  }
});

test('P25 R7 : les gestes de match sont appliqués au modèle humanoïde sans retour au mannequin procédural', async () => {
  const loader = await readFile(path.join(root, 'src/player-models.js'), 'utf8');
  const player = await readFile(path.join(root, 'src/player.js'), 'utf8');
  assert.match(loader, /model\.visible = true/);
  assert.match(loader, /fallbackBody\.visible = false/);
  for (const state of ['pass', 'shoot', 'control', 'tackle', 'dive', 'celebrate']) assert.ok(loader.includes(`state === '${state}'`), `geste humanoïde manquant : ${state}`);
  for (const bone of ['pelvis', 'spine_02', 'thigh_l', 'calf_l', 'upperarm_l']) assert.ok(loader.includes(`'${bone}'`), `articulation non pilotée : ${bone}`);
  assert.match(player, /progress: this\.animTimer/);
  assert.match(player, /preferredFoot: this\.preferredFoot/);
});

test('P25 R7 : la conduite de balle humanoïde utilise un cycle alterné piloté par la phase', async () => {
  const loader = await readFile(path.join(root, 'src/player-models.js'), 'utf8');
  const player = await readFile(path.join(root, 'src/player.js'), 'utf8');
  assert.match(loader, /const phase = Number\.isFinite\(action\.phase\)/);
  assert.match(loader, /rotate\('thigh_l', -0\.22 - stride \* 0\.24/);
  assert.match(loader, /rotate\('thigh_r', 0\.08 \+ stride \* 0\.24/);
  assert.match(loader, /rotate\('upperarm_l'/);
  assert.match(player, /this\.dribblePhase = \(this\.dribblePhase \+ dt \*/);
  assert.match(player, /phase: this\.dribblePhase/);
});


test('P25 R7 : la course rapide sélectionne le nom exact du clip de sprint disponible', async () => {
  const loader = await readFile(path.join(root, 'src/player-models.js'), 'utf8');
  assert.match(loader, /speed > 7\.5 \? 'Sprint_Fwd_Loop' : 'Jog_Fwd_Loop'/);
  assert.doesNotMatch(loader, /'Sprint_Loop'/);
});
