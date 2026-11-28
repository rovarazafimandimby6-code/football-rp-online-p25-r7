const REVISION_PATTERN = /^[a-f0-9]{64}$/;
const REQUIRED_SECTIONS = Object.freeze([
  'profile', 'progression', 'career', 'playerCareer', 'seasonStats', 'contract'
]);

function validAdapter(adapter) {
  return Boolean(adapter && typeof adapter === 'object'
    && typeof adapter.id === 'string' && adapter.id.trim()
    && Array.isArray(adapter.sections) && adapter.sections.length > 0
    && adapter.sections.every(section => REQUIRED_SECTIONS.includes(section))
    && typeof adapter.prepare === 'function'
    && typeof adapter.capture === 'function'
    && typeof adapter.apply === 'function'
    && typeof adapter.rollback === 'function');
}

/**
 * Transaction coordinator for a future multi-store account restore.
 * Store-specific adapters must provide the actual, audited data mapping.
 * This module deliberately knows nothing about local storage keys or domain models.
 */
export async function restoreAccountSnapshot({
  preview,
  currentRevision,
  confirmed = false,
  adapters = []
} = {}) {
  if (preview?.ready !== true
    || preview.reason !== 'EXPLICIT_RESTORE_CONFIRMATION_REQUIRED'
    || !preview.snapshot || typeof preview.snapshot !== 'object'
    || Array.isArray(preview.snapshot)
    || !REVISION_PATTERN.test(preview.revision || '')) {
    return { ok: false, reason: 'RECOVERY_PREVIEW_NOT_READY' };
  }

  if (confirmed !== true) return { ok: false, reason: 'RESTORE_CONFIRMATION_REQUIRED' };
  if (!REVISION_PATTERN.test(currentRevision || '') || currentRevision !== preview.revision) {
    return { ok: false, reason: 'SNAPSHOT_REVISION_CHANGED' };
  }
  if (!Array.isArray(adapters) || adapters.length === 0 || !adapters.every(validAdapter)) {
    return { ok: false, reason: 'RESTORE_ADAPTERS_INVALID' };
  }
  const ids = adapters.map(adapter => adapter.id);
  if (new Set(ids).size !== ids.length) return { ok: false, reason: 'RESTORE_ADAPTERS_DUPLICATED' };
  const coveredSections = adapters.flatMap(adapter => adapter.sections);
  if (new Set(coveredSections).size !== coveredSections.length
    || REQUIRED_SECTIONS.some(section => !coveredSections.includes(section))) {
    return { ok: false, reason: 'RESTORE_ADAPTER_COVERAGE_INVALID' };
  }

  let prepared;
  try {
    // Complete every mapping/validation before capturing or changing local state.
    prepared = await Promise.all(adapters.map(adapter => adapter.prepare(preview.snapshot)));
  } catch {
    return { ok: false, reason: 'RESTORE_PREPARATION_FAILED' };
  }

  const backups = [];
  try {
    // Capture every participating store before the first write.
    for (const adapter of adapters) backups.push(await adapter.capture());
  } catch {
    return { ok: false, reason: 'RESTORE_BACKUP_FAILED' };
  }

  const attempted = [];
  try {
    for (let index = 0; index < adapters.length; index++) {
      // Include the current adapter before apply: it may fail after a partial write.
      attempted.push(index);
      await adapters[index].apply(prepared[index]);
    }
    return { ok: true, reason: 'RESTORE_APPLIED', appliedAdapters: [...ids] };
  } catch {
    const rollbackErrors = [];
    for (const index of attempted.reverse()) {
      try {
        await adapters[index].rollback(backups[index]);
      } catch {
        rollbackErrors.push(adapters[index].id);
      }
    }
    return {
      ok: false,
      reason: rollbackErrors.length ? 'RESTORE_ROLLBACK_FAILED' : 'RESTORE_APPLY_FAILED',
      rolledBack: rollbackErrors.length === 0,
      rollbackFailedAdapters: rollbackErrors
    };
  }
}
