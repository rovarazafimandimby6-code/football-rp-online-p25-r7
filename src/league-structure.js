export const LEAGUE_DIVISIONS = Object.freeze([
  { id: 'D1', name: 'Premier League', level: 1, targetClubs: 16, description: 'Le championnat d’élite' },
  { id: 'D2', name: 'Ligue 2', level: 2, targetClubs: 20, description: 'Le deuxième niveau national' },
  { id: 'D3', name: 'National League', level: 3, targetClubs: 24, description: 'Le troisième niveau national' },
  { id: 'D4', name: 'Challenger League', level: 4, targetClubs: 32, description: 'Deux conférences régionales de seize clubs', conferences: Object.freeze(['Nord', 'Sud']) },
  { id: 'D5', name: 'Regional League', level: 5, targetClubs: 64, description: 'Quatre conférences régionales de seize clubs', conferences: Object.freeze(['Nord', 'Sud', 'Est', 'Ouest']) }
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

const GEO = (D4, D5) => Object.freeze({ ...(D4 ? { D4 } : {}), ...(D5 ? { D5 } : {}) });
const CITY_GEOGRAPHY = Object.freeze({
  // Nord : extrême nord et nord-ouest malgaches.
  'antsiranana': GEO('Nord','Nord'), 'diego suarez': GEO('Nord','Nord'),
  'ambilobe': GEO('Nord','Nord'), 'ambanja': GEO('Nord','Nord'), 'nosy be': GEO('Nord','Nord'),
  'sambava': GEO('Nord','Nord'), 'antalaha': GEO('Nord','Nord'), 'andapa': GEO('Nord','Nord'),
  'vohemar': GEO('Nord','Nord'), 'bealanana': GEO('Nord','Nord'),
  'befandriana nord': GEO('Nord','Nord'), 'port berge': GEO('Nord','Nord'),
  'mampikony': GEO('Nord','Nord'), 'mandritsara': GEO('Nord','Nord'),
  'marovoay': GEO('Nord','Nord'), 'mitsinjo': GEO('Nord',null),
  'soalala': GEO('Nord','Nord'), 'antsohihy': GEO('Nord','Nord'),
  'mahajanga': GEO('Nord','Ouest'), 'majunga': GEO('Nord','Ouest'),
  // Sud : hauts plateaux sud, sud-est et grand sud.
  'antananarivo': GEO('Sud',null), 'antsirabe': GEO('Sud','Sud'),
  'fianarantsoa': GEO('Sud','Sud'), 'ambositra': GEO('Sud','Sud'),
  'ihosy': GEO('Sud','Sud'), 'betroka': GEO('Sud','Sud'),
  'taolagnaro': GEO('Sud','Sud'), 'fort dauphin': GEO('Sud','Sud'),
  'toliara': GEO('Sud','Sud'), 'tulear': GEO('Sud','Sud'),
  'sakaraha': GEO('Sud','Sud'), 'ampanihy': GEO(null,'Sud'),
  'betioky': GEO(null,'Sud'), 'bekily': GEO(null,'Sud'),
  'ambovombe': GEO(null,'Sud'), 'amboasary': GEO(null,'Sud'),
  'tsihombe': GEO(null,'Sud'), 'beloha': GEO(null,'Sud'),
  'ejeda': GEO(null,'Sud'), 'morondava': GEO('Sud','Ouest'),
  'miandrivazo': GEO('Sud',null),
  // Est : côte orientale et arrière-pays.
  'toamasina': GEO('Nord','Est'), 'tamatave': GEO('Nord','Est'),
  'fenerive est': GEO(null,'Est'), 'vatomandry': GEO(null,'Est'),
  'mahanoro': GEO(null,'Est'), 'brickaville': GEO(null,'Est'),
  'moramanga': GEO(null,'Est'), 'andasibe': GEO(null,'Est'),
  'anosibe anala': GEO(null,'Est'), 'ambatondrazaka': GEO(null,'Est'),
  'amparafaravola': GEO(null,'Est'), 'manakara': GEO('Sud','Est'),
  'mananjary': GEO('Sud','Est'), 'farafangana': GEO('Sud','Est'),
  'vangaindrano': GEO('Sud','Est'), 'nosy varika': GEO(null,'Est'),
  // Ouest : façade occidentale et moyen-ouest.
  'ambato boeny': GEO(null,'Ouest'), 'ambatomainty': GEO(null,'Ouest'),
  'ankavandra': GEO(null,'Ouest'), 'maintirano': GEO(null,'Ouest'),
  'morafenobe': GEO(null,'Ouest'), 'besalampy': GEO(null,'Ouest'),
  'antsalova': GEO(null,'Ouest'), 'belo sur tsiribihina': GEO('Sud','Ouest'),
  'tsiroanomandidy': GEO(null,'Ouest'), 'miarinarivo': GEO(null,'Ouest'),
  'arivonimamo': GEO(null,'Ouest'), 'ankazobe': GEO(null,'Ouest'),
  'maevatanana': GEO(null,'Ouest'), 'kandreho': GEO(null,'Ouest'),
  // Clubs internationaux : D4 utilise une répartition Nord/Sud cohérente avec l'hémisphère.
  'glasgow': GEO('Nord',null), 'liverpool': GEO('Nord',null), 'bristol': GEO('Nord',null),
  'leeds': GEO('Nord',null), 'birmingham': GEO('Nord',null), 'cardiff': GEO('Nord',null),
  'dublin': GEO('Nord',null), 'edimbourg': GEO('Nord',null), 'lyon': GEO('Nord',null),
  'marseille': GEO('Nord',null), 'bordeaux': GEO('Nord',null), 'lille': GEO('Nord',null),
  'nantes': GEO('Nord',null), 'toulouse': GEO('Nord',null), 'nice': GEO('Nord',null),
  'strasbourg': GEO('Nord',null), 'naples': GEO('Nord',null), 'turin': GEO('Nord',null),
  'bologne': GEO('Nord',null), 'florence': GEO('Nord',null), 'seville': GEO('Nord',null),
  'bilbao': GEO('Nord',null), 'malaga': GEO('Nord',null), 'saragosse': GEO('Nord',null),
  'porto': GEO('Nord',null), 'braga': GEO('Nord',null), 'coimbra': GEO('Nord',null),
  'faro': GEO('Nord',null), 'dakar': GEO('Nord',null), 'saint louis': GEO('Nord',null),
  'thies': GEO('Nord',null), 'kaolack': GEO('Nord',null), 'lagos': GEO('Nord',null),
  'abuja': GEO('Nord',null), 'kano': GEO('Nord',null), 'ibadan': GEO('Nord',null),
  'yokohama': GEO('Nord',null), 'nagoya': GEO('Nord',null), 'kobe': GEO('Nord',null),
  'fukuoka': GEO('Nord',null), 'sao paulo': GEO('Sud',null), 'salvador': GEO('Sud',null),
  'recife': GEO('Sud',null), 'curitiba': GEO('Sud',null), 'nairobi': GEO('Sud','Est'),
  'mombasa': GEO('Sud',null), 'kisumu': GEO('Sud',null), 'nakuru': GEO('Sud',null)
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
