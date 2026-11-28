import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** Atomic JSON-backed storage adapter for persistent server club rosters. */
export class JsonClubRosterStorage {
  constructor(directory) {
    this.directory = path.resolve(directory);
    this.file = path.join(this.directory, 'club-rosters.json');
    mkdirSync(this.directory, { recursive:true });
  }
  getItem(key) {
    if (key !== 'p27-server-club-rosters') return null;
    try { return readFileSync(this.file, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  setItem(key, value) {
    if (key !== 'p27-server-club-rosters') throw new Error('CLUB_ROSTER_STORAGE_KEY_INVALID');
    const temp = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, String(value), { mode:0o600 });
      renameSync(temp, this.file);
    } catch (error) {
      try { unlinkSync(temp); } catch {}
      throw error;
    }
  }
}
