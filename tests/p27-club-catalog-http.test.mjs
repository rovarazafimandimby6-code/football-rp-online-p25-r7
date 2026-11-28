import test from 'node:test';
import assert from 'node:assert/strict';
import { server } from '../server/index.js';

test('P27 API HTTP : catalogue consultable, filtrable et protégé contre les filtres invalides', async () => {
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const address=server.address();
  const base='http://127.0.0.1:'+address.port;
  try {
    const allResponse=await fetch(base+'/api/clubs?limit=100');
    assert.equal(allResponse.status,200);
    const all=await allResponse.json();
    assert.equal(all.total,156);
    assert.equal(all.clubs.length,100);
    assert.ok(all.clubs.every(club=>!Object.hasOwn(club,'roster')));

    const structureResponse=await fetch(base+'/api/league-structure');
    assert.equal(structureResponse.status,200);
    const structure=await structureResponse.json();
    assert.equal(structure.complete,true);
    assert.equal(structure.currentClubCount,156);
    assert.deepEqual(structure.divisionCounts,{D1:16,D2:20,D3:24,D4:32,D5:64});
    assert.deepEqual(structure.conferenceCounts.D4,{A:16,B:16});
    assert.deepEqual(structure.conferenceCounts.D5,{A:16,B:16,C:16,D:16});

    const competitionResponse=await fetch(base+'/api/competitions');
    assert.equal(competitionResponse.status,200);
    const competitionSnapshot=await competitionResponse.json();
    const leagueCompetitions=competitionSnapshot.competitions.filter(item=>item.type==='league');
    assert.equal(leagueCompetitions.length,9);
    assert.equal(competitionSnapshot.scheduleAudit.ok,true);
    assert.equal(competitionSnapshot.scheduleAudit.fixtureCount,1892);
    assert.equal(competitionSnapshot.cupAudit.ok,true);
    assert.deepEqual({participants:competitionSnapshot.cupAudit.participants,preliminaryMatches:competitionSnapshot.cupAudit.preliminaryMatches,byes:competitionSnapshot.cupAudit.byes,rounds:competitionSnapshot.cupAudit.rounds,fixtures:competitionSnapshot.cupAudit.fixtures},{participants:156,preliminaryMatches:28,byes:100,rounds:8,fixtures:155});
    const expectedFormats={D1:['home-away',240],D2:['home-away',380],D3:['home-away',552],D4:['single-leg',120],D5:['single-leg',120]};
    for(const competition of leagueCompetitions){const [format,count]=expectedFormats[competition.division];assert.equal(competition.matchFormat,format);assert.equal(competition.fixtures.length,count);}
    assert.ok(leagueCompetitions.every(item=>item.standings.length===item.targetClubCount));
    const cup=competitionSnapshot.competitions.find(item=>item.type==='cup');
    assert.equal(cup.members.length,156);
    assert.equal(cup.fixtures.length,155);

    const conferenceResponse=await fetch(base+'/api/clubs?division=D4&conference=A');
    assert.equal(conferenceResponse.status,200);
    const conference=await conferenceResponse.json();
    assert.equal(conference.total,16);
    assert.ok(conference.clubs.every(club=>club.division==='D4'&&club.conference==='A'));

    const detailResponse=await fetch(base+'/api/clubs/antsiranana-north-fc');
    assert.equal(detailResponse.status,200);
    const detail=await detailResponse.json();
    assert.equal(detail.club.name,'Antsiranana North');
    assert.equal(detail.club.conference,'A');
    assert.equal(Object.hasOwn(detail.club,'roster'),false);

    const invalidResponse=await fetch(base+'/api/clubs?division=D6');
    assert.equal(invalidResponse.status,400);
    assert.equal((await invalidResponse.json()).error,'INVALID_DIVISION');
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
