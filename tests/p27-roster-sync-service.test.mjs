import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ClubManager } from '../src/club-manager.js';
import { JsonTransferStore } from '../server/transfer-store.js';
import { processPendingRosterSync } from '../server/roster-sync-service.js';

function setup() {
  const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-roster-sync-'));
  let now=Date.parse('2027-01-15T12:00:00.000Z');
  const clubs=[
    {id:'club-a',name:'Club A',city:'A',country:'Madagascar',countryCode:'MG',division:'D1',rating:60,control:'open',humanAdmission:'open',colors:['#1769aa','#092e55','#f3d36a'],stadium:'A',reputation:50,budget:200000,capacity:12},
    {id:'club-b',name:'Club B',city:'B',country:'Madagascar',countryCode:'MG',division:'D1',rating:60,control:'open',humanAdmission:'open',colors:['#1769aa','#092e55','#f3d36a'],stadium:'B',reputation:50,budget:200000,capacity:12}
  ];
  const storage={
    value:null,fail:false,
    getItem(){return this.value;},
    setItem(_key,value){if(this.fail)throw new Error('ROSTER_DISK_FULL');this.value=value;}
  };
  const clubManager=new ClubManager(clubs,storage,'test-rosters');
  const transferStore=new JsonTransferStore(directory,{clubs,now:()=>now});
  return {
    directory,clubs,storage,clubManager,transferStore,
    setNow(value){now=value;},
    cleanup(){rmSync(directory,{recursive:true,force:true});}
  };
}

test('P27 saga effectif : une signature inscrit le joueur humain une seule fois',()=>{
 const f=setup();try{
  const signed=f.transferStore.signContract('account-roster-sign',{clubId:'club-a',salary:500,durationDays:365});
  assert.equal(signed.ok,true);
  assert.equal(f.transferStore.pendingRosterSync().length,1);
  const result=processPendingRosterSync({transferStore:f.transferStore,clubManager:f.clubManager});
  assert.equal(result.ok,true);
  const roster=f.clubManager.getClub('club-a').roster;
  assert.equal(roster.length,1);
  assert.equal(roster[0].id,signed.career.playerId);
  assert.equal(roster[0].playerType,'human');
  assert.equal(roster[0].contract.clubId,'club-a');
  assert.equal(f.transferStore.pendingRosterSync().length,0);
 }finally{f.cleanup();}
});

test('P27 saga effectif : un transfert déplace le même joueur et une résiliation le libère',()=>{
 const f=setup();try{
  const signed=f.transferStore.signContract('account-roster-transfer',{clubId:'club-a',salary:500,durationDays:365});
  processPendingRosterSync({transferStore:f.transferStore,clubManager:f.clubManager});
  const offer=f.transferStore.requestOffer('account-roster-transfer',{toClubId:'club-b'});
  assert.equal(offer.ok,true);
  const accepted=f.transferStore.acceptOffer('account-roster-transfer',offer.offer.id);
  assert.equal(accepted.ok,true);
  const moved=processPendingRosterSync({transferStore:f.transferStore,clubManager:f.clubManager});
  assert.equal(moved.ok,true);
  assert.equal(f.clubManager.getClub('club-a').roster.some(p=>p.id===signed.career.playerId),false);
  assert.equal(f.clubManager.getClub('club-b').roster.filter(p=>p.id===signed.career.playerId).length,1);
  const terminated=f.transferStore.terminateContract('account-roster-transfer');
  assert.equal(terminated.ok,true);
  const released=processPendingRosterSync({transferStore:f.transferStore,clubManager:f.clubManager});
  assert.equal(released.ok,true);
  assert.equal(f.clubManager.getClub('club-b').roster.some(p=>p.id===signed.career.playerId),false);
  assert.ok(f.clubManager.getClub('club-b').releasedPlayers.some(item=>item.player.id===signed.career.playerId));
 }finally{f.cleanup();}
});

test('P27 saga effectif : une expiration déclenche une libération après lecture de carrière',()=>{
 const f=setup();try{
  const signed=f.transferStore.signContract('account-roster-expiry',{clubId:'club-a',salary:500,durationDays:1});
  processPendingRosterSync({transferStore:f.transferStore,clubManager:f.clubManager});
  f.setNow(Date.parse(signed.career.contract.expiresAt)+1);
  const career=f.transferStore.getCareer('account-roster-expiry');
  assert.equal(career.contract.status,'expired');
  const result=processPendingRosterSync({transferStore:f.transferStore,clubManager:f.clubManager});
  assert.equal(result.ok,true);
  assert.equal(f.clubManager.getClub('club-a').roster.some(p=>p.id===signed.career.playerId),false);
 }finally{f.cleanup();}
});

test('P27 saga effectif : une panne du stockage effectif conserve la commande et permet la reprise',()=>{
 const f=setup();try{
  const signed=f.transferStore.signContract('account-roster-retry',{clubId:'club-a',salary:500,durationDays:365});
  f.storage.fail=true;
  const failed=processPendingRosterSync({transferStore:f.transferStore,clubManager:f.clubManager});
  assert.equal(failed.ok,false);
  assert.equal(f.clubManager.getClub('club-a').roster.some(p=>p.id===signed.career.playerId),false);
  assert.equal(f.transferStore.pendingRosterSync().length,1);
  assert.equal(f.transferStore.pendingRosterSync()[0].attempts,1);
  f.storage.fail=false;
  const recovered=processPendingRosterSync({transferStore:f.transferStore,clubManager:f.clubManager});
  assert.equal(recovered.ok,true);
  assert.equal(f.clubManager.getClub('club-a').roster.filter(p=>p.id===signed.career.playerId).length,1);
  assert.equal(f.transferStore.pendingRosterSync().length,0);
 }finally{f.cleanup();}
});

test('P27 saga effectif : rejoue sans doublon si le checkpoint de sortie échoue après sauvegarde du roster',()=>{
 const f=setup();try{
  const signed=f.transferStore.signContract('account-roster-checkpoint',{clubId:'club-a',salary:500,durationDays:365});
  const complete=f.transferStore.completeRosterSync.bind(f.transferStore);
  f.transferStore.completeRosterSync=()=>{throw new Error('OUTBOX_CHECKPOINT_FAILED');};
  const first=processPendingRosterSync({transferStore:f.transferStore,clubManager:f.clubManager});
  assert.equal(first.ok,false);
  assert.equal(f.clubManager.getClub('club-a').roster.filter(p=>p.id===signed.career.playerId).length,1);
  f.transferStore.completeRosterSync=complete;
  const retry=processPendingRosterSync({transferStore:f.transferStore,clubManager:f.clubManager});
  assert.equal(retry.ok,true);
  assert.equal(f.clubManager.getClub('club-a').roster.filter(p=>p.id===signed.career.playerId).length,1);
  assert.equal(f.transferStore.pendingRosterSync().length,0);
 }finally{f.cleanup();}
});

test('P27 saga effectif : les commandes outbox survivent au redémarrage du mercato',()=>{
 const f=setup();try{
  const signed=f.transferStore.signContract('account-roster-restart',{clubId:'club-a',salary:500,durationDays:365});
  assert.equal(f.transferStore.pendingRosterSync().length,1);
  const restartedStore=new JsonTransferStore(f.directory,{clubs:f.clubs,now:()=>f.now});
  assert.equal(restartedStore.pendingRosterSync().length,1);
  const result=processPendingRosterSync({transferStore:restartedStore,clubManager:f.clubManager});
  assert.equal(result.ok,true);
  assert.equal(f.clubManager.getClub('club-a').roster.filter(player=>player.id===signed.career.playerId).length,1);
  assert.equal(restartedStore.pendingRosterSync().length,0);
 }finally{f.cleanup();}
});
