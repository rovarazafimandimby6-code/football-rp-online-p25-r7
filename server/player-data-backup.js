import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const STORES = Object.freeze({
  accounts: { file: 'accounts.json', directory: 'accounts', empty: { version: 1, accounts: [], sessions: [] }, validate: value => value?.version === 1 && Array.isArray(value.accounts) && Array.isArray(value.sessions) },
  playerIdentities: { file: 'player-identities.json', directory: 'player-identities', empty: { version: 1, identities: [] }, validate: value => value?.version === 1 && Array.isArray(value.identities) && value.identities.every(row => row && typeof row.localProfileKey === 'string' && typeof row.accountId === 'string' && typeof row.playerId === 'string' && typeof row.createdAt === 'string' && (row.proofHash === undefined || /^[a-f0-9]{64}$/i.test(row.proofHash))) },
  googleIdentities: { file: 'google-identities.json', directory: 'google-identities', empty: { version: 1, links: [], audit: [] }, validate: value => value?.version === 1 && Array.isArray(value.links) && Array.isArray(value.audit) && value.links.every(row => row && typeof row.accountId === 'string' && typeof row.googleSubject === 'string' && typeof row.linkedAt === 'string') && value.audit.every(row => row && typeof row.id === 'string' && typeof row.accountId === 'string' && typeof row.type === 'string' && typeof row.at === 'string') },
  profiles: { file: 'player-profiles.json', directory: 'player-profiles', empty: { version: 1, profiles: [] }, validate: value => value?.version === 1 && Array.isArray(value.profiles) },
  progression: { file: 'progression.json', directory: 'progression', empty: { version: 1, players: [] }, validate: value => value?.version === 1 && Array.isArray(value.players) },
  careers: { file: 'careers.json', directory: 'careers', empty: { version: 1, careers: [], playerCareers: [], pendingCloudMatches: [] }, validate: value => value?.version === 1 && Array.isArray(value.careers) && Array.isArray(value.playerCareers) },
  careerSyncQueue: { file: 'pending-career-sync.json', directory: 'career-sync', empty: { version: 1, pending: [] }, validate: value => value?.version === 1 && Array.isArray(value.pending) && value.pending.every(item => item && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.accountId || '') && /^FRP-[0-9]{6}$/.test(item.playerId || '') && typeof item.matchId === 'string' && item.matchId.length > 0 && item.matchId.length <= 64 && Number.isSafeInteger(item.queuedAt) && item.queuedAt >= 0 && Number.isSafeInteger(item.attempts ?? 0) && (item.attempts ?? 0) >= 0 && Number.isSafeInteger(item.nextAttemptAt ?? 0) && (item.nextAttemptAt ?? 0) >= 0 && item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload) && item.payload.matchId === item.matchId && ['win','draw','loss'].includes(item.payload.result)) },
  transfers: { file: 'transfers.json', directory: 'transfers', empty: { version: 1, careers: [], events: [], clubs: [], rosterSync: [] }, validate: value => value?.version === 1 && Array.isArray(value.careers) && Array.isArray(value.events) && Array.isArray(value.clubs) && (value.rosterSync === undefined || Array.isArray(value.rosterSync)) },
  clubRosters: { file: 'club-rosters.json', directory: 'club-rosters', empty: { version: 8, clubs: [], fixtures: [] }, validate: value => value?.version === 8 && Array.isArray(value.clubs) && Array.isArray(value.fixtures) },
  clubFinance: { file: 'club-finance.json', directory: 'finances', empty: { version: 1, accounts: [] }, validate: value => value?.version === 1 && Array.isArray(value.accounts) },
  systemPayroll: { file: 'system-payroll-schedule.json', directory: 'finances', empty: { version: 1, clubs: {} }, validate: value => value?.version === 1 && value.clubs && typeof value.clubs === 'object' && !Array.isArray(value.clubs) },
  transferFinanceJournal: { file: 'transfer-finance-journal.json', directory: 'finances', empty: { version: 1, transfers: [], playerWages: [] }, validate: value => value?.version === 1 && Array.isArray(value.transfers) && Array.isArray(value.playerWages) },
  systemTransferOutbox: { file: 'system-transfer-outbox.json', directory: 'system-transfers', empty: { version: 1, transfers: [] }, validate: value => value?.version === 1 && Array.isArray(value.transfers) && value.transfers.every(item => item && typeof item.id === 'string' && ['pending','completed','failed'].includes(item.status) && Number.isSafeInteger(item.fee) && item.fee > 0 && Number.isSafeInteger(item.createdAt) && item.createdAt >= 0 && Number.isSafeInteger(item.attempts) && item.attempts >= 0 && typeof item.playerId === 'string' && typeof item.fromClubId === 'string' && typeof item.toClubId === 'string' && (item.lastError === null || typeof item.lastError === 'string') && (item.status !== 'completed' || Number.isSafeInteger(item.completedAt))) },
  shopInventory: { file: 'shop-inventory.json', directory: 'shop', empty: { version: 1, players: [], clubs: [], purchases: [], resales: [] }, validate: value => value?.version === 1 && Array.isArray(value.players) && Array.isArray(value.clubs) && Array.isArray(value.purchases) && Array.isArray(value.resales) },
  competitions: { file: 'competitions.json', directory: 'competitions', empty: { version: 1, seasons: [] }, validate: value => value?.version === 1 && Array.isArray(value.seasons) },
  completedResults: { file: 'completed-results.json', directory: 'results', empty: [], validate: value => Array.isArray(value) },
  rpClubs: { file: 'rp-clubs.json', directory: 'rp-clubs', empty: { version: 1, clubs: [] }, validate: value => value?.version === 1 && Array.isArray(value.clubs) },
  rpClubChallenges: { file: 'rp-club-challenges.json', directory: 'rp-club-challenges', empty: { version: 1, challenges: [] }, validate: value => value?.version === 1 && Array.isArray(value.challenges) },
  rpClubSeasons: { file: 'rp-club-seasons.json', directory: 'rp-club-seasons', empty: { version: 1, seasons: [] }, validate: value => value?.version === 1 && Array.isArray(value.seasons) },
  // Archived for forensic recovery only: never auto-restore live matches from an older generation.
  roomCheckpoints: { file: 'active-rooms.json', directory: 'rooms', restore: false, empty: { version: 1, rooms: [] }, validate: value => value?.version === 1 && Array.isArray(value.rooms) && value.rooms.every(room => room && typeof room.id === 'string' && room.id.length > 0 && ['lobby','playing','halftime','fulltime'].includes(room.phase) && Array.isArray(room.players) && room.players.every(player => player && typeof player.id === 'string' && player.token === undefined && (player.tokenHash === undefined || /^[a-f0-9]{64}$/i.test(player.tokenHash)))) }
});
const digest = value => createHash('sha256').update(value).digest('hex');
const defaultDirectories = root => Object.fromEntries(Object.entries(STORES).map(([key, spec]) => [key, path.join(root, 'data', spec.directory)]));

function readAndValidate(key, file) {
  let raw;
  try { raw = readFileSync(file, 'utf8'); }
  catch (error) {
    // Several stores intentionally keep their empty state in memory until the
    // first write. Missing files therefore mean an empty store, not data loss.
    if (error.code !== 'ENOENT') throw error;
    raw = JSON.stringify(STORES[key].empty);
  }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error(`BACKUP_SOURCE_INVALID_JSON:${key}`); }
  if (!STORES[key].validate(parsed)) throw new Error(`BACKUP_SOURCE_INVALID_SCHEMA:${key}`);
  return raw;
}

/** Creates a portable, checksummed snapshot of durable player and world stores, including non-restorable live-room archives. */
export function createPlayerDataBackup({ directories = defaultDirectories(process.cwd()), outputFile, now = () => new Date() } = {}) {
  if (!outputFile) throw new Error('BACKUP_OUTPUT_REQUIRED');
  const files = {};
  for (const [key, spec] of Object.entries(STORES)) {
    const source = path.join(path.resolve(directories[key] || path.join(process.cwd(), 'data', spec.directory)), spec.file);
    const content = readAndValidate(key, source);
    files[key] = { file: spec.file, sha256: digest(content), content };
  }
  const bundle = { format: 'football-rp-online-player-data', version: 1, createdAt: now().toISOString(), files };
  const destination = path.resolve(outputFile);
  mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(bundle), { mode: 0o600, flag: 'wx' });
    renameSync(temporary, destination);
  } catch (error) { try { unlinkSync(temporary); } catch {} throw error; }
  return { outputFile: destination, stores: Object.keys(files), bytes: Buffer.byteLength(JSON.stringify(bundle)) };
}

/** Validates bundle format, all checksums and every store schema without modifying data. */
export function verifyPlayerDataBackup(backupFile) {
  const bundle = JSON.parse(readFileSync(path.resolve(backupFile), 'utf8'));
  if (bundle?.format !== 'football-rp-online-player-data' || bundle.version !== 1 || !bundle.files || typeof bundle.files !== 'object') throw new Error('BACKUP_FORMAT_INVALID');
  for (const [key, spec] of Object.entries(STORES)) {
    const entry = bundle.files[key];
    if (!entry || entry.file !== spec.file || typeof entry.content !== 'string' || entry.sha256 !== digest(entry.content)) throw new Error(`BACKUP_CHECKSUM_INVALID:${key}`);
    let parsed;
    try { parsed = JSON.parse(entry.content); } catch { throw new Error(`BACKUP_STORE_INVALID_JSON:${key}`); }
    if (!spec.validate(parsed)) throw new Error(`BACKUP_STORE_INVALID_SCHEMA:${key}`);
  }
  if (Object.keys(bundle.files).length !== Object.keys(STORES).length) throw new Error('BACKUP_STORE_SET_INVALID');
  return { ok: true, createdAt: bundle.createdAt, stores: Object.keys(STORES) };
}

/** Restores only a fully verified bundle. Existing files are staged for rollback on write failure. */
export function restorePlayerDataBackup({ backupFile, directories = defaultDirectories(process.cwd()) } = {}) {
  verifyPlayerDataBackup(backupFile);
  const bundle = JSON.parse(readFileSync(path.resolve(backupFile), 'utf8'));
  const staged = [];
  const replaced = [];
  try {
    for (const [key, spec] of Object.entries(STORES)) {
      if (spec.restore === false) continue;
      const directory = path.resolve(directories[key] || path.join(process.cwd(), 'data', spec.directory));
      mkdirSync(directory, { recursive: true });
      const destination = path.join(directory, spec.file);
      const temporary = `${destination}.${process.pid}.${randomUUID()}.restore`;
      writeFileSync(temporary, bundle.files[key].content, { mode: 0o600, flag: 'wx' });
      staged.push({ destination, temporary, previous: existsSync(destination) ? readFileSync(destination) : null });
    }
    for (const item of staged) {
      renameSync(item.temporary, item.destination);
      replaced.push(item);
    }
  } catch (error) {
    for (const item of replaced.reverse()) {
      try {
        if (item.previous === null) unlinkSync(item.destination);
        else {
          const rollback = `${item.destination}.${process.pid}.${randomUUID()}.rollback`;
          writeFileSync(rollback, item.previous, { mode: 0o600, flag: 'wx' });
          renameSync(rollback, item.destination);
        }
      } catch {}
    }
    throw error;
  } finally {
    for (const item of staged) { try { unlinkSync(item.temporary); } catch {} }
  }
  return { ok: true, restored: Object.keys(STORES).filter(key => STORES[key].restore !== false), archivedOnly: Object.keys(STORES).filter(key => STORES[key].restore === false), createdAt: bundle.createdAt };
}

/**
 * Creates and verifies a new generation before pruning older generations.
 * The backup directory can be mounted on a separate volume by the deployment.
 */
export function createRotatingPlayerDataBackup({ directories, backupDirectory, keep = 14, now = () => new Date() } = {}) {
  if (!backupDirectory) throw new Error('BACKUP_DIRECTORY_REQUIRED');
  const retention = Math.max(2, Math.min(100, Math.floor(Number(keep) || 14)));
  const directory = path.resolve(backupDirectory);
  mkdirSync(directory, { recursive: true });
  const stamp = now().toISOString().replace(/[:.]/g, '-');
  const outputFile = path.join(directory, `player-data-${stamp}-${randomUUID()}.json`);
  const created = createPlayerDataBackup({ directories, outputFile, now });
  try {
    verifyPlayerDataBackup(outputFile);
  } catch (error) {
    try { unlinkSync(outputFile); } catch {}
    throw error;
  }
  const candidates = readdirSync(directory)
    .filter(name => /^player-data-.*\.json$/.test(name))
    .map(name => {
      const file = path.join(directory, name);
      try { return { file, mtime: statSync(file).mtimeMs, isFile: statSync(file).isFile() }; }
      catch { return null; }
    })
    .filter(item => item?.isFile)
    .sort((a, b) => b.mtime - a.mtime);
  const removed = [];
  for (const item of candidates.slice(retention)) {
    unlinkSync(item.file);
    removed.push(path.basename(item.file));
  }
  return { ...created, verified: true, retained: Math.min(candidates.length, retention), removed };
}
