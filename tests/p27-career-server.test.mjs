import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonCareerStore } from '../server/career-store.js';
import { RoomManager } from '../server/room-manager.js';

function fixture(){const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-career-'));return {directory,store:new JsonCareerStore(directory),cleanup:()=>rmSync(directory,{recursive:true,force:true})};}

test('P27 carrière serveur : conserve le dossier lié au compte après redémarrage',()=>{
 const f=fixture();
 try{
  f.store.recordMatch('account-1',{matchId:'room-1',result:'win',finalizedAt:100,teamName:'Tana FC',opponent:'Toamasina United',role:'FWD',rating:8.4,minutesPlayedMs:180000,playerOfMatch:true,cleanSheet:true,stats:{goals:2,assists:1,passes:12,completedPasses:10}});
  const restored=new JsonCareerStore(f.directory), career=restored.get('account-1');
  assert.equal(career.totals.matches,1); assert.equal(career.totals.goals,2); assert.equal(career.totals.cleanSheets,1);
  assert.equal(career.averageRating,8.4); assert.equal(career.matches[0].opponent,'Toamasina United');
 }finally{f.cleanup();}
});

test('P27 carrière serveur : un rapport de match ne peut être crédité deux fois',()=>{
 const f=fixture();
 try{
  const payload={matchId:'room-idempotent',result:'win',rating:8,stats:{goals:1}};
  f.store.recordMatch('account-2',payload);
  const duplicate=f.store.recordMatch('account-2',{...payload,result:'loss',stats:{goals:99}});
  assert.equal(duplicate.duplicate,true); assert.equal(f.store.get('account-2').totals.matches,1);
  assert.equal(f.store.get('account-2').totals.goals,1); assert.equal(f.store.get('account-2').totals.losses,0);
 }finally{f.cleanup();}
});

test('P27 carrière serveur : seul le compte authentifié lié au joueur reçoit le match',()=>{
 const f=fixture();
 try{
  const manager=new RoomManager({careerStore:f.store});
  const created=manager.create(), joined=manager.join(created.id,{displayName:'Compte test',accountId:'account-3'});
  const room=manager.rooms.get(created.id), player=room.players.get(joined.playerId);
  player.matchTimePlayedMs=60000; player.stats.goals=1;
  room.phase='fulltime'; room.elapsedMs=room.durationMinutes*60000; room.score={blue:1,red:0};
  manager.finalizeResult(room);
  assert.equal(f.store.get('account-3').totals.matches,1);
  assert.equal(f.store.get('account-3').totals.goals,1);
  assert.equal(manager.get(created.id).players.find(row=>row.id===joined.playerId).accountId,undefined);
  manager.finalizeResult(room);
  assert.equal(f.store.get('account-3').totals.matches,1);
 }finally{f.cleanup();}
});

test('P27 profil joueur public : carrière persistante indexée par identité sportive, sans compte privé',()=>{
 const f=fixture();
 try {
  f.store.recordPlayerMatch('club-tana-fc-slot-2',{matchId:'m-1',result:'win',finalizedAt:100,name:'Mika Randria',role:'FWD',clubName:'Tana FC',teamName:'Tana FC',opponent:'Toamasina United',minutesPlayedMs:120000,rating:8.2,stats:{goals:2,assists:1}});
  f.store.recordPlayerMatch('club-tana-fc-slot-2',{matchId:'m-2',result:'draw',finalizedAt:200,name:'Mika Randria',role:'FWD',clubName:'Toamasina United',teamName:'Toamasina United',opponent:'Fianarantsoa Highland',minutesPlayedMs:90000,rating:7.4,stats:{goals:0}});
  const restored=new JsonCareerStore(f.directory), profile=restored.getPlayerCareer('club-tana-fc-slot-2');
  assert.equal(profile.player.name,'Mika Randria'); assert.equal(profile.player.clubName,'Toamasina United');
  assert.equal(profile.totals.matches,2); assert.equal(profile.totals.goals,2); assert.equal(profile.matches[0].opponent,'Toamasina United');
  assert.deepEqual(profile.clubHistory.map(row=>row.clubName),['Tana FC','Toamasina United']);
  assert.equal(profile.clubHistory[0].appearances,1);
  assert.equal(JSON.stringify(profile).includes('accountId'),false);
  assert.equal(restored.getPlayerCareer('unknown-player').player,null);
 } finally { f.cleanup(); }
});
