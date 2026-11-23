import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USERNAME_RE = /^[a-z0-9][a-z0-9_.-]{2,19}$/;
const cleanName = value => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 24);
const tokenDigest = token => createHash('sha256').update(token).digest('hex');

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex');
}

/** Persistent account identities. Only password hashes and session-token hashes are stored. */
export class JsonAccountStore {
  constructor(directory, { now = () => Date.now(), sessionTtlMs = SESSION_TTL_MS } = {}) {
    this.directory = path.resolve(directory);
    this.file = path.join(this.directory, 'accounts.json');
    this.now = now;
    this.sessionTtlMs = Math.max(60_000, Math.min(SESSION_TTL_MS, Number(sessionTtlMs) || SESSION_TTL_MS));
    mkdirSync(this.directory, { recursive: true });
    this.state = this.read();
  }

  read() {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.accounts) || !Array.isArray(parsed.sessions)) throw new Error('bad schema');
      return {
        version: 1,
        accounts: parsed.accounts.filter(row => row && typeof row.id === 'string' && typeof row.username === 'string' && typeof row.passwordHash === 'string' && typeof row.passwordSalt === 'string'),
        sessions: parsed.sessions.filter(row => row && typeof row.tokenHash === 'string' && typeof row.accountId === 'string' && Number.isFinite(row.expiresAt))
      };
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, accounts: [], sessions: [] };
      throw new Error('ACCOUNT_STORE_CORRUPT');
    }
  }

  persist() {
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(this.state), { mode: 0o600 });
      renameSync(temporary, this.file);
    } catch (error) {
      try { unlinkSync(temporary); } catch {}
      throw error;
    }
  }

  publicAccount(account) {
    return { id: account.id, username: account.username, displayName: account.displayName, createdAt: account.createdAt };
  }

  pruneSessions() {
    const now = this.now();
    const before = this.state.sessions.length;
    this.state.sessions = this.state.sessions.filter(session => session.expiresAt > now && this.state.accounts.some(account => account.id === session.accountId));
    return before !== this.state.sessions.length;
  }

  issueSession(account) {
    this.pruneSessions();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = this.now() + this.sessionTtlMs;
    this.state.sessions.push({ tokenHash: tokenDigest(token), accountId: account.id, expiresAt });
    this.state.sessions = this.state.sessions.slice(-20_000);
    this.persist();
    return { account: this.publicAccount(account), token, expiresAt: new Date(expiresAt).toISOString() };
  }

  register(input = {}) {
    const { username, password, displayName } = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const handle = String(username ?? '').trim().toLowerCase();
    if (!USERNAME_RE.test(handle)) throw new Error('INVALID_USERNAME');
    if (typeof password !== 'string' || password.length < 10 || password.length > 128) throw new Error('INVALID_PASSWORD');
    if (this.state.accounts.some(account => account.username === handle)) throw new Error('USERNAME_TAKEN');
    const salt = randomBytes(16).toString('hex');
    const account = {
      id: randomUUID(), username: handle,
      displayName: cleanName(displayName) || handle,
      passwordSalt: salt, passwordHash: hashPassword(password, salt),
      createdAt: new Date(this.now()).toISOString()
    };
    this.state.accounts.push(account);
    return this.issueSession(account);
  }

  login(input = {}) {
    const { username, password } = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const handle = String(username ?? '').trim().toLowerCase();
    const account = this.state.accounts.find(row => row.username === handle);
    if (typeof password !== 'string' || password.length > 128 || !account) {
      hashPassword(typeof password === 'string' ? password.slice(0, 128) : 'invalid-password', '00000000000000000000000000000000');
      return null;
    }
    const actual = Buffer.from(hashPassword(password, account.passwordSalt), 'hex');
    const expected = Buffer.from(account.passwordHash, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    return this.issueSession(account);
  }

  resolve(token) {
    if (typeof token !== 'string' || token.length < 32 || token.length > 128) return null;
    const digest = tokenDigest(token);
    const session = this.state.sessions.find(row => row.tokenHash === digest && row.expiresAt > this.now());
    if (!session) return null;
    const account = this.state.accounts.find(row => row.id === session.accountId);
    return account ? this.publicAccount(account) : null;
  }

  revoke(token) {
    if (typeof token !== 'string' || !token) return false;
    const digest = tokenDigest(token);
    const before = this.state.sessions.length;
    this.state.sessions = this.state.sessions.filter(row => row.tokenHash !== digest);
    if (this.state.sessions.length === before) return false;
    this.persist();
    return true;
  }
}
