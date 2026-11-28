import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonProgressionStore } from '../server/progression-store.js';
import { RoomManager } from '../server/room-manager.js';

test('P27 progression match : attribue les récompenses au compte lié et les rend idempotentes',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-room-progression-'));
 try{
  const progressionStore=new JsonProgressionStore(directory);
  const manager=new RoomManager({progressionStore});
  const created=manager.create(),joined=manager.join(created.id,{displayName:'Joueur cloud',accountId:'account-linked'});
  const room=manager.rooms.get(created.id),player=room.players.get(joined.playerId);
  player.matchTimePlayedMs=120000;player.stats.goals=1;
  room.phase='fulltime';room.elapsedMs=room.durationMinutes*60000;room.score={blue:1,red:0};
  manager.finalizeResult(room);
  const after=progressionStore.get('account-linked');
  assert.ok(after.processedMatchIds.includes(created.id));
  assert.ok(after.experience>0 || after.level>1);
  manager.finalizeResult(room);
  assert.deepEqual(progressionStore.get('account-linked'),after);
  assert.equal(progressionStore.get('unlinked').level,1);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('P27 finalisation : une récompense non persistée bloque l’archive et le résultat jusqu’à la nouvelle tentative',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-room-retry-'));
 try{
  const progressionStore=new JsonProgressionStore(directory);
  const archive=new Map();
  const resultStore={save(result){archive.set(result.roomId,result);},get(id){return archive.get(id)||null;}};
  const manager=new RoomManager({progressionStore,resultStore});
  const created=manager.create(),joined=manager.join(created.id,{displayName:'Joueur en attente',accountId:'account-pending'});
  const room=manager.rooms.get(created.id),player=room.players.get(joined.playerId);
  player.matchTimePlayedMs=120000;
  room.phase='fulltime';room.elapsedMs=room.durationMinutes*60000;room.score={blue:1,red:0};
  const persist=progressionStore.persist.bind(progressionStore);
  progressionStore.persist=()=>{throw new Error('DISK_FULL');};
  assert.equal(manager.tryFinalizeResult(room),false);
  assert.equal(archive.size,0);
  assert.deepEqual(progressionStore.get('account-pending').processedMatchIds,[]);
  assert.throws(()=>manager.getResult(created.id),/RESULT_NOT_READY/);
  progressionStore.persist=persist;
  assert.equal(manager.tryFinalizeResult(room),true);
  assert.equal(archive.size,1);
  const finalResult=manager.getResult(created.id);
  assert.equal(finalResult.roomId,created.id);
  const after=progressionStore.get('account-pending');
  assert.ok(after.processedMatchIds.includes(created.id));
  assert.equal(manager.tryFinalizeResult(room),true);
  assert.deepEqual(progressionStore.get('account-pending'),after);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
