import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {JsonCompetitionStore} from '../server/competition-store.js';
import {RoomManager} from '../server/room-manager.js';
const setup=()=>{const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-competitions-'));return {directory,store:new JsonCompetitionStore(directory,{seasonId:'test-season',now:()=>1000}),cleanup:()=>rmSync(directory,{recursive:true,force:true})};};
const finishPromotionPlayoffs=store=>{
 store.previewSeasonMovements();
 for(const round of [1,2]){
  const fixtures=store.activeSeason.competitions.filter(item=>item.type==='promotion-playoff').flatMap(item=>item.fixtures.filter(fixture=>fixture.round===round&&fixture.status==='scheduled'));
  for(const fixture of fixtures){
   const result=store.recordFixtureResult(fixture.id,{roomId:'test-'+fixture.id,homeGoals:2,awayGoals:1,finalizedAt:round*1000});
   assert.equal(result.ok,true,JSON.stringify(result));
  }
 }
};
test('P27 compétitions : génère les neuf groupes de championnat et la coupe à élimination directe',()=>{const f=setup();try{const data=f.store.snapshot();assert.equal(data.competitions.filter(c=>c.type==='league').length,9);assert.equal(data.competitions.find(c=>c.division==='D4'&&c.conference==='A').name,'Challenger League · Conférence A');assert.deepEqual(data.competitions.filter(c=>c.division==='D5').map(c=>c.conference),['A','B','C','D']);assert.ok(data.competitions.filter(c=>c.type==='league').every(c=>c.status==='active'));assert.equal(data.competitions.find(c=>c.id==='test-season-league-D1').members.length,16);assert.equal(data.competitions.find(c=>c.id==='test-season-league-D1').fixtures.length,240);assert.equal(new Set(data.competitions.find(c=>c.id==='test-season-league-D1').fixtures.map(f=>f.round)).size,30);assert.equal(data.competitions.find(c=>c.id==='test-season-league-D1').matchFormat,'home-away');assert.equal(data.competitions.find(c=>c.id==='test-season-league-D4-A').fixtures.length,120);assert.equal(data.competitions.find(c=>c.type==='cup').fixtures.length,155);}finally{f.cleanup();}});
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
  finishPromotionPlayoffs(f.store);const preview=f.store.previewSeasonMovements();
  const d1=preview.movements.find(item=>item.fromDivision==='D1'&&item.type==='relegation').clubId;
  const d2=preview.movements.find(item=>item.fromDivision==='D2'&&item.type==='promotion').clubId;
  const result=f.store.finalizeSeason({nextSeasonId:'2027-28',completedAt:2000,movements:preview.movements});
  assert.equal(result.ok,true);assert.equal(result.movements,40);assert.equal(f.store.activeSeason.id,'2027-28');
  assert.equal(f.store.activeSeason.status,'active');
  const next=f.store.snapshot().competitions;
  assert.equal(next.find(c=>c.id==='2027-28-league-D1').members.length,16);
  assert.equal(next.find(c=>c.id==='2027-28-league-D2').members.length,20);
  const history=f.store.seasonHistory();assert.equal(history.length,2);assert.equal(history[0].status,'completed');assert.equal(history[0].trophies.length,1);assert.equal(history[0].movements.length,40);const archivedLeague=history[0].competitions.find(c=>c.id==='test-season-league-D1');assert.equal(archivedLeague.finalStandings.length,16);assert.equal(archivedLeague.results.length,1);assert.equal(archivedLeague.results[0].result.home,3);
  const restored=new JsonCompetitionStore(f.directory,{seasonId:'ignored'});assert.equal(restored.activeSeason.id,'2027-28');assert.equal(restored.seasonHistory()[0].trophies.length,1);assert.equal(restored.clubs.get(d1).division,'D2');assert.equal(restored.clubs.get(d2).division,'D1');
}finally{f.cleanup();}});
test('P27 saisons : rejette les mouvements qui cassent les divisions ou les conférences',()=>{const f=setup();try{
  for(const competition of f.store.activeSeason.competitions)competition.status='completed';
  finishPromotionPlayoffs(f.store);const preview=f.store.previewSeasonMovements();const selected=preview.movements[0];
  assert.equal(f.store.finalizeSeason({nextSeasonId:'bad-hop',movements:[{clubId:selected.clubId,toDivision:'D3'}]}).reason,'movement-list-does-not-match-approved-preview');
  assert.equal(f.store.finalizeSeason({nextSeasonId:'bad-conference',movements:preview.movements.map(item=>item.clubId===selected.clubId?{...item,toConference:'Z'}:item)}).reason,'movement-list-does-not-match-approved-preview');
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


test('P27 mouvements : propose un barème complet et conserve exactement les quotas des divisions',()=>{
 const f=setup();try{
  for(const competition of f.store.activeSeason.competitions) if(competition.type==='league') competition.status='completed';
  finishPromotionPlayoffs(f.store);
  const preview=f.store.previewSeasonMovements();
  assert.equal(preview.ok,true,JSON.stringify(preview));
  assert.equal(preview.policy.status,'approved');
  assert.equal(preview.totalMovements,40);
  assert.equal(preview.promotions,20);
  assert.equal(preview.relegations,20);
  assert.deepEqual(preview.divisionCounts,{D1:16,D2:20,D3:24,D4:32,D5:64});
  assert.deepEqual(preview.conferenceCounts,{D4:{A:16,B:16},D5:{A:16,B:16,C:16,D:16}});
  assert.equal(new Set(preview.movements.map(item=>item.clubId)).size,40);
 }finally{f.cleanup();}
});

test('P27 mouvements : respecte les places nationales et les quatre conférences régionales',()=>{
 const f=setup();try{
  for(const competition of f.store.activeSeason.competitions){
   if(competition.type!=='league')continue;
   competition.status='completed';
   competition.standings=competition.standings.map((row,index)=>({...row,points:competition.standings.length-index,goalsFor:100-index,goalsAgainst:index}));
  }
  finishPromotionPlayoffs(f.store);
  const preview=f.store.previewSeasonMovements();
  assert.equal(preview.ok,true,JSON.stringify(preview));
  const byDivision=(division,type)=>preview.movements.filter(item=>item.fromDivision===division&&item.type===type);
  assert.equal(byDivision('D1','relegation').length,4);
  assert.equal(byDivision('D2','promotion').length,4);
  assert.equal(byDivision('D2','relegation').length,4);
  assert.equal(byDivision('D3','promotion').length,4);
  assert.equal(byDivision('D3','relegation').length,4);
  assert.equal(byDivision('D4','promotion').length,4);
  assert.equal(byDivision('D4','relegation').length,8);
  assert.equal(byDivision('D5','promotion').length,8);
  for(const conference of ['A','B','C','D']){
   const winner=byDivision('D5','promotion').find(item=>item.fromConference===conference);
   assert.ok(winner);
   assert.equal(winner.finalPosition,1);
  }
  assert.deepEqual(byDivision('D4','relegation').map(item=>item.toConference).sort(),['A','A','B','B','C','C','D','D']);
 }finally{f.cleanup();}
});

test('P27 mouvements : ne calcule pas de promotions sur un championnat incomplet ou une table tronquée',()=>{
 const f=setup();try{
  assert.equal(f.store.previewSeasonMovements().reason,'league-table-incomplete');
  for(const competition of f.store.activeSeason.competitions) if(competition.type==='league')competition.status='completed';
  const d5=f.store.activeSeason.competitions.find(item=>item.division==='D5'&&item.conference==='B');
  d5.standings.pop();
  assert.equal(f.store.previewSeasonMovements().reason,'league-table-incomplete');
 }finally{f.cleanup();}
});

test('P27 API snapshot : publie une prévision de mouvements seulement lorsque les neuf classements sont terminés',()=>{
 const f=setup();try{
  assert.equal(f.store.snapshot().movementPreview,null);
  for(const competition of f.store.activeSeason.competitions) if(competition.type==='league')competition.status='completed';
  finishPromotionPlayoffs(f.store);
  const snapshot=f.store.snapshot();
  assert.equal(snapshot.movementPreview.ok,true);
  assert.equal(snapshot.movementPreview.totalMovements,40);
  assert.equal(snapshot.movementPreview.policy.status,'approved');
 }finally{f.cleanup();}
});


test('P27 saisons : applique la prévision validée et archive les détails de chaque mouvement',()=>{
 const f=setup();try{
  for(const competition of f.store.activeSeason.competitions) if(competition.type==='league')competition.status='completed';
  for(const competition of f.store.activeSeason.competitions) if(competition.type==='cup')competition.status='completed';
  finishPromotionPlayoffs(f.store);
  const preview=f.store.previewSeasonMovements();
  assert.equal(preview.ok,true,JSON.stringify(preview));
  const result=f.store.finalizeSeason({nextSeasonId:'2027-28',movements:preview.movements,completedAt:3000});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.movements,40);
  const archived=f.store.seasonHistory()[0].movements;
  assert.equal(archived.length,40);
  assert.ok(archived.every(item=>item.clubName&&item.fromDivision&&item.toDivision&&item.type&&Number.isSafeInteger(item.finalPosition)&&item.competitionId));
  const promotions=archived.filter(item=>item.type==='promotion');
  const relegations=archived.filter(item=>item.type==='relegation');
  assert.equal(promotions.length,20);
  assert.equal(relegations.length,20);
  assert.deepEqual(Object.fromEntries(['A','B'].map(conference=>[conference,f.store.clubs.size? [...f.store.clubs.values()].filter(club=>club.division==='D4'&&club.conference===conference).length:0])),{A:16,B:16});
  assert.equal(f.store.activeSeason.competitions.find(item=>item.division==='D5'&&item.conference==='B').members.length,16);
  const restored=new JsonCompetitionStore(f.directory,{seasonId:'ignored'});
  assert.equal(restored.seasonHistory()[0].movements[0].type!==undefined,true);
 }finally{f.cleanup();}
});

test('P27 saisons : refuse une liste de mouvements mal formée sans modifier la saison',()=>{
 const f=setup();try{
  const result=f.store.finalizeSeason({nextSeasonId:'invalid',movements:null});
  assert.equal(result.reason,'invalid-movement-list');
  assert.equal(f.store.seasonHistory().length,1);
  assert.equal(f.store.activeSeason.status,'active');
 }finally{f.cleanup();}
});


test('P27 calendrier : audite les neuf groupes, chaque journée et les 1 892 rencontres',()=>{
 const f=setup();try{
  const snapshot=f.store.snapshot();
  const audit=snapshot.scheduleAudit;
  assert.equal(audit.ok,true,JSON.stringify(audit.errors));
  assert.equal(audit.leagueCount,9);
  assert.equal(audit.fixtureCount,1892);
  assert.equal(audit.errors.length,0);
  assert.deepEqual(audit.competitions.map(item=>item.rounds),[30,38,46,15,15,15,15,15,15]);
  assert.ok(audit.competitions.every(item=>item.ok&&item.appearancesPerClub===item.rounds));
 }finally{f.cleanup();}
});

test('P27 calendrier : détecte une double programmation et une confrontation manquante',()=>{
 const f=setup();try{
  const league=f.store.activeSeason.competitions.find(item=>item.division==='D1');
  const fixture=league.fixtures[1];
  fixture.homeClubId=league.fixtures[0].homeClubId;
  const audit=f.store.snapshot().scheduleAudit;
  assert.equal(audit.ok,false);
  assert.ok(audit.errors.some(item=>['club-scheduled-twice-in-round','duplicate-league-pairing','invalid-club-appearance-count'].includes(item.reason)));
 }finally{f.cleanup();}
});

test('P27 calendriers : D1, D2 et D3 jouent en aller-retour ; D4 et D5 en aller simple',()=>{
 const f=setup();try{
  const leagues=f.store.snapshot().competitions.filter(c=>c.type==='league');
  const expected={D1:{format:'home-away',fixtures:240,rounds:30},D2:{format:'home-away',fixtures:380,rounds:38},D3:{format:'home-away',fixtures:552,rounds:46},D4:{format:'single-leg',fixtures:120,rounds:15},D5:{format:'single-leg',fixtures:120,rounds:15}};
  for(const league of leagues){
   const rule=expected[league.division];
   assert.equal(league.matchFormat,rule.format,league.id);
   assert.equal(league.fixtures.length,rule.fixtures,league.id);
   assert.equal(new Set(league.fixtures.map(item=>item.round)).size,rule.rounds,league.id);
   assert.ok(league.fixtures.every(item=>Number.isInteger(item.leg)&&item.leg>0),league.id);
  }
  for(const division of ['D1','D2','D3']){
   const league=leagues.find(item=>item.division===division);
   const pairs=new Map();
   for(const fixture of league.fixtures){const key=[fixture.homeClubId,fixture.awayClubId].sort().join('|');if(!pairs.has(key))pairs.set(key,[]);pairs.get(key).push(fixture);}
   assert.equal(pairs.size,league.members.length*(league.members.length-1)/2);
   for(const pair of pairs.values()){assert.equal(pair.length,2);assert.equal(pair[0].homeClubId,pair[1].awayClubId);assert.equal(pair[0].awayClubId,pair[1].homeClubId);}
  }
  assert.equal(f.store.snapshot().scheduleAudit.fixtureCount,1892);
  assert.equal(f.store.snapshot().scheduleAudit.ok,true,JSON.stringify(f.store.snapshot().scheduleAudit.errors));
 }finally{f.cleanup();}
});

test('P27 migration calendrier : convertit une ancienne saison active en aller-retour sans perdre les résultats aller',()=>{
 const f=setup();try{
  const d1=f.store.activeSeason.competitions.find(item=>item.division==='D1');
  const d4=f.store.activeSeason.competitions.find(item=>item.division==='D4');
  d1.fixtures=d1.fixtures.filter(item=>item.leg===1).map(({leg,...fixture})=>fixture);
  delete d1.matchFormat;
  d1.status='active';
  d4.fixtures=d4.fixtures.map(({leg,...fixture})=>fixture);
  delete d4.matchFormat;
  f.store.persist();
  const restored=new JsonCompetitionStore(f.directory,{seasonId:'ignored'});
  const migratedD1=restored.activeSeason.competitions.find(item=>item.division==='D1');
  const migratedD4=restored.activeSeason.competitions.find(item=>item.division==='D4');
  assert.equal(migratedD1.fixtures.length,240);
  assert.equal(migratedD1.matchFormat,'home-away');
  assert.equal(migratedD1.fixtures.filter(item=>item.leg===2).length,120);
  assert.equal(migratedD4.fixtures.length,120);
  assert.equal(migratedD4.matchFormat,'single-leg');
  assert.ok(migratedD4.fixtures.every(item=>item.leg===1));
  assert.equal(restored.snapshot().scheduleAudit.ok,true,JSON.stringify(restored.snapshot().scheduleAudit.errors));
 }finally{f.cleanup();}
});

test('P27 coupe : expose un audit structurel valide du tableau complet de 156 clubs',()=>{const f=setup();try{
 const cup=f.store.snapshot().competitions.find(item=>item.type==='cup');
 const audit=f.store.snapshot().cupAudit;
 assert.equal(audit.ok,true,JSON.stringify(audit));
 assert.deepEqual({participants:audit.participants,preliminaryMatches:audit.preliminaryMatches,byes:audit.byes,rounds:audit.rounds,fixtures:audit.fixtures},{participants:156,preliminaryMatches:28,byes:100,rounds:8,fixtures:155});
}finally{f.cleanup();}});
test('P27 coupe : détecte un club engagé deux fois dans le tableau initial',()=>{const f=setup();try{
 const cup=f.store.activeSeason.competitions.find(item=>item.type==='cup');
 cup.fixtures.find(item=>item.round===1).homeClubId=cup.fixtures.filter(item=>item.round===1)[1].homeClubId;
 const audit=f.store.snapshot().cupAudit;
 assert.equal(audit.ok,false);
 assert.equal(audit.reason,'invalid-cup-preliminary-entrants');
}finally{f.cleanup();}});

test('P27 coupe : audit vérifie que le vainqueur de chaque barrage rejoint le tour principal',()=>{const f=setup();try{
 const cup=f.store.activeSeason.competitions.find(item=>item.type==='cup');
 const first=cup.fixtures.find(item=>item.round===1);
 assert.equal(f.store.recordFixtureResult(first.id,{roomId:'cup-audit-prelim',homeGoals:2,awayGoals:0}).ok,true);
 const winner=first.result.home>first.result.away?first.homeClubId:first.awayClubId;
 const target=cup.fixtures.find(item=>item.round===2&&(item.homeClubId===winner||item.awayClubId===winner));
 assert.ok(target);
 if(target.homeClubId===winner)target.homeClubId=first.awayClubId;else target.awayClubId=first.awayClubId;
 const audit=f.store.snapshot().cupAudit;
 assert.equal(audit.ok,false);
 assert.equal(audit.reason,'cup-preliminary-advancement-mismatch');
}finally{f.cleanup();}});
test('P27 coupe : audit vérifie la transmission des vainqueurs entre les tours',()=>{const f=setup();try{
 const cup=f.store.activeSeason.competitions.find(item=>item.type==='cup');
 for(const round of [1,2]){
  for(const fixture of cup.fixtures.filter(item=>item.round===round&&item.status==='scheduled'))
   assert.equal(f.store.recordFixtureResult(fixture.id,{roomId:`cup-advance-${round}-${fixture.id}`,homeGoals:2,awayGoals:1}).ok,true);
 }
 const feeder=cup.fixtures.find(item=>item.round===2&&item.status==='completed');
 const winner=feeder.result.home>feeder.result.away?feeder.homeClubId:feeder.awayClubId;
 const loser=feeder.result.home>feeder.result.away?feeder.awayClubId:feeder.homeClubId;
 const target=cup.fixtures.find(item=>item.round===3&&(item.homeClubId===winner||item.awayClubId===winner));
 assert.ok(feeder&&target);
 if(target.homeClubId===winner)target.homeClubId=loser;else target.awayClubId=loser;
 const audit=f.store.snapshot().cupAudit;
 assert.equal(audit.ok,false);
 assert.equal(audit.reason,'cup-round-advancement-mismatch');
}finally{f.cleanup();}});
test('P27 coupe : audit refuse un trophée attribué avant une finale valide',()=>{const f=setup();try{
 const cup=f.store.activeSeason.competitions.find(item=>item.type==='cup');
 cup.championClubId=cup.members[0].id;
 const audit=f.store.snapshot().cupAudit;
 assert.equal(audit.ok,false);
 assert.equal(audit.reason,'cup-champion-before-completion');
}finally{f.cleanup();}});


test('P27 coupe : dispute un match nul en rejouant le même barrage sans faire avancer un club',()=>{const f=setup();try{
 const cup=f.store.activeSeason.competitions.find(item=>item.type==='cup');
 const first=cup.fixtures.find(item=>item.round===1);
 const draw=f.store.recordFixtureResult(first.id,{roomId:'cup-replay-draw',homeGoals:1,awayGoals:1});
 assert.equal(draw.ok,true);
 assert.equal(draw.fixture.status,'replay-required');
 assert.equal(f.store.snapshot().cupAudit.ok,true,JSON.stringify(f.store.snapshot().cupAudit));
 const replay=f.store.recordFixtureResult(first.id,{roomId:'cup-replay-decider',homeGoals:2,awayGoals:1});
 assert.equal(replay.ok,true);
 assert.equal(replay.fixture.status,'completed');
 assert.equal(f.store.snapshot().cupAudit.ok,true,JSON.stringify(f.store.snapshot().cupAudit));
}finally{f.cleanup();}});

test('P27 coupe : simule les 155 rencontres jusqu’au champion et au trophée',()=>{const f=setup();try{
 const cup=f.store.activeSeason.competitions.find(item=>item.type==='cup');
 let played=0;
 for(let round=1;round<=8;round++){
  const ready=cup.fixtures.filter(item=>item.round===round&&item.status==='scheduled');
  for(const fixture of ready){
   const result=f.store.recordFixtureResult(fixture.id,{roomId:`cup-complete-${round}-${fixture.id}`,homeGoals:2,awayGoals:1});
   assert.equal(result.ok,true,JSON.stringify(result));
   played++;
  }
 }
 const audit=f.store.snapshot().cupAudit;
 assert.equal(played,155);
 assert.equal(cup.fixtures.filter(item=>item.status==='completed').length,155);
 assert.equal(cup.status,'completed');
 assert.ok(cup.championClubId);
 assert.equal(audit.ok,true,JSON.stringify(audit));
 assert.equal(audit.completedFixtures,155);
 assert.equal(audit.championClubId,cup.championClubId);
 assert.ok(f.store.activeSeason.trophies.some(item=>item.competitionId===cup.id&&item.clubId===cup.championClubId));
}finally{f.cleanup();}});


test('P27 barrages : un nul impose une revanche et seul le vainqueur de la finale obtient la montée',()=>{
 const f=setup();try{
  for(const competition of f.store.activeSeason.competitions) if(competition.type==='league') competition.status='completed';
  f.store.previewSeasonMovements();
  const playoff=f.store.activeSeason.competitions.find(item=>item.type==='promotion-playoff'&&item.division==='D2');
  const semifinal=playoff.fixtures.find(item=>item.round===1);
  assert.equal(f.store.recordFixtureResult(semifinal.id,{roomId:'playoff-draw',homeGoals:1,awayGoals:1}).ok,true);
  assert.equal(semifinal.status,'replay-required');
  assert.equal(playoff.fixtures.find(item=>item.round===2).status,'waiting');
  assert.equal(f.store.recordFixtureResult(semifinal.id,{roomId:'playoff-replay',homeGoals:2,awayGoals:1}).ok,true);
  const other=playoff.fixtures.find(item=>item.round===1&&item.id!==semifinal.id);
  assert.equal(f.store.recordFixtureResult(other.id,{roomId:'playoff-semi-2',homeGoals:2,awayGoals:0}).ok,true);
  const final=playoff.fixtures.find(item=>item.round===2);
  assert.equal(final.status,'scheduled');
  assert.equal(f.store.recordFixtureResult(final.id,{roomId:'playoff-final',homeGoals:0,awayGoals:2}).ok,true);
  assert.equal(playoff.status,'completed');
  assert.equal(playoff.championClubId,final.awayClubId);
  finishPromotionPlayoffs(f.store);
  const preview=f.store.previewSeasonMovements();
  assert.equal(preview.ok,true,JSON.stringify(preview));
  const promotion=preview.movements.find(item=>item.fromDivision==='D2'&&item.type==='promotion'&&item.qualificationStage==='playoff');
  assert.equal(promotion.clubId,final.awayClubId);
  assert.ok(promotion.finalPosition>=4&&promotion.finalPosition<=7);
 }finally{f.cleanup();}
});
