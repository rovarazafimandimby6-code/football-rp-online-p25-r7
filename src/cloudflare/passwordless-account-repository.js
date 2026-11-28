const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function publicAccount(row) {
  return {
    id: row.id,
    username: row.player_id || "Joueur P27",
    displayName: row.display_name,
    createdAt: row.created_at,
    passwordless: true,
    playerId: row.player_id,
  };
}

/** D1-backed passwordless account and opaque bearer-session repository. */
export class D1PasswordlessAccountRepository {
  constructor(db, { now = () => Date.now(), sessionTtlMs = SESSION_TTL_MS } = {}) {
    if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
      throw new Error("D1_DATABASE_BINDING_REQUIRED");
    }
    this.db = db;
    this.now = now;
    this.sessionTtlMs = Math.max(60_000, Math.min(SESSION_TTL_MS, Number(sessionTtlMs) || SESSION_TTL_MS));
  }

  async issuePasswordlessSession(accountId, { playerId } = {}) {
    if (typeof accountId !== "string" || !UUID_RE.test(accountId)) throw new Error("INVALID_ACCOUNT_ID");
    if (typeof playerId !== "string" || !/^FRP-\d{6}$/.test(playerId)) throw new Error("INVALID_PLAYER_ID");

    const createdAt = new Date(this.now()).toISOString();
    const salt = randomToken();
    const unreachableHash = await sha256(randomToken() + salt);
    const username = "p27-" + accountId.slice(0, 12);

    await this.db.prepare(
      "INSERT INTO p27_accounts (id, username, display_name, password_salt, password_hash, passwordless, player_id, created_at) " +
      "VALUES (?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO NOTHING"
    ).bind(accountId, username, playerId, salt, unreachableHash, playerId, createdAt).run();

    const account = await this.db.prepare(
      "SELECT id, username, display_name, passwordless, player_id, created_at " +
      "FROM p27_accounts WHERE id = ?"
    ).bind(accountId).first();
    if (!account || Number(account.passwordless) !== 1 || account.player_id !== playerId) {
      throw new Error("ACCOUNT_IDENTITY_MISMATCH");
    }

    const token = randomToken();
    const tokenHash = await sha256(token);
    const expiresAt = this.now() + this.sessionTtlMs;
    await this.db.prepare(
      "INSERT INTO p27_account_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)"
    ).bind(tokenHash, accountId, expiresAt).run();

    return { account: publicAccount(account), token, expiresAt: new Date(expiresAt).toISOString() };
  }

  async hashSessionToken(token) {
    if (typeof token !== "string" || token.length < 40 || token.length > 64) {
      throw new Error("INVALID_SESSION_TOKEN");
    }
    return sha256(token);
  }

  async isSessionHashActive(tokenHash, accountId) {
    if (typeof tokenHash !== "string" || !/^[a-f0-9]{64}$/i.test(tokenHash) ||
        typeof accountId !== "string" || !UUID_RE.test(accountId)) return false;
    const row = await this.db.prepare(
      "SELECT token_hash FROM p27_account_sessions WHERE token_hash = ? AND account_id = ? AND expires_at > ?"
    ).bind(tokenHash, accountId, this.now()).first();
    return Boolean(row);
  }

  async resolve(token) {
    if (typeof token !== "string" || token.length < 40 || token.length > 64) return null;
    const tokenHash = await sha256(token);
    const row = await this.db.prepare(
      "SELECT a.id, a.username, a.display_name, a.passwordless, a.player_id, a.created_at " +
      "FROM p27_account_sessions s JOIN p27_accounts a ON a.id = s.account_id " +
      "WHERE s.token_hash = ? AND s.expires_at > ?"
    ).bind(tokenHash, this.now()).first();
    return row ? publicAccount(row) : null;
  }

  async revoke(token) {
    if (typeof token !== "string" || token.length < 40 || token.length > 64) return false;
    const tokenHash = await sha256(token);
    const result = await this.db.prepare(
      "DELETE FROM p27_account_sessions WHERE token_hash = ?"
    ).bind(tokenHash).run();
    return Number(result?.meta?.changes) > 0;
  }

  async revokeAll(accountId) {
    if (typeof accountId !== "string" || !UUID_RE.test(accountId)) return 0;
    const result = await this.db.prepare(
      "DELETE FROM p27_account_sessions WHERE account_id = ?"
    ).bind(accountId).run();
    return Number(result?.meta?.changes) || 0;
  }
}
