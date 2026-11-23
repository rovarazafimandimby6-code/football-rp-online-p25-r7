/** Conseils de jeu contextuels : le joueur reste maître de son avatar et de ses décisions. */
const ROLE_GUIDANCE = Object.freeze({
  GK: Object.freeze({ possession: 'Relancez proprement et restez disponible.', support: 'Restez disponible derrière la ligne du ballon.', defend: 'Ajustez votre placement et protégez le but.', loose: 'Anticipez la trajectoire du ballon.' }),
  DEF: Object.freeze({ possession: 'Sécurisez la relance avant de progresser.', support: 'Couvrez l’espace et offrez une sortie sûre.', defend: 'Protégez l’axe et surveillez la profondeur.', loose: 'Avancez avec mesure pour récupérer le ballon.' }),
  MID: Object.freeze({ possession: 'Levez la tête et orientez le jeu.', support: 'Offrez une ligne de passe entre les lignes.', defend: 'Fermez les lignes de passe et accompagnez le repli.', loose: 'Anticipez le second ballon et la récupération.' }),
  FWD: Object.freeze({ possession: 'Fixez le défenseur ou préparez la finition.', support: 'Attaquez l’espace et proposez un appel.', defend: 'Orientez le pressing vers le côté.', loose: 'Pressez la relance et préparez la transition.' })
});
const PHASE_LABELS = Object.freeze({ possession: 'AVEC LE BALLON', support: 'SOUTIEN', defend: 'PHASE DÉFENSIVE', loose: 'BALLON LIBRE' });

export function resolvePlayerGuidance(player, ball, matchPhase = 'playing') {
  const role = ROLE_GUIDANCE[player?.role] ? player.role : 'MID';
  let phase = 'loose';
  if (matchPhase !== 'playing') phase = 'support';
  else if (ball?.owner === player) phase = 'possession';
  else if (ball?.owner && ball.owner.team === player?.team) phase = 'support';
  else if (ball?.owner && ball.owner.team !== player?.team) phase = 'defend';
  return { phase, label: PHASE_LABELS[phase], text: PHASE_LABELS[phase] + ' · ' + ROLE_GUIDANCE[role][phase] };
}
