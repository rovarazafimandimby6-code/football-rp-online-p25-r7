import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {JsonCompetitionStore} from '../server/competition-store.js';
import {RoomManager} from '../server/room-manager.js';
const setup=()=>{const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-competitions-'));return {directory,store:new JsonCompetitionStore(directory,{seasonId:'test-season',now:()=>1000}),cleanup:()=>rmSync(directory,{recursive:true,force:true})};};
test('P27 compétitions : génère les neuf groupes de championnat et la coupe à élimination directe',()=>{const f=setup();try{const data=f.store.snapshot();assert.equal(data.competitions.filter(c=>c.type==='league').length,9);assert.equal(data.competitions.find(c=>c.division==='D4'&&c.conference==='Nord').name,'Challenger League · Conférence Nord');assert.deepEqual(data.competitions.filter(c=>c.division==='D5').map(c=>c.conference),['Nord','Sud','Est','Ouest']);assert.ok(data.competitions.filter(c=>c.type==='league').every(c=>c.status==='active'));assert.equal(data.competitions.find(c=>c.id==='test-season-league-D1').members.length,16);assert.equal(data.competitions.find(c=>c.id==='test-season-league-D1').fixtures.length,120);assert.equal(new Set(data.competitions.find(c=>c.id==='test-season-league-D1').fixtures.map(f=>f.round)).size,15);assert.equal(data.competitions.find(c=>c.type==='cup').fixtures.length,155);}finally{f.cleanup();}});
test('P27 coupe : les 156 clubs sont engagés une seule fois dans le tableau initial',()=>{const f=setup();try{const cup=f.store.snapshot().competitions.find(c=>c.type==='cup');assert.equal(cup.members.length,156);assert.equal(new Set(cup.members.map(c=>c.id)).size,156);const preliminary=cup.fixtures.filter(x=>x.round===1);const main=cup.fixtures.filter(x=>x.round===2);assert.equal(preliminary.length,28);assert.equal(main.length,64);const preliminaryIds=preliminary.flatMap(x=>[x.homeClubId,x.awayClubId]);assert.equal(new Set(preliminaryIds).size,56);const byeIds=main.flatMap(x=>[x.homeClubId,x.awayClubId].filter(Boolean));assert.equal(byeIds.length,100);assert.equal(new Set(byeIds).size,100);assert.equal(preliminaryIds.some(id=>byeIds.includes(id)),false);assert.equal(main.filter(x=>x.status==='waiting').length,28);assert.equal(cup.fixtures.length,155);}finally{f.cleanup();}});
test('P27 coupe : les 155 rencontres conduisent à un champion et un trophée',()=>{const f=setup();try{for(let round=1;round<=8;round++){const cup=f.store.snapshot().competitions.find(c=>c.type==='cup');const ready=cup.fixtures.filter(x=>x.round===round&&x.status==='scheduled');assert.equal(ready.length,[0,28,64,32,16,8,4,2,1][round]);for(let i=0;i<ready.length;i++){const result=f.store.recordFixtureResult(ready[i].id,{roomId:`cup-r${round}-${i}`,homeGoals:2,awayGoals:1,finalizedAt:round*1000+i});assert.equal(result.ok,true);}}const cup=f.store.snapshot().competitions.find(c=>c.type==='cup');assert.equal(cup.status,'completed');assert.ok(cup.championClubId);assert.equal(cup.fixtures.length,155);assert.ok(cup.fixtures.every(x=>x.status==='completed'));assert.equal(f.store.snapshot().trophies.filter(x=>x.competitionId===cup.id).length,1);}finally{f.cleanup();}});
test('P27 compétitions : classement serveur idempotent et persistant',()=>{const f=setup();try{const league=f.store.snapshot().competitions.find(c=>c.id==='test-season-league-D1'),fixture=league.fixtures[0];assert.equal(f.store.recordFixtureResult(fixture.id,{roomId:'room-a',homeGoals:2,awayGoals:1,finalizedAt:200}).ok,true);assert.equal(f.store.recordFixtureResult(fixture.id,{roomId:'room-a',homeGoals:99,awayGoals:0,finalizedAt:201}).duplicate,true);assert.equal(f.store.recordFixtureResult(fixture.id,{roomId:'room-b',homeGoals:0,awayGoals:9}).reason,'fixture-already-completed');const table=f.store.snapshot().competitions.find(c=>c.id===league.id).standings;assert.equal(table.reduce((n,row)=>n+row.played,0),2);assert.equal(table.find(row=>row.id===fixture.homeClubId).points,3);const restored=new JsonCompetitionStore(f.directory,{seasonId:'test-season'});assert.equal(restored.getFixture(fixture.id).status,'completed');}finally{f.cleanup();}});
test('P27 compétitions : seul un salon lié au bon match officiel crédite le classement',()=>{const f=setup();try{const league=f.store.snapshot().competitions.find(c=>c.type==='league'),fixture=league.fixtures[0];const manager=new RoomManager({competitionStore:f.store,now:()=>2000});const created=manager.create({blueClubId:fixture.homeClubId,redClubId:fixture.awayClubId,competitionFixtureId:fixture.id});const room=manager.rooms.get(created.id);room.phase='fulltime';room.elapsedMs=300000;room.score={blue:2,red:0};const result=manager.finalizeResult(room);assert.equal(result.competition.fixtureId,fixture.id);assert.equal(f.store.getFixture(fixture.id).result.home,2);assert.throws(()=>manager.create({blueClubId:fixture.homeClubId,redClubId:fixture.awayClubId,competitionFixtureId:fixture.id}),/COMPETITION_FIXTURE_NOT_READY/);}finally{f.cleanup();}});
test('P27 coupe : un nul ne donne aucun trophée et une victoire fait avancer le vainqueur',()=>{const f=setup();try{const cup=f.store.snapshot().competitions.find(c=>c.type==='cup'),first=cup.fixtures[0];assert.equal(f.store.recordFixtureResult(first.id,{roomId:'cup-draw',homeGoals:1,awayGoals:1}).ok,true);assert.equal(f.store.getFixture(first.id).status,'replay-required');assert.equal(f.store.snapshot().trophies.length,0);assert.equal(f.store.recordFixtureResult(first.id,{roomId:'cup-replay',homeGoals:2,awayGoals:1}).ok,true);const next=f.store.snapshot().competitions.find(c=>c.type==='cup').fixtures.find(x=>x.round===2);assert.ok(next.homeClubId||next.awayClubId);assert.equal(f.store.getFixture(first.id).replays.length,1);}finally{f.cleanup();}});

test('P27 saisons : refuse de clôturer une saison incomplète',()=>{const f=setup();try{assert.equal(f.store.finalizeSeason({nextSeasonId:'2027-28'}).reason,'season-competitions-incomplete');assert.equal(f.store.seasonHistory().length,1);assert.equal(f.store.activeSeason.status,'active');}finally{f.cleanup();}});
test('P27 saisons : archive les trophées et ouvre une saison suivante avec des quotas conservés',()=>{const f=setup();try{
  const season=f.store.activeSeason;
  for(const competition of season.competitions){competition.status='completed';if(competition.type==='league')competition.championClubId=competition.standings[0].id;else competition.championClubId=competition.members[0].id;}
  const archivedFixture=season.competitions.find(c=>c.id==='test-season-league-D1').fixtures[0];archivedFixture.status='completed';archivedFixture.result={home:3,away:2,finalizedAt:850};archivedFixture.roomId='archived-room';
    season.trophies.push({id:'test-trophy',competitionId:'test-season-league-D1',competitionName:'Premier League',clubId:season.competitions.find(c=>c.id==='test-season-league-D1').championClubId,clubName:'Champion test',awardedAt:900});
  const d1=season.competitions.find(c=>c.id==='test-season-league-D1').members[0].id;
  const d2=season.competitions.find(c=>c.id==='test-season-league-D2').members[0].id;
  const result=f.store.finalizeSeason({nextSeasonId:'2027-28',completedAt:2000,movements:[{clubId:d1,toDivision:'D2'},{clubId:d2,toDivision:'D1'}]});
  assert.equal(result.ok,true);assert.equal(result.movements,2);assert.equal(f.store.activeSeason.id,'2027-28');
  assert.equal(f.store.activeSeason.status,'active');
  const next=f.store.snapshot().competitions;
  assert.equal(next.find(c=>c.id==='2027-28-league-D1').members.length,16);
  assert.equal(next.find(c=>c.id==='2027-28-league-D2').members.length,20);
  const history=f.store.seasonHistory();assert.equal(history.length,2);assert.equal(history[0].status,'completed');assert.equal(history[0].trophies.length,1);assert.equal(history[0].movements.length,2);const archivedLeague=history[0].competitions.find(c=>c.id==='test-season-league-D1');assert.equal(archivedLeague.finalStandings.length,16);assert.equal(archivedLeague.results.length,1);assert.equal(archivedLeague.results[0].result.home,3);
  const restored=new JsonCompetitionStore(f.directory,{seasonId:'ignored'});assert.equal(restored.activeSeason.id,'2027-28');assert.equal(restored.seasonHistory()[0].trophies.length,1);assert.equal(restored.clubs.get(d1).division,'D2');assert.equal(restored.clubs.get(d2).division,'D1');
}finally{f.cleanup();}});
test('P27 saisons : rejette les mouvements qui cassent les divisions ou les conférences',()=>{const f=setup();try{
  for(const competition of f.store.activeSeason.competitions)competition.status='completed';
  const d1=f.store.activeSeason.competitions.find(c=>c.id==='test-season-league-D1').members[0].id;
  assert.equal(f.store.finalizeSeason({nextSeasonId:'bad-hop',movements:[{clubId:d1,toDivision:'D3'}]}).reason,'movement-must-be-adjacent-division');
  assert.equal(f.store.finalizeSeason({nextSeasonId:'bad-conference',movements:[{clubId:d1,toDivision:'D2'},{clubId:f.store.activeSeason.competitions.find(c=>c.id==='test-season-league-D2').members[0].id,toDivision:'D1'}]}).ok,true);
}finally{f.cleanup();}});

test('P27 palmarès : agrège les saisons, les titres et les bilans sans dupliquer les matchs',()=>{
 const f=setup();try{
  const league=f.store.snapshot().competitions.find(c=>c.id==='test-season-league-D1');
  const fixture=league.fixtures[0];
  assert.equal(f.store.recordFixtureResult(fixture.id,{roomId:'history-room',homeGoals:2,awayGoals:1,finalizedAt:1200}).ok,true);
  const home=fixture.homeClubId, away=fixture.awayClubId;
  f.store.activeSeason.trophies.push({id:'history-title',competitionId:'test-season-league-D1',competitionName:'Premier League',clubId:home,clubName:f.store.clubs.get(home).name,awardedAt:1300});
  f.store.persist();
  const restored=new JsonCompetitionStore(f.directory,{seasonId:'ignored'});
  const records=new Map(restored.clubHistoricalRecords().map(item=>[item.clubId,item]));
  assert.equal(records.get(home).matches,1);assert.equal(records.get(home).wins,1);
  assert.equal(records.get(home).goalsFor,2);assert.equal(records.get(home).leagueTitles,1);
  assert.equal(records.get(home).seasonsParticipated,1);
  assert.equal(records.get(away).losses,1);assert.equal(records.get(away).goalsAgainst,2);
  const duel=restored.headToHead(home,away);
  assert.equal(duel.matches,1);assert.equal(duel.clubAWins+duel.clubBWins,1);
  assert.equal(restored.headToHead(home,home),null);
 }finally{f.cleanup();}
});
