import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';

const STORES = Object.freeze({
  accounts: { file: 'accounts.json', directory: 'accounts', validate: value => value?.version === 1 && Array.isArray(value.accounts) && Array.isArray(value.sessions) },
  profiles: { file: 'player-profiles.json', directory: 'player-profiles', validate: value => value?.version === 1 && Array.isArray(value.profiles) },
  progression: { file: 'progression.json', directory: 'progression', validate: value => value?.version === 1 && Array.isArray(value.players) },
  careers: { file: 'careers.json', directory: 'careers', validate: value => value?.version === 1 && Array.isArray(value.careers) && Array.isArray(value.playerCareers) }
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

/** Creates a portable, checksummed snapshot of the four account-owned data stores. */
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
