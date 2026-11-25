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

  transaction(mutator) {
    const previous = this.state;
    this.state = structuredClone(previous);
    try {
      const outcome = mutator();
      if (outcome?.skipPersist === true) { this.state = previous; return outcome.value; }
      this.persist();
      return outcome;
    } catch (error) { this.state = previous; throw error; }
  }

  publicAccount(account) {
    return {
      id: account.id,
      username: account.passwordless ? (account.playerId || 'Joueur P27') : account.username,
      displayName: account.displayName,
      createdAt: account.createdAt,
      ...(account.passwordless ? { passwordless: true, playerId: account.playerId || null } : {})
    };
  }

  pruneSessions() {
    const now = this.now();
    const before = this.state.sessions.length;
    this.state.sessions = this.state.sessions.filter(session => session.expiresAt > now && this.state.accounts.some(account => account.id === session.accountId));
    return before !== this.state.sessions.length;
  }

  issueSessionInTransaction(account) {
    this.pruneSessions();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = this.now() + this.sessionTtlMs;
    this.state.sessions.push({ tokenHash: tokenDigest(token), accountId: account.id, expiresAt });
    this.state.sessions = this.state.sessions.slice(-20_000);
    return { account: this.publicAccount(account), token, expiresAt: new Date(expiresAt).toISOString() };
  }

  issueSession(account) {
    return this.transaction(() => this.issueSessionInTransaction(account));
  }

  /**
   * Creates or resumes the internal passwordless P27 account for an already
   * reserved player identity. The account ID is supplied by the identity registry;
   * no user-chosen username or password is required or exposed.
   */
  issuePasswordlessSession(accountId, { playerId = null } = {}) {
    if (typeof accountId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId))
      throw new Error('INVALID_ACCOUNT_ID');
    if (playerId !== null && (typeof playerId !== 'string' || !/^FRP-\d{6}$/.test(playerId)))
      throw new Error('INVALID_PLAYER_ID');
    return this.transaction(() => {
      let account = this.state.accounts.find(row => row.id === accountId);
      if (account && account.passwordless !== true) throw new Error('ACCOUNT_ID_ALREADY_EXISTS');
      if (!account) {
        const salt = randomBytes(16).toString('hex');
        const unreachablePassword = randomBytes(48).toString('base64url');
        account = {
          id: accountId,
          username: `p27-${accountId.slice(0, 12)}`,
          displayName: playerId || 'Joueur P27',
          passwordSalt: salt,
          passwordHash: hashPassword(unreachablePassword, salt),
          passwordless: true,
          playerId,
          createdAt: new Date(this.now()).toISOString()
        };
        this.state.accounts.push(account);
      } else if (playerId && account.playerId && account.playerId !== playerId) {
        throw new Error('PLAYER_ID_MISMATCH');
      } else if (playerId && !account.playerId) {
        account.playerId = playerId;
        account.displayName = playerId;
      }
      return this.issueSessionInTransaction(account);
    });
  }

  register(input = {}) {
    const { username, password, displayName } = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const handle = String(username ?? '').trim().toLowerCase();
    if (!USERNAME_RE.test(handle)) throw new Error('INVALID_USERNAME');
    if (typeof password !== 'string' || password.length < 10 || password.length > 128) throw new Error('INVALID_PASSWORD');
    const salt = randomBytes(16).toString('hex');
    const account = {
      id: randomUUID(), username: handle,
      displayName: cleanName(displayName) || handle,
      passwordSalt: salt, passwordHash: hashPassword(password, salt),
      createdAt: new Date(this.now()).toISOString()
    };
    return this.transaction(() => {
      if (this.state.accounts.some(row => row.username === handle)) throw new Error('USERNAME_TAKEN');
      this.state.accounts.push(account);
      return this.issueSessionInTransaction(account);
    });
  }

  login(input = {}) {
    const { username, password } = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const handle = String(username ?? '').trim().toLowerCase();
    const account = this.state.accounts.find(row => row.username === handle);
    if (typeof password !== 'string' || password.length > 128 || !account || account.passwordless === true) {
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
    return this.transaction(() => {
      const before = this.state.sessions.length;
      this.state.sessions = this.state.sessions.filter(row => row.tokenHash !== digest);
      if (this.state.sessions.length === before) return { skipPersist:true, value:false };
      return true;
    });
  }
}
