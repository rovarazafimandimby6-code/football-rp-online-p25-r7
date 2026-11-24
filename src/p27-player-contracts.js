/**
 * Deterministic weekly wage scale for generated system-controlled squad members.
 * Values are game-economy units, not real-world salary estimates.
 */
const DIVISION_WAGE_BASE = Object.freeze({ D1: 1200, D2: 800, D3: 500, D4: 300, D5: 180 });
const DIVISION_RATING_BASE = Object.freeze({ D1: 75, D2: 68, D3: 61.5, D4: 55.5, D5: 49 });

export function calculateSystemWeeklyWage({ division, rating } = {}) {
  const base = DIVISION_WAGE_BASE[division];
  const baseline = DIVISION_RATING_BASE[division];
  const overall = Number(rating);
  if (!base || !baseline || !Number.isFinite(overall)) return null;
  return Math.max(1, Math.round(base * Math.max(1, Math.min(99, overall)) / baseline));
}

export function createSystemPlayerContract({ clubId, playerId, division, rating } = {}) {
  const club = String(clubId || '').trim();
  const player = String(playerId || '').trim();
  const weeklyWage = calculateSystemWeeklyWage({ division, rating });
  if (!club || !player || weeklyWage === null) return null;
  return {
    id: `system-contract-${player}`,
    clubId: club,
    playerId: player,
    type: 'system-roster',
    status: 'active',
    salary: weeklyWage,
    weeklyWage
  };
}
