import { createTeamRoster } from './ai.js';

const rating = player => Number.isFinite(Number(player?.rating)) ? Number(player.rating) : 0;
const potential = player => Number.isFinite(Number(player?.potential)) ? Number(player.potential) : rating(player);

/**
 * Construit la feuille de match à partir du seul effectif connu du club.
 * Le choix explicite du manager est respecté ; le banc ne contient que des
 * joueurs réellement enregistrés et jamais un doublon du onze.
 */
export function createMatchSquad(team, formationName = '2-2', clubRoster = null, priorityPlayerId = null, benchSize = 5, preferredStarterIds = null) {
  const roster = Array.isArray(clubRoster) ? clubRoster.filter(player => player && typeof player === 'object') : [];
  const starters = createTeamRoster(team, formationName, roster, priorityPlayerId, preferredStarterIds);
  const starterIds = new Set(starters.map(player => player.id).filter(id => id !== null && id !== undefined));
  const seen = new Set(starterIds);
  const reserves = roster.filter(player => {
    if (player.id === null || player.id === undefined || seen.has(player.id)) return false;
    seen.add(player.id);
    return true;
  }).sort((a, b) => rating(b) - rating(a) || potential(b) - potential(a) || String(a.id).localeCompare(String(b.id)));
  const limit = Number.isFinite(Number(benchSize)) ? Math.max(0, Math.min(7, Math.floor(Number(benchSize)))) : 5;
  return {
    starters,
    substitutes: reserves.slice(0, limit).map(player => ({ ...player })),
    squadSize: new Set(roster.map(player => player.id).filter(id => id !== null && id !== undefined)).size
  };
}
