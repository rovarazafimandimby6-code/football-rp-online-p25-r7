export const LEGACY_PROFILE_BACKUP_KEY = 'fpro.legacy-profile.migration.v1';

/** Creates a one-time local safety copy before linking legacy cosmetics to an account. */
export function createLegacyProfileBackup(storage, profile, { now = () => new Date().toISOString() } = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new Error('LOCAL_BACKUP_UNAVAILABLE');
  if (!profile || typeof profile !== 'object' || !profile.identity || !profile.progression) throw new Error('INVALID_LEGACY_PROFILE');
  const existing = storage.getItem(LEGACY_PROFILE_BACKUP_KEY);
  if (existing) {
    let backup;
    try { backup = JSON.parse(existing); } catch { throw new Error('LEGACY_BACKUP_CORRUPT'); }
    return { created: false, backup };
  }
  const backup = { schemaVersion: 1, capturedAt: now(), profile: structuredClone(profile) };
  storage.setItem(LEGACY_PROFILE_BACKUP_KEY, JSON.stringify(backup));
  return { created: true, backup };
}

/** Only non-competitive identity and appearance are eligible for account migration. */
export function buildLegacyProfileMigrationPayload(profile) {
  if (!profile || typeof profile !== 'object') throw new Error('INVALID_LEGACY_PROFILE');
  return {
    identity: structuredClone(profile.identity || {}),
    appearance: structuredClone(profile.appearance || {})
  };
}
