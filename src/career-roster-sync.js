import { DEFAULT_ATTRIBUTES } from './player-profile.js';

export const CAREER_ROSTER_PLAYER_ID = 'career-player';

const averageRating = attributes => {
  const values = Object.keys(DEFAULT_ATTRIBUTES).map(key => Number(attributes?.[key] ?? DEFAULT_ATTRIBUTES[key]));
  return Math.max(1, Math.min(99, Math.round(values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 50), 0) / values.length)));
};

const roleArchetype = role => ({
  GK: 'Gardien réflexe',
  DEF: 'Défenseur relanceur',
  MID: 'Relayeur dynamique',
  FWD: 'Attaquant mobile'
}[role] || 'Joueur polyvalent');

/** Maintient le footballeur de carrière dans un seul effectif local. */
export function syncCareerPlayerRoster({ clubs, career, profile, playerId = CAREER_ROSTER_PLAYER_ID } = {}) {
  if (!clubs || !career || !profile || typeof clubs.listClubs !== 'function') return { ok: false, reason: 'invalid-context' };
  career.refreshContractStatus?.();
  const id = String(playerId || '').trim().slice(0, 48);
  if (!id) return { ok: false, reason: 'invalid-player' };

  const targetId = career.contract?.status === 'active' && career.clubId && !career.getContractStatus?.()?.expired
    ? String(career.clubId)
    : null;
  const locations = clubs.listClubs().filter(club => club.roster.some(player => player.id === id));
  if (!targetId) {
    for (const club of locations) clubs.removePlayer(club.id, id);
    return { ok: true, registered: false, reason: 'free-agent' };
  }

  const target = clubs.getClub(targetId);
  if (!target) return { ok: false, reason: 'unknown-club', clubId: targetId };
  const source = locations.find(club => club.id === targetId) || locations[0] || null;
  for (const duplicate of locations) if (source && duplicate.id !== source.id) clubs.removePlayer(duplicate.id, id);

  if (source && source.id !== targetId) {
    const moved = clubs.transferPlayer(source.id, targetId, id);
    if (!moved.ok) return moved;
  } else if (!source) {
    const added = clubs.addPlayer(targetId, { id, name: profile.identity?.displayName });
    if (!added.ok) return added;
  }

  const attributes = profile.progression?.attributes || DEFAULT_ATTRIBUTES;
  const role = ['GK','DEF','MID','FWD'].includes(profile.identity?.role) ? profile.identity.role : 'MID';
  const rating = averageRating(attributes);
  const updated = clubs.updatePlayer(targetId, {
    id,
    name: profile.identity?.displayName || 'Nouveau joueur',
    number: profile.identity?.number,
    role,
    preferredFoot: profile.identity?.preferredFoot,
    nationality: target.countryCode,
    rating,
    potential: Math.max(rating, Number(profile.progression?.level) || rating),
    attributes,
    archetype: roleArchetype(role),
    appearance: profile.appearance && typeof profile.appearance === 'object' ? { ...profile.appearance } : null
  });
  return updated.ok ? { ok: true, registered: true, clubId: targetId, player: updated.player } : updated;
}
