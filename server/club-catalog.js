import { ClubManager, DEFAULT_CLUBS } from '../src/club-manager.js';
import { LEAGUE_DIVISIONS, CONFERENCE_NAMES, normalizeConference, conferenceForClub } from '../src/league-structure.js';

const divisionOrder = new Map(LEAGUE_DIVISIONS.map((item,index)=>[item.id,index]));
const conferenceOrder = { D4:['Nord','Sud'], D5:['Nord','Sud','Est','Ouest'] };

function publicClub(club) {
  return Object.freeze({
    id:club.id,
    name:club.name,
    city:club.city,
    country:club.country,
    location:Object.freeze({
      city:club.location?.city || String(club.city || '').split('/')[0].trim(),
      country:club.location?.country || club.country,
      countryCode:club.location?.countryCode || null
    }),
    division:club.division,
    conference:conferenceForClub(club),
    rating:club.rating,
    reputation:club.reputation,
    humanAdmission:club.humanAdmission,
    managementType:club.managerId ? 'human' : 'system',
    colors:Object.freeze([...(club.colors || [])]),
    kitDesign:club.kitDesign || 'central',
    stadium:club.stadium
  });
}

/** Read-only public catalogue; never includes player rosters or private contracts. */
export function listPublicClubs({
  clubs = catalogManager.listClubs(),
  division,
  conference,
  search = '',
  limit = 24,
  offset = 0
} = {}) {
  if (!Array.isArray(clubs)) throw new Error('INVALID_CLUB_LIST');
  if (division !== undefined && !divisionOrder.has(division)) throw new Error('INVALID_DIVISION');
  if (conference !== undefined && (!division || !normalizeConference(division,conference))) throw new Error('INVALID_CONFERENCE');
  if (typeof search !== 'string' || search.length > 64) throw new Error('INVALID_CLUB_SEARCH');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new Error('INVALID_PAGINATION');
  const needle=search.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').trim();
  const filtered=clubs.filter(club=>{
    if (division && club.division!==division) return false;
    const resolvedConference=conferenceForClub(club);
    if (conference && resolvedConference!==conference) return false;
    if (!needle) return true;
    return [club.name,club.city,club.country,club.stadium,club.location?.city]
      .some(value=>String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').includes(needle));
  }).sort((a,b)=>{
    const tier=(divisionOrder.get(a.division) ?? 99)-(divisionOrder.get(b.division) ?? 99);
    if(tier) return tier;
    const conf=(conferenceOrder[a.division] || []).indexOf(conferenceForClub(a))-(conferenceOrder[b.division] || []).indexOf(conferenceForClub(b));
    if(conf) return conf;
    return String(a.name).localeCompare(String(b.name),'fr');
  });
  return Object.freeze({
    total:filtered.length,
    limit,
    offset,
    clubs:Object.freeze(filtered.slice(offset,offset+limit).map(publicClub))
  });
}

export function resolvePublicClub(id, clubs = catalogManager.listClubs()) {
  if (typeof id !== 'string' || !id || id.length > 48) throw new Error('INVALID_CLUB');
  const club=clubs.find(item=>item.id===id);
  return club ? publicClub(club) : null;
}


const catalogManager = new ClubManager(DEFAULT_CLUBS, null, 'server-match-catalog');
const catalog = new Map(catalogManager.listClubs().map(club => [club.id, club]));

/** Return a server-owned, immutable identity snapshot for a known fictional club. */
export function resolveMatchClub(id, currentAssignments = null) {
  if (id === undefined || id === null || id === '') return null;
  if (typeof id !== 'string' || id.length > 48) throw new Error('INVALID_CLUB');
  const baseClub = catalog.get(id);
  if (!baseClub) throw new Error('INVALID_CLUB');
  const current = currentAssignments instanceof Map
    ? currentAssignments.get(id)
    : Array.isArray(currentAssignments) ? currentAssignments.find(item=>item?.id===id) : null;
  const club = current ? { ...baseClub, division:current.division || baseClub.division, conference:current.conference ?? null } : baseClub;
  return Object.freeze({
    id: club.id,
    name: club.name,
    city: club.city,
    country: club.country,
    countryCode: club.countryCode,
    location: Object.freeze({
      city: club.location?.city || club.city,
      country: club.location?.country || club.country,
      countryCode: club.location?.countryCode || null
    }),
    division: club.division,
    conference: club.conference || null,
    rating: club.rating,
    reputation: club.reputation,
    humanAdmission: club.humanAdmission,
    kitDesign: club.kitDesign,
    colors: Object.freeze([...club.colors]),
    stadium: club.stadium,
    roster: club.roster.map(player => ({ ...player, attributes: player.attributes ? { ...player.attributes } : null })),
  });
}

export function cloneMatchTeams(teams) {
  const publicTeam = team => {
    if (!team) return null;
    const { roster, ...identity } = team;
    return { ...identity, colors: [...team.colors], location:team.location ? { ...team.location } : null };
  };
  return { blue: publicTeam(teams?.blue), red: publicTeam(teams?.red) };
}
