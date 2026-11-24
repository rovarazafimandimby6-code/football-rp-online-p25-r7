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
    {id:'wage-1',category:'wages',amount:10,direction:'expense',createdAt:1000}
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

test('P27 intégrité contrats IA : détecte un contrat actif expiré encore inscrit',()=>{
 const input=cleanWorld();
 input.clubs[0].roster[0].contract.expiresAt='2020-01-01T00:00:00.000Z';
 const result=auditP27World(input);
 assert.ok(result.errors.some(item=>item.code==='SYSTEM_CONTRACT_EXPIRED_STILL_REGISTERED'&&item.playerId==='player-a'));
});

test('P27 intégrité contrats IA : refuse une archive de fin de contrat qui conserve un contrat actif',()=>{
 const input=cleanWorld();
 input.clubs[0].releasedPlayers=[{
  player:{id:'expired-archive-player',playerType:'system',contract:{status:'active',clubId:'club-a',playerId:'expired-archive-player'}},
  releasedAt:'2026-01-01T00:00:00.000Z',reason:'contract-not-renewed'
 }];
 const result=auditP27World(input);
 assert.ok(result.errors.some(item=>item.code==='EXPIRED_SYSTEM_PLAYER_ARCHIVE_HAS_ACTIVE_CONTRACT'));
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

test('P27 intégrité mercato IA : accepte un transfert en attente encore localisé au club vendeur',()=>{
 const input=cleanWorld();
 input.systemTransferState={version:1,transfers:[{
  id:'ai-transfer-audit-1',playerId:'player-a',fromClubId:'club-a',toClubId:'club-b',
  fee:500,createdAt:1000,status:'pending'
 }]};
 const result=auditP27World(input);
 assert.equal(result.ok,true,JSON.stringify(result.errors));
 assert.equal(result.counts.pendingSystemTransfers,1);
});

test('P27 intégrité mercato IA : refuse un transfert déclaré terminé sans déplacement et règlement',()=>{
 const input=cleanWorld();
 input.systemTransferState={version:1,transfers:[{
  id:'ai-transfer-audit-2',playerId:'player-a',fromClubId:'club-a',toClubId:'club-b',
  fee:500,createdAt:1000,status:'completed'
 }]};
 const result=auditP27World(input);
 const codes=result.errors.map(item=>item.code);
 assert.ok(codes.includes('SYSTEM_TRANSFER_COMPLETED_ROSTER_MISMATCH'));
 assert.ok(codes.includes('SYSTEM_TRANSFER_FINANCE_NOT_SETTLED'));
});

test('P27 intégrité mercato IA : détecte les identifiants de transfert outbox dupliqués',()=>{
 const input=cleanWorld();
 const record={id:'ai-transfer-audit-3',playerId:'player-a',fromClubId:'club-a',toClubId:'club-b',
  fee:500,createdAt:1000,status:'pending'};
 input.systemTransferState={version:1,transfers:[record,{...record}]};
 const result=auditP27World(input);
 assert.ok(result.errors.some(item=>item.code==='SYSTEM_TRANSFER_OUTBOX_ID_INVALID_OR_DUPLICATE'));
});

test('P27 intégrité mercato IA : détecte une écriture financière sans outbox de transfert correspondante',()=>{
 const input=cleanWorld();
 input.financeJournal={transfers:[{
  id:'orphan-ai-finance-transfer',fromClubId:'club-b',toClubId:'club-a',fee:500,
  status:'pending',debitPosted:false,creditPosted:false
 }]};
 const result=auditP27World(input);
 assert.ok(result.errors.some(item=>item.code==='SYSTEM_TRANSFER_FINANCE_OUTBOX_MISSING'));
});

test('P27 intégrité financière : détecte une écriture débit/crédit présente avant son checkpoint outbox',()=>{
 const input=cleanWorld();
 input.clubs[1].roster.push({id:'player-b',number:2,playerType:'system',contract:{status:'active',clubId:'club-b',playerId:'player-b'}});
 input.financeAccounts=[
  {clubId:'club-a',openingBalance:100,balance:80,entries:[
   {id:'wage-1',category:'wages',amount:10,direction:'expense',createdAt:1000},
   {id:'transfer-fee-out-ai-ledger-ahead-debit',category:'transfer-expense',amount:10,direction:'expense',createdAt:1001}
  ]},
  {clubId:'club-b',openingBalance:100,balance:110,entries:[
   {id:'transfer-fee-in-ai-ledger-ahead-credit',category:'transfer-income',amount:10,direction:'income',createdAt:1001}
  ]}
 ];
 input.systemTransferState={version:1,transfers:[
  {id:'ai-ledger-ahead-debit',playerId:'player-a',fromClubId:'club-a',toClubId:'club-b',fee:10,createdAt:1001,status:'pending'},
  {id:'ai-ledger-ahead-credit',playerId:'player-b',fromClubId:'club-b',toClubId:'club-a',fee:10,createdAt:1001,status:'pending'}
 ]};
 input.financeJournal={transfers:[
  {id:'ai-ledger-ahead-debit',fromClubId:'club-b',toClubId:'club-a',fee:10,status:'pending',debitPosted:false,creditPosted:false},
  {id:'ai-ledger-ahead-credit',fromClubId:'club-a',toClubId:'club-b',fee:10,status:'pending',debitPosted:false,creditPosted:false}
 ]};
 const result=auditP27World(input);
 const codes=result.errors.map(item=>item.code);
 assert.ok(codes.includes('TRANSFER_FINANCE_DEBIT_UNEXPECTED_ENTRY'));
 assert.ok(codes.includes('TRANSFER_FINANCE_CREDIT_UNEXPECTED_ENTRY'));
});

test('P27 intégrité mercato IA : contrôle la provenance du contrat après déplacement du roster',()=>{
 const input=cleanWorld();
 const player=input.clubs[0].roster.pop();
 player.contract={status:'active',clubId:'club-b',playerId:'player-a'};
 input.clubs[1].roster.push(player);
 input.systemTransferState={version:1,transfers:[{
  id:'ai-transfer-contract-link',playerId:'player-a',fromClubId:'club-a',toClubId:'club-b',
  fee:500,createdAt:1000,status:'pending'
 }]};
 const result=auditP27World(input);
 assert.ok(result.errors.some(item=>item.code==='SYSTEM_TRANSFER_CONTRACT_LINK_MISMATCH'));
});

test('P27 lot 99 : accepte la chaîne de deux transferts IA et vérifie uniquement la destination courante',()=>{
 const input=cleanWorld();
 const player=input.clubs[0].roster.pop();
 player.contract={status:'active',clubId:'club-b',playerId:'player-a',previousClubId:'club-a',transferredAt:'2028-01-02T00:00:00.000Z'};
 input.clubs[1].roster.push(player);
 input.systemTransferState={version:1,transfers:[
  {id:'ai-chain-first',playerId:'player-a',fromClubId:'club-a',toClubId:'club-b',fee:500,createdAt:1000,status:'completed'},
  {id:'ai-chain-second',playerId:'player-a',fromClubId:'club-b',toClubId:'club-a',fee:600,createdAt:2000,status:'pending'}
 ]};
 const result=auditP27World(input);
 const codes=result.errors.map(item=>item.code);
 assert.equal(codes.includes('SYSTEM_TRANSFER_CHAIN_INVALID'),false);
 assert.equal(codes.includes('SYSTEM_TRANSFER_COMPLETED_ROSTER_MISMATCH'),false);
 assert.equal(codes.includes('SYSTEM_TRANSFER_CONTRACT_LINK_MISMATCH'),false);
});

test('P27 lot 99 : refuse deux transferts IA simultanément en attente pour le même joueur',()=>{
 const input=cleanWorld();
 input.systemTransferState={version:1,transfers:[
  {id:'ai-chain-pending-a',playerId:'player-a',fromClubId:'club-a',toClubId:'club-b',fee:500,createdAt:1000,status:'pending'},
  {id:'ai-chain-pending-b',playerId:'player-a',fromClubId:'club-a',toClubId:'club-b',fee:600,createdAt:2000,status:'pending'}
 ]};
 const result=auditP27World(input);
 assert.ok(result.errors.some(item=>item.code==='SYSTEM_TRANSFER_PLAYER_MULTIPLE_PENDING'));
 assert.ok(result.errors.some(item=>item.code==='SYSTEM_TRANSFER_CHAIN_INVALID'));
});

test('P27 lot 102 : valide les métadonnées de reprise et de clôture de l’outbox IA',()=>{
 const input=cleanWorld();
 input.systemTransferState={version:1,transfers:[
  {id:'ai-retry-invalid',playerId:'player-a',fromClubId:'club-a',toClubId:'club-b',fee:500,
   createdAt:1000,status:'pending',attempts:-1,lastError:{unexpected:true}},
  {id:'ai-completion-date-invalid',playerId:'player-a',fromClubId:'club-a',toClubId:'club-b',fee:500,
   createdAt:2000,status:'completed',attempts:0,lastError:null}
 ]};
 const result=auditP27World(input);
 const codes=result.errors.map(item=>item.code);
 assert.ok(codes.includes('SYSTEM_TRANSFER_OUTBOX_RETRY_METADATA_INVALID'));
 assert.ok(codes.includes('SYSTEM_TRANSFER_OUTBOX_COMPLETION_DATE_INVALID'));
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


test('P27 intégrité finances : détecte les écritures mal catégorisées et les comptes manquants',()=>{
 const input=cleanWorld();
 input.financeAccounts[0].entries[0].category='unknown';
 input.financeAccounts[0].entries[0].createdAt=-1;
 const result=auditP27World(input);
 const codes=result.errors.map(item=>item.code);
 assert.ok(codes.includes('FINANCE_ENTRY_INVALID'));
 assert.ok(result.warnings.some(item=>item.code==='FINANCE_ACCOUNT_CATALOGUE_SIZE_MISMATCH'));
});

test('P27 intégrité saisons : détecte les identifiants de fixture dupliqués entre saisons',()=>{
 const input=cleanWorld();
 const season=structuredClone(input.competitionState.seasons[0]);
 season.id='season-b';
 season.competitions[0].id='league-b';
 season.competitions[0].fixtures[0].id='fixture-a';
 input.competitionState.seasons.push(season);
 const result=auditP27World(input);
 assert.ok(result.errors.some(item=>item.code==='FIXTURE_ID_INVALID_OR_DUPLICATE'));
});


test('P27 intégrité financière : détecte un transfert accepté dont la réconciliation est absente ou incomplète',()=>{
 const input=cleanWorld();
 input.transferState.events=[{id:'transfer-event-1',type:'transfer',fromClubId:'club-a',toClubId:'club-b',fee:25,at:1000}];
 input.financeJournal={version:1,transfers:[{id:'transfer-event-1',fromClubId:'club-a',toClubId:'club-b',fee:25,createdAt:1000,debitPosted:true,creditPosted:false,status:'pending'}],playerWages:[]};
 input.financeAccounts=[
  {clubId:'club-a',openingBalance:100,balance:75,entries:[{id:'transfer-fee-out-transfer-event-1',category:'transfer-expense',amount:25,direction:'expense',createdAt:1000}]},
  {clubId:'club-b',openingBalance:100,balance:100,entries:[]}
 ];
 const result=auditP27World(input);
 assert.equal(result.ok,true,JSON.stringify(result.errors));
 assert.equal(result.counts.pendingTransferSettlements,1);
 assert.ok(result.warnings.length===0);
});

test('P27 intégrité financière : détecte les checkpoints de transfert mensongers et les événements non journalisés',()=>{
 const input=cleanWorld();
 input.transferState.events=[{id:'transfer-event-2',type:'transfer',fromClubId:'club-a',toClubId:'club-b',fee:30,at:1000}];
 input.financeJournal={version:1,transfers:[{id:'transfer-event-2',fromClubId:'club-a',toClubId:'club-b',fee:30,createdAt:1000,debitPosted:true,creditPosted:true,status:'completed'}],playerWages:[]};
 const result=auditP27World(input);
 const codes=result.errors.map(item=>item.code);
 assert.ok(codes.includes('TRANSFER_FINANCE_DEBIT_CHECKPOINT_MISMATCH'));
 assert.ok(codes.includes('TRANSFER_FINANCE_CREDIT_CHECKPOINT_MISMATCH'));
 input.financeJournal.transfers=[];
 const missing=auditP27World(input);
 assert.ok(missing.warnings.some(item=>item.code==='TRANSFER_FINANCE_JOURNAL_MISSING'));
 assert.equal(missing.counts.pendingTransferSettlements,1);
});

test('P27 intégrité financière : vérifie les salaires humains et leurs checkpoints comptables',()=>{
 const input=cleanWorld();
 input.transferState.events=[{id:'salary-event-1',type:'salary-payment',clubId:'club-a',amount:10,at:1000}];
 input.financeJournal={version:1,transfers:[],playerWages:[{id:'salary-event-1',clubId:'club-a',amount:10,createdAt:1000,posted:true}]};
 const result=auditP27World(input);
 assert.ok(result.errors.some(item=>item.code==='PLAYER_WAGE_CHECKPOINT_MISMATCH'));
 assert.equal(result.counts.pendingPlayerWages,0);
});

test('P27 intégrité monde : relie une carrière humaine à son unique inscription au bon club',()=>{
 const input=cleanWorld();
 const career=input.transferState.careers[0];
 career.playerId='human-account-a';
 career.contract.playerId='human-account-a';
 input.clubs[0].roster.push({id:'human-account-a',number:2,playerType:'human',contract:{status:'active',clubId:'club-a'}});
 const result=auditP27World(input);
 assert.equal(result.ok,true,JSON.stringify(result.errors));
 assert.equal(result.warnings.some(item=>item.code==='CAREER_PLAYER_NOT_IN_ROSTER'),false);
});

test('P27 intégrité monde : compare le salaire, le club, le joueur et l’échéance du contrat inscrit à la carrière',()=>{
 const input=cleanWorld();
 const career=input.transferState.careers[0];
 career.playerId='human-contract-a';
 career.contract.playerId='human-contract-a';
 input.clubs[0].roster.push({id:'human-contract-a',number:2,playerType:'human',contract:{
  status:'active',clubId:'club-a',playerId:'human-contract-a',salary:100,weeklyWage:100,
  signedAt:career.contract.signedAt,expiresAt:career.contract.expiresAt
 }});
 assert.equal(auditP27World(input).ok,true);
 input.clubs[0].roster[1].contract.salary=125;
 input.clubs[0].roster[1].contract.weeklyWage=125;
 input.clubs[0].roster[1].contract.expiresAt='2028-01-01T00:00:00.000Z';
 const result=auditP27World(input);
 const codes=result.errors.map(item=>item.code);
 assert.ok(codes.includes('CAREER_ROSTER_CONTRACT_SALARY_MISMATCH'));
 assert.ok(codes.includes('CAREER_ROSTER_CONTRACT_EXPIRY_MISMATCH'));
});

test('P27 intégrité monde : signale une carrière active absente de l’effectif sans bloquer les anciens mondes',()=>{
 const input=cleanWorld();
 input.transferState.careers[0].playerId='human-account-missing';
 const result=auditP27World(input);
 assert.equal(result.ok,true,JSON.stringify(result.errors));
 assert.ok(result.warnings.some(item=>item.code==='CAREER_PLAYER_NOT_IN_ROSTER'));
});

test('P27 intégrité monde : rejette une carrière inscrite dans le mauvais club ou comme joueur système',()=>{
 const input=cleanWorld();
 input.transferState.careers[0].playerId='human-account-a';
 input.clubs[1].roster.push({id:'human-account-a',number:2,playerType:'system'});
 const result=auditP27World(input);
 const codes=result.errors.map(item=>item.code);
 assert.ok(codes.includes('CAREER_ROSTER_CLUB_MISMATCH'));
 assert.ok(codes.includes('CAREER_ROSTER_TYPE_MISMATCH'));
});

test('P27 intégrité monde : signale un joueur humain encore inscrit après expiration ou résiliation',()=>{
 const input=cleanWorld();
 input.transferState.careers[0].playerId='human-account-a';
 input.transferState.careers[0].contract.status='terminated';
 input.transferState.careers[0].clubId=null;
 input.clubs[0].roster.push({id:'human-account-a',number:2,playerType:'human'});
 const result=auditP27World(input);
 assert.ok(result.warnings.some(item=>item.code==='INACTIVE_CAREER_PLAYER_STILL_REGISTERED'));
});

test('P27 intégrité monde : audite les commandes outbox d’effectif et compte les reprises en attente',()=>{
 const input=cleanWorld();
 input.transferState.careers[0].playerId='human-account-a';
 input.transferState.rosterSync=[{
  id:'roster-command-a',playerId:'human-account-a',action:'upsert',clubId:'club-a',previousClubId:null,
  contract:{status:'active',playerId:'human-account-a',clubId:'club-a',salary:100},
  status:'pending',attempts:2,createdAt:'2027-01-01T00:00:00.000Z'
 }];
 const result=auditP27World(input);
 assert.equal(result.ok,true,JSON.stringify(result.errors));
 assert.equal(result.counts.pendingRosterSync,1);
 assert.ok(result.warnings.some(item=>item.code==='ROSTER_SYNC_PENDING'));
});

test('P27 intégrité monde : rejette les commandes outbox dupliquées ou incohérentes',()=>{
 const input=cleanWorld();
 const entry={id:'roster-command-a',playerId:'human-account-a',action:'upsert',clubId:'club-a',
  contract:{status:'active',playerId:'human-account-a',clubId:'club-b',salary:100},status:'pending',attempts:0,createdAt:'2027-01-01T00:00:00.000Z'};
 input.transferState.careers[0].playerId='human-account-a';
 input.transferState.rosterSync=[entry,{...entry}];
 const result=auditP27World(input);
 const codes=result.errors.map(item=>item.code);
 assert.ok(codes.includes('ROSTER_SYNC_ID_INVALID_OR_DUPLICATE'));
 assert.ok(codes.includes('ROSTER_SYNC_UPSERT_LINK_INVALID'));
});

test('P27 intégrité monde : refuse une commande outbox sans carrière source',()=>{
 const input=cleanWorld();
 input.transferState.rosterSync=[{id:'roster-orphan',eventId:'event-orphan',playerId:'human-orphan',action:'release',clubId:null,status:'pending',attempts:0,createdAt:'2027-01-01T00:00:00.000Z'}];
 const result=auditP27World(input);
 assert.ok(result.errors.some(item=>item.code==='ROSTER_SYNC_CAREER_LINK_MISSING'));
 assert.ok(result.errors.some(item=>item.code==='ROSTER_SYNC_EVENT_MISSING'));
});


test('P27 intégrité paie humaine : refuse les événements sans carrière, club ou montant cohérent',()=>{
 const input=cleanWorld();
 input.transferState.events=[
  {id:'salary-valid',type:'salary-payment',playerId:'human-unknown',clubId:'club-a',amount:100,periods:1,at:Date.UTC(2027,0,1)},
  {id:'salary-invalid-club',type:'salary-payment',playerId:'human-unknown',clubId:'unknown-club',amount:-1,periods:0,at:'invalid'}
 ];
 const result=auditP27World(input);
 const codes=result.errors.map(item=>item.code);
 assert.ok(codes.includes('SALARY_EVENT_CAREER_LINK_INVALID'));
 assert.ok(codes.includes('SALARY_EVENT_CLUB_LINK_INVALID'));
 assert.ok(codes.includes('SALARY_EVENT_AMOUNT_OR_DATE_INVALID'));
});

test('P27 intégrité paie humaine : refuse une écriture de journal sans événement métier source',()=>{
 const input=cleanWorld();
 input.financeJournal={version:1,transfers:[],playerWages:[
  {id:'orphan-salary-event',clubId:'club-a',amount:100,posted:false}
 ]};
 const result=auditP27World(input);
 assert.ok(result.errors.some(item=>item.code==='PLAYER_WAGE_JOURNAL_EVENT_MISSING'));
});


test('P27 intégrité carrière : signale un contrat actif sans effectif ni synchronisation en attente',()=>{
 const input=cleanWorld();
 input.transferState.careers[0].playerId='human-orphan';
 input.transferState.careers[0].contract.playerId='human-orphan';
 const result=auditP27World(input);
 assert.ok(result.errors.some(item=>item.code==='CAREER_ACTIVE_PLAYER_ORPHANED'&&item.playerId==='human-orphan'));
});

test('P27 intégrité carrière : tolère temporairement un effectif absent si la saga outbox est en attente',()=>{
 const input=cleanWorld();
 input.transferState.careers[0].playerId='human-pending';
 input.transferState.careers[0].contract.playerId='human-pending';
 input.transferState.events=[{id:'event-pending',type:'signing',playerId:'human-pending'}];
 input.transferState.rosterSync=[{
  id:'roster-event-pending',eventId:'event-pending',playerId:'human-pending',action:'upsert',clubId:'club-a',
  contract:{status:'active',playerId:'human-pending',clubId:'club-a',salary:100},status:'pending',attempts:0,
  createdAt:'2027-01-01T00:00:00.000Z'
 }];
 const result=auditP27World(input);
 assert.ok(!result.errors.some(item=>item.code==='CAREER_ACTIVE_PLAYER_ORPHANED'));
 assert.ok(result.warnings.some(item=>item.code==='CAREER_PLAYER_ROSTER_SYNC_PENDING'));
});

test('P27 intégrité prêts : vérifie le lien du contrat parent et du joueur inscrit au club emprunteur',()=>{
 const input=cleanWorld();
 const playerId='human-loan-player';
 const parentContract={status:'active',clubId:'club-a',playerId,salary:100,signedAt:'2027-01-01T00:00:00.000Z',expiresAt:'2027-12-01T00:00:00.000Z'};
 const loan={status:'active',parentClubId:'club-a',parentContract,startedAt:'2027-01-15T00:00:00.000Z',expiresAt:'2027-02-15T00:00:00.000Z'};
 input.clubs[1].roster.push({id:playerId,playerType:'human',number:2,contract:{...parentContract,clubId:'club-b',loan}});
 input.transferState.careers=[{accountId:'loan-account',playerId,clubId:'club-b',contract:{...parentContract,clubId:'club-b',loan}}];
 const result=auditP27World(input);
 assert.ok(!result.errors.some(item=>item.code.startsWith('CAREER_LOAN_')));
 input.transferState.careers[0].contract.loan.parentClubId='missing-club';
 assert.ok(auditP27World(input).errors.some(item=>item.code==='CAREER_LOAN_TERMS_INVALID'));
});

test('P27 intégrité mercato : compte les joueurs libres uniques et signale les archives dupliquées',()=>{
 const input=cleanWorld();
 input.clubs[0].releasedPlayers=[
  {player:{id:'free-player',name:'Libre'},releasedAt:'2027-01-01T00:00:00.000Z',reason:'contract-expired'},
  {player:{id:'moved-player',name:'Transféré'},releasedAt:'2027-01-02T00:00:00.000Z',reason:'transferred'}
 ];
 input.clubs[1].releasedPlayers=[
  {player:{id:'free-player',name:'Libre'},releasedAt:'2027-01-03T00:00:00.000Z',reason:'released'}
 ];
 const result=auditP27World(input);
 assert.equal(result.counts.freeAgents,1);
 assert.equal(result.counts.duplicateFreeAgentSnapshots,1);
 assert.ok(result.warnings.some(item=>item.code==='FREE_AGENT_ARCHIVE_DUPLICATE_SNAPSHOTS'&&item.playerId==='free-player'));
});
