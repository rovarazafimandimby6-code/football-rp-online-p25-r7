const rating = player => Number.isFinite(Number(player?.rating)) ? Math.max(1, Math.min(99, Number(player.rating))) : 50;
const potential = player => Number.isFinite(Number(player?.potential)) ? Math.max(1, Math.min(99, Number(player.potential))) : rating(player);

/** Sélectionne un remplacement IA à partir des joueurs réellement inscrits sur le banc. */
export function selectAISubstitution({ team, players = [], bench = [], used = 0, limit = 3, elapsedRatio = 0, staminaThreshold = 0.34 } = {}) {
  if (!['blue', 'red'].includes(team) || used >= limit || elapsedRatio < 0.4) return null;
  const outgoing = players
    .filter(player => player?.team === team && !player.isControlled && Number.isFinite(player.stamina) && player.stamina <= staminaThreshold)
    .sort((a, b) => a.stamina - b.stamina || rating(a) - rating(b) || String(a.id).localeCompare(String(b.id)))[0];
  if (!outgoing) return null;
  const incoming = bench
    .filter(player => player && player.id !== null && player.id !== undefined && player.role === outgoing.role)
    .sort((a, b) => rating(b) - rating(a) || potential(b) - potential(a) || String(a.id).localeCompare(String(b.id)))[0];
  return incoming ? { team, outgoing, incoming } : null;
}
