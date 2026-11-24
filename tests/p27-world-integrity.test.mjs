import test from 'node:test';
import assert from 'node:assert/strict';
import { auditP27World } from '../server/world-integrity-audit.js';
import { syncClubAssignments } from '../server/club-assignment-sync.js';

const cleanWorld=()=>({
  clubs:[{id:'club-a',division:'D1',conference:null,capacity:2,roster:[
    {id:'player-a',number:1,playerType:'system',contract:{status:'active',clubId:'club-a',playerId:'player-a'}}
  ]}],
  transferState:{careers:[{accountId:'account-a',clubId:'club-a',contract:{status:'active',clubId:'club-a'}}]},
  financeAccounts:[{clubId:'club-a',openingBalance:100,balance:90,entries:[
    {id:'wage-1',amount:10,direction:'expense'}
  ]}],
  competitionState:{seasons:[{id:'season-a',status:'active',competitions:[{
    id:'league-a',members:[{id:'club-a'}],fixtures:[{
      id:'fixture-a',status:'completed',homeClubId:'club-a',awayClubId:'club-a',result:{home:1,away:0}
    }]
  }]}]},
  expectedClubCount:1
});

test('P27 intégrité monde : accepte un ensemble cohérent de clubs, contrats, finances et compétitions',()=>{
 const result=auditP27World(cleanWorld());
 assert.equal(result.ok,true,JSON.stringify(result.errors));
 assert.equal(result.counts.clubs,1);
 assert.equal(result.counts.financeEntries,1);
 assert.equal(result.counts.completedFixtures,1);
});

test('P27 intégrité monde : détecte les doublons d’effectif et les écarts de grand livre',()=>{
 const input=cleanWorld();
 input.clubs[0].roster.push({id:'player-a',number:1,playerType:'human'});
 input.financeAccounts[0].balance=999;
 const result=auditP27World(input);
 const codes=result.errors.map(item=>item.code);
 assert.equal(result.ok,false);
 assert.ok(codes.includes('PLAYER_REGISTERED_MULTIPLE_TIMES'));
 assert.ok(codes.includes('SHIRT_NUMBER_DUPLICATE'));
 assert.ok(codes.includes('FINANCE_BALANCE_MISMATCH'));
});

test('P27 intégrité monde : détecte les contrats liés au mauvais club et les matchs invalides',()=>{
 const input=cleanWorld();
 input.transferState.careers[0].contract.clubId='unknown-club';
 input.competitionState.seasons[0].competitions[0].fixtures[0].result.home=120;
 const result=auditP27World(input);
 const codes=result.errors.map(item=>item.code);
 assert.ok(codes.includes('CAREER_CONTRACT_LINK_MISMATCH'));
 assert.ok(codes.includes('COMPLETED_FIXTURE_INVALID'));
});

test('P27 clubs : synchronise les divisions et conférences officielles après transition',()=>{
 const club={id:'club-a',division:'D2',conference:null};
 const manager={clubs:new Map([['club-a',club]]),saveSeason:()=>true};
 const competition={clubs:new Map([['club-a',{id:'club-a',division:'D1',conference:null}]])};
 const result=syncClubAssignments({clubManager:manager,competitionStore:competition});
 assert.deepEqual(result,{ok:true,updated:1});
 assert.equal(club.division,'D1');
});

test('P27 clubs : signale une persistance en attente sans désaligner le monde en mémoire',()=>{
 const club={id:'club-a',division:'D2',conference:null};
 const manager={clubs:new Map([['club-a',club]]),saveSeason:()=>false};
 const competition={clubs:new Map([['club-a',{id:'club-a',division:'D1',conference:null}]])};
 const result=syncClubAssignments({clubManager:manager,competitionStore:competition});
 assert.equal(result.ok,false);
 assert.equal(result.reason,'club-assignment-persistence-pending');
 assert.equal(club.division,'D1');
});
