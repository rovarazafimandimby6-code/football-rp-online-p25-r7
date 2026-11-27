import { applyP27ClubKit } from './p27-club-kit.js';
const clean = (value, max = 80) => String(value ?? '').trim().slice(0, max);
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const clampInt = (value, fallback, min, max) => Number.isSafeInteger(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;

/**
 * Read-only, server-safe player directory. Current memberships always win over
 * historical release snapshots; transferred snapshots are never free agents.
 */
export function listP27Players({ clubs = [], filters = {} } = {}) {
  const clubList = Array.isArray(clubs) ? clubs : [];
  const byId = new Map(clubList.filter(club => club && typeof club.id === 'string').map(club => [club.id, club]));
  const current = new Map();
  for (const club of clubList) {
    for (const player of Array.isArray(club.roster) ? club.roster : []) {
      if (!player || typeof player.id !== 'string' || !player.id) continue;
      current.set(player.id, { ...applyP27ClubKit(player, club), clubId:club.id, clubName:club.name, division:club.division, status:player.contract?.loan?.status === 'active' ? 'loaned' : 'active', lastClubId:null });
    }
  }
  const released = new Map();
  for (const club of clubList) {
    for (const entry of Array.isArray(club.releasedPlayers) ? club.releasedPlayers : []) {
      const player = entry?.player;
      if (!player || typeof player.id !== 'string' || !player.id || entry.reason === 'transferred' || current.has(player.id)) continue;
      const at = Date.parse(entry.releasedAt || '') || 0;
      const previous = released.get(player.id);
      if (!previous || at >= previous.at) released.set(player.id, {
        ...player, number:null, clubId:null, clubName:null, division:null, status:'free',
        appearance:{ ...(player.appearance || {}), kitColors:{ primary:'#465365', secondary:'#263344', accent:'#aab7c8' }, kitDesign:'central', kitVariant:'outfield', kitInspiration:'tenue neutre de joueur libre' },
        lastClubId:club.id, lastClubName:club.name, releasedAt:entry.releasedAt || null,
        releaseReason:entry.reason || 'released', at
      });
    }
  }
  const all = [...current.values(), ...[...released.values()].map(({ at, ...player }) => player)];
  const search = normalize(filters.search);
  const type = ['human','system'].includes(filters.type) ? filters.type : null;
  const role = ['GK','DEF','MID','FWD'].includes(filters.role) ? filters.role : null;
  const status = ['active','free','loaned'].includes(filters.status) ? filters.status : null;
  const division = /^D[1-5]$/.test(String(filters.division || '')) ? filters.division : null;
  const clubId = clean(filters.clubId, 48);
  const minRating = filters.minRating === undefined ? null : clampInt(filters.minRating, 1, 1, 99);
  const maxRating = filters.maxRating === undefined ? null : clampInt(filters.maxRating, 99, 1, 99);
  const minAge = filters.minAge === undefined ? null : clampInt(filters.minAge, 16, 16, 45);
  const maxAge = filters.maxAge === undefined ? null : clampInt(filters.maxAge, 45, 16, 45);
  let players = all.filter(player => {
    if (type && player.playerType !== type) return false;
    if (role && player.role !== role) return false;
    if (status && player.status !== status) return false;
    if (division && player.division !== division) return false;
    if (clubId && player.clubId !== clubId) return false;
    if (minRating !== null && Number(player.rating) < minRating) return false;
    if (maxRating !== null && Number(player.rating) > maxRating) return false;
    if (minAge !== null && Number(player.age) < minAge) return false;
    if (maxAge !== null && Number(player.age) > maxAge) return false;
    if (search && ![player.name, player.id, player.clubName, player.lastClubName, player.nationality, player.archetype].some(value => normalize(value).includes(search))) return false;
    return true;
  });
  const sort = ['rating','age','name','potential'].includes(filters.sort) ? filters.sort : 'rating';
  const direction = filters.order === 'asc' ? 1 : -1;
  players.sort((a,b) => {
    const av = sort === 'name' ? normalize(a.name) : Number(a[sort]) || 0;
    const bv = sort === 'name' ? normalize(b.name) : Number(b[sort]) || 0;
    return (av < bv ? -1 : av > bv ? 1 : a.id.localeCompare(b.id)) * direction;
  });
  const total = players.length;
  const limit = clampInt(filters.limit, 24, 1, 100);
  const offset = clampInt(filters.offset, 0, 0, 1000000);
  return {
    total, limit, offset,
    players:players.slice(offset, offset + limit).map(player => ({ ...player, attributes:player.attributes ? { ...player.attributes } : null, contract:player.contract ? { ...player.contract } : null })),
    facets:{
      divisions:[...new Set(all.map(player => player.division).filter(Boolean))].sort(),
      clubs:[...byId.values()].map(club => ({ id:club.id, name:club.name, division:club.division })).sort((a,b) => a.name.localeCompare(b.name)),
      statuses:{ active:all.filter(player => player.status === 'active').length, free:all.filter(player => player.status === 'free').length, loaned:all.filter(player => player.status === 'loaned').length }
    }
  };
}
