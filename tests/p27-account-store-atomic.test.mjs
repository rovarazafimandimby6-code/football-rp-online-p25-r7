import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonAccountStore } from '../server/account-store.js';

test('P27 comptes : inscription atomique, aucun compte fantôme après panne disque',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-account-atomic-'));
 try{
  const store=new JsonAccountStore(directory);
  const persist=store.persist.bind(store);
  store.persist=()=>{throw new Error('DISK_FULL');};
  assert.throws(()=>store.register({username:'atomic_user',password:'strong-password-123'}),/DISK_FULL/);
  assert.equal(store.login({username:'atomic_user',password:'strong-password-123'}),null);
  assert.equal(new JsonAccountStore(directory).login({username:'atomic_user',password:'strong-password-123'}),null);
  store.persist=persist;
  const registered=store.register({username:'atomic_user',password:'strong-password-123'});
  assert.equal(store.resolve(registered.token).id,registered.account.id);
  assert.equal(new JsonAccountStore(directory).resolve(registered.token).id,registered.account.id);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('P27 sessions : login et révocation restaurent l’état si la persistance échoue',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-session-atomic-'));
 try{
  const store=new JsonAccountStore(directory);
  const registered=store.register({username:'session_user',password:'strong-password-456'});
  const persist=store.persist.bind(store);
  store.persist=()=>{throw new Error('DISK_FULL');};
  assert.throws(()=>store.login({username:'session_user',password:'strong-password-456'}),/DISK_FULL/);
  assert.equal(store.resolve(registered.token).id,registered.account.id);
  assert.throws(()=>store.revoke(registered.token),/DISK_FULL/);
  assert.equal(store.resolve(registered.token).id,registered.account.id);
  store.persist=persist;
  assert.equal(store.revoke(registered.token),true);
  assert.equal(store.resolve(registered.token),null);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('P27 sessions : révocation globale invalide toutes les sessions du compte sans toucher aux autres comptes',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-session-revoke-all-'));
 try{
  const store=new JsonAccountStore(directory);
  const first=store.register({username:'revoke_user1',password:'strong-password-111'});
  const other=store.register({username:'revoke_user2',password:'strong-password-222'});
  const another=store.login({username:'revoke_user1',password:'strong-password-111'});
  assert.equal(store.revokeAll(first.account.id),2);
  assert.equal(store.resolve(first.token),null);
  assert.equal(store.resolve(another.token),null);
  assert.equal(store.resolve(other.token).id,other.account.id);
  assert.equal(store.revokeAll(first.account.id),0);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
