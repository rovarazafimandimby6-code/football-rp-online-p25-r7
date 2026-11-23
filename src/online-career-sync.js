import { PlayerSeasonStats } from './player-season-stats.js';

const safeStat = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1_000_000, Math.floor(Number(value)))) : 0;

/**
 * Resolve the controlled human player's final performance from the server-owned
 * match report. Returns null when the report/player identity is incomplete.
 */
export function resolveOnlinePlayerPerformance(report, playerId) {
  if (!report || report.phase !== 'fulltime' || typeof playerId !== 'string' || !playerId) return null;
  const player = Array.isArray(report.players) ? report.players.find(row => row?.playerId === playerId && row.isBot !== true) : null;
  if (!player || !['blue', 'red'].includes(player.team) || !report.score) return null;
  const blue = safeStat(report.score.blue), red = safeStat(report.score.red);
  const outcome = blue === red ? 'draw' : (player.team === (blue > red ? 'blue' : 'red') ? 'win' : 'loss');
  const stats = Object.fromEntries(['goals', 'assists', 'shots', 'passes', 'tackles', 'interceptions'].map(field => [field, safeStat(player.stats?.[field])]));
  // The server counts accepted pass actions; these are the completed passes in its report.
  stats.completedPasses = stats.passes;
  return { playerId, team: player.team, result: outcome, cleanSheet: (player.team === 'blue' ? red : blue) === 0, stats };
}
