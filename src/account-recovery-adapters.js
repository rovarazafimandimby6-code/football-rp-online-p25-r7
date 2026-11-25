import { buildAccountRecoveryPlan } from './account-recovery-mapping.js';
import { readJsonWithBackup, writeJsonWithBackup } from './persistent-json.js';
const ARCHIVE_SCHEMA_VERSION = 1;
const ARCHIVE_KEYS = Object.freeze({
  onlineCareer: 'football-rp-online.account-archive.online-career.v1',
  playerCareer: 'football-rp-online.account-archive.player-career.v1',
  transferCareer: 'football-rp-online.account-archive.transfer-career.v1'
});
const clone = value => structuredClone(value);
const objectValue = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
const normalizeArchive = value => !objectValue(value) || value.schemaVersion !== ARCHIVE_SCHEMA_VERSION || !objectValue(value.data)
  ? null : { schemaVersion: ARCHIVE_SCHEMA_VERSION, data: clone(value.data) };

function storageAdapter({ id, sections, storage, key, select, apply, rollbackMemory }) {
  if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) throw new Error('RECOVERY_STORAGE_UNAVAILABLE');
  return {
    id, sections,
    prepare(snapshot) { return clone(select(buildAccountRecoveryPlan(snapshot).stores)); },
    capture() { return { primary: storage.getItem(key), backup: storage.getItem(`${key}.backup`) }; },
    apply(value) { apply(value); },
    rollback(backup) {
      if (backup.primary === null) storage.removeItem(key); else storage.setItem(key, backup.primary);
      if (backup.backup === null) storage.removeItem(`${key}.backup`); else storage.setItem(`${key}.backup`, backup.backup);
      rollbackMemory?.();
    }
  };
}
function archiveAdapter({ id, section, storage, key, select }) {
  return storageAdapter({
    id, sections: [section], storage, key, select,
    apply(data) {
      if (!writeJsonWithBackup(storage, key, { schemaVersion: ARCHIVE_SCHEMA_VERSION, data }, normalizeArchive)) throw new Error('RECOVERY_ARCHIVE_WRITE_FAILED');
    }
  });
}
export function createAccountRecoveryAdapters({ profileStore, seasonStatsStore, storage } = {}) {
  if (!profileStore || typeof profileStore.save !== 'function' || !profileStore.storage || !profileStore.key) throw new Error('RECOVERY_PROFILE_STORE_INVALID');
  if (!seasonStatsStore || typeof seasonStatsStore.save !== 'function' || !seasonStatsStore.storage || !seasonStatsStore.key) throw new Error('RECOVERY_SEASON_STATS_STORE_INVALID');
  const archiveStorage = storage || profileStore.storage;
  if (!archiveStorage?.getItem || !archiveStorage?.setItem || !archiveStorage?.removeItem) throw new Error('RECOVERY_STORAGE_UNAVAILABLE');
  const profileAdapter = storageAdapter({
    id: 'profile-progression', sections: ['profile', 'progression'], storage: profileStore.storage, key: profileStore.key,
    select: stores => stores.profileProgression,
    apply(value) { if (profileStore.save(value) !== true) throw new Error('RECOVERY_PROFILE_WRITE_FAILED'); },
    rollbackMemory() { profileStore.load(); }
  });
  const seasonAdapter = storageAdapter({
    id: 'season-stats', sections: ['seasonStats'], storage: seasonStatsStore.storage, key: seasonStatsStore.key,
    select: stores => stores.seasonStats,
    apply(value) {
      seasonStatsStore.totals = clone(value.totals);
      seasonStatsStore.matches = clone(value.matches);
      seasonStatsStore.processedMatchIds = clone(value.processedMatchIds);
      if (seasonStatsStore.save() !== true) throw new Error('RECOVERY_SEASON_STATS_WRITE_FAILED');
    },
    rollbackMemory() { seasonStatsStore.load(); }
  });
  return [
    profileAdapter, seasonAdapter,
    archiveAdapter({ id: 'online-career-archive', section: 'career', storage: archiveStorage, key: ARCHIVE_KEYS.onlineCareer, select: s => s.onlineCareerArchive }),
    archiveAdapter({ id: 'player-career-archive', section: 'playerCareer', storage: archiveStorage, key: ARCHIVE_KEYS.playerCareer, select: s => s.playerCareerArchive }),
    archiveAdapter({ id: 'transfer-career-archive', section: 'contract', storage: archiveStorage, key: ARCHIVE_KEYS.transferCareer, select: s => s.transferCareerArchive })
  ];
}
export function readAccountRecoveryArchives(storage) {
  if (!storage?.getItem) return null;
  const result = {};
  for (const [name, key] of Object.entries(ARCHIVE_KEYS)) {
    const value = readJsonWithBackup(storage, key, normalizeArchive);
    if (!value) return null;
    result[name] = clone(value.data);
  }
  return result;
}
