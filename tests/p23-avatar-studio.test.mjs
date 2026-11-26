import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateProfile, createDefaultProfile } from '../src/player-profile.js';

const playerSource = await readFile(new URL('../src/player.js', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const htmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('P23 avatar : le profil propose cinq coiffures et trois morphologies contrôlées', () => {
  const p = validateProfile({ appearance: { hairStyle: 'afro', bodyBuild: 'strong' } });
  assert.equal(p.appearance.hairStyle, 'afro');
  assert.equal(p.appearance.bodyBuild, 'strong');
  assert.equal(validateProfile({ appearance: { hairStyle: 'invalid', bodyBuild: 'giant' } }).appearance.hairStyle, 'short');
  assert.equal(validateProfile({ appearance: { bodyBuild: 'giant' } }).appearance.bodyBuild, 'athletic');
  assert.equal(createDefaultProfile().appearance.bodyBuild, 'athletic');
});

test('P27 joueur : le pied préféré accepte droit, gauche et ambidextre', () => {
  assert.equal(validateProfile({ identity:{ preferredFoot:'right' } }).identity.preferredFoot, 'right');
  assert.equal(validateProfile({ identity:{ preferredFoot:'left' } }).identity.preferredFoot, 'left');
  assert.equal(validateProfile({ identity:{ preferredFoot:'both' } }).identity.preferredFoot, 'both');
  assert.equal(validateProfile({ identity:{ preferredFoot:'invalid' } }).identity.preferredFoot, 'right');
  assert.match(mainSource, /value:'both',label:'Ambidextre'/);
});

test('P23 avatar : silhouette humanoïde anatomique avec torse profilé, mâchoire et membres articulés', () => {
  assert.match(playerSource, /new THREE\.LatheGeometry\(torsoProfile, 20\)/);
  assert.match(playerSource, /const jaw = new THREE\.Mesh/);
  assert.match(playerSource, /const makeArm = \(side\)/);
  assert.match(playerSource, /const makeLeg = \(side\)/);
  assert.match(playerSource, /buildScale/);
});

test('P23 avatar : coiffures afro et dégradé et chaussures arrondies sont générées', () => {
  assert.match(playerSource, /appearance\?\.hairStyle === 'afro'/);
  assert.match(playerSource, /appearance\?\.hairStyle === 'fade'/);
  assert.match(playerSource, /const boot = new THREE\.Mesh\(new THREE\.SphereGeometry/);
});

test('P23 avatar : transitions articulaires amorties pour les poses et actions', () => {
  assert.match(playerSource, /const previousPose = poseNodes\.map/);
  assert.match(playerSource, /const blend = 1 - Math\.exp/);
  assert.match(playerSource, /node\.rotation\.x = previousPose\[index\]\.rotation\.x/);
});

test('P23 avatar : aperçu 3D interactif du profil monté puis nettoyé à la navigation', () => {
  assert.match(mainSource, /function mountAvatarPreview\(profile\)/);
  assert.match(mainSource, /new THREE\.WebGLRenderer/);
  assert.match(mainSource, /new Player\(\{ id: 'avatar-preview'/);
  assert.match(mainSource, /function disposeAvatarPreview\(\)/);
  assert.match(mainSource, /cancelAnimationFrame\(avatarPreview\.raf\)/);
  assert.match(mainSource, /mountAvatarPreview\(p\)/);
  assert.match(htmlSource, /three@0\.170\.0/);
});


test('P23 avatar : rotation tactile/souris réellement câblée et reprise automatique', () => {
  assert.match(mainSource, /addEventListener\('pointerdown'/);
  assert.match(mainSource, /addEventListener\('pointermove'/);
  assert.match(mainSource, /setPointerCapture/);
  assert.match(mainSource, /player\.visual\.root\.rotation\.y \+= deltaX \* 0\.009/);
  assert.match(mainSource, /resumeAutoAt/);
  assert.match(mainSource, /FAITES GLISSER POUR TOURNER/);
});

test('P23 avatar : aperçu adapté au redimensionnement et observateur nettoyé', () => {
  assert.match(mainSource, /new ResizeObserver/);
  assert.match(mainSource, /camera\.updateProjectionMatrix\(\)/);
  assert.match(mainSource, /avatarPreview\.resizeObserver\?\.disconnect\(\)/);
});
