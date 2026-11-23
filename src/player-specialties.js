export const PLAYER_SPECIALTIES = Object.freeze({
  GOALKEEPER: 'reflex',
  DEFENDER_STOPPER: 'stopper',
  DEFENDER_COVER: 'cover',
  PLAYMAKER: 'playmaker',
  FINISHER: 'finisher',
  RUNNER: 'runner'
});

export function specialtyForSlot(role, index = 0) {
  if (role === 'GK') return PLAYER_SPECIALTIES.GOALKEEPER;
  if (role === 'DEF') return index === 1 ? PLAYER_SPECIALTIES.DEFENDER_STOPPER : PLAYER_SPECIALTIES.DEFENDER_COVER;
  if (role === 'MID') return PLAYER_SPECIALTIES.PLAYMAKER;
  return index % 2 ? PLAYER_SPECIALTIES.FINISHER : PLAYER_SPECIALTIES.RUNNER;
}
