import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSystemWeeklyWage, createSystemPlayerContract } from '../src/p27-player-contracts.js';
import { ClubManager } from '../src/club-manager.js';

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
