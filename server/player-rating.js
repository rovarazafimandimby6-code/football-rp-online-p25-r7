const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const count = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

export function calculatePlayerMatchRating(player = {}) {
  const minutes = count(player.minutesPlayedMs) / 60000;
  if (minutes < 0.25) return null;
  const stats = player.stats || {};
  const goals = count(stats.goals), assists = count(stats.assists);
  const shots = count(stats.shots), passes = count(stats.passes);
  const completedPasses = Math.min(passes, count(stats.completedPasses));
  const tackles = count(stats.tackles), saves = count(stats.saves);
  const interceptions = count(stats.interceptions);
  const passAccuracy = passes > 0 ? completedPasses / passes : null;
  const participation = Math.min(1, minutes / 3.5);
  let score = 6 + (participation - 0.5) * 0.5;
  score += goals * (player.role === 'GK' ? 1.0 : 1.15) + assists * 0.82;
  score += Math.min(0.18, shots * (player.role === 'FWD' ? 0.025 : 0.012));
  if (passAccuracy !== null) {
    score += Math.min(0.38, completedPasses * 0.022);
    score += passAccuracy >= 0.82 ? 0.28 : passAccuracy >= 0.68 ? 0.12 : passAccuracy < 0.45 ? -0.3 : 0;
  }
  if (player.role === 'GK') {
    score += Math.min(1.05, saves * 0.34) + Math.min(0.18, interceptions * 0.06);
  } else if (player.role === 'DEF') {
    score += Math.min(0.48, tackles * 0.12) + Math.min(0.62, interceptions * 0.2);
  } else if (player.role === 'MID') {
    score += Math.min(0.28, tackles * 0.07) + Math.min(0.35, interceptions * 0.12);
  } else {
    score += Math.min(0.2, tackles * 0.05);
  }
  return Math.round(clamp(score, 4.5, 10) * 10) / 10;
}

const rank = (a,b) => (b.rating ?? -1) - (a.rating ?? -1)
  || (b.stats.goals-a.stats.goals) || (b.stats.assists-a.stats.assists)
  || (b.minutesPlayedMs-a.minutesPlayedMs) || String(a.playerId).localeCompare(String(b.playerId));

export function buildMatchPerformance(players = []) {
  const rated = players.map(player => {
    const passes = count(player.stats?.passes);
    const completedPasses = Math.min(passes, count(player.stats?.completedPasses));
    return { ...player, stats: {
      passes, completedPasses, passAccuracy: passes ? Math.round(completedPasses / passes * 100) : null,
      shots:count(player.stats?.shots), tackles:count(player.stats?.tackles),
      goals:count(player.stats?.goals), assists:count(player.stats?.assists),
      saves:count(player.stats?.saves), interceptions:count(player.stats?.interceptions)
    }, rating:calculatePlayerMatchRating(player) };
  });
  const participants = rated.filter(player => player.rating !== null).sort(rank);
  const compact = player => player ? ({
    playerId:player.playerId,name:player.name,team:player.team,role:player.role,
    rating:player.rating,goals:player.stats.goals,assists:player.stats.assists,
    minutesPlayedMs:player.minutesPlayedMs,passAccuracy:player.stats.passAccuracy
  }) : null;
  return { players:rated, awards:{
    playerOfMatch:compact(participants[0] || null),
    teamStandouts:{
      blue:compact(participants.find(p=>p.team==='blue') || null),
      red:compact(participants.find(p=>p.team==='red') || null)
    },
    topPerformers:participants.slice(0,3).map(compact)
  }};
}
