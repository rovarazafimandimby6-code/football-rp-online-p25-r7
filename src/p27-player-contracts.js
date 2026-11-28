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

export const SYSTEM_CONTRACT_MIN_WEEKS = 4;
export const SYSTEM_CONTRACT_MAX_WEEKS = 104;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function setSystemPlayerContractTerm(contract, { signedAt, durationWeeks } = {}) {
  if (!contract || contract.type !== 'system-roster' || contract.status !== 'active') return { ok:false, reason:'contract-not-active' };
  if (!Number.isSafeInteger(signedAt) || signedAt < 0) return { ok:false, reason:'invalid-signing-time' };
  if (!Number.isInteger(durationWeeks) || durationWeeks < SYSTEM_CONTRACT_MIN_WEEKS || durationWeeks > SYSTEM_CONTRACT_MAX_WEEKS) return { ok:false, reason:'invalid-duration' };
  const expiresAt = signedAt + durationWeeks * WEEK_MS;
  if (!Number.isSafeInteger(expiresAt)) return { ok:false, reason:'invalid-expiry' };
  return { ok:true, contract:{ ...contract, signedAt:new Date(signedAt).toISOString(), durationWeeks, expiresAt:new Date(expiresAt).toISOString(), status:'active' } };
}

export function expireSystemPlayerContract(contract, { now } = {}) {
  if (!contract || contract.type !== 'system-roster' || contract.status !== 'active') return { ok:false, reason:'contract-not-active' };
  if (!Number.isSafeInteger(now) || now < 0) return { ok:false, reason:'invalid-time' };
  const expiresAt = Date.parse(contract.expiresAt);
  if (!Number.isFinite(expiresAt)) return { ok:false, reason:'contract-has-no-expiry' };
  if (expiresAt > now) return { ok:false, reason:'contract-not-due', expiresAt };
  return { ok:true, contract:{ ...contract, status:'expired', expiredAt:new Date(now).toISOString() } };
}


export function renewSystemPlayerContract(contract, { now, durationWeeks, weeklyWage } = {}) {
  if (!contract || contract.type !== 'system-roster' || contract.status !== 'active') return { ok:false, reason:'contract-not-active' };
  if (!Number.isSafeInteger(now) || now < 0) return { ok:false, reason:'invalid-time' };
  if (!Number.isInteger(durationWeeks) || durationWeeks < SYSTEM_CONTRACT_MIN_WEEKS || durationWeeks > SYSTEM_CONTRACT_MAX_WEEKS) return { ok:false, reason:'invalid-duration' };
  const currentExpiry = Date.parse(contract.expiresAt);
  if (!Number.isFinite(currentExpiry)) return { ok:false, reason:'contract-has-no-expiry' };
  if (now > currentExpiry) return { ok:false, reason:'contract-expired' };
  const startAt = Math.max(now, currentExpiry);
  const expiresAt = startAt + durationWeeks * WEEK_MS;
  if (!Number.isSafeInteger(expiresAt)) return { ok:false, reason:'invalid-expiry' };
  const wage = weeklyWage === undefined ? (contract.weeklyWage ?? contract.salary) : weeklyWage;
  if (!Number.isSafeInteger(wage) || wage <= 0) return { ok:false, reason:'invalid-wage' };
  return { ok:true, contract:{
    ...contract,
    weeklyWage:wage,
    salary:wage,
    durationWeeks,
    expiresAt:new Date(expiresAt).toISOString(),
    renewedAt:new Date(now).toISOString(),
    renewalCount:Math.max(0, Number(contract.renewalCount) || 0) + 1,
    termHistory:[...(Array.isArray(contract.termHistory) ? contract.termHistory : []), {
      previousExpiresAt:contract.expiresAt,
      renewedAt:new Date(now).toISOString(),
      durationWeeks,
      weeklyWage:wage
    }].slice(-20)
  } };
}


/**
 * Evaluate a renewal using explicit club wage headroom supplied by the caller.
 * The policy never reads or guesses a club's cash balance.
 */
export function evaluateSystemContractRenewal({ player, club, now, renewalWindowWeeks = 4, availableWeeklyWageBudget } = {}) {
  if (!player || player.playerType !== 'system' || !player.contract || player.contract.type !== 'system-roster' || player.contract.status !== 'active') return { renew:false, reason:'contract-not-active' };
  if (!club || !Number.isSafeInteger(now) || now < 0) return { renew:false, reason:'invalid-context' };
  if (!Number.isInteger(renewalWindowWeeks) || renewalWindowWeeks < 1 || renewalWindowWeeks > 26) return { renew:false, reason:'invalid-renewal-window' };
  if (!Number.isSafeInteger(availableWeeklyWageBudget) || availableWeeklyWageBudget < 0) return { renew:false, reason:'budget-not-provided' };
  const expiresAt = Date.parse(player.contract.expiresAt);
  if (!Number.isFinite(expiresAt)) return { renew:false, reason:'contract-has-no-expiry' };
  if (expiresAt < now) return { renew:false, reason:'contract-expired' };
  if (expiresAt - now > renewalWindowWeeks * WEEK_MS) return { renew:false, reason:'outside-renewal-window' };
  const wage = player.contract.weeklyWage ?? player.contract.salary;
  if (!Number.isSafeInteger(wage) || wage <= 0) return { renew:false, reason:'invalid-wage' };
  if (wage > availableWeeklyWageBudget) return { renew:false, reason:'wage-budget-exceeded', requiredWeeklyBudget:wage };
  const rating = Number(player.rating);
  const clubRating = Number(club.rating);
  const loyalty = Number(player.loyalty?.clubLoyalty ?? 50);
  const age = Number(player.age);
  const sportingFit = Number.isFinite(rating) && Number.isFinite(clubRating) && rating >= clubRating - 8;
  const loyaltyFit = Number.isFinite(loyalty) && loyalty >= 75;
  const ageFit = !Number.isFinite(age) || age <= 34;
  if ((!sportingFit && !loyaltyFit) || !ageFit) return { renew:false, reason:'sporting-policy-declined' };
  return { renew:true, reason:'renewal-approved', durationWeeks:26, weeklyWage:wage };
}
