import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonCareerStore } from '../server/career-store.js';

function fixture(){const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-career-atomic-'));return {directory,store:new JsonCareerStore(directory),cleanup:()=>rmSync(directory,{recursive:true,force:true})};}

test('P27 carrière compte : une panne disque annule la mutation et permet une nouvelle tentative',()=>{
 const f=fixture();try{
  const before=f.store.get('account-career');
  const persist=f.store.persist.bind(f.store);
  f.store.persist=()=>{throw new Error('DISK_FULL');};
  const input={matchId:'career-match-1',result:'win',minutesPlayedMs:120000,rating:8,stats:{goals:1}};
  assert.throws(()=>f.store.recordMatch('account-career',input),/DISK_FULL/);
  assert.deepEqual(f.store.get('account-career'),before);
  assert.deepEqual(new JsonCareerStore(f.directory).get('account-career'),before);
  f.store.persist=persist;
  const saved=f.store.recordMatch('account-career',input);
  assert.equal(saved.duplicate,false);
  assert.equal(saved.career.totals.matches,1);
  assert.equal(new JsonCareerStore(f.directory).get('account-career').totals.matches,1);
 }finally{f.cleanup();}
});

test('P27 carrière joueur : une panne disque ne marque pas le match comme déjà traité',()=>{
 const f=fixture();try{
  const input={matchId:'player-match-1',result:'draw',name:'Joueur test',role:'MID',minutesPlayedMs:90000,rating:7,stats:{passes:10,completedPasses:8}};
  const persist=f.store.persist.bind(f.store);
  f.store.persist=()=>{throw new Error('DISK_FULL');};
  assert.throws(()=>f.store.recordPlayerMatch('player-1',input),/DISK_FULL/);
  assert.equal(f.store.getPlayerCareer('player-1').totals.matches,0);
  f.store.persist=persist;
  const saved=f.store.recordPlayerMatch('player-1',input);
  assert.equal(saved.duplicate,false);
  assert.equal(saved.career.totals.matches,1);
  assert.equal(new JsonCareerStore(f.directory).getPlayerCareer('player-1').totals.matches,1);
 }finally{f.cleanup();}
});
