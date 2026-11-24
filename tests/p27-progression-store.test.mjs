import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonProgressionStore } from '../server/progression-store.js';

function fixture(){const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-progression-'));return {directory,store:new JsonProgressionStore(directory),cleanup:()=>rmSync(directory,{recursive:true,force:true})};}

test('P27 progression serveur : récompense calculée et persistée une seule fois par match',()=>{
 const f=fixture();try{
  const first=f.store.grantMatchReward('account-1',{matchId:'match-1',result:'win',minutesPlayedMs:180000,rating:8.5});
  assert.equal(first.duplicate,false);assert.ok(first.reward.experience>0);assert.ok(first.reward.coins>0);
  const duplicate=f.store.grantMatchReward('account-1',{matchId:'match-1',result:'loss',minutesPlayedMs:300000,rating:1});
  assert.equal(duplicate.duplicate,true);assert.deepEqual(duplicate.progression,first.progression);
  const restored=new JsonProgressionStore(f.directory);
  assert.deepEqual(restored.get('account-1'),first.progression);
 }finally{f.cleanup();}
});

test('P27 progression serveur : comptes séparés et résultat nul/récompenses cohérentes',()=>{
 const f=fixture();try{
  const draw=f.store.grantMatchReward('account-a',{matchId:'draw-1',result:'draw',minutesPlayedMs:60000,rating:6});
  const loss=f.store.grantMatchReward('account-b',{matchId:'loss-1',result:'loss',minutesPlayedMs:60000,rating:6});
  assert.ok(draw.reward.coins>loss.reward.coins);
  assert.equal(f.store.get('account-c').level,1);
  assert.notDeepEqual(f.store.get('account-a'),f.store.get('account-b'));
 }finally{f.cleanup();}
});

test('P27 entraînement serveur : consomme ressources et refuse les dépassements sans mutation',()=>{
 const f=fixture();try{
  f.store.grantMatchReward('account-train',{matchId:'reward-1',result:'win',minutesPlayedMs:300000,rating:10});
  const before=f.store.get('account-train');
  const trained=f.store.train('account-train','pace',1);
  assert.equal(trained.ok,true);assert.equal(trained.progression.attributes.pace,before.attributes.pace+1);
  assert.equal(trained.progression.trainingPoints,before.trainingPoints-1);
  const poor=f.store.train('account-train','shooting',5);
  assert.equal(poor.ok,false);
  const invalid=f.store.train('account-train','coins',1);
  assert.throws(()=>invalid,/./);
 }finally{f.cleanup();}
});

test('P27 entraînement serveur : pratique encadrée et plafond de 99',()=>{
 const f=fixture();try{
  const before=f.store.get('account-practice');
  const practice=f.store.practice('account-practice','control',2);
  assert.equal(practice.ok,true);assert.equal(practice.progression.attributes.control,before.attributes.control+2);
  const row=f.store.row('account-practice');row.progression.attributes.pace=99;
  const capped=f.store.train('account-practice','pace',1);
  assert.equal(capped.ok,false);assert.equal(capped.reason,'ATTRIBUTE_CAP');
 }finally{f.cleanup();}
});
