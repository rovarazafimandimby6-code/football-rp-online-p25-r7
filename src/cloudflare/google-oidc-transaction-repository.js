const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PURPOSES = new Set(["link", "login"]);
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_TTL_MS = 15 * 60 * 1000;

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function randomValue(size = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
async function sha256Base64Url(value) {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

/** Short-lived, browser-bound, single-use OIDC transaction storage in D1. */
export class D1GoogleOidcTransactionRepository {
  constructor(db, { now = () => Date.now(), ttlMs = DEFAULT_TTL_MS } = {}) {
    if (!db || typeof db.prepare !== "function") throw new Error("D1_DATABASE_BINDING_REQUIRED");
    this.db = db;
    this.now = now;
    this.ttlMs = Math.max(60_000, Math.min(MAX_TTL_MS, Number(ttlMs) || DEFAULT_TTL_MS));
  }
  async create({ accountId, sessionBinding, purpose = accountId ? "link" : "login" } = {}) {
    if (!PURPOSES.has(purpose)) throw new Error("INVALID_OIDC_PURPOSE");
    if (purpose === "link" && (typeof accountId !== "string" || !UUID_RE.test(accountId))) throw new Error("INVALID_OIDC_ACCOUNT_ID");
    if (purpose === "login" && accountId !== undefined) throw new Error("OIDC_LOGIN_MUST_NOT_SPECIFY_ACCOUNT");
    if (typeof sessionBinding !== "string" || sessionBinding.length < 24 || sessionBinding.length > 256) throw new Error("INVALID_OIDC_SESSION_BINDING");

    const state = randomValue();
    const nonce = randomValue();
    const codeVerifier = randomValue();
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const stateHash = await sha256Hex(state);
    const bindingHash = await sha256Hex(sessionBinding);
    const expiresAt = this.now() + this.ttlMs;
    await this.db.prepare(
      "INSERT INTO p27_google_oidc_transactions " +
      "(state_hash, nonce, code_verifier, binding_hash, purpose, account_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(stateHash, nonce, codeVerifier, bindingHash, purpose, accountId ?? null, expiresAt).run();
    return {
      state, nonce, codeVerifier, codeChallenge, codeChallengeMethod: "S256",
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }
  async consume({ state, sessionBinding } = {}) {
    if (typeof state !== "string" || state.length < 32 || state.length > 128) return null;
    if (typeof sessionBinding !== "string" || sessionBinding.length < 24 || sessionBinding.length > 256) return null;
    const stateHash = await sha256Hex(state);
    const bindingHash = await sha256Hex(sessionBinding);
    const row = await this.db.prepare(
      "SELECT state_hash, nonce, code_verifier, binding_hash, purpose, account_id, expires_at FROM p27_google_oidc_transactions WHERE state_hash = ?"
    ).bind(stateHash).first();
    if (!row || row.expires_at <= this.now() || row.binding_hash !== bindingHash) return null;
    if (!PURPOSES.has(row.purpose) || (row.purpose === "link" && !UUID_RE.test(row.account_id || "")) ||
        (row.purpose === "login" && row.account_id !== null)) throw new Error("GOOGLE_OIDC_TRANSACTION_CORRUPT");
    const deleted = await this.db.prepare(
      "DELETE FROM p27_google_oidc_transactions WHERE state_hash = ? AND binding_hash = ? AND expires_at > ?"
    ).bind(stateHash, bindingHash, this.now()).run();
    if (Number(deleted?.meta?.changes) !== 1) return null;
    return {
      nonce: row.nonce, codeVerifier: row.code_verifier, purpose: row.purpose,
      ...(row.account_id ? { accountId: row.account_id } : {}),
      expiresAt: new Date(row.expires_at).toISOString(),
    };
  }
  async pruneExpired() {
    const result = await this.db.prepare("DELETE FROM p27_google_oidc_transactions WHERE expires_at <= ?")
      .bind(this.now()).run();
    return Number(result?.meta?.changes) || 0;
  }
}
