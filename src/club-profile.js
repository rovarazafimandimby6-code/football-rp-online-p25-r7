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


const NATIONALITY_CONTINENTS = Object.freeze({
  MG:'Africa', SN:'Africa', NG:'Africa', KE:'Africa', MA:'Africa', DZ:'Africa', TN:'Africa',
  FR:'Europe', GB:'Europe', IT:'Europe', ES:'Europe', PT:'Europe',
  BR:'South America', AR:'South America', JP:'Asia'
});
const CONTINENT_NATIONALITIES = Object.freeze(Object.fromEntries(
  [...new Set(Object.values(NATIONALITY_CONTINENTS))].map(continent => [
    continent, Object.freeze(Object.keys(NATIONALITY_CONTINENTS).filter(code => NATIONALITY_CONTINENTS[code] === continent))
  ])
));
const RESERVED_SYSTEM_CLUBS = Object.freeze({
  'manparis-sporting': Object.freeze({ division:'D1', mode:'continent', continent:'Europe' }),
  'londaka-city': Object.freeze({ division:'D2', mode:'continent', continent:'Africa' }),
  'valencia-northbridge': Object.freeze({ division:'D3', mode:'continent', continent:'Europe' }),
  'nairobi-tana-academy': Object.freeze({ division:'D5', mode:'continent', continent:'Africa' })
});
const VALID_CONTINENTS = Object.freeze(Object.keys(CONTINENT_NATIONALITIES));

/**
 * Separate human-admission policy from club control and roster capacity.
 * A reserved club remains system-managed and cannot be taken over by a human.
 */
export function generateClubRecruitmentProfile(club = {}) {
  const authored = club.recruitmentProfile && typeof club.recruitmentProfile === 'object'
    ? club.recruitmentProfile : null;
  const reserved = RESERVED_SYSTEM_CLUBS[club.id] || null;
  const mode = ['country','continent','mixed'].includes(authored?.mode) ? authored.mode : reserved?.mode || 'mixed';
  const continent = VALID_CONTINENTS.includes(authored?.continent) ? authored.continent : reserved?.continent || null;
  const countryCode = /^[A-Z]{2}$/.test(authored?.countryCode || '') ? authored.countryCode : /^[A-Z]{2}$/.test(club.countryCode || '') ? club.countryCode : 'MG';
  const nationalityCodes = mode === 'country' ? [countryCode]
    : mode === 'continent' ? [...(CONTINENT_NATIONALITIES[continent] || CONTINENT_NATIONALITIES.Africa)]
    : [];
  const admission = ['open','system-only'].includes(club.humanAdmission)
    ? club.humanAdmission : reserved ? 'system-only' : 'open';
  return Object.freeze({
    humanAdmission: admission,
    mode,
    continent: mode === 'continent' ? continent : null,
    countryCode: mode === 'country' ? countryCode : null,
    nationalityCodes: Object.freeze(nationalityCodes),
    reservedForSystem: admission === 'system-only'
  });
}

/**
 * Guarantees one clear above-division-average player while preserving roster
 * variation. A small club-level adjustment differentiates strong squads from
 * ordinary ones without making any club unbeatable.
 */
export function balanceClubRosterQuality(roster = [], club = {}) {
  if (!Array.isArray(roster) || roster.length === 0) return [];
  const division = DIVISION_PROFILE_BASES[club.division] ? club.division : 'D5';
  const ratingBand = ({ D1:[65,84,75], D2:[59,77,68], D3:[53,70,61.5], D4:[47,64,55.5], D5:[40,58,49] })[division];
  const [minimum, maximum, baseline] = ratingBand;
  const clubRating = clamp(Number(club.rating) || baseline);
  const teamAdjustment = Math.max(-2, Math.min(3, Math.round((clubRating - baseline) * 0.2)));
  const balanced = roster.map(player => {
    const rating = Math.max(minimum, Math.min(maximum, Number(player.rating || baseline) + teamAdjustment));
    const delta = rating - Number(player.rating || baseline);
    const attributes = Object.fromEntries(Object.entries(player.attributes || {}).map(([key,value]) => [key, clamp(Number(value) + delta, 25, 99)]));
    return { ...player, rating, attributes, potential: Math.max(rating, Number(player.potential) || rating) };
  });
  const standoutTarget = Math.min(maximum, Math.max(minimum, Math.floor(baseline) + 2));
  const best = balanced.reduce((winner, player, index, all) => player.rating > all[winner].rating ? index : winner, 0);
  if (balanced[best].rating < standoutTarget) {
    const player = balanced[best];
    const delta = standoutTarget - player.rating;
    player.rating = standoutTarget;
    player.potential = Math.max(standoutTarget, player.potential || standoutTarget);
    player.attributes = Object.fromEntries(Object.entries(player.attributes || {}).map(([key,value]) => [key, clamp(Number(value) + delta, 25, 99)]));
  }
  return balanced;
}
