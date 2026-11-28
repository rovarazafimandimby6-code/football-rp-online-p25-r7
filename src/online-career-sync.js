const safeStat = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1_000_000, Math.floor(Number(value)))) : 0;
const safeRating = value => Number.isFinite(Number(value)) ? Math.round(Math.max(1, Math.min(10, Number(value))) * 10) / 10 : null;

/** Resolve only the controlled human player's authoritative final performance. */
export function resolveOnlinePlayerPerformance(report, playerId) {
  if (!report || report.phase !== 'fulltime' || typeof playerId !== 'string' || !playerId) return null;
  const player = Array.isArray(report.players) ? report.players.find(row => row?.playerId === playerId && row.isBot !== true) : null;
  if (!player || !['blue', 'red'].includes(player.team) || !report.score) return null;
  const blue = safeStat(report.score.blue), red = safeStat(report.score.red);
  const outcome = blue === red ? 'draw' : (player.team === (blue > red ? 'blue' : 'red') ? 'win' : 'loss');
  const stats = Object.fromEntries(['goals','assists','shots','passes','completedPasses','tackles','interceptions','saves'].map(field => [field, safeStat(player.stats?.[field])]));
  const opponentTeam = player.team === 'blue' ? 'red' : 'blue';
  return {
    playerId, team: player.team, role: ['GK','DEF','MID','FWD'].includes(player.role) ? player.role : 'MID',
    result: outcome, cleanSheet: (player.team === 'blue' ? red : blue) === 0,
    stats, rating: safeRating(player.rating), minutesPlayedMs: safeStat(player.minutesPlayedMs),
    playerOfMatch: report.awards?.playerOfMatch?.playerId === playerId,
    opponent: typeof report.teams?.[opponentTeam]?.name === 'string' ? report.teams[opponentTeam].name.slice(0,48) : ''
  };
}
