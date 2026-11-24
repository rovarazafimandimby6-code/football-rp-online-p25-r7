import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonTransferStore } from '../server/transfer-store.js';

function setup(){const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-transfer-atomic-'));let now=Date.parse('2027-01-15T12:00:00.000Z');return{directory,get now(){return now;},store:new JsonTransferStore(directory,{now:()=>now}),cleanup:()=>rmSync(directory,{recursive:true,force:true})};}

test('P27 mercato : une panne disque annule un transfert et restaure les budgets des deux clubs',()=>{
 const f=setup();try{
  f.store.signContract('account-transfer',{clubId:'antananarivo-fc',salary:3000,durationDays:365});
  const offer=f.store.requestOffer('account-transfer',{toClubId:'toamasina-united'});
  assert.equal(offer.ok,true);
  const beforeCareer=f.store.getCareer('account-transfer');
  const beforeTarget=f.store.club('toamasina-united').budget;
  const beforeCurrent=f.store.club('antananarivo-fc').budget;
  const persist=f.store.persist.bind(f.store);
  f.store.persist=()=>{throw new Error('DISK_FULL');};
  assert.throws(()=>f.store.acceptOffer('account-transfer',offer.offer.id),/DISK_FULL/);
  f.store.persist=persist;
  const afterCareer=f.store.getCareer('account-transfer');
  assert.equal(afterCareer.clubId,'antananarivo-fc');
  assert.equal(afterCareer.offers.find(item=>item.id===offer.offer.id).status,'pending');
  assert.equal(f.store.club('toamasina-united').budget,beforeTarget);
  assert.equal(f.store.club('antananarivo-fc').budget,beforeCurrent);
  const retried=f.store.acceptOffer('account-transfer',offer.offer.id);
  assert.equal(retried.ok,true);
  assert.equal(retried.career.clubId,'toamasina-united');
  assert.equal(f.store.club('toamasina-united').budget,beforeTarget-offer.offer.fee);
  assert.equal(f.store.club('antananarivo-fc').budget,beforeCurrent+offer.offer.fee);
  const restored=new JsonTransferStore(f.directory,{now:()=>f.now});
  assert.equal(restored.getCareer('account-transfer').clubId,'toamasina-united');
 }finally{f.cleanup();}
});

test('P27 mercato : une inscription contractuelle non persistée ne crée pas de contrat fantôme',()=>{
 const f=setup();try{
  const persist=f.store.persist.bind(f.store);
  f.store.persist=()=>{throw new Error('DISK_FULL');};
  assert.throws(()=>f.store.signContract('account-sign',{clubId:'antananarivo-fc',salary:1500,durationDays:90}),/DISK_FULL/);
  f.store.persist=persist;
  const career=f.store.getCareer('account-sign');
  assert.equal(career.clubId,null);
  assert.equal(career.contract,null);
  assert.equal(career.history.length,0);
 }finally{f.cleanup();}
});

test('P27 mercato : chaque contrat humain conserve l’identifiant stable de sa carrière',()=>{
 const f=setup();try{
  const signed=f.store.signContract('account-stable-id',{clubId:'antananarivo-fc',salary:1500,durationDays:90});
  assert.equal(signed.ok,true);
  assert.equal(signed.career.contract.playerId,signed.career.playerId);
  const restored=new JsonTransferStore(f.directory,{now:()=>f.now});
  assert.equal(restored.getCareer('account-stable-id').contract.playerId,signed.career.playerId);
 }finally{f.cleanup();}
});

test('P27 mercato : complète à la lecture l’identifiant des contrats actifs hérités',()=>{
 const f=setup();try{
  f.store.signContract('account-legacy-id',{clubId:'antananarivo-fc',salary:1500,durationDays:90});
  const row=f.store.state.careers.find(item=>item.accountId==='account-legacy-id');
  delete row.contract.playerId;
  f.store.persist();
  const restored=new JsonTransferStore(f.directory,{now:()=>f.now});
  const career=restored.getCareer('account-legacy-id');
  assert.equal(career.contract.playerId,career.playerId);
 }finally{f.cleanup();}
});
