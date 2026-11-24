const clamp = (value, min = 1, max = 100) => Math.max(min, Math.min(max, Math.round(value)));
function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function randomFor(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
const DIVISION_PROFILE_BASES = Object.freeze({
  D1: Object.freeze({ popularity:78, attractiveness:76, infrastructure:78, management:68 }),
  D2: Object.freeze({ popularity:65, attractiveness:64, infrastructure:64, management:62 }),
  D3: Object.freeze({ popularity:52, attractiveness:53, infrastructure:52, management:58 }),
  D4: Object.freeze({ popularity:40, attractiveness:43, infrastructure:40, management:54 }),
  D5: Object.freeze({ popularity:30, attractiveness:34, infrastructure:31, management:50 })
});
/**
 * Deterministic off-pitch club profile. Explicit authored characteristics win;
 * generated values are stable per club and remain independent from sporting rating.
 */
export function generateClubCharacteristics(club = {}) {
  const division = DIVISION_PROFILE_BASES[club.division] ? club.division : 'D5';
  const base = DIVISION_PROFILE_BASES[division];
  const random = randomFor(hashSeed(`fpro-p27-club-profile:${club.id || club.name || 'club'}`));
  const rating = clamp(Number(club.rating) || 50);
  const reputation = clamp(Number(club.reputation) || 40);
  const budget = Math.max(0, Number(club.budget) || 0);
  const financialFactor = Math.max(-7, Math.min(7, Math.log10(Math.max(1, budget) / 250000) * 4));
  const reputationFactor = (reputation - 50) * 0.18;
  const ratingFactor = (rating - 60) * 0.12;
  const result = {};
  for (const [key, value] of Object.entries(base)) {
    const variance = Math.round((random() * 2 - 1) * 8);
    const adjustment = key === 'management' ? financialFactor * 0.35
      : key === 'infrastructure' ? financialFactor * 0.65
      : key === 'attractiveness' ? reputationFactor + ratingFactor
      : reputationFactor;
    result[key] = clamp(value + variance + adjustment);
  }
  return Object.freeze(result);
}
export const CLUB_CHARACTERISTIC_KEYS = Object.freeze(['popularity','attractiveness','infrastructure','management']);
export const CLUB_DIVISION_PROFILE_BASES = DIVISION_PROFILE_BASES;
