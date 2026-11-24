export const LEAGUE_DIVISIONS = Object.freeze([
  { id: 'D1', name: 'Premier League', level: 1, targetClubs: 16, description: 'Le championnat d’élite' },
  { id: 'D2', name: 'Ligue 2', level: 2, targetClubs: 20, description: 'Le deuxième niveau national' },
  { id: 'D3', name: 'National League', level: 3, targetClubs: 24, description: 'Le troisième niveau national' },
  { id: 'D4', name: 'Regional League', level: 4, targetClubs: 32, description: 'Deux conférences régionales de seize clubs', conferences: Object.freeze(['Nord', 'Sud']) },
  { id: 'D5', name: 'Challenger League', level: 5, targetClubs: 64, description: 'Quatre conférences régionales de seize clubs', conferences: Object.freeze(['Nord', 'Sud', 'Est', 'Ouest']) }
]);

export const CONFERENCE_NAMES = Object.freeze({
  D4: Object.freeze(['Nord', 'Sud']),
  D5: Object.freeze(['Nord', 'Sud', 'Est', 'Ouest'])
});

export const TOTAL_LEAGUE_CLUBS = LEAGUE_DIVISIONS.reduce((total, division) => total + division.targetClubs, 0);

export function normalizeDivision(value) {
  return value === 'AMATEUR' ? 'D5' : LEAGUE_DIVISIONS.some(division => division.id === value) ? value : 'D5';
}

export function normalizeConference(division, value) {
  const label = String(value ?? '').trim();
  return (CONFERENCE_NAMES[division] || []).includes(label) ? label : null;
}

const CITY_GEOGRAPHY = Object.freeze({
  'antsiranana': Object.freeze({ D4: 'Nord', D5: 'Nord' }),
  'diego suarez': Object.freeze({ D4: 'Nord', D5: 'Nord' }),
  'nosy be': Object.freeze({ D4: 'Nord', D5: 'Nord' }),
  'ambanja': Object.freeze({ D4: 'Nord', D5: 'Nord' }),
  'sambava': Object.freeze({ D4: 'Nord', D5: 'Nord' }),
  'antalaha': Object.freeze({ D4: 'Nord', D5: 'Nord' }),
  'mahajanga': Object.freeze({ D4: 'Nord', D5: 'Ouest' }),
  'majunga': Object.freeze({ D4: 'Nord', D5: 'Ouest' }),
  'toamasina': Object.freeze({ D4: 'Nord', D5: 'Est' }),
  'tamatave': Object.freeze({ D4: 'Nord', D5: 'Est' }),
  'antananarivo': Object.freeze({ D4: 'Sud' }),
  'antsirabe': Object.freeze({ D4: 'Sud', D5: 'Sud' }),
  'fianarantsoa': Object.freeze({ D4: 'Sud', D5: 'Sud' }),
  'toliara': Object.freeze({ D4: 'Sud', D5: 'Sud' }),
  'tulear': Object.freeze({ D4: 'Sud', D5: 'Sud' }),
  'morondava': Object.freeze({ D4: 'Sud', D5: 'Ouest' }),
  'taolagnaro': Object.freeze({ D4: 'Sud', D5: 'Sud' }),
  'fort dauphin': Object.freeze({ D4: 'Sud', D5: 'Sud' }),
  'manakara': Object.freeze({ D4: 'Sud', D5: 'Est' }),
  'mananjary': Object.freeze({ D4: 'Sud', D5: 'Est' }),
  'nairobi': Object.freeze({ D5: 'Est' })
});

function normalizeCityName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve a conference from a club's primary city.
 * Explicit conference data always wins; unknown locations stay unassigned
 * instead of being guessed from arbitrary substrings in a club name or ID.
 */
export function conferenceForClub(club) {
  const division = normalizeDivision(club?.division);
  const explicit = normalizeConference(division, club?.conference ?? club?.region);
  if (explicit) return explicit;
  if (division !== 'D4' && division !== 'D5') return null;

  const primaryCity = String(club?.location?.city || club?.city || '').split('/')[0];
  const city = normalizeCityName(primaryCity);
  return CITY_GEOGRAPHY[city]?.[division] ?? null;
}

export function getCompetitionGroups() {
  return LEAGUE_DIVISIONS.flatMap(division => {
    const conferences = CONFERENCE_NAMES[division.id];
    return conferences
      ? conferences.map(conference => ({ division: division.id, leagueName: division.name, conference, competitionName: `${division.name} · Conférence ${conference}` }))
      : [{ division: division.id, leagueName: division.name, conference: null, competitionName: division.name }];
  });
}
