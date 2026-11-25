import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const STORES = Object.freeze({
  accounts: { file: 'accounts.json', directory: 'accounts', validate: value => value?.version === 1 && Array.isArray(value.accounts) && Array.isArray(value.sessions) },
  playerIdentities: { file: 'player-identities.json', directory: 'player-identities', validate: value => value?.version === 1 && Array.isArray(value.identities) && value.identities.every(row => row && typeof row.localProfileKey === 'string' && typeof row.accountId === 'string' && typeof row.playerId === 'string' && typeof row.createdAt === 'string' && (row.proofHash === undefined || /^[a-f0-9]{64}$/i.test(row.proofHash))) },
  googleIdentities: { file: 'google-identities.json', directory: 'google-identities', validate: value => value?.version === 1 && Array.isArray(value.links) && Array.isArray(value.audit) && value.links.every(row => row && typeof row.accountId === 'string' && typeof row.googleSubject === 'string' && typeof row.linkedAt === 'string') && value.audit.every(row => row && typeof row.id === 'string' && typeof row.accountId === 'string' && typeof row.type === 'string' && typeof row.at === 'string') },
  profiles: { file: 'player-profiles.json', directory: 'player-profiles', validate: value => value?.version === 1 && Array.isArray(value.profiles) },
  progression: { file: 'progression.json', directory: 'progression', validate: value => value?.version === 1 && Array.isArray(value.players) },
  careers: { file: 'careers.json', directory: 'careers', validate: value => value?.version === 1 && Array.isArray(value.careers) && Array.isArray(value.playerCareers) },
  transfers: { file: 'transfers.json', directory: 'transfers', validate: value => value?.version === 1 && Array.isArray(value.careers) && Array.isArray(value.events) && Array.isArray(value.clubs) && (value.rosterSync === undefined || Array.isArray(value.rosterSync)) },
  clubRosters: { file: 'club-rosters.json', directory: 'club-rosters', validate: value => value?.version === 8 && Array.isArray(value.clubs) && Array.isArray(value.fixtures) }
});
const digest = value => createHash('sha256').update(value).digest('hex');
const defaultDirectories = root => Object.fromEntries(Object.entries(STORES).map(([key, spec]) => [key, path.join(root, 'data', spec.directory)]));

function readAndValidate(key, file) {
  const raw = readFileSync(file, 'utf8');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error(`BACKUP_SOURCE_INVALID_JSON:${key}`); }
  if (!STORES[key].validate(parsed)) throw new Error(`BACKUP_SOURCE_INVALID_SCHEMA:${key}`);
  return raw;
}

/** Creates a portable, checksummed snapshot of all six account, career, transfer and club-roster stores. */
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
  return { ok: true, restored: Object.keys(STORES), createdAt: bundle.createdAt };
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
