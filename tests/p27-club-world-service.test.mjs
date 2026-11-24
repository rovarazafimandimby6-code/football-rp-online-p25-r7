import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ClubManager, DEFAULT_CLUBS } from '../src/club-manager.js';
import { JsonClubRosterStorage } from '../server/club-roster-storage.js';
import { P27ClubWorldService } from '../server/club-world-service.js';
import { JsonClubFinanceService } from '../server/club-finance-service.js';

function memoryStorage() {
  const values = new Map();
  return { getItem:key=>values.get(key)||null, setItem:(key,value)=>values.set(key,value) };
}

test('P27 monde persistant : le stockage serveur restaure les effectifs et les contrats',()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-club-rosters-'));
  try {
    const first=new ClubManager(DEFAULT_CLUBS,new JsonClubRosterStorage(directory),'p27-server-club-rosters');
    const club=first.getClub('antananarivo-fc'), player=club.roster[0], signedAt=Date.UTC(2027,0,1);
    assert.equal(first.setSystemPlayerContractTerm(club.id,player.id,{signedAt,durationWeeks:30}).ok,true);
    const restored=new ClubManager(DEFAULT_CLUBS,new JsonClubRosterStorage(directory),'p27-server-club-rosters');
    const persisted=restored.getClub(club.id).roster.find(item=>item.id===player.id);
    assert.equal(persisted.contract.signedAt,new Date(signedAt).toISOString());
    assert.equal(persisted.contract.durationWeeks,30);
    assert.equal(JSON.parse(readFileSync(path.join(directory,'club-rosters.json'),'utf8')).version,8);
  } finally { rmSync(directory,{recursive:true,force:true}); }
});

test('P27 monde persistant : expiration, remplacement et paie utilisent le même instant',()=>{
  const clubManager=new ClubManager(undefined,memoryStorage(),'p27-world-lifecycle');
  const club=clubManager.getClub('antananarivo-fc'), departing=club.roster[0];
  const signedAt=Date.UTC(2027,0,1), expiresAt=signedAt+4*7*86400000;
  assert.equal(clubManager.setSystemPlayerContractTerm(club.id,departing.id,{signedAt,durationWeeks:4}).ok,true);
  let financeCalls=0, financeAt=null;
  const financeService={settleScheduledItems(now){financeCalls++;financeAt=now;return {ok:true,at:now};}};
  const world=new P27ClubWorldService({clubManager,financeService,now:()=>expiresAt});
  const first=world.tick();
  assert.equal(first.ok,true);
  assert.equal(first.at,expiresAt);
  assert.equal(first.lifecycle.expirations.expired.length,1);
  assert.equal(first.lifecycle.recruitment.recruited.length,1);
  const updated=clubManager.getClub(club.id);
  const released=updated.releasedPlayers.find(item=>item.player.id===departing.id);
  const recruit=updated.roster.find(item=>item.id===first.lifecycle.recruitment.recruited[0].playerId);
  assert.equal(released.player.contract.status,'expired');
  assert.equal(recruit.contract.signedAt,new Date(expiresAt).toISOString());
  assert.equal(financeCalls,1);
  assert.equal(financeAt,expiresAt);
  const second=world.tick();
  assert.equal(second.lifecycle.expirations.expired.length,0);
  assert.equal(second.lifecycle.recruitment.recruited.length,0);
  assert.equal(financeCalls,2);
});

test('P27 monde persistant : renouvelle avant expiration uniquement avec un budget explicite',()=>{
  const clubManager=new ClubManager();
  const club=clubManager.getClub('antananarivo-fc'), player=club.roster[0];
  const now=Date.UTC(2027,0,1);
  assert.equal(clubManager.setSystemPlayerContractTerm(club.id,player.id,{signedAt:now-27*7*86400000,durationWeeks:28}).ok,true);
  const wage=clubManager.getClub(club.id).roster.find(item=>item.id===player.id).contract.weeklyWage;
  const world=new P27ClubWorldService({
    clubManager,financeService:{settleScheduledItems:at=>({ok:true,at})},
    now:()=>now,weeklyWageBudgets:{[club.id]:wage}
  });
  const result=world.tick();
  assert.equal(result.lifecycle.renewals.renewed.length,1);
  assert.equal(result.lifecycle.expirations.expired.length,0);
  assert.equal(clubManager.getClub(club.id).roster.find(item=>item.id===player.id).contract.renewalCount,1);
});

test('P27 monde persistant : rejette dates invalides et budgets configurés invalides',()=>{
  const world=new P27ClubWorldService({
    clubManager:new ClubManager(),financeService:{settleScheduledItems:()=>({ok:true})},
    now:()=>-1,weeklyWageBudgets:{'valid-club':-1,'bad id':500}
  });
  assert.equal(world.tick().reason,'invalid-time');
  assert.deepEqual(world.weeklyWageBudgets,{});
});


test('P27 monde persistant : la paie réelle règle le contrat expiré sans facturer les recrues à leur arrivée',()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-world-finance-integration-'));
  try {
    const start=Date.UTC(2027,0,1);
    let now=start;
    const clubManager=new ClubManager();
    const club=clubManager.clubs.get('antananarivo-fc');
    const departing=club.roster[0];
    club.roster=[departing];
    club.releasedPlayers=[];
    assert.equal(clubManager.setSystemPlayerContractTerm(club.id,departing.id,{signedAt:start-14*86400000,durationWeeks:4}).ok,true);
    const weeklyWage=departing.contract.weeklyWage;
    const financeService=new JsonClubFinanceService(directory,{clubs:[club],now:()=>now});
    const world=new P27ClubWorldService({clubManager,financeService,now:()=>now});
    now=start+14*86400000;
    const result=world.tick();
    assert.equal(result.ok,true);
    assert.equal(result.finance.systemWages.posted,2);
    assert.equal(result.finance.systemWages.unpaid,0);
    assert.equal(financeService.store.getAccount(club.id).totalExpenses,weeklyWage*2);
    assert.equal(club.roster.length,club.initialRosterSize);
    assert.ok(club.roster.every(player=>player.contract.signedAt===new Date(now).toISOString()));
    assert.equal(world.tick().finance.systemWages.posted,0);
    assert.equal(financeService.store.getAccount(club.id).totalExpenses,weeklyWage*2);
  } finally { rmSync(directory,{recursive:true,force:true}); }
});
