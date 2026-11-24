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
