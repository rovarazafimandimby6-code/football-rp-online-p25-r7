import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPlayerDataBackup, verifyPlayerDataBackup, restorePlayerDataBackup, createRotatingPlayerDataBackup } from '../server/player-data-backup.js';
import { JsonAccountStore } from '../server/account-store.js';
import { JsonPlayerIdentityStore } from '../server/player-identity-store.js';
import { JsonGoogleIdentityStore } from '../server/google-identity-store.js';
import { JsonCareerStore } from '../server/career-store.js';
import { JsonPlayerProfileStore } from '../server/player-profile-store.js';
import { JsonProgressionStore } from '../server/progression-store.js';
import { JsonTransferStore } from '../server/transfer-store.js';
import { JsonClubRosterStorage } from '../server/club-roster-storage.js';
import { ClubManager, DEFAULT_CLUBS } from '../src/club-manager.js';

const schemas = {
  accounts: { version:1, accounts:[{id:'account-1'}], sessions:[] },
  playerIdentities: { version:1, identities:[{localProfileKey:'123e4567-e89b-42d3-a456-426614174000',accountId:'123e4567-e89b-42d3-a456-426614174099',playerId:'FRP-675757',createdAt:'2026-11-25T12:00:00.000Z'}] },
  googleIdentities: { version:1, links:[{accountId:'123e4567-e89b-42d3-a456-426614174099',googleSubject:'google-subject-0001',linkedAt:'2026-11-25T12:00:00.000Z'}], audit:[{id:'123e4567-e89b-42d3-a456-426614174098',accountId:'123e4567-e89b-42d3-a456-426614174099',type:'google_linked',at:'2026-11-25T12:00:00.000Z'}] },
  profiles: { version:1, profiles:[{accountId:'account-1',profile:{identity:{displayName:'Test'}}}] },
  progression: { version:1, players:[{accountId:'account-1',progression:{level:4}}] },
  careers: { version:1, careers:[{accountId:'account-1',totals:{matches:2},matches:[]}], playerCareers:[] },
  transfers: { version:1, careers:[{accountId:'account-1',playerId:'human-1',wallet:2500,clubId:null,contract:null,offers:[],history:[],loanOffers:[],loanHistory:[]}], events:[], clubs:[], rosterSync:[] },
  clubRosters: { version:8, clubs:[], fixtures:[] },
  clubFinance: { version:1, accounts:[] },
  systemPayroll: { version:1, clubs:{} },
  transferFinanceJournal: { version:1, transfers:[], playerWages:[] },
  shopInventory: { version:1, players:[], clubs:[], purchases:[], resales:[] },
  competitions: { version:1, seasons:[] },
  completedResults: [],
  rpClubs: { version:1, clubs:[] },
  rpClubChallenges: { version:1, challenges:[] },
  rpClubSeasons: { version:1, seasons:[] }
};
function makeRoot() {
  const root=mkdtempSync(path.join(os.tmpdir(),'p27-player-backup-'));
  const directories={};
  for(const key of Object.keys(schemas)){
    directories[key]=path.join(root,key);
    mkdirSync(directories[key],{recursive:true});
    const filenames={accounts:'accounts.json',playerIdentities:'player-identities.json',googleIdentities:'google-identities.json',profiles:'player-profiles.json',progression:'progression.json',careers:'careers.json',transfers:'transfers.json',clubRosters:'club-rosters.json',clubFinance:'club-finance.json',systemPayroll:'system-payroll-schedule.json',transferFinanceJournal:'transfer-finance-journal.json',shopInventory:'shop-inventory.json',competitions:'competitions.json',completedResults:'completed-results.json',rpClubs:'rp-clubs.json',rpClubChallenges:'rp-club-challenges.json',rpClubSeasons:'rp-club-seasons.json'};
    const filename=filenames[key];
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
    assert.deepEqual(JSON.parse(readFileSync(path.join(target.directories.accounts,'accounts.json'),'utf8')),schemas.accounts);\n    assert.deepEqual(JSON.parse(readFileSync(path.join(target.directories.clubFinance,'club-finance.json'),'utf8')),schemas.clubFinance);
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

test('P27 compte: le backup accepte les fichiers produits par les vrais stores serveur',()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'p27-real-stores-'));
  const directories={
    accounts:path.join(root,'accounts'),
    playerIdentities:path.join(root,'player-identities'),
    googleIdentities:path.join(root,'google-identities'),
    profiles:path.join(root,'player-profiles'),
    progression:path.join(root,'progression'),
    careers:path.join(root,'careers'),
    transfers:path.join(root,'transfers'),
    clubRosters:path.join(root,'club-rosters'),
    clubFinance:path.join(root,'club-finance'),systemPayroll:path.join(root,'system-payroll'),transferFinanceJournal:path.join(root,'transfer-finance-journal'),
    shopInventory:path.join(root,'shop-inventory'),competitions:path.join(root,'competitions'),completedResults:path.join(root,'completed-results'),
    rpClubs:path.join(root,'rp-clubs'),rpClubChallenges:path.join(root,'rp-club-challenges'),rpClubSeasons:path.join(root,'rp-club-seasons')
  };
  try{
    const accountStore=new JsonAccountStore(directories.accounts);
    const identityStore=new JsonPlayerIdentityStore(directories.playerIdentities);
    const googleIdentityStore=new JsonGoogleIdentityStore(directories.googleIdentities);
    identityStore.reserve({ localProfileKey:'123e4567-e89b-42d3-a456-426614174000', localProofSecret:'c'.repeat(64) });
    googleIdentityStore.linkInitial({ accountId:'123e4567-e89b-42d3-a456-426614174099', googleSubject:'google-subject-0001', googleIdentityVerified:true });
    const created=accountStore.register({username:'backupplayer',password:'StrongPass123',displayName:'Backup Player'});
    const accountId=created.account.id;
    new JsonPlayerProfileStore(directories.profiles).save(accountId,{identity:{displayName:'Backup Player'}});
    new JsonProgressionStore(directories.progression).grantMatchReward(accountId,{matchId:'backup-match-1',result:'win',minutesPlayedMs:900000,rating:7.5});
    new JsonCareerStore(directories.careers).recordMatch(accountId,{matchId:'backup-match-1',result:'win',teamName:'Test FC',opponent:'Rival FC'});
    new JsonTransferStore(directories.transfers).getCareer(accountId);
    const clubManager=new ClubManager(DEFAULT_CLUBS,new JsonClubRosterStorage(directories.clubRosters),'p27-server-club-rosters');
    assert.equal(clubManager.saveSeason(),true);
    const outputFile=path.join(root,'backups','real-server-stores.json');
    const createdBackup=createPlayerDataBackup({directories,outputFile});
    assert.equal(verifyPlayerDataBackup(outputFile).ok,true);
    for(const key of ['clubFinance','systemPayroll','transferFinanceJournal','shopInventory','competitions','completedResults','rpClubs','rpClubChallenges','rpClubSeasons']){\n      mkdirSync(directories[key],{recursive:true});\n      const filenames={clubFinance:'club-finance.json',systemPayroll:'system-payroll-schedule.json',transferFinanceJournal:'transfer-finance-journal.json',shopInventory:'shop-inventory.json',competitions:'competitions.json',completedResults:'completed-results.json',rpClubs:'rp-clubs.json',rpClubChallenges:'rp-club-challenges.json',rpClubSeasons:'rp-club-seasons.json'};\n      writeFileSync(path.join(directories[key],filenames[key]),JSON.stringify(schemas[key]));\n    }\n    assert.equal(createdBackup.stores.length,17);
  }finally{rmSync(root,{recursive:true,force:true});}
});
