const clone = value => structuredClone(value);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const REQUIRED_SECTIONS = Object.freeze(['profile', 'progression', 'career', 'playerCareer', 'seasonStats', 'contract']);
const MAX_MATCHES = 20_000;
const MAX_HISTORY = 20_000;
const validId = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 64;
function validateCareerSection(value, code) {
  if (!isObject(value) || !isObject(value.totals) || !Array.isArray(value.matches) || value.matches.length > MAX_MATCHES) {
    throw new Error(code);
  }
  const ids = new Set();
  for (const match of value.matches) {
    if (!isObject(match) || !validId(match.matchId) || ids.has(match.matchId)) throw new Error(code);
    ids.add(match.matchId);
    if (match.result !== undefined && !['win', 'draw', 'loss'].includes(match.result)) throw new Error(code);
  }
}
function validateRows(rows, code) {
  if (!Array.isArray(rows) || rows.length > MAX_HISTORY || rows.some(row => !isObject(row))) throw new Error(code);
}
export function buildAccountRecoveryPlan(snapshot) {
  if (!isObject(snapshot) || snapshot.schemaVersion !== 1 || REQUIRED_SECTIONS.some(section => !isObject(snapshot[section]))) {
    throw new Error('INVALID_RECOVERY_SNAPSHOT');
  }
  const { profile, progression, career, playerCareer, seasonStats, contract } = snapshot;
  if (!isObject(profile.identity) || !isObject(profile.appearance)
    || !Number.isSafeInteger(progression.level) || progression.level < 1 || progression.level > 99
    || !Number.isSafeInteger(progression.experience) || progression.experience < 0
    || !Number.isSafeInteger(progression.coins) || progression.coins < 0
    || !Number.isSafeInteger(progression.trainingPoints) || progression.trainingPoints < 0
    || !isObject(progression.attributes)
    || !Array.isArray(progression.processedMatchIds) || progression.processedMatchIds.length > 2000
    || progression.processedMatchIds.some(id => !validId(id))
    || !isObject(seasonStats.totals) || !Array.isArray(seasonStats.matches)
    || seasonStats.matches.length > MAX_MATCHES
    || !Array.isArray(seasonStats.processedMatchIds) || seasonStats.processedMatchIds.length > MAX_MATCHES
    || seasonStats.processedMatchIds.some(id => !validId(id))
    || !Number.isSafeInteger(contract.wallet) || contract.wallet < 0
    || !(contract.clubId === null || (typeof contract.clubId === 'string' && contract.clubId.length <= 64))
    || !(contract.contract === null || isObject(contract.contract))
    || !['offers','history','loanOffers','loanHistory'].every(key => Array.isArray(contract[key]) && contract[key].length <= MAX_HISTORY)
    || ['offers','history','loanOffers','loanHistory'].some(key => contract[key].some(row => !isObject(row)))) {
    throw new Error('INVALID_RECOVERY_STORE_MAPPING');
  }
  validateCareerSection(career, 'INVALID_RECOVERY_CAREER');
  validateCareerSection(playerCareer, 'INVALID_RECOVERY_PLAYER_CAREER');
  const seasonIds = new Set();
  for (const match of seasonStats.matches) {
    if (!isObject(match) || !validId(match.matchId) || seasonIds.has(match.matchId)
      || (match.result !== undefined && !['win', 'draw', 'loss'].includes(match.result))) {
      throw new Error('INVALID_RECOVERY_SEASON_STATS');
    }
    seasonIds.add(match.matchId);
  }
  const profileProgression = { ...clone(profile), progression: clone(progression), appliedMatchIds: [...new Set([
    ...(Array.isArray(profile.appliedMatchIds) ? profile.appliedMatchIds : []), ...progression.processedMatchIds
  ].filter(id => typeof id === 'string' && id.trim()).map(id => id.slice(0,64)))].slice(-2000) };
  const transferCareerManager = {
    wallet: contract.wallet, clubId: contract.clubId, contract: clone(contract.contract),
    offers: clone(contract.offers), history: clone(contract.history).slice(-200),
    matchRewards: [], processedMatchIds: [], nextOfferNumber: 1
  };
  return { schemaVersion: 1, stores: {
    profileProgression, seasonStats: clone(seasonStats), onlineCareerArchive: clone(career),
    playerCareerArchive: clone(playerCareer), transferCareerArchive: clone(contract), transferCareerManager
  }, mapping: {
    profileProgression: 'profile.identity+appearance+server.progression', seasonStats: 'server.seasonStats',
    onlineCareerArchive: 'server.career (kept distinct)', playerCareerArchive: 'server.playerCareer (kept distinct)',
    transferCareerArchive: 'server.contract (complete; includes loans)',
    transferCareerManager: 'server.contract core fields -> local CareerManager; loan fields retained in archive'
  } };
}
