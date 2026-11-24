import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSystemWeeklyWage, createSystemPlayerContract } from '../src/p27-player-contracts.js';
import { ClubManager } from '../src/club-manager.js';
import { auditP27World } from '../server/world-integrity-audit.js';

test('P27 contrats joueurs : barème salarial déterministe et progressif par division',()=>{
  assert.equal(calculateSystemWeeklyWage({division:'D1',rating:75}),1200);
  assert.equal(calculateSystemWeeklyWage({division:'D2',rating:68}),800);
  assert.ok(calculateSystemWeeklyWage({division:'D1',rating:85})>calculateSystemWeeklyWage({division:'D1',rating:65}));
  assert.ok(calculateSystemWeeklyWage({division:'D1',rating:75})>calculateSystemWeeklyWage({division:'D5',rating:49}));
  assert.equal(calculateSystemWeeklyWage({division:'D6',rating:50}),null);
});
test('P27 contrats joueurs : contrat système stable, rattaché au club et au joueur',()=>{
  const input={clubId:'club-a',playerId:'player-a',division:'D3',rating:62};
  const contract=createSystemPlayerContract(input);
  assert.deepEqual(contract,createSystemPlayerContract(input));
  assert.equal(contract.clubId,'club-a');
  assert.equal(contract.playerId,'player-a');
  assert.equal(contract.status,'active');
  assert.equal(contract.salary,contract.weeklyWage);
});

test('P27 joueurs libres : réinscrit un joueur IA archivé avec un nouveau contrat au club recruteur',()=>{
 const manager=new ClubManager();
 const source=manager.getClub('antananarivo-fc');
 const target=manager.getClub('toamasina-united');
 const player=source.roster[0];
 assert.equal(manager.removePlayer(source.id,player.id),true);
 assert.equal(manager.removePlayer(target.id,target.roster[0].id),true);
 const now=Date.UTC(2027,0,15);
 const signed=manager.signFreeAgent(target.id,player.id,{now});
 assert.equal(signed.ok,true);
 assert.equal(signed.previousClubId,source.id);
 const recruited=manager.getClub(target.id).roster.find(item=>item.id===player.id);
 assert.equal(recruited.contract.status,'active');
 assert.equal(recruited.contract.clubId,target.id);
 assert.equal(recruited.contract.playerId,player.id);
 assert.equal(recruited.contract.previousClubId,source.id);
 assert.equal(recruited.contract.signedAt,new Date(now).toISOString());
 assert.equal(manager.signFreeAgent(target.id,player.id,{now}).reason,'player-already-registered');
});

test('P27 joueurs libres : refuse les identifiants inconnus et les carrières humaines',()=>{
 const manager=new ClubManager();
 const source=manager.getClub('antananarivo-fc');
 const target=manager.getClub('toamasina-united');
 assert.equal(manager.signFreeAgent(target.id,'missing-player').reason,'free-agent-not-found');
 const human={id:'human-free-agent',name:'Human Free',playerType:'human',rating:60,role:'MID'};
 assert.equal(manager.removePlayer(source.id,source.roster[0].id),true);
 assert.equal(manager.addPlayer(source.id,human).ok,true);
 assert.equal(manager.removePlayer(source.id,human.id),true);
 assert.equal(manager.signFreeAgent(target.id,human.id).reason,'human-career-managed');
});

test('P27 contrats IA : mémorise un refus sportif, libère le joueur à échéance et recrute un remplaçant',()=>{
 const values=new Map();
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const key='p27-ai-renewal-decline';
 const manager=new ClubManager(undefined,storage,key);
 const club=manager.getClub('antananarivo-fc');
 const original=club.roster[0];
 const declined=manager.updatePlayer(club.id,{...original,age:35,rating:Math.max(1,club.rating-20),loyalty:{clubLoyalty:10,transferWillingness:90,departurePolicy:'ambitious'}});
 assert.equal(declined.ok,true);
 const signedAt=Date.UTC(2027,0,1);
 assert.equal(manager.setSystemPlayerContractTerm(club.id,original.id,{signedAt,durationWeeks:4}).ok,true);
 const decision=manager.processSystemContractRenewals({now:signedAt+1,weeklyWageBudgets:{[club.id]:1000000}});
 assert.ok(decision.declined.some(item=>item.playerId===original.id&&item.reason==='sporting-policy-declined'));
 const restored=new ClubManager(undefined,storage,key);
 const persisted=restored.getClub(club.id).roster.find(item=>item.id===original.id);
 assert.equal(persisted.contract.renewalDecision,'declined');
 assert.equal(persisted.contract.renewalDeclineReason,'sporting-policy-declined');
 const expired=restored.expireSystemPlayerContracts({now:signedAt+28*24*60*60*1000});
 assert.ok(expired.expired.some(item=>item.playerId===original.id));
 assert.equal(restored.getClub(club.id).releasedPlayers.at(-1).reason,'contract-not-renewed');
 const recruited=restored.replenishSystemRosterVacancies({clubIds:[club.id],now:signedAt+28*24*60*60*1000});
 assert.equal(recruited.recruited.length,1);
 assert.equal(restored.getClub(club.id).roster.length,12);
});

test('P27 contrats IA : recrutement d’un joueur libre persiste après redémarrage et reste intègre',()=>{
 const values=new Map();
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const key='p27-free-agent-restart-audit';
 const manager=new ClubManager(undefined,storage,key);
 const source=manager.getClub('antananarivo-fc');
 const target=manager.getClub('toamasina-united');
 const player=source.roster.find(item=>item.playerType==='system');
 assert.ok(player);
 assert.equal(manager.removePlayer(source.id,player.id),true);
 const now=Date.UTC(2027,5,1);
 const signed=manager.signFreeAgent(target.id,player.id,{now});
 assert.equal(signed.ok,true);
 const restored=new ClubManager(undefined,storage,key);
 const current=restored.getClub(target.id).roster.find(item=>item.id===player.id);
 assert.equal(current.contract.status,'active');
 assert.equal(current.contract.clubId,target.id);
 assert.equal(current.contract.playerId,player.id);
 assert.equal(current.contract.previousClubId,source.id);
 const audit=auditP27World({clubs:restored.listClubs(),expectedClubCount:0});
 assert.equal(audit.errors.length,0,JSON.stringify(audit.errors));
 assert.equal(audit.warnings.some(item=>item.code==='FREE_AGENT_ARCHIVE_DUPLICATE_SNAPSHOTS'),false);
});
