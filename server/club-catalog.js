import { ClubManager, DEFAULT_CLUBS } from '../src/club-manager.js';

const catalogManager = new ClubManager(DEFAULT_CLUBS, null, 'server-match-catalog');
const catalog = new Map(catalogManager.listClubs().map(club => [club.id, club]));

/** Return a server-owned, immutable identity snapshot for a known fictional club. */
export function resolveMatchClub(id) {
  if (id === undefined || id === null || id === '') return null;
  if (typeof id !== 'string' || id.length > 48) throw new Error('INVALID_CLUB');
  const club = catalog.get(id);
  if (!club) throw new Error('INVALID_CLUB');
  return Object.freeze({
    id: club.id,
    name: club.name,
    city: club.city,
    country: club.country,
    countryCode: club.countryCode,
    division: club.division,
    rating: club.rating,
    colors: Object.freeze([...club.colors]),
    stadium: club.stadium,
  });
}

export function cloneMatchTeams(teams) {
  const publicTeam = team => {
    if (!team) return null;
    const { roster, ...identity } = team;
    return { ...identity, colors: [...team.colors] };
  };
  return { blue: publicTeam(teams?.blue), red: publicTeam(teams?.red) };
}
