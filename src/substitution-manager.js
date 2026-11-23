const fail = (code, message) => ({ ok: false, code, message });

/** Valide un remplacement sans modifier l'effectif ni l'état du match. */
export function validateSubstitution({ phase, online = false, outgoing, incoming, activePlayer, used = 0, limit = 3 }) {
  if (phase !== 'paused') return fail('match-not-paused', 'Mettez le match en pause pour effectuer un remplacement.');
  if (online) return fail('online-not-supported', 'Les remplacements en ligne ne sont pas encore disponibles.');
  if (!Number.isFinite(used) || !Number.isFinite(limit) || used >= limit) return fail('substitution-limit', 'Limite de remplacements atteinte.');
  if (!outgoing || outgoing.team !== 'blue') return fail('invalid-outgoing', 'Joueur sortant invalide.');
  if (outgoing === activePlayer || outgoing.isControlled || outgoing.id === activePlayer?.id) {
    return fail('controlled-player-protected', 'Votre footballeur personnel ne peut pas être remplacé.');
  }
  if (!incoming || incoming.id === null || incoming.id === undefined || incoming.id === outgoing.id) {
    return fail('invalid-incoming', 'Joueur entrant invalide.');
  }
  if (incoming.role !== outgoing.role) return fail('role-mismatch', 'Le remplaçant doit occuper le même poste.');
  return { ok: true, code: 'valid-substitution', message: 'Remplacement autorisé.' };
}
