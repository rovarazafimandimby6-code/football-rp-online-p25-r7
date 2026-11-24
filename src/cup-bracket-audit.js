const ROUND_COUNTS = Object.freeze({1:28,2:64,3:32,4:16,5:8,6:4,7:2,8:1});
const TOTAL_FIXTURES = Object.values(ROUND_COUNTS).reduce((sum,count)=>sum+count,0);

/** Validate the 156-entry knockout bracket, including its 28 preliminary ties and 100 byes. */
export function auditCupBracket(competition) {
  const fail=(reason,details={})=>({ok:false,reason,...details});
  if(!competition||competition.type!=='cup') return fail('invalid-cup-competition');
  const members=Array.isArray(competition.members)?competition.members:[];
  if(members.length!==156||members.some(item=>!item?.id)||new Set(members.map(item=>item.id)).size!==156)
    return fail('invalid-cup-members',{expected:156,actual:members.length});
  const memberIds=new Set(members.map(item=>item.id));
  const fixtures=Array.isArray(competition.fixtures)?competition.fixtures:[];
  if(fixtures.length!==TOTAL_FIXTURES) return fail('invalid-cup-fixture-count',{expected:TOTAL_FIXTURES,actual:fixtures.length});
  const fixtureIds=new Set(), rounds=new Map();
  for(const fixture of fixtures) {
    if(!fixture?.id||fixtureIds.has(fixture.id)) return fail('duplicate-cup-fixture-id',{fixtureId:fixture?.id||null});
    fixtureIds.add(fixture.id);
    if(fixture.type!=='cup'||fixture.competitionId!==competition.id) return fail('cup-fixture-competition-mismatch',{fixtureId:fixture.id});
    if(!Number.isSafeInteger(fixture.round)||!ROUND_COUNTS[fixture.round]) return fail('invalid-cup-round',{fixtureId:fixture.id,round:fixture.round});
    if(!rounds.has(fixture.round)) rounds.set(fixture.round,[]);
    rounds.get(fixture.round).push(fixture);
    const home=fixture.homeClubId||null,away=fixture.awayClubId||null;
    if((home&&!memberIds.has(home))||(away&&!memberIds.has(away))||(home&&away&&home===away))
      return fail('invalid-cup-fixture-participants',{fixtureId:fixture.id});
    if(['scheduled','completed','replay-required'].includes(fixture.status)&&(!home||!away))
      return fail('cup-ready-fixture-missing-participant',{fixtureId:fixture.id});
    if(fixture.status==='completed'&&(!fixture.result||!Number.isSafeInteger(fixture.result.home)||!Number.isSafeInteger(fixture.result.away)||fixture.result.home<0||fixture.result.away<0||fixture.result.home===fixture.result.away))
      return fail('invalid-completed-cup-result',{fixtureId:fixture.id});
    if(fixture.status==='replay-required'&&(!fixture.result||fixture.result.home!==fixture.result.away))
      return fail('invalid-cup-replay-state',{fixtureId:fixture.id});
  }
  for(const [round,expected] of Object.entries(ROUND_COUNTS)) {
    const actual=rounds.get(Number(round))?.length||0;
    if(actual!==expected) return fail('invalid-cup-round-fixture-count',{round:Number(round),expected,actual});
  }
  const preliminary=rounds.get(1)||[];
  const preliminaryPlayers=preliminary.flatMap(item=>[item.homeClubId,item.awayClubId]);
  if(preliminaryPlayers.length!==56||new Set(preliminaryPlayers).size!==56)
    return fail('invalid-cup-preliminary-entrants',{expected:56,actual:preliminaryPlayers.length});
  const preliminarySet=new Set(preliminaryPlayers);
  const seededPlayers=(rounds.get(2)||[]).flatMap(item=>[item.homeClubId,item.awayClubId].filter(Boolean)).filter(id=>!preliminarySet.has(id));
  if(seededPlayers.length!==100||new Set(seededPlayers).size!==100||seededPlayers.some(id=>preliminarySet.has(id)))
    return fail('invalid-cup-bye-entrants',{expected:100,actual:seededPlayers.length});
  if(new Set([...preliminaryPlayers,...seededPlayers]).size!==156)
    return fail('cup-entrants-not-exactly-once',{actual:new Set([...preliminaryPlayers,...seededPlayers]).size});
  const preliminaryWinnersExpected=28;
  const unresolvedRoundTwo=(rounds.get(2)||[]).filter(item=>!item.homeClubId||!item.awayClubId);
  if(unresolvedRoundTwo.length>preliminaryWinnersExpected)
    return fail('too-many-cup-preliminary-winner-slots',{expectedMaximum:preliminaryWinnersExpected,actual:unresolvedRoundTwo.length});
  const final=rounds.get(8)?.[0];
  if(competition.status==='completed'&&(!final||final.status!=='completed'||!competition.championClubId))
    return fail('cup-completion-without-final-winner');
  return {ok:true,participants:156,preliminaryMatches:28,byes:100,rounds:8,fixtures:TOTAL_FIXTURES,championClubId:competition.championClubId||null};
}
