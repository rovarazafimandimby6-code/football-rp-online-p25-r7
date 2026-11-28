export const ROTATION_RULES_V1 = Object.freeze({
  playersOnPitchPerTeam: 5,
  minimumSubstitutesPerTeam: 3,
  maximumSubstitutesPerTeam: 7,
  returnCooldownMatchSeconds: 10 * 60,
  substitutionsLimit: Infinity,
  allowedPhases: Object.freeze(['stoppage', 'paused', 'halftime']),
});

const fail = (code, message) => ({ ok: false, code, message });

/** Validate a 5v5 team sheet without silently dropping or duplicating players. */
export function validateMatchSheet({ starters = [], substitutes = [] } = {}) {
  if (!Array.isArray(starters) || starters.length !== ROTATION_RULES_V1.playersOnPitchPerTeam) {
    return fail('invalid-starters-count', 'Une feuille de match doit avoir exactement 5 titulaires.');
  }
  if (!Array.isArray(substitutes)
    || substitutes.length < ROTATION_RULES_V1.minimumSubstitutesPerTeam
    || substitutes.length > ROTATION_RULES_V1.maximumSubstitutesPerTeam) {
    return fail('invalid-substitutes-count', 'La feuille de match doit contenir entre 3 et 7 remplaçants.');
  }
  const all = [...starters, ...substitutes];
  const ids = all.map(player => player?.id);
  if (all.some(player => !player || player.id === null || player.id === undefined || String(player.id).trim() === '')) {
    return fail('invalid-player', 'Chaque joueur convoqué doit avoir un identifiant valide.');
  }
  if (new Set(ids).size !== ids.length) {
    return fail('duplicate-player', 'Un même joueur ne peut pas apparaître deux fois sur la feuille.');
  }
  return { ok: true, code: 'valid-match-sheet', totalPlayers: all.length };
}

/** Pure eligibility check for an unlimited rolling substitution. Times are virtual match seconds. */
export function validateRotation({ phase, elapsedMatchSeconds, outgoing, incoming, teamPlayers = null } = {}) {
  if (!ROTATION_RULES_V1.allowedPhases.includes(phase)) {
    return fail('not-a-stoppage', 'Le remplacement est autorisé uniquement pendant un arrêt de jeu.');
  }
  if (!Number.isFinite(elapsedMatchSeconds) || elapsedMatchSeconds < 0) {
    return fail('invalid-match-time', 'Temps de match invalide.');
  }
  if (!outgoing || !incoming || outgoing.id === undefined || incoming.id === undefined || outgoing.id === incoming.id) {
    return fail('invalid-player-pair', 'Joueurs sortant et entrant invalides.');
  }
  if (outgoing.team !== incoming.team) {
    return fail('different-teams', 'Un remplacement doit concerner deux joueurs de la même équipe.');
  }
  if (teamPlayers && (!teamPlayers.some(player => player?.id === outgoing.id)
    || !teamPlayers.some(player => player?.id === incoming.id))) {
    return fail('player-not-in-match-sheet', 'Les deux joueurs doivent figurer sur la feuille de match.');
  }
  const hasPreviousExit = incoming.lastSubstitutedOutAt !== null && incoming.lastSubstitutedOutAt !== undefined;
  const lastExit = hasPreviousExit ? Number(incoming.lastSubstitutedOutAt) : NaN;
  if (Number.isFinite(lastExit)) {
    const elapsedSinceExit = elapsedMatchSeconds - lastExit;
    if (elapsedSinceExit < ROTATION_RULES_V1.returnCooldownMatchSeconds) {
      return fail('return-cooldown', 'Ce joueur doit attendre 10 minutes de temps de match avant de revenir.');
    }
  }
  return { ok: true, code: 'rotation-allowed', message: 'Rotation autorisée.' };
}

/** Swap two registered squad members while preserving the on-pitch tactical slot. */
export function applyRotation({ starters, substitutes, outgoingId, incomingId, elapsedMatchSeconds }) {
  if (!Array.isArray(starters) || !Array.isArray(substitutes)) return fail('invalid-squad', 'Effectif invalide.');
  const outgoingIndex = starters.findIndex(player => player?.id === outgoingId);
  const incomingIndex = substitutes.findIndex(player => player?.id === incomingId);
  if (outgoingIndex < 0 || incomingIndex < 0) return fail('player-not-in-correct-list', 'Le joueur sortant doit être sur le terrain et le joueur entrant sur le banc.');
  const outgoing = starters[outgoingIndex];
  const incoming = substitutes[incomingIndex];
  const validation = validateRotation({
    phase: 'stoppage',
    elapsedMatchSeconds,
    outgoing,
    incoming,
    teamPlayers: [...starters, ...substitutes],
  });
  if (!validation.ok) return validation;
  const nextStarters = starters.slice();
  const nextSubstitutes = substitutes.slice();
  nextStarters[outgoingIndex] = { ...incoming, slotIndex: outgoing.slotIndex };
  nextSubstitutes[incomingIndex] = { ...outgoing, slotIndex: undefined, lastSubstitutedOutAt: elapsedMatchSeconds };
  return {
    ok: true,
    code: 'rotation-complete',
    starters: nextStarters,
    substitutes: nextSubstitutes,
    substitutionsUsed: null,
  };
}
