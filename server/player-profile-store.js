import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const clean = (value, max, fallback = '') => String(value ?? fallback).replace(/[<>\\u0000-\\u001f]/g, '').trim().slice(0, max) || fallback;
const oneOf = (value, values, fallback) => values.includes(value) ? value : fallback;

function normalize(input = {}) {
  const identity = input.identity && typeof input.identity === 'object' ? input.identity : {};
  const appearance = input.appearance && typeof input.appearance === 'object' ? input.appearance : {};
  return {
    schemaVersion: 1,
    identity: {
      displayName: clean(identity.displayName, 20, 'Nouveau joueur'),
      number: Number.isFinite(Number(identity.number)) ? Math.max(1, Math.min(99, Math.round(Number(identity.number)))) : 10,
      preferredFoot: oneOf(identity.preferredFoot, ['left','right'], 'right'),
      role: oneOf(identity.role, ['GK','DEF','MID','FWD'], 'MID')
    },
    appearance: {
      kit: oneOf(appearance.kit, ['emerald','crimson','gold','violet','monochrome'], 'emerald'),
      skinTone: oneOf(appearance.skinTone, ['light','medium','dark'], 'medium'),
      hairStyle: oneOf(appearance.hairStyle, ['short','curly','shaved','fade','afro'], 'short'),
      hairColor: oneOf(appearance.hairColor, ['dark','brown','blond'], 'dark'),
      bodyBuild: oneOf(appearance.bodyBuild, ['lean','athletic','strong'], 'athletic')
    },
    updatedAt: new Date().toISOString()
  };
}

/** Account-linked identity and cosmetic appearance only; competitive progression stays authoritative elsewhere. */
export class JsonPlayerProfileStore {
  constructor(directory) {
    this.directory = path.resolve(directory);
    this.file = path.join(this.directory, 'player-profiles.json');
    mkdirSync(this.directory, { recursive: true });
    this.state = this.read();
  }
  read() {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.profiles)) throw new Error('bad schema');
      return { version: 1, profiles: parsed.profiles.filter(row => row && typeof row.accountId === 'string' && row.profile && typeof row.profile === 'object') };
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, profiles: [] };
      throw new Error('PLAYER_PROFILE_STORE_CORRUPT');
    }
  }
  persist() {
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, JSON.stringify(this.state), { mode: 0o600 }); renameSync(temporary, this.file); }
    catch (error) { try { unlinkSync(temporary); } catch {} throw error; }
  }
  get(accountId) {
    const row = this.state.profiles.find(item => item.accountId === String(accountId));
    return row ? structuredClone(row.profile) : null;
  }
  save(accountId, input) {
    const id = clean(accountId, 64);
    if (!id) throw new Error('INVALID_ACCOUNT_ID');
    const profile = normalize(input);
    const index = this.state.profiles.findIndex(item => item.accountId === id);
    const row = { accountId: id, profile };
    if (index < 0) this.state.profiles.push(row); else this.state.profiles[index] = row;
    this.persist();
    return structuredClone(profile);
  }
}
