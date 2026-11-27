import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlayerAnimationClip, isLoopingPlayerAnimation } from '../src/player-animation-map.js';

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
