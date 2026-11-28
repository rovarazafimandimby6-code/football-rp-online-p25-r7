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
const MAX_RESOURCE = 1_000_000_000;
const OFFER_STATUSES = new Set(['pending', 'accepted', 'rejected', 'expired', 'cancelled']);
const validCount = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_RESOURCE;
const validClubId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(value);
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
function validateOffers(offers) {
  if (!Array.isArray(offers) || offers.length > MAX_HISTORY) throw new Error('INVALID_RECOVERY_OFFERS');
  const ids = new Set();
  const pendingClubs = new Set();
  let pendingCount = 0;
  for (const offer of offers) {
    if (!isObject(offer) || !validId(offer.id) || ids.has(offer.id)
      || !validClubId(offer.fromClubId) || !OFFER_STATUSES.has(offer.status)
      || !validCount(offer.salary) || !validCount(offer.fee)
      || !(offer.expiresAt === null || offer.expiresAt === undefined || validDate(offer.expiresAt))) {
      throw new Error('INVALID_RECOVERY_OFFERS');
    }
    ids.add(offer.id);
    if (offer.status === 'pending') {
      pendingCount++;
      if (pendingClubs.has(offer.fromClubId)) throw new Error('INVALID_RECOVERY_OFFERS');
      pendingClubs.add(offer.fromClubId);
    }
  }
  if (pendingCount > 5) throw new Error('INVALID_RECOVERY_OFFERS');
}
function validateContract(contract, clubId) {
  if (contract === null) return;
  if (!isObject(contract) || !validClubId(contract.clubId)
    || !['active', 'terminated', 'expired'].includes(contract.status)
    || !validCount(contract.salary)
    || !validDate(contract.signedAt) || !validDate(contract.expiresAt)
    || !(contract.lastSalaryPaidAt === null || contract.lastSalaryPaidAt === undefined || validDate(contract.lastSalaryPaidAt))
    || (clubId !== null && clubId !== contract.clubId)
    || (contract.status === 'active' && clubId !== contract.clubId)) {
    throw new Error('INVALID_RECOVERY_CONTRACT');
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
  const attributeKeys = ['pace', 'shooting', 'passing', 'defense', 'stamina', 'control'];
  if (!isObject(progression.attributes) || attributeKeys.some(key =>
    !Number.isSafeInteger(progression.attributes[key]) || progression.attributes[key] < 1 || progression.attributes[key] > 99)) {
    throw new Error('INVALID_RECOVERY_STORE_MAPPING');
  }
  if (!isObject(profile.identity) || !isObject(profile.appearance)
    || !Number.isSafeInteger(progression.level) || progression.level < 1 || progression.level > 99
    || !Number.isSafeInteger(progression.experience) || progression.experience < 0 || progression.experience > MAX_RESOURCE
    || !validCount(progression.coins) || !validCount(progression.trainingPoints)
    || !isObject(progression.attributes)
    || !['pace', 'shooting', 'passing', 'defense', 'stamina', 'control'].every(key =>
      Number.isSafeInteger(progression.attributes[key]) && progression.attributes[key] >= 1 && progression.attributes[key] <= 99)
    || !Array.isArray(progression.processedMatchIds) || progression.processedMatchIds.length > 2000
    || progression.processedMatchIds.some(id => !validId(id))
    || new Set(progression.processedMatchIds).size !== progression.processedMatchIds.length
    || !isObject(seasonStats.totals) || !Array.isArray(seasonStats.matches)
    || seasonStats.matches.length > MAX_MATCHES
    || !Array.isArray(seasonStats.processedMatchIds) || seasonStats.processedMatchIds.length > MAX_MATCHES
    || seasonStats.processedMatchIds.some(id => !validId(id))
    || !validCount(contract.wallet)
    || !(contract.clubId === null || validClubId(contract.clubId))
    || !(contract.contract === null || isObject(contract.contract))
    || !['offers','history','loanOffers','loanHistory'].every(key => Array.isArray(contract[key]) && contract[key].length <= MAX_HISTORY)
    || ['offers','history','loanOffers','loanHistory'].some(key => contract[key].some(row => !isObject(row)))) {
    throw new Error('INVALID_RECOVERY_STORE_MAPPING');
  }
  validateOffers(contract.offers);
  validateContract(contract.contract, contract.clubId);
  if (contract.clubId !== null && contract.contract?.status === 'active' && contract.clubId !== contract.contract.clubId) {
    throw new Error('INVALID_RECOVERY_CONTRACT');
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
  if (new Set(seasonStats.processedMatchIds).size !== seasonStats.processedMatchIds.length
    || seasonStats.processedMatchIds.some(id => !seasonIds.has(id))) {
    throw new Error('INVALID_RECOVERY_SEASON_STATS');
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
