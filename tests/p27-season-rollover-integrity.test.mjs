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
