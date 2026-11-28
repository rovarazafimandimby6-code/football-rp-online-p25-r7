import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderFramePacer } from '../src/render-frame-pacer.js';

test('P27 rendu mobile : cadence le GPU à 30 FPS sans bloquer la simulation',()=>{
 const pacer=new RenderFramePacer(30);
 assert.equal(pacer.shouldRender(0),true);
 assert.equal(pacer.shouldRender(16),false);
 assert.equal(pacer.shouldRender(33),true);
 assert.equal(pacer.shouldRender(49),false);
 assert.equal(pacer.shouldRender(67),true);
});

test('P27 rendu standard : autorise 60 FPS et réinitialise la cadence au changement de profil',()=>{
 const pacer=new RenderFramePacer(60);
 assert.equal(pacer.shouldRender(100),true);
 assert.equal(pacer.shouldRender(110),false);
 assert.equal(pacer.shouldRender(117),true);
 pacer.setTargetFps(30);
 assert.equal(pacer.shouldRender(118),true);
 assert.equal(pacer.shouldRender(135),false);
 assert.equal(pacer.shouldRender(152),true);
});

test('P27 rendu mobile : borne les valeurs de FPS et accepte un horodatage invalide',()=>{
 const pacer=new RenderFramePacer(1000);
 assert.equal(pacer.targetFps,120);
 assert.equal(pacer.shouldRender(Number.NaN),true);
 pacer.setTargetFps(1);
 assert.equal(pacer.targetFps,15);
});
