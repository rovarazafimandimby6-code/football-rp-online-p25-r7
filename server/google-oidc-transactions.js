import { createHash, randomBytes } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest('base64url');
const cleanBinding = value => typeof value === 'string' && value.length >= 24 && value.length <= 256 ? value : null;

/**
 * Short-lived server-side OIDC transactions.
 * State, nonce and PKCE verifier are single-use; bind each transaction to the
 * initiating browser session. This module does not exchange or validate tokens.
 */
export class GoogleOidcTransactionStore {
  constructor({ now = () => Date.now(), ttlMs = 10 * 60_000, maxEntries = 5000 } = {}) {
    this.now = now;
    this.ttlMs = Math.max(60_000, Math.min(15 * 60_000, Number(ttlMs) || 10 * 60_000));
    this.maxEntries = Math.max(100, Math.min(20_000, Number(maxEntries) || 5000));
    this.transactions = new Map();
  }

  prune() {
    const now = this.now();
    for (const [key, row] of this.transactions) if (row.expiresAt <= now) this.transactions.delete(key);
    while (this.transactions.size >= this.maxEntries) this.transactions.delete(this.transactions.keys().next().value);
  }

  create({ sessionBinding } = {}) {
    const binding = cleanBinding(sessionBinding);
    if (!binding) throw new Error('INVALID_OIDC_SESSION_BINDING');
    this.prune();
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const expiresAt = this.now() + this.ttlMs;
    this.transactions.set(digest(state), {
      nonce,
      codeVerifier,
      bindingHash: digest(binding),
      expiresAt
    });
    return {
      state,
      nonce,
      codeVerifier,
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
      this.transactions.delete(key);
      return null;
    }
    if (row.bindingHash !== digest(binding)) return null;
    this.transactions.delete(key);
    return { nonce: row.nonce, codeVerifier: row.codeVerifier, expiresAt: new Date(row.expiresAt).toISOString() };
  }
}
