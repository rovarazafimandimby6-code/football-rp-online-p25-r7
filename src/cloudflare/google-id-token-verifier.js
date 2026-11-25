const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const MAX_TOKEN_LENGTH = 16_384;
const MAX_JWKS_KEYS = 20;
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;

function decodeBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("GOOGLE_ID_TOKEN_MALFORMED");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function decodeJsonPart(value) {
  try { return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))); }
  catch { throw new Error("GOOGLE_ID_TOKEN_MALFORMED"); }
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function cacheTtlFromHeaders(headers, fallback) {
  const cacheControl = headers?.get?.("cache-control") || "";
  const match = cacheControl.match(/(?:^|,)\s*max-age=(\d+)/i);
  if (!match) return fallback;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds)
    ? Math.max(60_000, Math.min(6 * 60 * 60 * 1000, seconds * 1000))
    : fallback;
}

export class GoogleWorkerJwksCache {
  constructor({ fetchImpl = globalThis.fetch, now = () => Date.now(), ttlMs = DEFAULT_CACHE_TTL_MS } = {}) {
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.ttlMs = Math.max(60_000, Math.min(6 * 60 * 60 * 1000, Number(ttlMs) || DEFAULT_CACHE_TTL_MS));
    this.keys = null;
    this.expiresAt = 0;
    this.pending = null;
  }

  async getKeys({ forceRefresh = false } = {}) {
    if (!forceRefresh && this.keys && this.expiresAt > this.now()) return this.keys;
    if (this.pending) return this.pending;
    if (typeof this.fetchImpl !== "function") throw new Error("GOOGLE_JWKS_FETCH_UNAVAILABLE");

    this.pending = (async () => {
      let response;
      try {
        response = await this.fetchImpl(GOOGLE_JWKS_URL, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(5_000),
        });
      } catch { throw new Error("GOOGLE_JWKS_FETCH_FAILED"); }
      if (!response?.ok) throw new Error("GOOGLE_JWKS_FETCH_FAILED");

      let data;
      try { data = await response.json(); }
      catch { throw new Error("GOOGLE_JWKS_INVALID"); }
      if (!data || !Array.isArray(data.keys) || data.keys.length < 1 || data.keys.length > MAX_JWKS_KEYS) {
        throw new Error("GOOGLE_JWKS_INVALID");
      }
      const keys = data.keys.filter(key =>
        key && key.kty === "RSA" && key.use === "sig" && key.alg === "RS256" &&
        typeof key.kid === "string" && key.kid.length > 0 && key.kid.length <= 256 &&
        typeof key.n === "string" && typeof key.e === "string"
      );
      if (!keys.length || new Set(keys.map(key => key.kid)).size !== keys.length) {
        throw new Error("GOOGLE_JWKS_INVALID");
      }
      this.keys = keys;
      this.expiresAt = this.now() + cacheTtlFromHeaders(response.headers, this.ttlMs);
      return keys;
    })();

    try { return await this.pending; }
    finally { this.pending = null; }
  }
}

export async function verifyGoogleWorkerIdToken(idToken, {
  clientId, expectedNonce, jwksCache, now = () => Date.now(), clockSkewSeconds = 120,
} = {}) {
  if (typeof idToken !== "string" || idToken.length > MAX_TOKEN_LENGTH) throw new Error("GOOGLE_ID_TOKEN_MALFORMED");
  const parts = idToken.split(".");
  if (parts.length !== 3 || parts.some(part => !part)) throw new Error("GOOGLE_ID_TOKEN_MALFORMED");
  if (typeof clientId !== "string" || !clientId.trim() ||
      typeof expectedNonce !== "string" || expectedNonce.length < 16) {
    throw new Error("GOOGLE_ID_TOKEN_EXPECTED_CONTEXT_REQUIRED");
  }

  const header = decodeJsonPart(parts[0]);
  const claims = decodeJsonPart(parts[1]);
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new Error("GOOGLE_ID_TOKEN_ALGORITHM_REJECTED");
  }

  const cache = jwksCache || new GoogleWorkerJwksCache();
  let keys = await cache.getKeys();
  let jwk = keys.find(key => key.kid === header.kid);
  if (!jwk) {
    keys = await cache.getKeys({ forceRefresh: true });
    jwk = keys.find(key => key.kid === header.kid);
  }
  if (!jwk) throw new Error("GOOGLE_ID_TOKEN_SIGNING_KEY_UNKNOWN");

  let publicKey;
  try {
    publicKey = await crypto.subtle.importKey(
      "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"],
    );
  } catch { throw new Error("GOOGLE_ID_TOKEN_SIGNING_KEY_INVALID"); }

  let signatureValid = false;
  try {
    signatureValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", publicKey, decodeBase64Url(parts[2]),
      new TextEncoder().encode(parts[0] + "." + parts[1]),
    );
  } catch { signatureValid = false; }
  if (!signatureValid) throw new Error("GOOGLE_ID_TOKEN_SIGNATURE_INVALID");

  if (!GOOGLE_ISSUERS.has(claims.iss)) throw new Error("GOOGLE_ID_TOKEN_ISSUER_INVALID");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(clientId) ||
      (audiences.length > 1 && claims.azp !== clientId) ||
      (claims.azp !== undefined && claims.azp !== clientId)) {
    throw new Error("GOOGLE_ID_TOKEN_AUDIENCE_INVALID");
  }

  const seconds = Math.floor(now() / 1000);
  const skew = Math.max(0, Math.min(300, Number(clockSkewSeconds) || 0));
  if (!Number.isFinite(claims.exp) || claims.exp <= seconds - skew) throw new Error("GOOGLE_ID_TOKEN_EXPIRED");
  if (!Number.isFinite(claims.iat) || claims.iat > seconds + skew) throw new Error("GOOGLE_ID_TOKEN_ISSUED_AT_INVALID");
  if (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > seconds + skew)) {
    throw new Error("GOOGLE_ID_TOKEN_NOT_YET_VALID");
  }
  if (!constantTimeEqual(claims.nonce, expectedNonce)) throw new Error("GOOGLE_ID_TOKEN_NONCE_INVALID");
  if (typeof claims.sub !== "string" || !/^[A-Za-z0-9_-]{8,255}$/.test(claims.sub)) {
    throw new Error("GOOGLE_ID_TOKEN_SUBJECT_INVALID");
  }

  return { googleSubject: claims.sub, issuer: claims.iss, audience: clientId, issuedAt: claims.iat, expiresAt: claims.exp };
}
