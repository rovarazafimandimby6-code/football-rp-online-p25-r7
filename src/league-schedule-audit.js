import { LEAGUE_DIVISIONS } from './league-structure.js';

const TARGETS=Object.freeze(Object.fromEntries(LEAGUE_DIVISIONS.map(item=>[item.id,item.targetClubs])));
export const LEAGUE_MATCH_FORMATS=Object.freeze({D1:'home-away',D2:'home-away',D3:'home-away',D4:'single-leg',D5:'single-leg'});

/** Audit the division-specific league calendar without changing its fixtures. */
export function auditLeagueSchedule(competition) {
  const fail=(reason,details={})=>({ok:false,reason,...details});
  if(!competition||competition.type!=='league'||!TARGETS[competition.division]) return fail('invalid-league-competition');
  const members=Array.isArray(competition.members)?competition.members:[];
  const expected=competition.conference?16:TARGETS[competition.division];
  if(members.length!==expected||new Set(members.map(item=>item.id)).size!==expected) return fail('invalid-league-members',{expected,actual:members.length});
  const ids=new Set(members.map(item=>item.id));
  for(const member of members) {
    if(member.division!==undefined&&member.division!==competition.division) return fail('member-division-mismatch',{clubId:member.id,expected:competition.division,actual:member.division});
    if(member.conference!==undefined&&(member.conference||null)!==(competition.conference||null)) return fail('member-conference-mismatch',{clubId:member.id,expected:competition.conference||null,actual:member.conference||null});
  }
  const format=LEAGUE_MATCH_FORMATS[competition.division];
  const expectedLegs=format==='home-away'?2:1;
  const expectedRounds=(expected-1)*expectedLegs;
  const baseMatches=expected*(expected-1)/2;
  const expectedMatches=baseMatches*expectedLegs;
  const fixtures=Array.isArray(competition.fixtures)?competition.fixtures:[];
  if(fixtures.length!==expectedMatches) return fail('invalid-fixture-count',{expected:expectedMatches,actual:fixtures.length});
  if(competition.matchFormat!==undefined&&competition.matchFormat!==format) return fail('invalid-match-format',{expected:format,actual:competition.matchFormat});
  const fixtureIds=new Set(), pairLegs=new Map(), roundPlayers=new Map();
  const appearances=new Map([...ids].map(id=>[id,0]));
  const homeCounts=new Map([...ids].map(id=>[id,0]));
  const awayCounts=new Map([...ids].map(id=>[id,0]));
  for(const fixture of fixtures) {
    if(!fixture?.id||fixtureIds.has(fixture.id)) return fail('duplicate-fixture-id',{fixtureId:fixture?.id||null});
    fixtureIds.add(fixture.id);
    if(fixture.competitionId&&fixture.competitionId!==competition.id) return fail('fixture-competition-link-mismatch',{fixtureId:fixture.id,expected:competition.id,actual:fixture.competitionId});
    if(!['scheduled','completed'].includes(fixture.status)) return fail('invalid-league-fixture-status',{fixtureId:fixture.id,status:fixture.status});
    if(fixture.status==='scheduled'&&fixture.result) return fail('scheduled-fixture-has-result',{fixtureId:fixture.id});
    if(fixture.status==='completed'&&(!fixture.result||!Number.isSafeInteger(fixture.result.home)||!Number.isSafeInteger(fixture.result.away)||fixture.result.home<0||fixture.result.away<0)) return fail('completed-fixture-result-invalid',{fixtureId:fixture.id});
    const home=fixture.homeClubId,away=fixture.awayClubId;
    if(!ids.has(home)||!ids.has(away)||home===away) return fail('invalid-fixture-participants',{fixtureId:fixture.id});
    const leg=fixture.leg??1;
    if(!Number.isSafeInteger(leg)||leg<1||leg>expectedLegs) return fail('invalid-fixture-leg',{fixtureId:fixture.id,leg});
    const pair=[home,away].sort().join('|');
    if(!pairLegs.has(pair)) pairLegs.set(pair,new Map());
    const legs=pairLegs.get(pair);
    if(legs.has(leg)) return fail('duplicate-league-pairing',{fixtureId:fixture.id,pair,leg});
    legs.set(leg,{home,away});
    if(!Number.isSafeInteger(fixture.round)||fixture.round<1||fixture.round>expectedRounds) return fail('invalid-fixture-round',{fixtureId:fixture.id,round:fixture.round});
    if(!roundPlayers.has(fixture.round)) roundPlayers.set(fixture.round,new Set());
    const active=roundPlayers.get(fixture.round);
    if(active.has(home)||active.has(away)) return fail('club-scheduled-twice-in-round',{fixtureId:fixture.id,round:fixture.round});
    active.add(home);active.add(away);
    appearances.set(home,appearances.get(home)+1);appearances.set(away,appearances.get(away)+1);
    homeCounts.set(home,homeCounts.get(home)+1);awayCounts.set(away,awayCounts.get(away)+1);
  }
  if(pairLegs.size!==baseMatches) return fail('incomplete-league-pairings',{expected:baseMatches,actual:pairLegs.size});
  for(const [pair,legs] of pairLegs) {
    if(legs.size!==expectedLegs) return fail('incomplete-league-pairing-legs',{pair,expected:expectedLegs,actual:legs.size});
    if(expectedLegs===2) {
      const first=legs.get(1),second=legs.get(2);
      if(!first||!second||first.home!==second.away||first.away!==second.home) return fail('invalid-home-away-return-leg',{pair});
    }
  }
  if(roundPlayers.size!==expectedRounds) return fail('incomplete-round-count',{expected:expectedRounds,actual:roundPlayers.size});
  for(let round=1;round<=expectedRounds;round++) if(!roundPlayers.has(round)||roundPlayers.get(round).size!==expected)
    return fail('incomplete-round',{round,expectedPlayers:expected,actual:roundPlayers.get(round)?.size||0});
  for(const id of ids) {
    if(appearances.get(id)!==expectedRounds) return fail('invalid-club-appearance-count',{clubId:id,actual:appearances.get(id)});
    if(expectedLegs===2 ? homeCounts.get(id)!==awayCounts.get(id) : Math.abs(homeCounts.get(id)-awayCounts.get(id))>1)
      return fail('unbalanced-home-away-count',{clubId:id,home:homeCounts.get(id),away:awayCounts.get(id)});
  }
  const standings=Array.isArray(competition.standings)?competition.standings:[];
  if(standings.length!==expected||new Set(standings.map(row=>row?.id)).size!==expected||standings.some(row=>!ids.has(row.id)))
    return fail('invalid-league-standings-members',{expected,actual:standings.length});
  const calculated=new Map([...ids].map(id=>[id,{played:0,wins:0,draws:0,losses:0,goalsFor:0,goalsAgainst:0,points:0}]));
  for(const fixture of fixtures) {
    if(fixture.status!=='completed')continue;
    const home=calculated.get(fixture.homeClubId),away=calculated.get(fixture.awayClubId);
    const hg=fixture.result.home,ag=fixture.result.away;
    if(hg>99||ag>99)return fail('completed-fixture-result-invalid',{fixtureId:fixture.id});
    home.played++;away.played++;home.goalsFor+=hg;home.goalsAgainst+=ag;away.goalsFor+=ag;away.goalsAgainst+=hg;
    if(hg>ag){home.wins++;home.points+=3;away.losses++;}
    else if(ag>hg){away.wins++;away.points+=3;home.losses++;}
    else{home.draws++;away.draws++;home.points++;away.points++;}
  }
  for(const row of standings) {
    const expectedStats=calculated.get(row.id);
    for(const key of ['played','wins','draws','losses','goalsFor','goalsAgainst','points']) {
      if(!Number.isSafeInteger(row[key])||row[key]<0||row[key]!==expectedStats[key])
        return fail('league-standings-fixture-mismatch',{clubId:row.id,field:key,expected:expectedStats[key],actual:row[key]});
    }
  }
  return {ok:true,division:competition.division,conference:competition.conference||null,matchFormat:format,legs:expectedLegs,clubs:expected,rounds:expectedRounds,fixtures:fixtures.length,completedFixtures:fixtures.filter(item=>item.status==='completed').length,appearancesPerClub:expectedRounds};
}

export function auditLeagueSchedules(competitions=[]) {
  const leagues=competitions.filter(item=>item.type==='league');
  const audits=leagues.map(competition=>({competitionId:competition.id,name:competition.name,...auditLeagueSchedule(competition)}));
  const errors=audits.filter(item=>!item.ok);
  return {ok:leagues.length===9&&errors.length===0,leagueCount:leagues.length,fixtureCount:audits.reduce((total,item)=>total+(item.fixtures||0),0),errors,competitions:audits};
}
