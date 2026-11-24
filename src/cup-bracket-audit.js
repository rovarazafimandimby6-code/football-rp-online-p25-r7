const ROUND_COUNTS = Object.freeze({1:28,2:64,3:32,4:16,5:8,6:4,7:2,8:1});
const TOTAL_FIXTURES = Object.values(ROUND_COUNTS).reduce((sum,count)=>sum+count,0);
const ALLOWED_STATUSES = new Set(['waiting','scheduled','completed','replay-required']);

const winnerOf = fixture => fixture.result.home > fixture.result.away
  ? fixture.homeClubId : fixture.awayClubId;

/** Validate the 156-entry knockout bracket and every completed progression step. */
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
    if(!ALLOWED_STATUSES.has(fixture.status)) return fail('invalid-cup-fixture-status',{fixtureId:fixture.id,status:fixture.status});
    if(!rounds.has(fixture.round)) rounds.set(fixture.round,[]);
    rounds.get(fixture.round).push(fixture);
    const home=fixture.homeClubId||null,away=fixture.awayClubId||null;
    if((home&&!memberIds.has(home))||(away&&!memberIds.has(away))||(home&&away&&home===away))
      return fail('invalid-cup-fixture-participants',{fixtureId:fixture.id});
    if(fixture.status==='scheduled'&&(!home||!away||fixture.result))
      return fail('invalid-scheduled-cup-fixture',{fixtureId:fixture.id});
    if(fixture.status==='waiting'&&(home&&away||fixture.result))
      return fail('invalid-waiting-cup-fixture',{fixtureId:fixture.id});
    if(fixture.status==='completed'&&(!home||!away||!fixture.result||
      !Number.isSafeInteger(fixture.result.home)||!Number.isSafeInteger(fixture.result.away)||
      fixture.result.home<0||fixture.result.away<0||fixture.result.home===fixture.result.away))
      return fail('invalid-completed-cup-result',{fixtureId:fixture.id});
    if(fixture.status==='replay-required'&&(!home||!away||!fixture.result||
      !Number.isSafeInteger(fixture.result.home)||fixture.result.home!==fixture.result.away))
      return fail('invalid-cup-replay-state',{fixtureId:fixture.id});
  }
  for(const [round,expected] of Object.entries(ROUND_COUNTS)) {
    const actual=rounds.get(Number(round))?.length||0;
    if(actual!==expected) return fail('invalid-cup-round-fixture-count',{round:Number(round),expected,actual});
  }

  const preliminary=rounds.get(1)||[];
  const preliminaryPlayers=preliminary.flatMap(item=>[item.homeClubId,item.awayClubId]);
  if(preliminaryPlayers.length!==56||preliminaryPlayers.some(id=>!id)||new Set(preliminaryPlayers).size!==56)
    return fail('invalid-cup-preliminary-entrants',{expected:56,actual:preliminaryPlayers.length});
  const preliminarySet=new Set(preliminaryPlayers);
  const roundTwoPlayers=(rounds.get(2)||[]).flatMap(item=>[item.homeClubId,item.awayClubId].filter(Boolean));
  const seededPlayers=roundTwoPlayers.filter(id=>!preliminarySet.has(id));
  if(seededPlayers.length!==100||new Set(seededPlayers).size!==100)
    return fail('invalid-cup-bye-entrants',{expected:100,actual:seededPlayers.length});
  const allEntrants=new Set([...preliminaryPlayers,...seededPlayers]);
  if(allEntrants.size!==156||[...memberIds].some(id=>!allEntrants.has(id))||[...allEntrants].some(id=>!memberIds.has(id)))
    return fail('cup-entrants-not-exactly-once',{actual:allEntrants.size});

  const preliminaryWinners=new Set(preliminary.filter(item=>item.status==='completed').map(winnerOf));
  const preliminaryAdvancers=new Set(roundTwoPlayers.filter(id=>preliminarySet.has(id)));
  if(preliminaryWinners.size!==preliminaryAdvancers.size||[...preliminaryWinners].some(id=>!preliminaryAdvancers.has(id)))
    return fail('cup-preliminary-advancement-mismatch',{expected:preliminaryWinners.size,actual:preliminaryAdvancers.size});

  for(let round=2;round<=7;round++) {
    const winners=new Set((rounds.get(round)||[]).filter(item=>item.status==='completed').map(winnerOf));
    const nextPlayers=(rounds.get(round+1)||[]).flatMap(item=>[item.homeClubId,item.awayClubId].filter(Boolean));
    const nextSet=new Set(nextPlayers);
    if(nextPlayers.length!==winners.size||nextSet.size!==winners.size||[...winners].some(id=>!nextSet.has(id)))
      return fail('cup-round-advancement-mismatch',{round,expected:winners.size,actual:nextPlayers.length});
  }

  const final=rounds.get(8)?.[0];
  if(competition.status==='completed') {
    if(fixtures.some(item=>item.status!=='completed')||!final||!competition.championClubId||
      competition.championClubId!==winnerOf(final))
      return fail('cup-completion-without-valid-final-winner');
  } else if(competition.championClubId) {
    return fail('cup-champion-before-completion');
  }
  return {ok:true,participants:156,preliminaryMatches:28,byes:100,rounds:8,fixtures:TOTAL_FIXTURES,completedFixtures:fixtures.filter(item=>item.status==='completed').length,championClubId:competition.championClubId||null};
}
