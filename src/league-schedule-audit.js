import { LEAGUE_DIVISIONS } from './league-structure.js';

const TARGETS=Object.freeze(Object.fromEntries(LEAGUE_DIVISIONS.map(item=>[item.id,item.targetClubs])));

/** Audit a single round-robin league calendar without changing its fixtures. */
export function auditLeagueSchedule(competition) {
  const fail=(reason,details={})=>({ok:false,reason,...details});
  if(!competition||competition.type!=='league'||!TARGETS[competition.division])
    return fail('invalid-league-competition');
  const members=Array.isArray(competition.members)?competition.members:[];
  const expected=competition.conference?16:TARGETS[competition.division];
  if(members.length!==expected||new Set(members.map(item=>item.id)).size!==expected)
    return fail('invalid-league-members',{expected,actual:members.length});
  const ids=new Set(members.map(item=>item.id));
  for(const member of members) {
    if(member.division!==undefined && member.division!==competition.division)
      return fail('member-division-mismatch',{clubId:member.id,expected:competition.division,actual:member.division});
    if(member.conference!==undefined && (member.conference||null)!==(competition.conference||null))
      return fail('member-conference-mismatch',{clubId:member.id,expected:competition.conference||null,actual:member.conference||null});
  }
  const fixtures=Array.isArray(competition.fixtures)?competition.fixtures:[];
  const expectedMatches=expected*(expected-1)/2;
  if(fixtures.length!==expectedMatches)
    return fail('invalid-fixture-count',{expected:expectedMatches,actual:fixtures.length});
  const fixtureIds=new Set();
  const pairs=new Set();
  const roundPlayers=new Map();
  const appearances=new Map([...ids].map(id=>[id,0]));
  const homeCounts=new Map([...ids].map(id=>[id,0]));
  const awayCounts=new Map([...ids].map(id=>[id,0]));
  for(const fixture of fixtures) {
    if(!fixture?.id||fixtureIds.has(fixture.id))return fail('duplicate-fixture-id',{fixtureId:fixture?.id||null});
    fixtureIds.add(fixture.id);
    const home=fixture.homeClubId,away=fixture.awayClubId;
    if(!ids.has(home)||!ids.has(away)||home===away)return fail('invalid-fixture-participants',{fixtureId:fixture.id});
    const pair=[home,away].sort().join('|');
    if(pairs.has(pair))return fail('duplicate-league-pairing',{fixtureId:fixture.id,pair});
    pairs.add(pair);
    if(!Number.isSafeInteger(fixture.round)||fixture.round<1||fixture.round>=expected)
      return fail('invalid-fixture-round',{fixtureId:fixture.id,round:fixture.round});
    if(!roundPlayers.has(fixture.round))roundPlayers.set(fixture.round,new Set());
    const active=roundPlayers.get(fixture.round);
    if(active.has(home)||active.has(away))return fail('club-scheduled-twice-in-round',{fixtureId:fixture.id,round:fixture.round});
    active.add(home);active.add(away);
    appearances.set(home,appearances.get(home)+1);appearances.set(away,appearances.get(away)+1);
    homeCounts.set(home,homeCounts.get(home)+1);awayCounts.set(away,awayCounts.get(away)+1);
  }
  if(pairs.size!==expectedMatches)return fail('incomplete-league-pairings',{expected:expectedMatches,actual:pairs.size});
  if(roundPlayers.size!==expected-1)return fail('incomplete-round-count',{expected:expected-1,actual:roundPlayers.size});
  for(let round=1;round<expected;round++) {
    if(!roundPlayers.has(round)||roundPlayers.get(round).size!==expected)
      return fail('incomplete-round',{round,expectedPlayers:expected,actual:roundPlayers.get(round)?.size||0});
  }
  for(const id of ids) {
    if(appearances.get(id)!==expected-1)return fail('invalid-club-appearance-count',{clubId:id,actual:appearances.get(id)});
    if(Math.abs(homeCounts.get(id)-awayCounts.get(id))>1)return fail('unbalanced-home-away-count',{clubId:id,home:homeCounts.get(id),away:awayCounts.get(id)});
  }
  return {ok:true,division:competition.division,conference:competition.conference||null,clubs:expected,rounds:expected-1,fixtures:fixtures.length,appearancesPerClub:expected-1};
}

export function auditLeagueSchedules(competitions=[]) {
  const leagues=competitions.filter(item=>item.type==='league');
  const audits=leagues.map(competition=>({competitionId:competition.id,name:competition.name,...auditLeagueSchedule(competition)}));
  const errors=audits.filter(item=>!item.ok);
  return {
    ok:leagues.length===9&&errors.length===0,
    leagueCount:leagues.length,
    fixtureCount:audits.reduce((total,item)=>total+(item.fixtures||0),0),
    errors,
    competitions:audits
  };
}
