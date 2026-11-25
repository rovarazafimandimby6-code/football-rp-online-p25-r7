import {
  D1PlayerIdentityRepository,
  allowPlayerIdentityAttempt,
} from "./player-identity-repository.js";
import { D1PasswordlessAccountRepository } from "./passwordless-account-repository.js";

const MAX_BODY_BYTES = 8 * 1024;
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
});

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
    code === "BODY_TOO_LARGE" ? 400 :
    code === "LOCAL_PROFILE_PROOF_INVALID" ? 401 :
    code === "PLAYER_IDENTITY_RATE_LIMITED" ? 429 :
    code === "LOCAL_PROFILE_REPLICA_LIMIT" ? 409 :
    code === "PLAYER_IDENTITY_NOT_FOUND" ? 404 :
    503;
  const safeCode = status === 503 ? "PLAYER_IDENTITY_SERVICE_UNAVAILABLE" : code;
  return json(status, { error: safeCode });
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
        return json(503, {
          ok: false,
          status: "not-ready",
          reason: "D1_BINDING_MISSING",
        });
      }

      try {
        const probe = await env.P27_DB.prepare("SELECT 1 AS ok").first();
        if (Number(probe?.ok) !== 1) throw new Error("D1_PROBE_FAILED");
        return json(200, {
          ok: true,
          status: "ready",
          storage: "d1-connected",
          stage: "local-player-identity",
        });
      } catch {
        return json(503, {
          ok: false,
          status: "not-ready",
          reason: "D1_UNAVAILABLE",
        });
      }
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
          const accounts = new D1PasswordlessAccountRepository(env.P27_DB);
          const session = await accounts.issuePasswordlessSession(reservation.accountId, {
            playerId: reservation.playerId,
          });
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
        return json(200, {
          verified: true,
          accountId: identity.accountId,
          playerId: identity.playerId,
        });
      } catch (error) {
        return errorResponse(error);
      }
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
