import { buildAccountRecoveryPlan } from './account-recovery-mapping.js';
import { readJsonWithBackup, writeJsonWithBackup } from './persistent-json.js';
const ARCHIVE_SCHEMA_VERSION = 1;
const ARCHIVE_KEYS = Object.freeze({ onlineCareer:'football-rp-online.account-archive.online-career.v1', playerCareer:'football-rp-online.account-archive.player-career.v1', transferCareer:'football-rp-online.account-archive.transfer-career.v1' });
const clone = value => structuredClone(value);
const objectValue = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
const normalizeArchive = value => !objectValue(value) || value.schemaVersion !== ARCHIVE_SCHEMA_VERSION || !objectValue(value.data) ? null : { schemaVersion:1, data:clone(value.data) };
function restoreRaw(storage,key,backup){ if(backup.primary===null)storage.removeItem(key);else storage.setItem(key,backup.primary);if(backup.backup===null)storage.removeItem(key+'.backup');else storage.setItem(key+'.backup',backup.backup); }
function storageAdapter({id,sections,storage,key,select,apply,captureMemory,rollbackMemory}){
 if(!storage?.getItem||!storage?.setItem||!storage?.removeItem)throw new Error('RECOVERY_STORAGE_UNAVAILABLE');
 return {id,sections,prepare(snapshot){return clone(select(buildAccountRecoveryPlan(snapshot).stores));},
 capture(){return{primary:storage.getItem(key),backup:storage.getItem(key+'.backup'),memory:captureMemory?clone(captureMemory()):null};},
 apply(value){apply(value);},rollback(backup){restoreRaw(storage,key,backup);rollbackMemory?.(backup.memory);}};
}
function archiveAdapter({id,section,storage,key,select}){return storageAdapter({id,sections:[section],storage,key,select,apply(data){if(!writeJsonWithBackup(storage,key,{schemaVersion:1,data},normalizeArchive))throw new Error('RECOVERY_ARCHIVE_WRITE_FAILED');}});}
function assignCareerState(manager,value){manager.wallet=value.wallet;manager.clubId=value.clubId;manager.contract=clone(value.contract);manager.offers=new Map(value.offers.map(row=>[row.id,clone(row)]));manager.history=clone(value.history);manager.matchRewards=clone(value.matchRewards||[]);manager.processedMatchIds=clone(value.processedMatchIds||[]);manager.nextOfferNumber=value.nextOfferNumber;}
export function createAccountRecoveryAdapters({profileStore,seasonStatsStore,careerManager,storage}={}){
 if(!profileStore||typeof profileStore.save!=='function'||!profileStore.storage||!profileStore.key)throw new Error('RECOVERY_PROFILE_STORE_INVALID');
 if(!seasonStatsStore||typeof seasonStatsStore.save!=='function'||!seasonStatsStore.storage||!seasonStatsStore.key)throw new Error('RECOVERY_SEASON_STATS_STORE_INVALID');
 if(!careerManager||typeof careerManager.persist!=='function'||!careerManager.storage||!careerManager.storageKey)throw new Error('RECOVERY_CAREER_STORE_INVALID');
 const archiveStorage=storage||profileStore.storage;
 if(!archiveStorage?.getItem||!archiveStorage?.setItem||!archiveStorage?.removeItem)throw new Error('RECOVERY_STORAGE_UNAVAILABLE');
 const profileAdapter=storageAdapter({id:'profile-progression',sections:['profile','progression'],storage:profileStore.storage,key:profileStore.key,select:s=>s.profileProgression,captureMemory:()=>profileStore.profile,apply(v){if(profileStore.save(v)!==true)throw new Error('RECOVERY_PROFILE_WRITE_FAILED');},rollbackMemory(memory){profileStore.profile=clone(memory);}});
 const seasonAdapter=storageAdapter({id:'season-stats',sections:['seasonStats'],storage:seasonStatsStore.storage,key:seasonStatsStore.key,select:s=>s.seasonStats,captureMemory:()=>seasonStatsStore.snapshot(),apply(v){seasonStatsStore.totals=clone(v.totals);seasonStatsStore.matches=clone(v.matches);seasonStatsStore.processedMatchIds=clone(v.processedMatchIds);if(seasonStatsStore.save()!==true)throw new Error('RECOVERY_SEASON_STATS_WRITE_FAILED');},rollbackMemory(m){seasonStatsStore.totals=clone(m.totals);seasonStatsStore.matches=clone(m.matches);seasonStatsStore.processedMatchIds=clone(m.processedMatchIds);}});
 const transferCareerAdapter={
  id:'transfer-career',sections:['contract'],
  prepare(snapshot){const s=buildAccountRecoveryPlan(snapshot).stores;return{manager:clone(s.transferCareerManager),archive:clone(s.transferCareerArchive)};},
  capture(){return{managerRaw:{primary:careerManager.storage.getItem(careerManager.storageKey),backup:careerManager.storage.getItem(careerManager.storageKey+'.backup')},archiveRaw:{primary:archiveStorage.getItem(ARCHIVE_KEYS.transferCareer),backup:archiveStorage.getItem(ARCHIVE_KEYS.transferCareer+'.backup')},managerMemory:clone(careerManager.snapshot())};},
  apply(v){assignCareerState(careerManager,v.manager);if(careerManager.persist()!==true)throw new Error('RECOVERY_CAREER_WRITE_FAILED');if(!writeJsonWithBackup(archiveStorage,ARCHIVE_KEYS.transferCareer,{schemaVersion:1,data:v.archive},normalizeArchive))throw new Error('RECOVERY_ARCHIVE_WRITE_FAILED');},
  rollback(b){restoreRaw(careerManager.storage,careerManager.storageKey,b.managerRaw);restoreRaw(archiveStorage,ARCHIVE_KEYS.transferCareer,b.archiveRaw);assignCareerState(careerManager,b.managerMemory);}
 };
 return[profileAdapter,seasonAdapter,archiveAdapter({id:'online-career-archive',section:'career',storage:archiveStorage,key:ARCHIVE_KEYS.onlineCareer,select:s=>s.onlineCareerArchive}),archiveAdapter({id:'player-career-archive',section:'playerCareer',storage:archiveStorage,key:ARCHIVE_KEYS.playerCareer,select:s=>s.playerCareerArchive}),transferCareerAdapter];
}
export function hasAccountRecoveryData(storage){if(!storage?.getItem)return true;try{return Object.values(ARCHIVE_KEYS).some(key=>Boolean(storage.getItem(key)||storage.getItem(key+'.backup')));}catch{return true;}}
export function readAccountRecoveryArchives(storage){if(!storage?.getItem)return null;const result={};for(const[name,key]of Object.entries(ARCHIVE_KEYS)){const value=readJsonWithBackup(storage,key,normalizeArchive);if(!value)return null;result[name]=clone(value.data);}return result;}
