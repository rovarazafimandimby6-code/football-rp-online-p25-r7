import {
  D1PlayerIdentityRepository,
  allowPlayerIdentityAttempt,
} from "./player-identity-repository.js";
import { D1PasswordlessAccountRepository } from "./passwordless-account-repository.js";
import { D1GoogleIdentityRepository } from "./google-identity-repository.js";
import { D1GoogleOidcTransactionRepository } from "./google-oidc-transaction-repository.js";
import { verifyGoogleWorkerIdToken } from "./google-id-token-verifier.js";

const MAX_BODY_BYTES = 8 * 1024;
const OIDC_BINDING_COOKIE = "p27_google_oidc_binding";
const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "pragma": "no-cache",
    ...headers,
  },
});

function cookieValue(request, name) {
  const cookies = request.headers.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      try { return decodeURIComponent(part.slice(index + 1).trim()); }
      catch { return null; }
    }
  }
  return null;
}

function randomBase64Url(size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function googleConfig(env) {
  const clientId = typeof env.GOOGLE_CLIENT_ID === "string" ? env.GOOGLE_CLIENT_ID.trim() : "";
  const clientSecret = typeof env.GOOGLE_CLIENT_SECRET === "string" ? env.GOOGLE_CLIENT_SECRET : "";
  const redirectUri = typeof env.GOOGLE_REDIRECT_URI === "string" ? env.GOOGLE_REDIRECT_URI.trim() : "";
  if (!clientId || !clientSecret || !redirectUri) throw new Error("GOOGLE_OIDC_NOT_CONFIGURED");
  let redirect;
  try { redirect = new URL(redirectUri); } catch { throw new Error("GOOGLE_OIDC_REDIRECT_INVALID"); }
  if (redirect.protocol !== "https:" && redirect.hostname !== "localhost") {
    throw new Error("GOOGLE_OIDC_REDIRECT_INVALID");
  }
  if (redirect.search || redirect.hash || redirect.username || redirect.password) {
    throw new Error("GOOGLE_OIDC_REDIRECT_INVALID");
  }
  return { clientId, clientSecret, redirectUri, redirect };
}

function callbackMatches(requestUrl, redirect) {
  const actual = new URL(requestUrl);
  return actual.origin === redirect.origin && actual.pathname === redirect.pathname;
}

async function readJson(request) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new Error("INVALID_JSON");
  }
}

function errorResponse(error) {
  const code = String(error?.message || "INTERNAL_ERROR");
  const status =
    code === "INVALID_LOCAL_PROFILE_KEY" ||
    code === "INVALID_LOCAL_PROFILE_PROOF" ||
    code === "INVALID_PLAYER_ID_GENERATOR" ||
    code === "INVALID_JSON" ||
    code === "BODY_TOO_LARGE" ||
    code === "GOOGLE_OIDC_TRANSACTION_INVALID" ||
    code === "GOOGLE_OIDC_CODE_INVALID" ||
    code === "GOOGLE_OIDC_REDIRECT_INVALID" ? 400 :
    code === "LOCAL_PROFILE_PROOF_INVALID" ||
    code === "GOOGLE_IDENTITY_NOT_VERIFIED" ? 401 :
    code === "PLAYER_IDENTITY_RATE_LIMITED" ? 429 :
    code === "LOCAL_PROFILE_REPLICA_LIMIT" ||
    code === "GOOGLE_IDENTITY_ALREADY_LINKED" ? 409 :
    code === "PLAYER_IDENTITY_NOT_FOUND" ||
    code === "GOOGLE_ACCOUNT_NOT_LINKED" ? 404 :
    503;
  const safeCode = status === 503 && code !== "GOOGLE_OIDC_NOT_CONFIGURED"
    ? "P27_SERVICE_UNAVAILABLE"
    : code;
  return json(status, { error: safeCode });
}

async function startGoogleAuthorization(request, env, purpose) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) return json(403, { error: "ORIGIN_NOT_ALLOWED" });
    } catch { return json(403, { error: "ORIGIN_NOT_ALLOWED" }); }
  }
  if (!env.P27_DB || typeof env.P27_DB.prepare !== "function") {
    return json(503, { error: "D1_BINDING_MISSING" });
  }
  const config = googleConfig(env);
  let account = null;
  if (purpose === "link") {
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    account = await new D1PasswordlessAccountRepository(env.P27_DB).resolve(token);
    if (!account) return json(401, { error: "SESSION_EXPIRED" });
    const identity = await new D1PlayerIdentityRepository(env.P27_DB).getByAccountId(account.id);
    if (!identity || identity.playerId !== account.playerId) return json(404, { error: "PLAYER_IDENTITY_NOT_FOUND" });
    const linked = await new D1GoogleIdentityRepository(env.P27_DB).getByAccountId(account.id);
    if (linked) return json(409, { error: "GOOGLE_IDENTITY_ALREADY_LINKED" });
  }

  const binding = randomBase64Url();
  const transactions = new D1GoogleOidcTransactionRepository(env.P27_DB);
  const transaction = await transactions.create({
    ...(account ? { accountId: account.id } : {}),
    sessionBinding: binding,
    purpose,
  });
  const authorizationUrl = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  authorizationUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: transaction.codeChallenge,
    code_challenge_method: "S256",
    access_type: "online",
    prompt: "select_account",
  }).toString();

  return json(200, {
    authorizationUrl: authorizationUrl.toString(),
    expiresAt: transaction.expiresAt,
    purpose,
  }, {
    "set-cookie": `${OIDC_BINDING_COOKIE}=${encodeURIComponent(binding)}; Path=${new URL(config.redirectUri).pathname}; Max-Age=900; HttpOnly; Secure; SameSite=Lax`,
  });
}

async function completeGoogleAuthorization(request, env, requestUrl) {
  if (!env.P27_DB || typeof env.P27_DB.prepare !== "function") {
    return json(503, { error: "D1_BINDING_MISSING" });
  }
  const config = googleConfig(env);
  if (!callbackMatches(requestUrl, config.redirect)) {
    return json(400, { error: "GOOGLE_OIDC_REDIRECT_MISMATCH" });
  }
  const url = new URL(requestUrl);
  const providerError = url.searchParams.get("error");
  if (providerError) return json(400, { error: "GOOGLE_OIDC_PROVIDER_DENIED" });
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (typeof code !== "string" || code.length < 8 || code.length > 4096 || /\s/.test(code)) {
    return json(400, { error: "GOOGLE_OIDC_CODE_INVALID" });
  }
  const binding = cookieValue(request, OIDC_BINDING_COOKIE);
  if (!binding) return json(400, { error: "GOOGLE_OIDC_TRANSACTION_INVALID" });

  const transactions = new D1GoogleOidcTransactionRepository(env.P27_DB);
  const transaction = await transactions.consume({ state, sessionBinding: binding });
  if (!transaction || !["link", "login"].includes(transaction.purpose)) {
    return json(400, { error: "GOOGLE_OIDC_TRANSACTION_INVALID" });
  }

  let tokenResponse;
  try {
    tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
        code_verifier: transaction.codeVerifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return json(503, { error: "GOOGLE_OIDC_TOKEN_EXCHANGE_UNAVAILABLE" });
  }
  if (!tokenResponse.ok) return json(401, { error: "GOOGLE_OIDC_TOKEN_EXCHANGE_FAILED" });
  let tokens;
  try { tokens = await tokenResponse.json(); }
  catch { return json(401, { error: "GOOGLE_OIDC_TOKEN_RESPONSE_INVALID" }); }
  if (!tokens || typeof tokens.id_token !== "string" || tokens.id_token.length > 16_384) {
    return json(401, { error: "GOOGLE_OIDC_ID_TOKEN_MISSING" });
  }

  const verified = await verifyGoogleWorkerIdToken(tokens.id_token, {
    clientId: config.clientId,
    expectedNonce: transaction.nonce,
  });
  const identities = new D1GoogleIdentityRepository(env.P27_DB);
  const playerIdentities = new D1PlayerIdentityRepository(env.P27_DB);
  const accounts = new D1PasswordlessAccountRepository(env.P27_DB);

  if (transaction.purpose === "link") {
    const identity = await playerIdentities.getByAccountId(transaction.accountId);
    if (!identity) return json(404, { error: "PLAYER_IDENTITY_NOT_FOUND" });
    const existingGoogle = await identities.getByGoogleSubject(verified.googleSubject);
    const existingAccount = await identities.getByAccountId(transaction.accountId);
    if (existingGoogle || existingAccount) return json(409, { error: "GOOGLE_IDENTITY_ALREADY_LINKED" });
    try {
      await identities.linkInitial({
        accountId: transaction.accountId,
        googleSubject: verified.googleSubject,
        googleIdentityVerified: true,
      });
    } catch (error) {
      if (String(error?.message || "").includes("UNIQUE")) {
        return json(409, { error: "GOOGLE_IDENTITY_ALREADY_LINKED" });
      }
      throw error;
    }
    return json(200, {
      linked: true,
      authenticated: false,
      accountId: transaction.accountId,
      playerId: identity.playerId,
      purpose: "link",
    }, {
      "set-cookie": `${OIDC_BINDING_COOKIE}=; Path=${config.redirect.pathname}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    });
  }

  const linked = await identities.getByGoogleSubject(verified.googleSubject);
  if (!linked) return json(404, { error: "GOOGLE_ACCOUNT_NOT_LINKED" });
  const identity = await playerIdentities.getByAccountId(linked.accountId);
  if (!identity) return json(503, { error: "GOOGLE_ACCOUNT_IDENTITY_INCONSISTENT" });
  const session = await accounts.issuePasswordlessSession(linked.accountId, { playerId: identity.playerId });
  return json(200, {
    authenticated: true,
    linked: false,
    purpose: "login",
    ...session,
  }, {
    "set-cookie": `${OIDC_BINDING_COOKIE}=; Path=${config.redirect.pathname}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
  });
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json(200, {
        ok: true,
        status: "live",
        service: "football-rp-online-p27-cloudflare",
        stage: "local-player-identity",
      });
    }

    if (request.method === "GET" && url.pathname === "/readyz") {
      if (!env.P27_DB || typeof env.P27_DB.prepare !== "function") {
        return json(503, { ok: false, status: "not-ready", reason: "D1_BINDING_MISSING" });
      }
      try {
        const probe = await env.P27_DB.prepare("SELECT 1 AS ok").first();
        if (Number(probe?.ok) !== 1) throw new Error("D1_PROBE_FAILED");
        return json(200, { ok: true, status: "ready", storage: "d1-connected", stage: "local-player-identity" });
      } catch {
        return json(503, { ok: false, status: "not-ready", reason: "D1_UNAVAILABLE" });
      }
    }

    if (request.method === "POST" &&
        (url.pathname === "/api/auth/google/login/start" || url.pathname === "/api/auth/google/link/start")) {
      try {
        return await startGoogleAuthorization(
          request, env, url.pathname.endsWith("/login/start") ? "login" : "link",
        );
      } catch (error) { return errorResponse(error); }
    }

    if (request.method === "GET" && url.pathname === "/api/auth/google/callback") {
      try { return await completeGoogleAuthorization(request, env, request.url); }
      catch (error) { return errorResponse(error); }
    }

    const identityRoute =
      request.method === "POST" &&
      (url.pathname === "/api/player-identities/reserve" ||
        url.pathname === "/api/player-identities/verify-local-proof");

    if (identityRoute) {
      if (!env.P27_DB || typeof env.P27_DB.prepare !== "function") {
        return json(503, { error: "D1_BINDING_MISSING" });
      }
      try {
        const clientAddress = request.headers.get("CF-Connecting-IP") || "local";
        if (!await allowPlayerIdentityAttempt(env.P27_DB, clientAddress)) {
          throw new Error("PLAYER_IDENTITY_RATE_LIMITED");
        }
        const body = await readJson(request);
        const identities = new D1PlayerIdentityRepository(env.P27_DB);
        if (url.pathname === "/api/player-identities/reserve") {
          const reservation = await identities.reserve({
            localProfileKey: body.localProfileKey,
            localProofSecret: body.localProofSecret,
          });
          const session = await new D1PasswordlessAccountRepository(env.P27_DB)
            .issuePasswordlessSession(reservation.accountId, { playerId: reservation.playerId });
          return json(200, {
            ...session,
            accountId: reservation.accountId,
            playerId: reservation.playerId,
            reserved: true,
            alreadyReserved: reservation.alreadyReserved,
          });
        }
        const identity = await identities.verifyLocalProof({
          localProfileKey: body.localProfileKey,
          localProofSecret: body.localProofSecret,
        });
        if (!identity) return json(401, { error: "LOCAL_PROFILE_PROOF_INVALID" });
        return json(200, { verified: true, accountId: identity.accountId, playerId: identity.playerId });
      } catch (error) { return errorResponse(error); }
    }

    if (url.pathname.startsWith("/api/accounts/")) {
      if (!env.P27_DB || typeof env.P27_DB.prepare !== "function") {
        return json(503, { error: "D1_BINDING_MISSING" });
      }
      const accounts = new D1PasswordlessAccountRepository(env.P27_DB);
      const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      if (request.method === "GET" && url.pathname === "/api/accounts/me") {
        const account = await accounts.resolve(token);
        return account ? json(200, { account }) : json(401, { error: "SESSION_EXPIRED" });
      }
      if (request.method === "POST" && url.pathname === "/api/accounts/logout") {
        await accounts.revoke(token);
        return json(200, { loggedOut: true });
      }
      if (request.method === "POST" && url.pathname === "/api/accounts/sessions/revoke-all") {
        const account = await accounts.resolve(token);
        if (!account) return json(401, { error: "SESSION_EXPIRED" });
        const revokedSessions = await accounts.revokeAll(account.id);
        return json(200, { revoked: true, revokedSessions });
      }
    }

    return json(501, {
      error: "CLOUDFLARE_API_NOT_MIGRATED",
      message: "Cette entrée Cloudflare ne contient pas encore toutes les routes P27.",
    });
  },
};
