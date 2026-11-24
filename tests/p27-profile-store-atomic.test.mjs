import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonPlayerProfileStore } from '../server/player-profile-store.js';

test('P27 profil cloud : une panne disque annule la sauvegarde et permet de la rejouer',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-profile-atomic-'));
 try{
  const store=new JsonPlayerProfileStore(directory);
  const before=store.get('account-atomic');
  const persist=store.persist.bind(store);
  store.persist=()=>{throw new Error('DISK_FULL');};
  assert.throws(()=>store.save('account-atomic',{identity:{displayName:'Profil provisoire'}}),/DISK_FULL/);
  assert.equal(store.get('account-atomic'),before);
  assert.equal(new JsonPlayerProfileStore(directory).get('account-atomic'),null);
  store.persist=persist;
  const saved=store.save('account-atomic',{identity:{displayName:'Profil durable'}});
  assert.equal(saved.identity.displayName,'Profil durable');
  assert.equal(new JsonPlayerProfileStore(directory).get('account-atomic').identity.displayName,'Profil durable');
 }finally{rmSync(directory,{recursive:true,force:true});}
});
