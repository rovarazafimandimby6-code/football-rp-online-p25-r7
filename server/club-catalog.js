import { DEFAULT_CLUBS } from '../src/club-manager.js';

const catalog = new Map(DEFAULT_CLUBS.map(club => [club.id, club]));

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
  return {
    blue: teams?.blue ? { ...teams.blue, colors: [...teams.blue.colors] } : null,
    red: teams?.red ? { ...teams.red, colors: [...teams.red.colors] } : null,
  };
}
