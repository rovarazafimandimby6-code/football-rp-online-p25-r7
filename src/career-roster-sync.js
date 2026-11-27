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

const profilePlayer = (profile, target, career) => {
  const attributes = profile.progression?.attributes || DEFAULT_ATTRIBUTES;
  const role = ['GK','DEF','MID','FWD'].includes(profile.identity?.role) ? profile.identity.role : 'MID';
  const rating = averageRating(attributes);
  const careerContract = career.contract?.status === 'active' ? {
    clubId:career.contract.clubId,
    status:'active',
    salary:Math.max(0, Math.floor(Number(career.contract.salary) || 0)),
    weeklyWage:Math.max(0, Math.floor(Number(career.contract.salary) || 0)),
    signedAt:career.contract.signedAt,
    expiresAt:career.contract.expiresAt,
    durationWeeks:Number.isFinite(Date.parse(career.contract.expiresAt) - Date.parse(career.contract.signedAt)) ? Math.max(1, Math.ceil((Date.parse(career.contract.expiresAt) - Date.parse(career.contract.signedAt)) / (7 * 86400000))) : 180
  } : null;
  return {
    id:CAREER_ROSTER_PLAYER_ID,
    name:profile.identity?.displayName || 'Nouveau joueur',
    number:profile.identity?.number,
    role,
    preferredFoot:profile.identity?.preferredFoot,
    nationality:target.countryCode,
    rating,
    potential:Math.max(rating, Number(profile.progression?.level) || rating),
    attributes,
    archetype:roleArchetype(role),
    contract:careerContract,
    appearance:profile.appearance && typeof profile.appearance === 'object' ? { ...profile.appearance } : null
  };
};

/** Maintient le footballeur de carrière dans un seul effectif local, sans désynchroniser un contrat. */
export function syncCareerPlayerRoster({ clubs, career, profile, playerId = CAREER_ROSTER_PLAYER_ID } = {}) {
  if (!clubs || !career || !profile || typeof clubs.listClubs !== 'function') return { ok:false, reason:'invalid-context' };
  const refreshed = career.refreshContractStatus?.();
  if (refreshed?.persistenceFailed) return { ok:false, reason:'career-persistence-failed' };
  const id = String(playerId || '').trim().slice(0, 48);
  if (!id) return { ok:false, reason:'invalid-player' };

  const contractClubId = career.contract?.clubId;
  const targetId = career.contract?.status === 'active' && contractClubId && !career.getContractStatus?.()?.expired
    ? String(contractClubId)
    : null;
  const locations = clubs.listClubs().filter(club => club.roster.some(player => player.id === id));
  if (!targetId) {
    for (const club of locations) {
      if (!clubs.removePlayer(club.id, id)) return { ok:false, reason:'roster-persistence-failed', clubId:club.id };
    }
    return { ok:true, registered:false, reason:'free-agent' };
  }

  const target = clubs.getClub(targetId);
  if (!target) return { ok:false, reason:'unknown-club', clubId:targetId };
  const source = locations.find(club => club.id === targetId) || locations[0] || null;
  const player = profilePlayer(profile, target, career);

  if (source && source.id !== targetId) {
    const updatedSource = clubs.updatePlayer(source.id, player);
    if (!updatedSource.ok) return updatedSource;
    for (const duplicate of locations) {
      if (duplicate.id !== source.id && duplicate.id !== targetId && !clubs.removePlayer(duplicate.id, id)) {
        return { ok:false, reason:'roster-persistence-failed', clubId:duplicate.id };
      }
    }
    const moved = clubs.transferPlayer(source.id, targetId, id);
    if (!moved.ok) return moved;
    return { ok:true, registered:true, clubId:targetId, player:clubs.getClub(targetId).roster.find(item=>item.id===id) };
  }

  if (source) {
    const updated = clubs.updatePlayer(targetId, player);
    return updated.ok ? { ok:true, registered:true, clubId:targetId, player:updated.player } : updated;
  }

  const added = clubs.addPlayer(targetId, { ...player, playerType:'human' });
  if (!added.ok) return added;
  return { ok:true, registered:true, clubId:targetId, player:clubs.getClub(targetId).roster.find(item=>item.id===id) };
}
