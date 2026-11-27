import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlayerAnimationClip, createPlayerAnimationClipMap, resolveCachedPlayerAnimationClip, isLoopingPlayerAnimation, resolvePlayerAnimationTimeScale } from '../src/player-animation-map.js';

const clips = [
  'Idle_Loop','Walk_Loop','Jog_Fwd_Loop','Sprint_Fwd_Loop',
  'Pass_Right','Shot_Long','Dribble_Loop','Slide_Tackle',
  'Goalkeeper_Dive_Left','Celebrate_Goal'
];

test('P27 animation : résout les clips de locomotion selon la vitesse',()=>{
 assert.equal(resolvePlayerAnimationClip(clips,'idle'),'Idle_Loop');
 assert.equal(resolvePlayerAnimationClip(clips,'walk'),'Walk_Loop');
 assert.equal(resolvePlayerAnimationClip(clips,'run',6.5),'Jog_Fwd_Loop');
 assert.equal(resolvePlayerAnimationClip(clips,'run',8.2),'Sprint_Fwd_Loop');
 assert.equal(resolvePlayerAnimationClip(['Jog_Fwd_Loop'],'run',9),'Jog_Fwd_Loop');
});

test('P27 animation : associe les gestes de match à leurs clips sémantiques',()=>{
 assert.equal(resolvePlayerAnimationClip(clips,'pass'),'Pass_Right');
 assert.equal(resolvePlayerAnimationClip(clips,'shoot'),'Shot_Long');
 assert.equal(resolvePlayerAnimationClip(clips,'control'),'Dribble_Loop');
 assert.equal(resolvePlayerAnimationClip(clips,'tackle'),'Slide_Tackle');
 assert.equal(resolvePlayerAnimationClip(clips,'dive'),'Goalkeeper_Dive_Left');
 assert.equal(resolvePlayerAnimationClip(clips,'celebrate'),'Celebrate_Goal');
});

test('P27 animation : conserve le fallback procédural quand un clip manque',()=>{
 assert.equal(resolvePlayerAnimationClip(['Idle_Loop','Walk_Loop'],'shoot'),null);
 assert.equal(resolvePlayerAnimationClip(null,'run'),null);
 assert.equal(resolvePlayerAnimationClip(clips,'unknown'),null);
});

test('P27 animation : distingue les cycles continus des gestes ponctuels',()=>{
 for(const state of ['idle','walk','run','control']) assert.equal(isLoopingPlayerAnimation(state),true);
 for(const state of ['pass','shoot','tackle','dive','celebrate']) assert.equal(isLoopingPlayerAnimation(state),false);
});


test('P27 animation : adapte la cadence de locomotion à la vitesse sans valeurs extrêmes',()=>{
 assert.equal(resolvePlayerAnimationTimeScale('run',7.5),1);
 assert.ok(resolvePlayerAnimationTimeScale('run',3) >= 0.82);
 assert.equal(resolvePlayerAnimationTimeScale('run',99),1.2);
 assert.equal(resolvePlayerAnimationTimeScale('walk',3.2),1);
 assert.equal(resolvePlayerAnimationTimeScale('walk',99),1.15);
 assert.equal(resolvePlayerAnimationTimeScale('idle',8),1);
 assert.equal(resolvePlayerAnimationTimeScale('run',Number.NaN),0.82);
});


test('P27 animation : résout les noms de clips GLTF sans normaliser ni modifier la liste source',()=>{
 const source=[null,{}, {name:'Idle_Loop'}, {name:'Jog_Fwd_Loop'}, {name:'Sprint_Loop'}];
 assert.equal(resolvePlayerAnimationClip(source,'idle'),'Idle_Loop');
 assert.equal(resolvePlayerAnimationClip(source,'run',7.5),'Jog_Fwd_Loop');
 assert.equal(resolvePlayerAnimationClip(source,'run',7.51),'Sprint_Loop');
 assert.deepEqual(source,[null,{}, {name:'Idle_Loop'}, {name:'Jog_Fwd_Loop'}, {name:'Sprint_Loop'}]);
});


test('P27 animation : prépare une table de clips réutilisable au montage du modèle',()=>{
 const map=createPlayerAnimationClipMap(clips);
 assert.equal(map.idle,'Idle_Loop');
 assert.equal(map.walk,'Walk_Loop');
 assert.equal(map.jog,'Jog_Fwd_Loop');
 assert.equal(map.sprint,'Sprint_Fwd_Loop');
 assert.equal(resolveCachedPlayerAnimationClip(map,'run',7.5),'Jog_Fwd_Loop');
 assert.equal(resolveCachedPlayerAnimationClip(map,'run',7.51),'Sprint_Fwd_Loop');
 assert.equal(resolveCachedPlayerAnimationClip(map,'shoot'),'Shot_Long');
 assert.equal(resolveCachedPlayerAnimationClip(map,'unknown'),null);
});

test('P27 animation : conserve le clip de repli si une variante de course manque',()=>{
 const map=createPlayerAnimationClipMap(['Jog_Fwd_Loop']);
 assert.equal(resolveCachedPlayerAnimationClip(map,'run',9),'Jog_Fwd_Loop');
 assert.equal(resolveCachedPlayerAnimationClip(null,'idle'),null);
});
