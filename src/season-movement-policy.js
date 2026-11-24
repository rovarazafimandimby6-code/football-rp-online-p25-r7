import { LEAGUE_DIVISIONS } from './league-structure.js';

export const DEFAULT_SEASON_MOVEMENT_POLICY = Object.freeze({
  id: 'balanced-2-4',
  status: 'proposed',
  description: 'Deux montées/descentes par palier national ; quatre entre Challenger League et Regional League',
  nationalSlots: 2,
  d4RelegationSlotsPerConference: 2,
  d4ToD5ConferenceOrder: Object.freeze({
    Nord: Object.freeze(['Nord','Est']),
    Sud: Object.freeze(['Sud','Ouest'])
  }),
  d5ToD4Conference: Object.freeze({ Nord:'Nord', Sud:'Sud', Est:'Nord', Ouest:'Sud' })
});

const DIVISION_ORDER = Object.freeze({ D1:1, D2:2, D3:3, D4:4, D5:5 });
const TARGETS = Object.freeze(Object.fromEntries(LEAGUE_DIVISIONS.map(item=>[item.id,item.targetClubs])));
const EXPECTED_GROUPS = Object.freeze([
  ['D1',null],['D2',null],['D3',null],
  ['D4','Nord'],['D4','Sud'],
  ['D5','Nord'],['D5','Sud'],['D5','Est'],['D5','Ouest']
]);

function fail(reason, details = {}) {
  return { ok:false, reason, ...details, movements:[] };
}
function competitionFor(competitions, division, conference) {
  return competitions.find(item => item.type === 'league' &&
    item.division === division && (item.conference || null) === conference);
}
function rankedRows(competition, expectedCount) {
  if (!competition || competition.status !== 'completed') return null;
  if (!Array.isArray(competition.standings) || competition.standings.length !== expectedCount) return null;
  const ids = competition.standings.map(row=>row.id);
  if (ids.some(id=>typeof id!=='string'||!id) || new Set(ids).size !== expectedCount) return null;
  return competition.standings;
}

/** Build a reviewable proposal. The default policy is proposed, not auto-approved. */
export function calculateSeasonMovements({ competitions = [], clubs = [], policy = DEFAULT_SEASON_MOVEMENT_POLICY } = {}) {
  if (!Array.isArray(competitions) || !Array.isArray(clubs) || !policy)
    return fail('invalid-movement-input');
  const expected = EXPECTED_GROUPS.map(([division,conference])=>division+':'+(conference||'-'));
  const actual = competitions.filter(item=>item.type==='league').map(item=>item.division+':'+(item.conference||'-'));
  if (expected.some(key=>actual.filter(value=>value===key).length!==1) || actual.length!==expected.length)
    return fail('league-groups-incomplete');
  const clubMap = new Map(clubs.map(club=>[club.id,club]));
  if (clubMap.size !== clubs.length || clubs.length !== 156) return fail('club-catalogue-incomplete');

  const tables = new Map();
  for (const [division,conference] of EXPECTED_GROUPS) {
    const count = conference ? 16 : TARGETS[division];
    const competition = competitionFor(competitions,division,conference);
    const rows = rankedRows(competition,count);
    if (!rows) return fail('league-table-incomplete',{division,conference});
    for (const row of rows) {
      const club = clubMap.get(row.id);
      if (!club || club.division!==division || (conference && club.conference!==conference))
        return fail('league-table-club-mismatch',{clubId:row.id,division,conference});
    }
    tables.set(division+':'+(conference||'-'),{competition,rows});
  }

  const movements = [];
  const add = (row, fromDivision, fromConference, toDivision, toConference, type, position, competition) => {
    movements.push({
      clubId:row.id, clubName:row.name, fromDivision, fromConference:fromConference||null,
      toDivision, toConference:toConference||null, type, finalPosition:position,
      competitionId:competition.id, competitionName:competition.name
    });
  };

  for (const division of ['D1','D2','D3']) {
    const {competition,rows}=tables.get(division+':-');
    if (division!=='D1') for(let i=0;i<policy.nationalSlots;i++)
      add(rows[i],division,null,'D'+(DIVISION_ORDER[division]-1),null,'promotion',i+1,competition);
    if (division!=='D3') for(let i=0;i<policy.nationalSlots;i++) {
      const position=rows.length-i;
      add(rows[position-1],division,null,'D'+(DIVISION_ORDER[division]+1),null,'relegation',position,competition);
    }
  }

  for (const conference of ['Nord','Sud']) {
    const {competition,rows}=tables.get('D4:'+conference);
    add(rows[0],'D4',conference,'D3',null,'promotion',1,competition);
    const destinations=policy.d4ToD5ConferenceOrder?.[conference];
    if (!Array.isArray(destinations) || destinations.length!==policy.d4RelegationSlotsPerConference)
      return fail('d4-relegation-conference-policy-invalid',{conference});
    for(let i=0;i<destinations.length;i++) {
      const position=rows.length-i;
      const targetConference=destinations[i];
      if (!['Nord','Sud','Est','Ouest'].includes(targetConference))
        return fail('d4-relegation-conference-policy-invalid',{conference,targetConference});
      add(rows[position-1],'D4',conference,'D5',targetConference,'relegation',position,competition);
    }
  }

  for (const conference of ['Nord','Sud','Est','Ouest']) {
    const {competition,rows}=tables.get('D5:'+conference);
    const targetConference=policy.d5ToD4Conference?.[conference];
    if (!['Nord','Sud'].includes(targetConference))
      return fail('d5-promotion-conference-policy-invalid',{conference,targetConference});
    add(rows[0],'D5',conference,'D4',targetConference,'promotion',1,competition);
  }

  const moved = new Set();
  for (const movement of movements) {
    if (moved.has(movement.clubId)) return fail('club-selected-more-than-once',{clubId:movement.clubId});
    moved.add(movement.clubId);
    if (Math.abs(DIVISION_ORDER[movement.fromDivision]-DIVISION_ORDER[movement.toDivision])!==1)
      return fail('non-adjacent-movement',{clubId:movement.clubId});
  }
  const counts=Object.fromEntries(Object.keys(TARGETS).map(division=>[division,0]));
  const conferenceCounts={D4:{Nord:0,Sud:0},D5:{Nord:0,Sud:0,Est:0,Ouest:0}};
  for(const club of clubs) {
    const movement=movements.find(item=>item.clubId===club.id);
    const division=movement?.toDivision||club.division;
    const conference=movement ? movement.toConference : club.conference;
    if(!Object.hasOwn(counts,division)) return fail('invalid-club-division',{clubId:club.id});
    counts[division]++;
    if(division==='D4'||division==='D5') {
      if(!Object.hasOwn(conferenceCounts[division],conference)) return fail('invalid-club-conference',{clubId:club.id,division,conference});
      conferenceCounts[division][conference]++;
    }
  }
  if(Object.entries(TARGETS).some(([division,count])=>counts[division]!==count))
    return fail('division-capacity-mismatch',{counts});
  for(const division of ['D4','D5']) for(const [conference,count] of Object.entries(conferenceCounts[division]))
    if(count!==16) return fail('conference-capacity-mismatch',{division,conference,count});

  return {
    ok:true, policy:{id:policy.id||'custom',status:policy.status||'custom',description:policy.description||''},
    totalMovements:movements.length,
    promotions:movements.filter(item=>item.type==='promotion').length,
    relegations:movements.filter(item=>item.type==='relegation').length,
    divisionCounts:counts, conferenceCounts, movements
  };
}
