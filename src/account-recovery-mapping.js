const clone = value => structuredClone(value);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const REQUIRED_SECTIONS = Object.freeze([
  'profile', 'progression', 'career', 'playerCareer', 'seasonStats', 'contract'
]);

/**
 * Build a loss-aware import plan from a server-confirmed account snapshot.
 * This is deliberately pure: it never writes local storage or mutates a live store.
 */
export function buildAccountRecoveryPlan(snapshot) {
  if (!isObject(snapshot) || snapshot.schemaVersion !== 1
    || REQUIRED_SECTIONS.some(section => !isObject(snapshot[section]))) {
    throw new Error('INVALID_RECOVERY_SNAPSHOT');
  }

  const profile = snapshot.profile;
  const progression = snapshot.progression;
  const seasonStats = snapshot.seasonStats;

  if (!isObject(profile.identity) || !isObject(profile.appearance)
    || !Number.isSafeInteger(progression.level)
    || !Array.isArray(progression.processedMatchIds)
    || !isObject(seasonStats.totals) || !Array.isArray(seasonStats.matches)
    || !Array.isArray(seasonStats.processedMatchIds)) {
    throw new Error('INVALID_RECOVERY_STORE_MAPPING');
  }

  // The local profile store owns both appearance and progression in one key.
  // Server progression is authoritative; profile progression may be stale.
  const profileProgression = {
    ...clone(profile),
    progression: clone(progression),
    appliedMatchIds: [...new Set([
      ...(Array.isArray(profile.appliedMatchIds) ? profile.appliedMatchIds : []),
      ...progression.processedMatchIds
    ].filter(id => typeof id === 'string' && id.trim()).map(id => id.slice(0, 64)))].slice(-2000)
  };

  // The server builds this flat season-stat representation from playerCareer.
  // Keep it separate from the two career archives; their models are not equivalent.
  const seasonStatsStore = clone(seasonStats);
  const onlineCareerArchive = clone(snapshot.career);
  const playerCareerArchive = clone(snapshot.playerCareer);
  const transferCareerArchive = clone(snapshot.contract);

  return {
    schemaVersion: 1,
    stores: {
      profileProgression: profileProgression,
      seasonStats: seasonStatsStore,
      onlineCareerArchive,
      playerCareerArchive,
      transferCareerArchive
    },
    mapping: {
      profileProgression: 'profile.identity+appearance+server.progression',
      seasonStats: 'server.seasonStats',
      onlineCareerArchive: 'server.career (kept distinct)',
      playerCareerArchive: 'server.playerCareer (kept distinct)',
      transferCareerArchive: 'server.contract (not flattened into CareerManager)'
    }
  };
}
