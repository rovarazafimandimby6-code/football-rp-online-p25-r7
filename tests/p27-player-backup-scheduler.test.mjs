import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerBackupScheduler, resolvePlayerBackupConfig } from '../server/player-backup-scheduler.js';

test('P27 sauvegarde: configuration borne l’intervalle et la rétention',()=>{
  const config=resolvePlayerBackupConfig({root:'/srv/p27',env:{P27_PLAYER_BACKUP_INTERVAL_MS:'1000',P27_BACKUPS_KEEP:'1000'}});
  assert.equal(config.intervalMs,5*60_000);
  assert.equal(config.keep,100);
  assert.equal(config.backupDirectory,'/srv/p27/data/backups');
  assert.equal(config.directories.playerIdentities,'/srv/p27/data/player-identities');
  assert.equal(config.directories.googleIdentities,'/srv/p27/data/google-identities');
  assert.equal(config.directories.careerSyncQueue,'/srv/p27/data/career-sync');
  assert.equal(config.directories.systemTransferOutbox,'/srv/p27/data/system-transfers');
  assert.equal(config.directories.roomCheckpoints,'/srv/p27/data/rooms');
  const custom=resolvePlayerBackupConfig({root:'/srv/p27',env:{PLAYER_IDENTITIES_DIR:'/mnt/p27-identities'}});
  assert.equal(custom.directories.playerIdentities,'/mnt/p27-identities');
  const customGoogle=resolvePlayerBackupConfig({root:'/srv/p27',env:{GOOGLE_IDENTITIES_DIR:'/mnt/p27-google-identities'}});
  assert.equal(customGoogle.directories.googleIdentities,'/mnt/p27-google-identities');
  assert.equal(resolvePlayerBackupConfig({root:'/srv/p27',env:{P27_PLAYER_BACKUP_INTERVAL_MS:'invalid'}}).intervalMs,6*60*60_000);
});

test('P27 sauvegarde: planifie, exécute, expose le statut et arrête le timer',()=>{
  let callback,cleared=null,calls=0;
  const reports=[];
  const scheduler=createPlayerBackupScheduler({
    config:{intervalMs:300_000,backupDirectory:'/backups',keep:3,directories:{}},
    setIntervalFn:(fn,ms)=>{assert.equal(ms,300_000);callback=fn;return {unref(){}};},
    clearIntervalFn:timer=>{cleared=timer;},
    backup:()=>{calls++;return {retained:3,removed:['old.json'],bytes:123};},
    onResult:report=>reports.push(report),
    now:()=>new Date('2026-11-25T12:00:00.000Z')
  });
  assert.equal(scheduler.start(),true);
  assert.equal(calls,1); // immediate startup snapshot
  assert.equal(scheduler.start(),false);
  assert.equal(scheduler.status().scheduled,true);
  const report=callback();
  assert.equal(report.ok,true);
  assert.equal(calls,2);
  assert.equal(scheduler.status().lastSuccessAt,'2026-11-25T12:00:00.000Z');
  assert.equal(reports.length,2);
  assert.equal(scheduler.stop(),true);
  assert.ok(cleared);
  assert.equal(scheduler.status().scheduled,false);
});

test('P27 sauvegarde: une erreur est mémorisée et la prochaine exécution peut réussir',()=>{
  let calls=0;
  const scheduler=createPlayerBackupScheduler({
    config:{intervalMs:300_000,backupDirectory:'/backups',keep:3,directories:{}},
    backup:()=>{calls++;if(calls===1)throw new Error('SOURCE_UNAVAILABLE');return {retained:1,removed:[],bytes:10};}
  });
  const failed=scheduler.runNow();
  assert.equal(failed.ok,false);
  assert.equal(scheduler.status().lastError,'SOURCE_UNAVAILABLE');
  const recovered=scheduler.runNow();
  assert.equal(recovered.ok,true);
  assert.equal(scheduler.status().lastError,null);
  assert.equal(scheduler.status().lastResult.bytes,10);
});

test('P27 sauvegarde: empêche deux exécutions simultanées',()=>{
  let scheduler;
  const backup=()=>{const nested=scheduler.runNow();assert.equal(nested.reason,'BACKUP_ALREADY_RUNNING');return {retained:1,removed:[],bytes:1};};
  scheduler=createPlayerBackupScheduler({config:{intervalMs:300_000,backupDirectory:'/backups',keep:3,directories:{}},backup});
  const result=scheduler.runNow();
  assert.equal(result.ok,true);
  assert.equal(scheduler.status().skippedOverlaps,1);
});
