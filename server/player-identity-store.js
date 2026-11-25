import { randomInt, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
const validUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const validNumber = value => typeof value === 'string' && /^FRP-\d{6}$/.test(value);
export class JsonPlayerIdentityStore {
  constructor(directory, options = {}) {
    this.directory = path.resolve(directory);
    this.file = path.join(this.directory, 'player-identities.json');
    this.now = options.now || (() => Date.now());
    this.idFactory = options.idFactory || (() => String(randomInt(100000, 1000000)));
    this.maxAttempts = Math.max(1, Math.min(10000, Number(options.maxAttempts) || 1000));
    mkdirSync(this.directory, { recursive: true });
    this.state = this.read();
  }
  read() {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.identities)) throw Error('schema');
      const rows = parsed.identities.filter(row => row && validUuid(row.localProfileKey) && validUuid(row.accountId) && validNumber(row.playerId) && typeof row.createdAt === 'string');
      if (rows.length !== parsed.identities.length || new Set(rows.map(row => row.localProfileKey)).size !== rows.length ||
          new Set(rows.map(row => row.accountId)).size !== rows.length || new Set(rows.map(row => row.playerId)).size !== rows.length) throw Error('duplicates');
      return { version: 1, identities: rows };
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, identities: [] };
      throw new Error('PLAYER_IDENTITY_STORE_CORRUPT');
    }
  }
  persist() {
    const temporary = this.file + '.' + process.pid + '.' + randomUUID() + '.tmp';
    try { writeFileSync(temporary, JSON.stringify(this.state), { mode: 0o600 }); renameSync(temporary, this.file); }
    catch (error) { try { unlinkSync(temporary); } catch {} throw error; }
  }
  reserve({ localProfileKey } = {}) {
    if (!validUuid(localProfileKey)) throw new Error('INVALID_LOCAL_PROFILE_KEY');
    const existing = this.state.identities.find(row => row.localProfileKey === localProfileKey);
    if (existing) return { accountId: existing.accountId, playerId: existing.playerId, createdAt: existing.createdAt, alreadyReserved: true };
    const previous = this.state;
    this.state = structuredClone(previous);
    try {
      let playerId = null;
      for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
        const number = String(this.idFactory());
        if (!/^\d{6}$/.test(number)) throw new Error('INVALID_PLAYER_ID_GENERATOR');
        const candidate = 'FRP-' + number;
        if (!this.state.identities.some(row => row.playerId === candidate)) { playerId = candidate; break; }
      }
      if (!playerId) throw new Error('PLAYER_ID_SPACE_EXHAUSTED');
      const accountId = randomUUID();
      const createdAt = new Date(this.now()).toISOString();
      this.state.identities.push({ localProfileKey, accountId, playerId, createdAt });
      this.persist();
      return { accountId, playerId, createdAt, alreadyReserved: false };
    } catch (error) { this.state = previous; throw error; }
  }
  getByLocalProfileKey(localProfileKey) {
    if (!validUuid(localProfileKey)) return null;
    const row = this.state.identities.find(item => item.localProfileKey === localProfileKey);
    return row ? { accountId: row.accountId, playerId: row.playerId, createdAt: row.createdAt } : null;
  }
}