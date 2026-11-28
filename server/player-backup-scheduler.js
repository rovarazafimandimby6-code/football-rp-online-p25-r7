import path from 'node:path';
import { createRotatingPlayerDataBackup } from './player-data-backup.js';

const MIN_INTERVAL_MS = 5 * 60_000;
const MAX_INTERVAL_MS = 24 * 60 * 60_000;
const DEFAULT_INTERVAL_MS = 6 * 60 * 60_000;

export function resolvePlayerBackupConfig({ env = process.env, root = process.cwd() } = {}) {
  const requested = Number(env.P27_PLAYER_BACKUP_INTERVAL_MS);
  const intervalMs = Number.isFinite(requested) && requested > 0
    ? Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, Math.floor(requested)))
    : DEFAULT_INTERVAL_MS;
  const base = root.replace(/[\\/]+$/, '');
  const directory = path.resolve(env.P27_BACKUPS_DIR || `${base}/data/backups`);
  return {
    intervalMs,
    backupDirectory: directory,
    keep: Math.max(2, Math.min(100, Math.floor(Number(env.P27_BACKUPS_KEEP) || 14))),
    directories: {
      accounts: path.resolve(env.ACCOUNTS_DIR || `${base}/data/accounts`),
      playerIdentities: path.resolve(env.PLAYER_IDENTITIES_DIR || `${base}/data/player-identities`),
      googleIdentities: path.resolve(env.GOOGLE_IDENTITIES_DIR || `${base}/data/google-identities`),
      profiles: path.resolve(env.PLAYER_PROFILES_DIR || `${base}/data/player-profiles`),
      progression: path.resolve(env.PLAYER_PROGRESSION_DIR || `${base}/data/progression`),
      careers: path.resolve(env.CAREERS_DIR || `${base}/data/careers`),
      transfers: path.resolve(env.TRANSFERS_DIR || `${base}/data/transfers`),
      clubRosters: path.resolve(env.CLUB_ROSTERS_DIR || `${base}/data/club-rosters`),
      clubFinance: path.resolve(env.FINANCES_DIR || `${base}/data/finances`),
      systemPayroll: path.resolve(env.FINANCES_DIR || `${base}/data/finances`),
      transferFinanceJournal: path.resolve(env.FINANCES_DIR || `${base}/data/finances`),
      shopInventory: path.resolve(env.SHOP_INVENTORY_DIR || `${base}/data/shop`),
      competitions: path.resolve(env.COMPETITIONS_DIR || `${base}/data/competitions`),
      completedResults: path.resolve(env.RESULTS_DIR || `${base}/data/results`),
      rpClubs: path.resolve(env.RP_CLUBS_DIR || `${base}/data/rp-clubs`),
      rpClubChallenges: path.resolve(env.RP_CLUB_CHALLENGES_DIR || `${base}/data/rp-club-challenges`),
      rpClubSeasons: path.resolve(env.RP_CLUB_SEASONS_DIR || `${base}/data/rp-club-seasons`)
    }
  };
}

/** A single-process scheduler; failed runs are observable and retried on the next interval. */
export function createPlayerBackupScheduler({
  backup = createRotatingPlayerDataBackup,
  config,
  now = () => new Date(),
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  onResult = () => {}
} = {}) {
  if (!config?.backupDirectory) throw new Error('BACKUP_SCHEDULER_CONFIG_REQUIRED');
  let timer = null;
  let running = false;
  const state = { running: false, lastStartedAt: null, lastSuccessAt: null, lastErrorAt: null, lastError: null, lastResult: null, skippedOverlaps: 0 };

  function runNow() {
    if (running) {
      state.skippedOverlaps++;
      return { ok: false, skipped: true, reason: 'BACKUP_ALREADY_RUNNING' };
    }
    running = true;
    state.running = true;
    state.lastStartedAt = now().toISOString();
    try {
      const result = backup({
        directories: config.directories,
        backupDirectory: config.backupDirectory,
        keep: config.keep,
        now
      });
      state.lastSuccessAt = now().toISOString();
      state.lastError = null;
      state.lastResult = { retained: result.retained, removed: result.removed?.length || 0, bytes: result.bytes };
      const report = { ok: true, ...state.lastResult, completedAt: state.lastSuccessAt };
      onResult(report);
      return report;
    } catch (error) {
      state.lastErrorAt = now().toISOString();
      state.lastError = String(error?.message || 'PLAYER_BACKUP_FAILED').slice(0, 180);
      const report = { ok: false, error: state.lastError, failedAt: state.lastErrorAt };
      onResult(report);
      return report;
    } finally {
      running = false;
      state.running = false;
    }
  }

  function start() {
    if (timer) return false;
    // Create a recovery point at startup instead of waiting for the first interval.
    runNow();
    timer = setIntervalFn(runNow, config.intervalMs);
    timer?.unref?.();
    return true;
  }

  function stop() {
    if (!timer) return false;
    clearIntervalFn(timer);
    timer = null;
    return true;
  }

  return {
    start,
    stop,
    runNow,
    status: () => ({ ...state, running, scheduled: Boolean(timer), intervalMs: config.intervalMs, backupDirectory: config.backupDirectory, keep: config.keep })
  };
}
