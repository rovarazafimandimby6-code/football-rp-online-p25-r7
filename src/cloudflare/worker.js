import {
  D1PlayerIdentityRepository,
  allowPlayerIdentityAttempt,
} from "./player-identity-repository.js";
import { D1PasswordlessAccountRepository } from "./passwordless-account-repository.js";
import { D1GoogleIdentityRepository } from "./google-identity-repository.js";
import { D1GoogleOidcTransactionRepository } from "./google-oidc-transaction-repository.js";
import { verifyGoogleWorkerIdToken } from "./google-id-token-verifier.js";
import { D1PlayerProfileRepository } from "./player-profile-repository.js";
import { D1PlayerProgressionRepository } from "./player-progression-repository.js";
import { D1PlayerCareerRepository } from "./player-career-repository.js";
import { D1PlayerShopRepository } from "./player-shop-repository.js";
import { verifyCareerIngestSignature } from "./career-ingest-auth.js";
import { D1MatchRoomRepository } from "./match-room-repository.js";
export { P27MatchRoomDurableObject } from "./match-room-object.js";

const MAX_BODY_BYTES = 8 * 1024;
const DEFAULT_APP_ORIGINS = new Set([
  "capacitor://localhost",
  "http://localhost",
  "https://localhost",
  "https://football-rp-online-p25-r7.onrender.com",
]);

function isAllowedOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { if (new URL(origin).origin === new URL(request.url).origin) return true; } catch { return false; }
  const configured = typeof env.P27_ALLOWED_ORIGINS === "string"
    ? env.P27_ALLOWED_ORIGINS.split(",").map(value => value.trim()).filter(Boolean)
    : [];
  return DEFAULT_APP_ORIGINS.has(origin) || configured.includes(origin);
}

function withCors(response, request) {
  const origin = request.headers.get("origin");
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.set("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("access-control-allow-headers", "Accept, Authorization, Content-Type, X-P27-Signature");
  headers.set("access-control-max-age", "86400");
  headers.append("vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const OIDC_BINDING_COOKIE = "p27_google_oidc_binding";
const ACCOUNT_SESSION_COOKIE = "p27_account_session";
const ACCOUNT_SESSION_MAX_AGE = 30 * 24 * 60 * 60;
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

function sessionTokenFromRequest(request) {
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) return bearer;
  return cookieValue(request, ACCOUNT_SESSION_COOKIE);
}

function accountSessionCookie(token) {
  return `${ACCOUNT_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${ACCOUNT_SESSION_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

function clearAccountSessionCookie() {
  return `${ACCOUNT_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function redirectToApp(request, query = "") {
  const destination = new URL("/", request.url);
  if (query) destination.searchParams.set("google", query);
  return new Response(null, {
    status: 303,
    headers: { location: destination.toString(), "cache-control": "no-store" },
  });
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
    code === "INVALID_PLAYER_PROFILE" ||
    code === "INVALID_PROFILE_REVISION" ||
    code === "PLAYER_PROFILE_TOO_LARGE" ||
    code === "INVALID_ATTRIBUTE" ||
    code === "INVALID_PROGRESSION_MODE" ||
    code === "INVALID_PLAYER_ID" ||
    code === "INVALID_CAREER_CURSOR" ||
    code === "INVALID_JSON" ||
    code === "BODY_TOO_LARGE" ||
    code === "GOOGLE_OIDC_TRANSACTION_INVALID" ||
    code === "GOOGLE_OIDC_CODE_INVALID" ||
    code === "GOOGLE_OIDC_REDIRECT_INVALID" ? 400 :
    code === "LOCAL_PROFILE_PROOF_INVALID" ||
    code === "GOOGLE_IDENTITY_NOT_VERIFIED" ||
    code === "SESSION_EXPIRED" ? 401 :
    code === "PLAYER_IDENTITY_RATE_LIMITED" ? 429 :
    code === "LOCAL_PROFILE_REPLICA_LIMIT" ||
    code === "GOOGLE_IDENTITY_ALREADY_LINKED" ||
    code === "PROFILE_REVISION_CONFLICT" ||
    code === "PROGRESSION_CONCURRENT_UPDATE" ? 409 :
    code === "PLAYER_IDENTITY_NOT_FOUND" ||
    code === "GOOGLE_ACCOUNT_NOT_LINKED" ? 404 :
    code === "PLAYER_IDENTITY_MISMATCH" ? 409 :
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
      if (!isAllowedOrigin(request, env)) return json(403, { error: "ORIGIN_NOT_ALLOWED" });
    } catch { return json(403, { error: "ORIGIN_NOT_ALLOWED" }); }
  }
  if (!env.P27_DB || typeof env.P27_DB.prepare !== "function") {
    return json(503, { error: "D1_BINDING_MISSING" });
  }
  const clientAddress = request.headers.get("CF-Connecting-IP") || "local";
  if (!await allowPlayerIdentityAttempt(env.P27_DB, clientAddress, Date.now(), "google-oidc-start")) {
    return json(429, { error: "PLAYER_IDENTITY_RATE_LIMITED" });
  }
  const config = googleConfig(env);
  let account = null;
  let sessionTokenHash = null;
  if (purpose === "link") {
    const token = sessionTokenFromRequest(request);
    const accountRepository = new D1PasswordlessAccountRepository(env.P27_DB);
    account = await accountRepository.resolve(token);
    if (!account) return json(401, { error: "SESSION_EXPIRED" });
    sessionTokenHash = await accountRepository.hashSessionToken(token);
    const body = await readJson(request);
    const provenIdentity = await new D1PlayerIdentityRepository(env.P27_DB).verifyLocalProof({
      localProfileKey: body.localProfileKey,
      localProofSecret: body.localProofSecret,
    });
    if (!provenIdentity || provenIdentity.accountId !== account.id ||
        provenIdentity.playerId !== account.playerId) {
      return json(401, { error: "LOCAL_PROFILE_PROOF_INVALID" });
    }
    const identity = await new D1PlayerIdentityRepository(env.P27_DB).getByAccountId(account.id);
    if (!identity || identity.playerId !== account.playerId) return json(404, { error: "PLAYER_IDENTITY_NOT_FOUND" });
    const linked = await new D1GoogleIdentityRepository(env.P27_DB).getByAccountId(account.id);
    if (linked) return json(409, { error: "GOOGLE_IDENTITY_ALREADY_LINKED" });
  }

  const binding = randomBase64Url();
  const transactions = new D1GoogleOidcTransactionRepository(env.P27_DB);
  await transactions.pruneExpired();
  const transaction = await transactions.create({
    ...(account ? { accountId: account.id, sessionTokenHash } : {}),
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
  const clientAddress = request.headers.get("CF-Connecting-IP") || "local";
  if (!await allowPlayerIdentityAttempt(env.P27_DB, clientAddress, Date.now(), "google-oidc-callback")) {
    return json(429, { error: "PLAYER_IDENTITY_RATE_LIMITED" });
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
  const accounts = new D1PasswordlessAccountRepository(env.P27_DB);
  if (transaction.purpose === "link" &&
      !await accounts.isSessionHashActive(transaction.sessionTokenHash, transaction.accountId)) {
    return json(401, { error: "SESSION_EXPIRED" });
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
  
  if (transaction.purpose === "link") {
    const identity = await playerIdentities.getByAccountId(transaction.accountId);
    if (!identity) return json(404, { error: "PLAYER_IDENTITY_NOT_FOUND" });
    const existingGoogle = await identities.getByGoogleSubject(verified.googleSubject);
    const existingAccount = await identities.getByAccountId(transaction.accountId);
    if (existingGoogle || existingAccount) return json(409, { error: "GOOGLE_IDENTITY_ALREADY_LINKED" });
    try {
      await identities.linkInitialForActiveSession({
        accountId: transaction.accountId,
        googleSubject: verified.googleSubject,
        googleIdentityVerified: true,
        sessionTokenHash: transaction.sessionTokenHash,
      });
    } catch (error) {
      if (String(error?.message || "").includes("UNIQUE")) {
        return json(409, { error: "GOOGLE_IDENTITY_ALREADY_LINKED" });
      }
      throw error;
    }
    const response = redirectToApp(request, "linked");
    response.headers.append(
      "set-cookie",
      `${OIDC_BINDING_COOKIE}=; Path=${config.redirect.pathname}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    );
    return response;
  }

  const linked = await identities.getByGoogleSubject(verified.googleSubject);
  if (!linked) return json(404, { error: "GOOGLE_ACCOUNT_NOT_LINKED" });
  const identity = await playerIdentities.getByAccountId(linked.accountId);
  if (!identity) return json(503, { error: "GOOGLE_ACCOUNT_IDENTITY_INCONSISTENT" });
  const session = await accounts.issuePasswordlessSession(linked.accountId, { playerId: identity.playerId });
  const response = redirectToApp(request, "connected");
  response.headers.append("set-cookie", accountSessionCookie(session.token));
  response.headers.append(
    "set-cookie",
    `${OIDC_BINDING_COOKIE}=; Path=${config.redirect.pathname}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
  );
  return response;
}


async function handleMatchRoomRoute(request, env, url) {
  const namespace = env.P27_MATCH_ROOMS;
  const hasD1 = env.P27_DB && typeof env.P27_DB.prepare === "function";
  const roomRepo = hasD1 ? new D1MatchRoomRepository(env.P27_DB) : null;
  const roomPath = url.pathname.match(/^\\/api\\/rooms\\/([a-f0-9]{12})(?:\\/(join|input|heartbeat|reconnect|leave|entry-request|rotation|result|socket))?$/);
  const isRoomCollection = url.pathname === "/api/rooms";
  if (!isRoomCollection && !roomPath) return null;
  if (!namespace || typeof namespace.idFromName !== "function" || typeof namespace.get !== "function") {
    return json(503, { error: "MATCH_ROOM_OBJECTS_NOT_CONFIGURED" });
  }
  if (!roomRepo) return json(503, { error: "D1_BINDING_MISSING" });

  if (request.method === "GET" && isRoomCollection) {
    try { return json(200, { rooms: await roomRepo.listDiscoverable({ limit: 50 }) }); }
    catch (error) { return json(503, { error: String(error?.message || "MATCH_ROOM_INDEX_UNAVAILABLE") }); }
  }
  if (request.method === "POST" && isRoomCollection) {
    try {
      const body = await readJson(request);
      if (body.competitionFixtureId) return json(409, { error: "COMPETITION_MATCH_NOT_MIGRATED" });
      const bytes = crypto.getRandomValues(new Uint8Array(6));
      const roomId = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
      const stub = namespace.get(namespace.idFromName(roomId));
      return await stub.fetch("https://match-room.internal/internal/create", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, roomId }),
      });
    } catch (error) { return errorResponse(error); }
  }

  const roomId = roomPath[1];
  const action = roomPath[2] || "state";
  const stub = namespace.get(namespace.idFromName(roomId));
  if (action === "socket") return json(501, { error: "MATCH_SOCKET_NOT_READY" });

  if (action === "join" && request.method === "POST") {
    try {
      const body = await readJson(request);
      const sessionToken = sessionTokenFromRequest(request);
      const account = sessionToken ? await new D1PasswordlessAccountRepository(env.P27_DB).resolve(sessionToken) : null;
      if (account) return json(409, { error: "MATCH_CAREER_INGEST_NOT_READY" });
      if (sessionToken && !account) return json(401, { error: "SESSION_EXPIRED" });
      let identity = null;
      if (account) {
        identity = await new D1PlayerIdentityRepository(env.P27_DB).getByAccountId(account.id);
        if (!identity || identity.playerId !== account.playerId) return json(403, { error: "PLAYER_IDENTITY_REQUIRED" });
      }
      return await stub.fetch("https://match-room.internal/internal/join", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: body.displayName, preferredTeam: body.preferredTeam, role: body.role,
          accountId: account?.id || null, careerPlayerId: identity?.playerId || null,
        }),
      });
    } catch (error) { return errorResponse(error); }
  }
  if (action === "result" && request.method === "GET") return stub.fetch("https://match-room.internal/internal/result");
  if (!roomPath[2] && request.method === "GET") {
    const since = url.searchParams.get("sinceSequence");
    if (since !== null) {
      const afterEventId = url.searchParams.get("afterEventId") || "0";
      return stub.fetch("https://match-room.internal/internal/delta?afterSequence=" +
        encodeURIComponent(since) + "&afterEventId=" + encodeURIComponent(afterEventId));
    }
    return stub.fetch("https://match-room.internal/internal/state");
  }

  const postActions = new Set(["input", "heartbeat", "reconnect", "leave", "entry-request", "rotation"]);
  if (request.method !== "POST" || !postActions.has(action)) return json(405, { error: "METHOD_NOT_ALLOWED" });
  try {
    const body = await readJson(request);
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.match(/^Bearer\\s+(.+)$/i)?.[1]?.trim() || "";
    const internalBody = action === "input" ? { token, input: body }
      : action === "rotation" ? { token, outgoingId: body.outgoingId, incomingId: body.incomingId }
      : { token };
    return await stub.fetch("https://match-room.internal/internal/" + action, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(internalBody),
    });
  } catch (error) { return errorResponse(error); }
}

const worker = {
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

    const matchRoomResponse = await handleMatchRoomRoute(request, env, url);
    if (matchRoomResponse) return matchRoomResponse;

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
            accountId: reservation.accountId,
            playerId: reservation.playerId,
            reserved: true,
            alreadyReserved: reservation.alreadyReserved,
            session: { token: session.token, account: session.account, expiresAt: session.expiresAt },
          }, { "set-cookie": accountSessionCookie(session.token) });
        }
        const identity = await identities.verifyLocalProof({
          localProfileKey: body.localProfileKey,
          localProofSecret: body.localProofSecret,
        });
        if (!identity) return json(401, { error: "LOCAL_PROFILE_PROOF_INVALID" });
        return json(200, { verified: true, accountId: identity.accountId, playerId: identity.playerId });
      } catch (error) { return errorResponse(error); }
    }

    if (url.pathname === "/api/player-profile/me" && ["GET", "PUT"].includes(request.method)) {
      if (!env.P27_DB || typeof env.P27_DB.prepare !== "function") {
        return json(503, { error: "D1_BINDING_MISSING" });
      }
      const token = sessionTokenFromRequest(request);
      const accounts = new D1PasswordlessAccountRepository(env.P27_DB);
      const account = await accounts.resolve(token);
      if (!account) return json(401, { error: "SESSION_EXPIRED" });
      if (request.method === "GET") {
        try {
          const snapshot = await new D1PlayerProfileRepository(env.P27_DB).get(account.id);
          return json(200, snapshot);
        } catch (error) { return errorResponse(error); }
      }
      const origin = request.headers.get("origin");
      if (origin) {
        try {
          if (!isAllowedOrigin(request, env)) return json(403, { error: "ORIGIN_NOT_ALLOWED" });
        } catch { return json(403, { error: "ORIGIN_NOT_ALLOWED" }); }
      }
      try {
        const body = await readJson(request);
        const snapshot = await new D1PlayerProfileRepository(env.P27_DB).save(
          account.id, body.profile, body.expectedRevision,
        );
        return json(200, snapshot);
      } catch (error) {
        const response = errorResponse(error);
        if (error?.message === "PROFILE_REVISION_CONFLICT") {
          return json(409, { error: "PROFILE_REVISION_CONFLICT", currentRevision: error.currentRevision });
        }
        return response;
      }
    }

    // Unified player-shop API used by the current in-game shop client.
    // Club-shop requests remain on the authoritative server until club ownership and treasury are D1-backed.
    if (url.pathname === "/api/shop" && request.method === "GET" && (url.searchParams.get("shop") || "player") === "player") {
      if (!env.P27_DB || typeof env.P27_DB.prepare !== "function") return json(503, { error: "D1_BINDING_MISSING" });
      const account = await new D1PasswordlessAccountRepository(env.P27_DB).resolve(sessionTokenFromRequest(request));
      if (!account) return json(401, { error: "SESSION_EXPIRED" });
      try {
        const shop = new D1PlayerShopRepository(env.P27_DB);
        const progression = await new D1PlayerProgressionRepository(env.P27_DB).get(account.id);
        return json(200, {
          shop:"player", currency:"player-coins", balance:progression.progression.coins,
          catalog:await shop.catalog(), inventory:await shop.inventory(account.id)
        });
      } catch (error) { return errorResponse(error); }
    }
    if (["/api/shop/purchase","/api/shop/resale","/api/shop/equip"].includes(url.pathname) && request.method === "POST") {
      if (!env.P27_DB || typeof env.P27_DB.prepare !== "function") return json(503, { error: "D1_BINDING_MISSING" });
      const origin = request.headers.get("origin");
      if (origin) {
        try { if (!isAllowedOrigin(request, env)) return json(403, { error: "ORIGIN_NOT_ALLOWED" }); }
        catch { return json(403, { error:"ORIGIN_NOT_ALLOWED" }); }
      }
      const account = await new D1PasswordlessAccountRepository(env.P27_DB).resolve(sessionTokenFromRequest(request));
      if (!account) return json(401, { error:"SESSION_EXPIRED" });
      try {
        const body = await readJson(request);
        if (!body || body.shop !== "player") return json(400, { error:"UNSUPPORTED_SHOP" });
        const shop = new D1PlayerShopRepository(env.P27_DB);
        const result = url.pathname === "/api/shop/purchase"
          ? await shop.purchase(account.id, { itemId:body.itemId, purchaseId:body.purchaseId })
          : url.pathname === "/api/shop/resale"
            ? await shop.resale(account.id, { itemId:body.itemId, resaleId:body.resaleId })
            : await shop.setEquipped(account.id, { itemId:body.itemId, equipped:body.equipped });
        return json(result.ok ? 200 : 409, result);
      } catch (error) { return errorResponse(error); }
    }

    const playerShopRoute = url.pathname.startsWith("/api/shop/player/");
    if (playerShopRoute && ["GET", "POST"].includes(request.method)) {
      if (!env.P27_DB || typeof env.P27_DB.prepare !== "function") {
        return json(503, { error: "D1_BINDING_MISSING" });
      }
      const token = sessionTokenFromRequest(request);
      const account = await new D1PasswordlessAccountRepository(env.P27_DB).resolve(token);
      if (!account) return json(401, { error: "SESSION_EXPIRED" });
      if (request.method === "POST") {
        const origin = request.headers.get("origin");
        if (origin) {
          try {
            if (!isAllowedOrigin(request, env)) return json(403, { error: "ORIGIN_NOT_ALLOWED" });
          } catch { return json(403, { error: "ORIGIN_NOT_ALLOWED" }); }
        }
      }
      const shop = new D1PlayerShopRepository(env.P27_DB);
      try {
        if (request.method === "GET" && url.pathname === "/api/shop/player/catalog") {
          return json(200, { catalog: await shop.catalog() });
        }
        if (request.method === "GET" && url.pathname === "/api/shop/player/inventory") {
          return json(200, { inventory: await shop.inventory(account.id) });
        }
        if (request.method === "POST") {
          const body = await readJson(request);
          let result;
          if (url.pathname === "/api/shop/player/purchase") {
            result = await shop.purchase(account.id, { itemId: body.itemId, purchaseId: body.purchaseId });
          } else if (url.pathname === "/api/shop/player/resale") {
            result = await shop.resale(account.id, { itemId: body.itemId, resaleId: body.resaleId });
          } else if (url.pathname === "/api/shop/player/equip") {
            result = await shop.setEquipped(account.id, { itemId: body.itemId, equipped: body.equipped });
          } else {
            return json(404, { error: "SHOP_ROUTE_NOT_FOUND" });
          }
          return json(result.ok ? 200 : 409, result);
        }
        return json(405, { error: "METHOD_NOT_ALLOWED" });
      } catch (error) { return errorResponse(error); }
    }

    if (url.pathname === "/api/progression/me" && ["GET", "POST"].includes(request.method)) {
      if (!env.P27_DB || typeof env.P27_DB.prepare !== "function") {
        return json(503, { error: "D1_BINDING_MISSING" });
      }
      const token = sessionTokenFromRequest(request);
      const accounts = new D1PasswordlessAccountRepository(env.P27_DB);
      const account = await accounts.resolve(token);
      if (!account) return json(401, { error: "SESSION_EXPIRED" });
      const repository = new D1PlayerProgressionRepository(env.P27_DB);
      if (request.method === "GET") {
        try { return json(200, await repository.get(account.id)); }
        catch (error) { return errorResponse(error); }
      }
      const origin = request.headers.get("origin");
      if (origin) {
        try {
          if (!isAllowedOrigin(request, env)) return json(403, { error: "ORIGIN_NOT_ALLOWED" });
        } catch { return json(403, { error: "ORIGIN_NOT_ALLOWED" }); }
      }
      try {
        const body = await readJson(request);
        const mode = body.action === "train" ? "training" : body.action === "practice" ? "practice" : null;
        if (!mode) return json(400, { error: "INVALID_PROGRESSION_ACTION" });
        const result = await repository.spend(account.id, body.attribute, body.amount, mode);
        return json(result.ok ? 200 : 409, result);
      } catch (error) {
        if (error?.message === "PROGRESSION_CONCURRENT_UPDATE") return json(409, { error: error.message });
        return errorResponse(error);
      }
    }


    // Server-to-server ingestion; the HMAC secret is never exposed to clients.
    if (url.pathname === "/internal/matches/career") {
      if (request.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
      if (typeof env.P27_MATCH_INGEST_SECRET !== "string" || env.P27_MATCH_INGEST_SECRET.length < 32) return json(503, { error: "MATCH_INGEST_NOT_CONFIGURED" });
      let rawBody;
      try {
        rawBody = await request.text();
        if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return json(413, { error: "BODY_TOO_LARGE" });
      } catch { return json(400, { error: "INVALID_BODY" }); }
      const validSignature = await verifyCareerIngestSignature(env.P27_MATCH_INGEST_SECRET, rawBody, request.headers.get("x-p27-signature"));
      if (!validSignature) return json(401, { error: "MATCH_INGEST_UNAUTHORIZED" });
      if (!env.P27_DB || typeof env.P27_DB.prepare !== "function") return json(503, { error: "D1_BINDING_MISSING" });
      let body;
      try {
        body = JSON.parse(rawBody);
        if (!body || typeof body !== "object" || Array.isArray(body) || !body.match || typeof body.match !== "object" || Array.isArray(body.match)) throw new Error();
      } catch { return json(400, { error: "INVALID_JSON" }); }
      try {
        const result = await new D1PlayerCareerRepository(env.P27_DB).recordFinalizedMatch(body.accountId, body.playerId, body.match);
        return json(200, { accepted: true, duplicate: result.duplicate === true, revision: result.career?.totals?.revision ?? null });
      } catch (error) { return errorResponse(error); }
    }

    // Career history is read-only for clients. Only the trusted match authority
    // may call D1PlayerCareerRepository.recordFinalizedMatch internally.
    if (url.pathname === "/api/career" && request.method !== "GET") {
      return json(405, { error: "METHOD_NOT_ALLOWED" });
    }

    if (request.method === "GET" && url.pathname === "/api/career") {
      if (!env.P27_DB || typeof env.P27_DB.prepare !== "function") {
        return json(503, { error: "D1_BINDING_MISSING" });
      }
      const token = sessionTokenFromRequest(request);
      const account = await new D1PasswordlessAccountRepository(env.P27_DB).resolve(token);
      if (!account) return json(401, { error: "SESSION_EXPIRED" });
      try {
        const career = await new D1PlayerCareerRepository(env.P27_DB).get(account.id);
        return json(200, { career });
      } catch (error) { return errorResponse(error); }
    }

    const publicCareerRoute = url.pathname.match(/^\/api\/players\/(FRP-[0-9]{6})\/career$/);
    if (request.method === "GET" && publicCareerRoute) {
      if (!env.P27_DB || typeof env.P27_DB.prepare !== "function") {
        return json(503, { error: "D1_BINDING_MISSING" });
      }
      try {
        const career = await new D1PlayerCareerRepository(env.P27_DB).getPlayerCareer(publicCareerRoute[1]);
        return career.player
          ? json(200, { career })
          : json(404, { error: "PLAYER_NOT_FOUND" });
      } catch (error) { return errorResponse(error); }
    }

    if (url.pathname.startsWith("/api/accounts/")) {
      if (!env.P27_DB || typeof env.P27_DB.prepare !== "function") {
        return json(503, { error: "D1_BINDING_MISSING" });
      }
      const accounts = new D1PasswordlessAccountRepository(env.P27_DB);
      const token = sessionTokenFromRequest(request);
      if (request.method === "GET" && url.pathname === "/api/accounts/me") {
        const account = await accounts.resolve(token);
        return account ? json(200, { account }) : json(401, { error: "SESSION_EXPIRED" });
      }
      if (request.method === "POST" && url.pathname === "/api/accounts/logout") {
        await accounts.revoke(token);
        return json(200, { loggedOut: true }, { "set-cookie": clearAccountSessionCookie() });
      }
      if (request.method === "POST" && url.pathname === "/api/accounts/sessions/revoke-all") {
        const account = await accounts.resolve(token);
        if (!account) return json(401, { error: "SESSION_EXPIRED" });
        const revokedSessions = await accounts.revokeAll(account.id);
        return json(200, { revoked: true, revokedSessions }, { "set-cookie": clearAccountSessionCookie() });
      }
    }

    return json(501, {
      error: "CLOUDFLARE_API_NOT_MIGRATED",
      message: "Cette entrée Cloudflare ne contient pas encore toutes les routes P27.",
    });
  },
};

export default {
  async fetch(request, env = {}) {
    if (request.headers.has("origin") && !isAllowedOrigin(request, env)) {
      return json(403, { error: "ORIGIN_NOT_ALLOWED" });
    }
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), request);
    }
    return withCors(await worker.fetch(request, env), request);
  },
};
