import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const digest = value => createHash('sha256').update(value).digest('base64url');
const cleanBinding = value => typeof value === 'string' && value.length >= 24 && value.length <= 256 ? value : null;
const validDigest = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

/**
 * Short-lived server-side OIDC transactions.
 * State, nonce and PKCE verifier are single-use; bind each transaction to the
 * initiating browser session. Optional directory enables restart-safe persistence.
 * Only hashed state/binding values and short-lived nonce/verifier secrets are stored;
 * OAuth tokens and authorization codes are never persisted here.
 */
export class GoogleOidcTransactionStore {
  constructor({ now = () => Date.now(), ttlMs = 10 * 60_000, maxEntries = 5000, directory = null } = {}) {
    this.now = now;
    this.ttlMs = Math.max(60_000, Math.min(15 * 60_000, Number(ttlMs) || 10 * 60_000));
    this.maxEntries = Math.max(100, Math.min(20_000, Number(maxEntries) || 5000));
    this.directory = directory ? path.resolve(directory) : null;
    this.file = this.directory ? path.join(this.directory, 'google-oidc-transactions.json') : null;
    if (this.directory) mkdirSync(this.directory, { recursive: true });
    this.transactions = this.read();
  }

  read() {
    if (!this.file) return new Map();
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.transactions) || parsed.transactions.length > this.maxEntries) throw new Error('bad schema');
      const rows = new Map();
      for (const row of parsed.transactions) {
        if (!row || !validDigest(row.key) || typeof row.nonce !== 'string' || row.nonce.length < 40
          || typeof row.codeVerifier !== 'string' || row.codeVerifier.length < 40
          || !validDigest(row.bindingHash) || !Number.isSafeInteger(row.expiresAt)
          || row.expiresAt <= 0 || rows.has(row.key)) throw new Error('bad transaction');
        rows.set(row.key, { nonce: row.nonce, codeVerifier: row.codeVerifier, bindingHash: row.bindingHash, expiresAt: row.expiresAt });
      }
      return rows;
    } catch (error) {
      if (error.code === 'ENOENT') return new Map();
      throw new Error('GOOGLE_OIDC_TRANSACTION_STORE_CORRUPT');
    }
  }

  persist() {
    if (!this.file) return;
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    const payload = JSON.stringify({ version: 1, transactions: [...this.transactions].map(([key, row]) => ({ key, ...row })) });
    try {
      writeFileSync(temporary, payload, { mode: 0o600 });
      renameSync(temporary, this.file);
    } catch (error) {
      try { unlinkSync(temporary); } catch {}
      throw error;
    }
  }

  prune() {
    const now = this.now();
    const previous = this.transactions;
    const next = new Map([...previous].filter(([, row]) => row.expiresAt > now));
    if (next.size !== previous.size) {
      this.transactions = next;
      try { this.persist(); } catch (error) { this.transactions = previous; throw error; }
    }
  }

  create({ sessionBinding } = {}) {
    const binding = cleanBinding(sessionBinding);
    if (!binding) throw new Error('INVALID_OIDC_SESSION_BINDING');
    this.prune();
    if (this.transactions.size >= this.maxEntries) throw new Error('GOOGLE_OIDC_TRANSACTION_STORE_FULL');
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const expiresAt = this.now() + this.ttlMs;
    const key = digest(state);
    const previous = this.transactions;
    this.transactions = new Map(previous);
    this.transactions.set(key, { nonce, codeVerifier, bindingHash: digest(binding), expiresAt });
    try { this.persist(); } catch (error) { this.transactions = previous; throw error; }
    return {
      state, nonce, codeVerifier,
      codeChallenge: digest(codeVerifier),
      codeChallengeMethod: 'S256',
      expiresAt: new Date(expiresAt).toISOString()
    };
  }

  consume({ state, sessionBinding } = {}) {
    if (typeof state !== 'string' || state.length < 32 || state.length > 128) return null;
    const binding = cleanBinding(sessionBinding);
    if (!binding) return null;
    const key = digest(state);
    const row = this.transactions.get(key);
    if (!row) return null;
    if (row.expiresAt <= this.now()) {
      const previous = this.transactions;
      this.transactions = new Map(previous);
      this.transactions.delete(key);
      try { this.persist(); } catch (error) { this.transactions = previous; throw error; }
      return null;
    }
    if (row.bindingHash !== digest(binding)) return null;
    const previous = this.transactions;
    this.transactions = new Map(previous);
    this.transactions.delete(key);
    try { this.persist(); } catch (error) { this.transactions = previous; throw error; }
    return { nonce: row.nonce, codeVerifier: row.codeVerifier, expiresAt: new Date(row.expiresAt).toISOString() };
  }
}
