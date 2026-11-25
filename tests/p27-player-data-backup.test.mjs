import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPlayerDataBackup, verifyPlayerDataBackup, restorePlayerDataBackup, createRotatingPlayerDataBackup } from '../server/player-data-backup.js';

const schemas = {
  accounts: { version:1, accounts:[{id:'account-1'}], sessions:[] },
  profiles: { version:1, profiles:[{accountId:'account-1',profile:{identity:{displayName:'Test'}}}] },
  progression: { version:1, players:[{accountId:'account-1',progression:{level:4}}] },
  careers: { version:1, careers:[{accountId:'account-1',totals:{matches:2},matches:[]}], playerCareers:[] },
  transfers: { version:1, careers:[{accountId:'account-1',playerId:'human-1',wallet:2500,clubId:null,contract:null,offers:[],history:[],loanOffers:[],loanHistory:[]}], events:[], clubs:[], rosterSync:[] }
};
function makeRoot() {
  const root=mkdtempSync(path.join(os.tmpdir(),'p27-player-backup-'));
  const directories={};
  for(const key of Object.keys(schemas)){
    directories[key]=path.join(root,key);
    mkdirSync(directories[key],{recursive:true});
    const filename=key==='profiles'?'player-profiles.json':key==='progression'?'progression.json':key==='careers'?'careers.json':key==='transfers'?'transfers.json':'accounts.json';
    writeFileSync(path.join(directories[key],filename),JSON.stringify(schemas[key]));
  }
  return {root,directories};
}

test('P27 compte: sauvegarde portable vérifiée et restauration des données joueur après perte locale',()=>{
  const source=makeRoot(),target=makeRoot(),backup=path.join(source.root,'offsite','player-data.json');
  try{
    createPlayerDataBackup({directories:source.directories,outputFile:backup,now:()=>new Date('2026-11-25T12:00:00.000Z')});
    assert.equal(verifyPlayerDataBackup(backup).ok,true);
    const changed={...schemas.progression,players:[{accountId:'account-1',progression:{level:1}}]};
    writeFileSync(path.join(target.directories.progression,'progression.json'),JSON.stringify(changed));
    const result=restorePlayerDataBackup({backupFile:backup,directories:target.directories});
    assert.equal(result.ok,true);
    assert.deepEqual(JSON.parse(readFileSync(path.join(target.directories.progression,'progression.json'),'utf8')),schemas.progression);
    assert.deepEqual(JSON.parse(readFileSync(path.join(target.directories.accounts,'accounts.json'),'utf8')),schemas.accounts);
  }finally{rmSync(source.root,{recursive:true,force:true});rmSync(target.root,{recursive:true,force:true});}
});

test('P27 compte: refuse un backup modifié avant toute restauration',()=>{
  const source=makeRoot(),target=makeRoot(),backup=path.join(source.root,'player-data.json');
  try{
    createPlayerDataBackup({directories:source.directories,outputFile:backup});
    const bundle=JSON.parse(readFileSync(backup,'utf8'));
    bundle.files.progression.content=bundle.files.progression.content.replace('"level":4','"level":99');
    writeFileSync(backup,JSON.stringify(bundle));
    assert.throws(()=>restorePlayerDataBackup({backupFile:backup,directories:target.directories}),/BACKUP_CHECKSUM_INVALID:progression/);
    assert.deepEqual(JSON.parse(readFileSync(path.join(target.directories.progression,'progression.json'),'utf8')),schemas.progression);
  }finally{rmSync(source.root,{recursive:true,force:true});rmSync(target.root,{recursive:true,force:true});}
});

test('P27 compte: la rotation conserve les générations récentes et vérifie la nouvelle avant purge',()=>{
  const source=makeRoot(),backupDirectory=path.join(source.root,'backups');
  try{
    const created=[];
    for(let day=1;day<=4;day++){
      const now=()=>new Date(`2026-11-0${day}T12:00:00.000Z`);
      created.push(createRotatingPlayerDataBackup({directories:source.directories,backupDirectory,keep:2,now}));
    }
    const names=readdirSync(backupDirectory).filter(name=>name.endsWith('.json'));
    assert.equal(names.length,2);
    assert.equal(created[3].verified,true);
    assert.equal(created[3].retained,2);
    assert.equal(created[3].removed.length,1);
    for(const name of names)assert.equal(verifyPlayerDataBackup(path.join(backupDirectory,name)).ok,true);
  }finally{rmSync(source.root,{recursive:true,force:true});}
});

test('P27 compte: une source invalide ne déclenche pas la purge des sauvegardes existantes',()=>{
  const source=makeRoot(),backupDirectory=path.join(source.root,'backups');
  try{
    createRotatingPlayerDataBackup({directories:source.directories,backupDirectory,keep:2});
    const before=readdirSync(backupDirectory);
    writeFileSync(path.join(source.directories.accounts,'accounts.json'),'not-json');
    assert.throws(()=>createRotatingPlayerDataBackup({directories:source.directories,backupDirectory,keep:2}),/BACKUP_SOURCE_INVALID_JSON:accounts/);
    assert.deepEqual(readdirSync(backupDirectory),before);
  }finally{rmSync(source.root,{recursive:true,force:true});}
});
