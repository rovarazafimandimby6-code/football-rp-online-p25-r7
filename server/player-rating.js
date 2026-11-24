const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const count = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

export function calculatePlayerMatchRating(player = {}) {
  const minutes = count(player.minutesPlayedMs) / 60000;
  if (minutes < 0.25) return null;
  const stats = player.stats || {};
  const goals = count(stats.goals), assists = count(stats.assists);
  const shots = count(stats.shots), passes = count(stats.passes);
  const tackles = count(stats.tackles), saves = count(stats.saves);
  const interceptions = count(stats.interceptions);
  const participation = Math.min(1, minutes / 3.5);
  let score = 6 + (participation - 0.5) * 0.5;
  score += goals * 1.15 + assists * 0.78;
  score += Math.min(0.42, passes * 0.025) + Math.min(0.18, shots * 0.018);
  score += tackles * 0.085 + interceptions * 0.13 + saves * 0.3;
  if (player.role === 'GK') score += Math.min(0.3, saves * 0.12);
  if (player.role === 'DEF') score += Math.min(0.22, interceptions * 0.045 + tackles * 0.025);
  return Math.round(clamp(score, 4.5, 10) * 10) / 10;
}

const rank = (a,b) => (b.rating ?? -1) - (a.rating ?? -1) || (b.stats.goals-a.stats.goals) || (b.stats.assists-a.stats.assists) || (b.minutesPlayedMs-a.minutesPlayedMs) || String(a.playerId).localeCompare(String(b.playerId));

export function buildMatchPerformance(players = []) {
  const rated = players.map(player => ({ ...player, stats: {
    passes:count(player.stats?.passes), shots:count(player.stats?.shots), tackles:count(player.stats?.tackles),
    goals:count(player.stats?.goals), assists:count(player.stats?.assists), saves:count(player.stats?.saves), interceptions:count(player.stats?.interceptions)
  }, rating:calculatePlayerMatchRating(player) }));
  const participants = rated.filter(player => player.rating !== null).sort(rank);
  const compact = player => player ? ({playerId:player.playerId,name:player.name,team:player.team,rating:player.rating,goals:player.stats.goals,assists:player.stats.assists}) : null;
  return { players:rated, awards:{ playerOfMatch:compact(participants[0] || null), teamStandouts:{blue:compact(participants.find(p=>p.team==='blue') || null),red:compact(participants.find(p=>p.team==='red') || null)}, topPerformers:participants.slice(0,3).map(compact) } };
}