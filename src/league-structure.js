export const LEAGUE_DIVISIONS = Object.freeze([
  { id:'D1', name:'Premier League', level:1, targetClubs:16, description:'Le championnat d’élite' },
  { id:'D2', name:'Ligue 2', level:2, targetClubs:20, description:'Le deuxième niveau national' },
  { id:'D3', name:'National League', level:3, targetClubs:24, description:'Le troisième niveau national' },
  { id:'D4', name:'Challenger League', level:4, targetClubs:32, description:'Deux conférences de seize clubs', conferences:Object.freeze(['A','B']) },
  { id:'D5', name:'Regional League', level:5, targetClubs:64, description:'Quatre conférences de seize clubs', conferences:Object.freeze(['A','B','C','D']) }
]);

export const CONFERENCE_NAMES = Object.freeze({
  D4:Object.freeze(['A','B']),
  D5:Object.freeze(['A','B','C','D'])
});

export const TOTAL_LEAGUE_CLUBS = LEAGUE_DIVISIONS.reduce((total,division)=>total+division.targetClubs,0);

export function normalizeDivision(value) {
  return value === 'AMATEUR' ? 'D5' : LEAGUE_DIVISIONS.some(division=>division.id===value) ? value : 'D5';
}

export function normalizeConference(division,value) {
  const label=String(value ?? '').trim().toUpperCase();
  return (CONFERENCE_NAMES[division] || []).includes(label) ? label : null;
}

/** Conference membership is explicit catalogue data; city names are descriptive only. */
export function conferenceForClub(club) {
  const division=normalizeDivision(club?.division);
  if (division!=='D4' && division!=='D5') return null;
  return normalizeConference(division,club?.conference);
}

export function getCompetitionGroups() {
  return LEAGUE_DIVISIONS.flatMap(division=>{
    const conferences=CONFERENCE_NAMES[division.id];
    return conferences
      ? conferences.map(conference=>({division:division.id,leagueName:division.name,conference,competitionName:`${division.name} · Conférence ${conference}`}))
      : [{division:division.id,leagueName:division.name,conference:null,competitionName:division.name}];
  });
}
