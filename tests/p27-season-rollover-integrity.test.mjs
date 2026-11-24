import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JsonCompetitionStore } from '../server/competition-store.js';

const finishPromotionPlayoffs=store=>{
  store.previewSeasonMovements();
  for(const round of [1,2]){
    const fixtures=store.activeSeason.competitions.filter(item=>item.type==='promotion-playoff').flatMap(item=>item.fixtures.filter(fixture=>fixture.round===round&&fixture.status==='scheduled'));
    for(const fixture of fixtures) assert.equal(store.recordFixtureResult(fixture.id,{roomId:'rollover-'+fixture.id,homeGoals:2,awayGoals:1}).ok,true);
  }
};

test('P27 transition de saison : conserve les 156 clubs et les quotas après rechargement', () => {
  const directory=mkdtempSync(path.join(tmpdir(),'p27-rollover-audit-'));
  try {
    const store=new JsonCompetitionStore(directory,{seasonId:'2026-27',now:()=>1000});
    for(const competition of store.activeSeason.competitions) competition.status='completed';
    finishPromotionPlayoffs(store);
    const preview=store.previewSeasonMovements();
    assert.equal(preview.ok,true,JSON.stringify(preview));
    const finalized=store.finalizeSeason({nextSeasonId:'2027-28',movements:preview.movements,completedAt:2000});
    assert.equal(finalized.ok,true,JSON.stringify(finalized));
    const restored=new JsonCompetitionStore(directory,{seasonId:'unused',now:()=>3000});
    const snapshot=restored.snapshot();
    assert.equal(snapshot.season.id,'2027-28');
    assert.equal(snapshot.scheduleAudit.ok,true,JSON.stringify(snapshot.scheduleAudit.errors));
    assert.equal(snapshot.scheduleAudit.leagueCount,9);
    assert.equal(snapshot.scheduleAudit.fixtureCount,1892);
    const leagues=snapshot.competitions.filter(item=>item.type==='league');
    assert.equal(leagues.length,9);
    assert.deepEqual(leagues.filter(item=>item.division==='D4').map(item=>[item.conference,item.members.length]),[['A',16],['B',16]]);
    assert.deepEqual(leagues.filter(item=>item.division==='D5').map(item=>[item.conference,item.members.length]),[['A',16],['B',16],['C',16],['D',16]]);
    assert.equal(snapshot.competitions.find(item=>item.type==='cup').members.length,156);
    assert.equal(new Set(snapshot.competitions.find(item=>item.type==='cup').members.map(item=>item.id)).size,156);
  } finally {
    rmSync(directory,{recursive:true,force:true});
  }
});


test('P27 renouvellement pluri-saisons : conserve 156 clubs et les capacités de chaque groupe sur trois saisons', () => {
  const directory=mkdtempSync(path.join(tmpdir(),'p27-multi-season-'));
  try {
    const store=new JsonCompetitionStore(directory,{seasonId:'2026-27',now:()=>1000});
    const expectedDivisions={D1:16,D2:20,D3:24,D4:32,D5:64};
    const expectedConferences={D4:{A:16,B:16},D5:{A:16,B:16,C:16,D:16}};
    for(let year=2027;year<=2029;year++){
      for(const competition of store.activeSeason.competitions) if(competition.type==='league'||competition.type==='cup') competition.status='completed';
      finishPromotionPlayoffs(store);
      const preview=store.previewSeasonMovements();
      assert.equal(preview.ok,true,JSON.stringify(preview));
      assert.equal(preview.promotions,20);
      assert.equal(preview.relegations,20);
      const nextId=`${year}-${String(year+1).slice(-2)}`;
      const result=store.finalizeSeason({nextSeasonId:nextId,movements:preview.movements,completedAt:year*1000});
      assert.equal(result.ok,true,JSON.stringify(result));
      const clubs=[...store.clubs.values()];
      assert.equal(clubs.length,156);
      assert.equal(new Set(clubs.map(club=>club.id)).size,156);
      const counts=Object.fromEntries(Object.keys(expectedDivisions).map(division=>[division,clubs.filter(club=>club.division===division).length]));
      assert.deepEqual(counts,expectedDivisions);
      for(const division of ['D4','D5']){
        const groups=Object.fromEntries(Object.keys(expectedConferences[division]).map(conference=>[conference,clubs.filter(club=>club.division===division&&club.conference===conference).length]));
        assert.deepEqual(groups,expectedConferences[division]);
      }
      const restored=new JsonCompetitionStore(directory,{seasonId:'unused',now:()=>year*1000+1});
      assert.equal(restored.clubs.size,156);
      assert.equal(restored.snapshot().scheduleAudit.ok,true,JSON.stringify(restored.snapshot().scheduleAudit.errors));
      assert.equal(restored.snapshot().cupAudit.ok,true,JSON.stringify(restored.snapshot().cupAudit));
    }
    assert.equal(store.seasonHistory().filter(season=>season.status==='completed').length,3);
  } finally {
    rmSync(directory,{recursive:true,force:true});
  }
});


test('P27 transition de saison : restaure intégralement clubs et archives si la persistance finale échoue',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'p27-rollover-rollback-'));
 try {
  const store=new JsonCompetitionStore(directory,{seasonId:'2026-27',now:()=>1000});
  for(const competition of store.activeSeason.competitions) competition.status='completed';
  finishPromotionPlayoffs(store);
  const preview=store.previewSeasonMovements();
  assert.equal(preview.ok,true,JSON.stringify(preview));
  const beforeAssignments=[...store.clubs.values()].map(club=>({id:club.id,division:club.division,conference:club.conference}));
  const originalPersist=store.persist.bind(store);
  store.persist=()=>{throw new Error('simulated-disk-failure');};
  assert.throws(()=>store.finalizeSeason({nextSeasonId:'2027-28',movements:preview.movements,completedAt:2000}),/simulated-disk-failure/);
  store.persist=originalPersist;
  assert.equal(store.seasonHistory().length,1);
  assert.equal(store.activeSeason.id,'2026-27');
  assert.equal(store.activeSeason.status,'active');
  assert.deepEqual([...store.clubs.values()].map(club=>({id:club.id,division:club.division,conference:club.conference})),beforeAssignments);
  const restored=new JsonCompetitionStore(directory,{seasonId:'ignored',now:()=>3000});
  assert.equal(restored.seasonHistory().length,1);
  assert.equal(restored.activeSeason.id,'2026-27');
 } finally {
  rmSync(directory,{recursive:true,force:true});
 }
});


test('P27 archives de saison : contrôle une chronologie unique et refuse une transition antidatée invalide',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'p27-season-timeline-'));
 try {
  const store=new JsonCompetitionStore(directory,{seasonId:'2026-27',now:()=>1000});
  const first=store.snapshot();
  assert.equal(first.timelineAudit.ok,true,JSON.stringify(first.timelineAudit));
  const invalid=store.finalizeSeason({nextSeasonId:'invalid-time',movements:[],completedAt:-1});
  assert.equal(invalid.ok,false);
  assert.equal(invalid.reason,'invalid-season-transition');
  for(const competition of store.activeSeason.competitions) competition.status='completed';
  finishPromotionPlayoffs(store);
  const preview=store.previewSeasonMovements();
  assert.equal(preview.ok,true,JSON.stringify(preview));
  assert.equal(store.finalizeSeason({nextSeasonId:'2027-28',movements:preview.movements,completedAt:2000}).ok,true);
  const snapshot=store.snapshot();
  assert.equal(snapshot.timelineAudit.ok,true,JSON.stringify(snapshot.timelineAudit));
  assert.equal(snapshot.timelineAudit.seasons,2);
  assert.equal(snapshot.timelineAudit.completedSeasons,1);
  const restored=new JsonCompetitionStore(directory,{seasonId:'unused',now:()=>3000});
  assert.equal(restored.snapshot().timelineAudit.ok,true);
  restored.state.seasons[0].id=restored.state.seasons[1].id;
  assert.equal(restored.snapshot().timelineAudit.reason,'season-id-invalid-or-duplicate');
 } finally {rmSync(directory,{recursive:true,force:true});}
});
