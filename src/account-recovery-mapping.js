const clone = value => structuredClone(value);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const REQUIRED_SECTIONS = Object.freeze(['profile', 'progression', 'career', 'playerCareer', 'seasonStats', 'contract']);
export function buildAccountRecoveryPlan(snapshot) {
  if (!isObject(snapshot) || snapshot.schemaVersion !== 1 || REQUIRED_SECTIONS.some(section => !isObject(snapshot[section]))) throw new Error('INVALID_RECOVERY_SNAPSHOT');
  const { profile, progression, seasonStats, contract } = snapshot;
  if (!isObject(profile.identity) || !isObject(profile.appearance) || !Number.isSafeInteger(progression.level)
    || !Array.isArray(progression.processedMatchIds) || !isObject(seasonStats.totals) || !Array.isArray(seasonStats.matches)
    || !Array.isArray(seasonStats.processedMatchIds) || !Number.isSafeInteger(contract.wallet) || contract.wallet < 0
    || !(contract.clubId === null || typeof contract.clubId === 'string') || !(contract.contract === null || isObject(contract.contract))
    || !['offers','history','loanOffers','loanHistory'].every(key => Array.isArray(contract[key]))) throw new Error('INVALID_RECOVERY_STORE_MAPPING');
  const profileProgression = { ...clone(profile), progression: clone(progression), appliedMatchIds: [...new Set([
    ...(Array.isArray(profile.appliedMatchIds) ? profile.appliedMatchIds : []), ...progression.processedMatchIds
  ].filter(id => typeof id === 'string' && id.trim()).map(id => id.slice(0,64)))].slice(-2000) };
  const transferCareerManager = {
    wallet: contract.wallet, clubId: contract.clubId, contract: clone(contract.contract),
    offers: clone(contract.offers), history: clone(contract.history).slice(-200),
    matchRewards: [], processedMatchIds: [], nextOfferNumber: 1
  };
  return { schemaVersion: 1, stores: {
    profileProgression, seasonStats: clone(seasonStats), onlineCareerArchive: clone(snapshot.career),
    playerCareerArchive: clone(snapshot.playerCareer), transferCareerArchive: clone(contract), transferCareerManager
  }, mapping: {
    profileProgression: 'profile.identity+appearance+server.progression', seasonStats: 'server.seasonStats',
    onlineCareerArchive: 'server.career (kept distinct)', playerCareerArchive: 'server.playerCareer (kept distinct)',
    transferCareerArchive: 'server.contract (complete; includes loans)',
    transferCareerManager: 'server.contract core fields -> local CareerManager; loan fields retained in archive'
  }};
}