import { LEAGUE_DIVISIONS, conferenceForClub } from './league-structure.js';

export const DEFAULT_SEASON_MOVEMENT_POLICY = Object.freeze({
  id:'p27-approved-20-20',
  status:'approved',
  description:'20 promotions et 20 relégations : promotions directes et barrages de montée, relégations directes.',
  nationalDirectPromotionSlots:3,
  nationalRelegationSlots:4,
  d4DirectPromotionSlotsPerConference:1,
  d4RelegationSlotsPerConference:4,
  d5DirectPromotionSlotsPerConference:1,
  d5ToD4Conference:Object.freeze({A:'A',B:'A',C:'B',D:'B'}),
  d4ToD5Conference:Object.freeze({A:Object.freeze(['A','B']),B:Object.freeze(['C','D'])})
});

const DIVISION_ORDER=Object.freeze({D1:1,D2:2,D3:3,D4:4,D5:5});
const TARGETS=Object.freeze(Object.fromEntries(LEAGUE_DIVISIONS.map(item=>[item.id,item.targetClubs])));
export const EXPECTED_LEAGUE_GROUPS=Object.freeze([
  ['D1',null],['D2',null],['D3',null],
  ['D4','A'],['D4','B'],
  ['D5','A'],['D5','B'],['D5','C'],['D5','D']
]);
export const REQUIRED_PROMOTION_PLAYOFFS=Object.freeze([
  ['D2',null],['D3',null],
  ['D4','A'],['D4','B'],
  ['D5','A'],['D5','B'],['D5','C'],['D5','D']
]);

const fail=(reason,details={})=>({ok:false,reason,...details,movements:[]});
const groupKey=(division,conference)=>division+':'+(conference||'-');
const competitionFor=(competitions,division,conference)=>competitions.find(item=>item.type==='league'&&item.division===division&&(item.conference||null)===conference);
const playoffFor=(competitions,division,conference)=>competitions.find(item=>item.type==='promotion-playoff'&&item.division===division&&(item.conference||null)===conference);
const rankedRows=(competition,count)=>{
  if(!competition||competition.status!=='completed'||!Array.isArray(competition.standings)||competition.standings.length!==count)return null;
  const ids=competition.standings.map(row=>row.id);
  return ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==count?null:competition.standings;
};

/** Build the approved two-semifinal promotion playoff for one league group. */
export function createPromotionPlayoff({seasonId,division,conference=null,standings=[]}={}) {
  const national=['D2','D3'].includes(division)&&conference===null;
  const regional=['D4','D5'].includes(division)&&((division==='D4'&&['A','B'].includes(conference))||(division==='D5'&&['A','B','C','D'].includes(conference)));
  if(!national&&!regional)throw new Error('INVALID_PROMOTION_PLAYOFF_GROUP');
  const expectedStandings=national?({D2:20,D3:24}[division]):16;
  if(typeof seasonId!=='string'||!seasonId.trim()||seasonId.length>48)throw new Error('INVALID_PROMOTION_PLAYOFF_SEASON');
  if(!Array.isArray(standings)||standings.length!==expectedStandings)throw new Error('INVALID_PROMOTION_PLAYOFF_STANDINGS');
  const standingIds=standings.map(row=>row?.id);
  if(standingIds.some(id=>typeof id!=='string'||!id.trim())||new Set(standingIds).size!==expectedStandings)throw new Error('INVALID_PROMOTION_PLAYOFF_STANDING_IDS');
  const [first,second]=national?[4,5]:[2,3];
  const [last,thirdLast]=national?[7,6]:[5,4];
  const prefix=`${seasonId}-playoff-${division}${conference?'-'+conference:''}`;
  const semifinal1={id:prefix+'-SF1',competitionId:prefix,type:'promotion-playoff',round:1,stage:'semi-final',homeClubId:standings[first-1].id,awayClubId:standings[last-1].id,status:'scheduled',result:null,roomId:null};
  const semifinal2={id:prefix+'-SF2',competitionId:prefix,type:'promotion-playoff',round:1,stage:'semi-final',homeClubId:standings[second-1].id,awayClubId:standings[thirdLast-1].id,status:'scheduled',result:null,roomId:null};
  const final={id:prefix+'-FINAL',competitionId:prefix,type:'promotion-playoff',round:2,stage:'final',homeClubId:null,awayClubId:null,status:'waiting',result:null,roomId:null};
  return {id:prefix,type:'promotion-playoff',name:`Barrages de promotion · ${division}${conference?' · Conférence '+conference:''}`,division,conference,status:'active',format:national?'4e à 7e place':'2e à 5e place',fixtures:[semifinal1,semifinal2,final],standings:[],championClubId:null};
}

/** Advance a completed playoff tie; a draw requires a replay and cannot qualify either club. */
export function advancePromotionPlayoff(competition,fixture) {
  const stored=competition?.fixtures?.find(item=>item.id===fixture?.id);
  const result=fixture?.result;
  if(!competition||competition.type!=='promotion-playoff'||!stored||stored!==fixture||
    !Number.isSafeInteger(result?.home)||result.home<0||!Number.isSafeInteger(result?.away)||result.away<0||
    !fixture.homeClubId||!fixture.awayClubId||fixture.homeClubId===fixture.awayClubId)
    return {ok:false,reason:'invalid-playoff-fixture'};
  if(result.home===result.away){fixture.status='replay-required';fixture.replayCount=(fixture.replayCount||0)+1;return {ok:true,decided:false,replayRequired:true};}
  const winnerId=result.home>result.away?fixture.homeClubId:fixture.awayClubId;
  if(fixture.round===1&&fixture.stage==='semi-final'){
    const final=competition.fixtures.find(item=>item.round===2&&item.stage==='final');
    if(!final)return {ok:false,reason:'playoff-final-missing'};
    if(final.status!=='waiting'||[final.homeClubId,final.awayClubId].includes(winnerId))
      return {ok:false,reason:'playoff-final-slot-conflict'};
    if(!final.homeClubId)final.homeClubId=winnerId;
    else if(!final.awayClubId)final.awayClubId=winnerId;
    if(final.homeClubId&&final.awayClubId)final.status='scheduled';
    return {ok:true,decided:true,winnerId,finalReady:final.status==='scheduled'};
  }
  if(fixture.round===2&&fixture.stage==='final'){
    if(fixture.status!=='completed'||competition.status==='completed'||
      ![fixture.homeClubId,fixture.awayClubId].includes(winnerId))
      return {ok:false,reason:'playoff-final-not-ready'};
    competition.championClubId=winnerId;
    competition.status='completed';
    return {ok:true,decided:true,winnerId,championClubId:winnerId};
  }
  return {ok:false,reason:'invalid-playoff-round'};
}

/** Calculate the complete 20-up/20-down proposal from final tables and decided playoff winners. */
export function calculateSeasonMovements({competitions=[],clubs=[],policy=DEFAULT_SEASON_MOVEMENT_POLICY}={}) {
  if(!Array.isArray(competitions)||!Array.isArray(clubs)||!policy)return fail('invalid-movement-input');
  const leagueComps=competitions.filter(item=>item.type==='league');
  const expected=EXPECTED_LEAGUE_GROUPS.map(([d,c])=>groupKey(d,c));
  const actual=leagueComps.map(item=>groupKey(item.division,item.conference||null));
  if(expected.some(key=>actual.filter(value=>value===key).length!==1)||actual.length!==expected.length)return fail('league-groups-incomplete');
  const clubMap=new Map(clubs.map(club=>[club.id,club]));
  if(clubMap.size!==clubs.length||clubs.length!==156)return fail('club-catalogue-incomplete');
  const tables=new Map();
  for(const [division,conference] of EXPECTED_LEAGUE_GROUPS){
    const count=conference?16:TARGETS[division];
    const competition=competitionFor(competitions,division,conference);
    const rows=rankedRows(competition,count);
    if(!rows)return fail('league-table-incomplete',{division,conference});
    for(const row of rows){
      const club=clubMap.get(row.id);
      if(!club||club.division!==division||(conference&&conferenceForClub(club)!==conference))return fail('league-table-club-mismatch',{clubId:row.id,division,conference});
    }
    tables.set(groupKey(division,conference),{competition,rows});
  }
  const playoffs=new Map();
  for(const [division,conference] of REQUIRED_PROMOTION_PLAYOFFS){
    const playoff=playoffFor(competitions,division,conference);
    if(!playoff||playoff.status!=='completed'||!playoff.championClubId)return fail('promotion-playoffs-incomplete',{division,conference});
    const table=tables.get(groupKey(division,conference));
    const champion=clubMap.get(playoff.championClubId);
    if(!champion||!table.rows.slice(division==='D2'||division==='D3'?3:1,division==='D2'||division==='D3'?7:5).some(row=>row.id===playoff.championClubId))
      return fail('promotion-playoff-winner-invalid',{division,conference,clubId:playoff.championClubId});
    playoffs.set(groupKey(division,conference),playoff);
  }

  const movements=[];
  const add=(row,fromDivision,fromConference,toDivision,toConference,type,position,competition,stage='league')=>{
    movements.push({clubId:row.id,clubName:row.name,fromDivision,fromConference:fromConference||null,toDivision,toConference:toConference||null,type,finalPosition:position,competitionId:competition.id,competitionName:competition.name,qualificationStage:stage});
  };
  const playoffWinner=(division,conference)=>clubMap.get(playoffs.get(groupKey(division,conference)).championClubId);
  for(const division of ['D1','D2','D3']){
    const {competition,rows}=tables.get(groupKey(division,null));
    if(division!=='D1'){
      for(let i=0;i<policy.nationalDirectPromotionSlots;i++)add(rows[i],division,null,'D'+(DIVISION_ORDER[division]-1),null,'promotion',i+1,competition,'direct');
      const winner=playoffWinner(division,null);
      const position=rows.findIndex(row=>row.id===winner.id)+1;
      add(winner,division,null,'D'+(DIVISION_ORDER[division]-1),null,'promotion',position,playoffs.get(groupKey(division,null)),'playoff');
    }
    for(let i=0;i<policy.nationalRelegationSlots;i++){
      const position=rows.length-i,row=rows[position-1];
      const targetDivision='D'+(DIVISION_ORDER[division]+1);
      let targetConference=null;
      if(targetDivision==='D4')targetConference=i%2===0?'A':'B';
      add(row,division,null,targetDivision,targetConference,'relegation',position,competition,'direct');
    }
  }
  for(const conference of ['A','B']){
    const {competition,rows}=tables.get(groupKey('D4',conference));
    for(let i=0;i<policy.d4DirectPromotionSlotsPerConference;i++)add(rows[i],'D4',conference,'D3',null,'promotion',i+1,competition,'direct');
    const winner=playoffWinner('D4',conference),position=rows.findIndex(row=>row.id===winner.id)+1;
    add(winner,'D4',conference,'D3',null,'promotion',position,playoffs.get(groupKey('D4',conference)),'playoff');
    const destinations=policy.d4ToD5Conference?.[conference];
    const relegationSlots=policy.d4RelegationSlotsPerConference;
    if(!Array.isArray(destinations)||!destinations.length||destinations.some(item=>!['A','B','C','D'].includes(item))||relegationSlots%destinations.length!==0)return fail('d4-relegation-conference-policy-invalid',{conference});
    const slotsPerDestination=relegationSlots/destinations.length;
    for(let i=0;i<relegationSlots;i++){
      const position=rows.length-i;
      add(rows[position-1],'D4',conference,'D5',destinations[Math.floor(i/slotsPerDestination)],'relegation',position,competition,'direct');
    }
  }
  for(const conference of ['A','B','C','D']){
    const {competition,rows}=tables.get(groupKey('D5',conference));
    const targetConference=policy.d5ToD4Conference?.[conference];
    if(!['A','B'].includes(targetConference))return fail('d5-promotion-conference-policy-invalid',{conference,targetConference});
    for(let i=0;i<policy.d5DirectPromotionSlotsPerConference;i++)add(rows[i],'D5',conference,'D4',targetConference,'promotion',i+1,competition,'direct');
    const winner=playoffWinner('D5',conference),position=rows.findIndex(row=>row.id===winner.id)+1;
    add(winner,'D5',conference,'D4',targetConference,'promotion',position,playoffs.get(groupKey('D5',conference)),'playoff');
  }

  const moved=new Set();
  for(const item of movements){
    if(moved.has(item.clubId))return fail('club-selected-more-than-once',{clubId:item.clubId});
    moved.add(item.clubId);
    if(Math.abs(DIVISION_ORDER[item.fromDivision]-DIVISION_ORDER[item.toDivision])!==1)return fail('non-adjacent-movement',{clubId:item.clubId});
  }
  const counts=Object.fromEntries(Object.keys(TARGETS).map(division=>[division,0]));
  const conferenceCounts={D4:{A:0,B:0},D5:{A:0,B:0,C:0,D:0}};
  const movementById=new Map(movements.map(item=>[item.clubId,item]));
  for(const club of clubs){
    const movement=movementById.get(club.id),division=movement?.toDivision||club.division;
    const conference=movement?movement.toConference:conferenceForClub(club);
    if(!Object.hasOwn(counts,division))return fail('invalid-club-division',{clubId:club.id});
    counts[division]++;
    if(division==='D4'||division==='D5'){
      if(!Object.hasOwn(conferenceCounts[division],conference))return fail('invalid-club-conference',{clubId:club.id,division,conference});
      conferenceCounts[division][conference]++;
    }
  }
  if(Object.entries(TARGETS).some(([division,count])=>counts[division]!==count))return fail('division-capacity-mismatch',{counts});
  for(const division of ['D4','D5'])for(const [conference,count] of Object.entries(conferenceCounts[division]))if(count!==16)return fail('conference-capacity-mismatch',{division,conference,count});
  const promotions=movements.filter(item=>item.type==='promotion').length;
  const relegations=movements.filter(item=>item.type==='relegation').length;
  if(promotions!==20||relegations!==20)return fail('movement-quota-mismatch',{promotions,relegations});
  return {ok:true,policy:{id:policy.id,status:policy.status,description:policy.description},totalMovements:movements.length,promotions,relegations,divisionCounts:counts,conferenceCounts,movements};
}
