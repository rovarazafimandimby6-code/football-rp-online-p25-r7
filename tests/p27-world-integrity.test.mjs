import test from 'node:test';
import assert from 'node:assert/strict';
import { auditP27World } from '../server/world-integrity-audit.js';
import { syncClubAssignments } from '../server/club-assignment-sync.js';

const cleanWorld=()=>({
  clubs:[{id:'club-a',division:'D1',conference:null,capacity:2,roster:[
    {id:'player-a',number:1,playerType:'system',contract:{status:'active',clubId:'club-a',playerId:'player-a'}}
  ]},{id:'club-b',division:'D1',conference:null,capacity:2,roster:[]}],
  transferState:{careers:[{accountId:'account-a',clubId:'club-a',contract:{status:'active',clubId:'club-a',salary:100,signedAt:'2026-01-01T00:00:00.000Z',expiresAt:'2027-01-01T00:00:00.000Z'}}]},
  financeAccounts:[{clubId:'club-a',openingBalance:100,balance:90,entries:[
    {id:'wage-1',amount:10,direction:'expense'}
  ]}],
  competitionState:{seasons:[{id:'season-a',status:'active',competitions:[{
    id:'league-a',members:[{id:'club-a'},{id:'club-b'}],fixtures:[{
      id:'fixture-a',status:'completed',homeClubId:'club-a',awayClubId:'club-b',result:{home:1,away:0}
    }]
  }]}]},
  expectedClubCount:2
});

test('P27 intégrité monde : accepte un ensemble cohérent de clubs, contrats, finances et compétitions',()=>{
 const result=auditP27World(cleanWorld());
 assert.equal(result.ok,true,JSON.stringify(result.errors));
 assert.equal(result.counts.clubs,2);
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


test('P27 intégrité monde : détecte les doublons de carrière et les événements de transfert incohérents',()=>{
 const input=cleanWorld();
 input.transferState.careers.push({accountId:'account-b',playerId:'human-player-1',clubId:'club-a',contract:{status:'active',clubId:'club-a',playerId:'human-player-2'}});
 input.transferState.events=[
  {id:'transfer-x',type:'transfer',fromClubId:'club-a',toClubId:'unknown-club',fee:-10},
  {id:'transfer-x',type:'transfer',fromClubId:'club-a',toClubId:'club-b',fee:100}
 ];
 const result=auditP27World(input);
 const codes=result.errors.map(item=>item.code);
 assert.ok(codes.includes('CAREER_CONTRACT_PLAYER_MISMATCH'));
 assert.ok(codes.includes('TRANSFER_EVENT_ID_INVALID_OR_DUPLICATE'));
 assert.ok(codes.includes('TRANSFER_EVENT_CLUB_LINK_INVALID'));
 assert.ok(codes.includes('TRANSFER_EVENT_FEE_INVALID'));
});

test('P27 intégrité monde : détecte les fixtures rattachées à la mauvaise compétition et les auto-rencontres',()=>{
 const input=cleanWorld();
 const fixture=input.competitionState.seasons[0].competitions[0].fixtures[0];
 fixture.competitionId='other-competition';
 fixture.awayClubId='club-a';
 const result=auditP27World(input);
 const codes=result.errors.map(item=>item.code);
 assert.ok(codes.includes('FIXTURE_COMPETITION_LINK_MISMATCH'));
 assert.ok(codes.includes('FIXTURE_SELF_PLAY_INVALID'));
});


test('P27 clubs : refuse une synchronisation si le catalogue officiel est incomplet',()=>{
 const club={id:'club-a',division:'D2',conference:null};
 const manager={clubs:new Map([['club-a',club],['club-b',{id:'club-b',division:'D2',conference:null}]]),saveSeason:()=>true};
 const competition={clubs:new Map([['club-a',{id:'club-a',division:'D1',conference:null}]])};
 const result=syncClubAssignments({clubManager:manager,competitionStore:competition});
 assert.equal(result.ok,false);
 assert.equal(result.reason,'assignment-catalogue-mismatch');
 assert.equal(club.division,'D2');
});

test('P27 clubs : refuse les identifiants dupliqués dans les affectations officielles',()=>{
 const club={id:'club-a',division:'D2',conference:null};
 const manager={clubs:new Map([['club-a',club]]),saveSeason:()=>true};
 const competition={clubs:new Map([['club-a',{id:'club-a',division:'D1',conference:null}],['duplicate',{id:'club-a',division:'D1',conference:null}]])};
 const result=syncClubAssignments({clubManager:manager,competitionStore:competition});
 assert.equal(result.ok,false);
 assert.equal(result.reason,'assignment-catalogue-mismatch');
 assert.equal(club.division,'D2');
});


test('P27 intégrité monde : contrôle les budgets et identités du catalogue mercato',()=>{
 const input=cleanWorld();
 input.transferState.clubs=[
  {id:'club-a',budget:100000},
  {id:'club-a',budget:100000},
  {id:'unknown-club',budget:-1}
 ];
 const result=auditP27World(input);
 const codes=result.errors.map(item=>item.code);
 assert.ok(codes.includes('TRANSFER_CLUB_ID_INVALID_OR_DUPLICATE'));
 assert.ok(codes.includes('TRANSFER_CLUB_UNKNOWN'));
 assert.ok(codes.includes('TRANSFER_CLUB_BUDGET_INVALID'));
 assert.ok(codes.includes('TRANSFER_CLUB_CATALOGUE_SIZE_MISMATCH'));
});

test('P27 intégrité monde : détecte contrats actifs invalides et comptes financiers dupliqués',()=>{
 const input=cleanWorld();
 input.transferState.careers[0].contract.salary=-1;
 input.transferState.careers[0].contract.expiresAt='2025-01-01T00:00:00.000Z';
 input.financeAccounts.push({...input.financeAccounts[0]});
 const result=auditP27World(input);
 const codes=result.errors.map(item=>item.code);
 assert.ok(codes.includes('CAREER_CONTRACT_SALARY_INVALID'));
 assert.ok(codes.includes('CAREER_CONTRACT_DATES_INVALID'));
 assert.ok(codes.includes('FINANCE_ACCOUNT_DUPLICATE'));
});

test('P27 intégrité monde : refuse les identifiants de saison et de compétition dupliqués',()=>{
 const input=cleanWorld();
 const season=input.competitionState.seasons[0];
 season.competitions.push(structuredClone(season.competitions[0]));
 input.competitionState.seasons.push(structuredClone(season));
 const result=auditP27World(input);
 const codes=result.errors.map(item=>item.code);
 assert.ok(codes.includes('SEASON_ID_INVALID_OR_DUPLICATE'));
 assert.ok(codes.includes('COMPETITION_ID_INVALID_OR_DUPLICATE'));
});


test('P27 clubs : reprend automatiquement une affectation après échec temporaire de sauvegarde',()=>{
 const club={id:'club-a',division:'D2',conference:null};
 let attempts=0;
 const manager={clubs:new Map([['club-a',club]]),saveSeason:()=>++attempts>1};
 const competition={clubs:new Map([['club-a',{id:'club-a',division:'D1',conference:null}]])};
 const first=syncClubAssignments({clubManager:manager,competitionStore:competition});
 assert.equal(first.ok,false);
 assert.equal(first.reason,'club-assignment-persistence-pending');
 const retry=syncClubAssignments({clubManager:manager,competitionStore:competition});
 assert.equal(retry.ok,true);
 assert.equal(retry.updated,0);
 assert.equal(attempts,2);
});


test('P27 intégrité résultats : rapproche les archives officielles avec les fixtures terminées',()=>{
 const input=cleanWorld();
 const fixture=input.competitionState.seasons[0].competitions[0].fixtures[0];
 fixture.roomId='room-official-1';
 input.resultArchive=[{roomId:'room-official-1',phase:'fulltime',score:{blue:1,red:0},finalizedAt:1000,
  competition:{fixtureId:fixture.id,result:{home:1,away:0}}}];
 assert.equal(auditP27World(input).ok,true);
 input.resultArchive[0].score.blue=2;
 const mismatch=auditP27World(input);
 assert.ok(mismatch.errors.some(item=>item.code==='RESULT_ARCHIVE_FIXTURE_MISMATCH'));
});

test('P27 intégrité résultats : détecte les archives dupliquées et les fixtures inconnues',()=>{
 const input=cleanWorld();
 input.resultArchive=[
  {roomId:'duplicate-room',phase:'fulltime',score:{blue:1,red:0},finalizedAt:1000,competition:{fixtureId:'missing-fixture'}},
  {roomId:'duplicate-room',phase:'fulltime',score:{blue:1,red:0},finalizedAt:1001,competition:{fixtureId:'missing-fixture'}}
 ];
 const result=auditP27World(input);
 const codes=result.errors.map(item=>item.code);
 assert.ok(codes.includes('RESULT_ROOM_ID_INVALID_OR_DUPLICATE'));
 assert.ok(codes.includes('RESULT_FIXTURE_ARCHIVE_DUPLICATE'));
 assert.ok(codes.includes('RESULT_ARCHIVE_UNKNOWN_FIXTURE'));
});


test('P27 intégrité monde : compare les affectations officielles et le catalogue des effectifs',()=>{
 const input=cleanWorld();
 input.competitionClubs=[
  {id:'club-a',division:'D2',conference:null},
  {id:'club-b',division:'D1',conference:null}
 ];
 const result=auditP27World(input);
 assert.ok(result.errors.some(item=>item.code==='CLUB_ASSIGNMENT_CATALOGUE_MISMATCH'&&item.clubId==='club-a'));
});

test('P27 intégrité monde : détecte un club absent du catalogue persistant du mercato',()=>{
 const input=cleanWorld();
 input.transferState.clubs=[{id:'club-a',budget:1000}];
 const result=auditP27World(input);
 assert.ok(result.errors.some(item=>item.code==='TRANSFER_CLUB_MISSING'&&item.clubId==='club-b'));
 assert.ok(result.errors.some(item=>item.code==='TRANSFER_CLUB_CATALOGUE_SIZE_MISMATCH'));
});
