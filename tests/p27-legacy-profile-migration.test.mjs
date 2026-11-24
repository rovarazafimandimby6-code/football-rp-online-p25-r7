import test from 'node:test';
import assert from 'node:assert/strict';
import { createLegacyProfileBackup, buildLegacyProfileMigrationPayload, LEGACY_PROFILE_BACKUP_KEY } from '../src/legacy-profile-migration.js';

function memoryStorage(){const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,String(value)),data};}
const profile={identity:{displayName:'Rova',number:9,role:'FWD'},appearance:{kit:'crimson'},progression:{level:18,coins:4200,attributes:{pace:77}},appliedMatchIds:['offline-1']};

test('P27 migration héritage : sauvegarde locale intégrale créée avant synchronisation',()=>{
 const storage=memoryStorage();
 const result=createLegacyProfileBackup(storage,profile,{now:()=> '2026-11-24T12:00:00.000Z'});
 assert.equal(result.created,true);
 const stored=JSON.parse(storage.getItem(LEGACY_PROFILE_BACKUP_KEY));
 assert.deepEqual(stored.profile,profile);
 assert.equal(stored.capturedAt,'2026-11-24T12:00:00.000Z');
});

test('P27 migration héritage : ne remplace jamais une sauvegarde initiale',()=>{
 const storage=memoryStorage();
 const first=createLegacyProfileBackup(storage,profile,{now:()=> '2026-11-24T12:00:00.000Z'});
 const second=createLegacyProfileBackup(storage,{...profile,identity:{displayName:'Changed'}},{now:()=> '2026-11-25T12:00:00.000Z'});
 assert.equal(first.created,true);assert.equal(second.created,false);
 assert.deepEqual(second.backup.profile,profile);
});

test('P27 migration héritage : seules identité et apparence peuvent rejoindre le compte',()=>{
 const payload=buildLegacyProfileMigrationPayload(profile);
 assert.deepEqual(payload,{identity:profile.identity,appearance:profile.appearance});
 assert.equal(Object.hasOwn(payload,'progression'),false);
 assert.equal(Object.hasOwn(payload,'appliedMatchIds'),false);
});
