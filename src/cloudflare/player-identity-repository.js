import {
  createHash, randomBytes, randomInt, randomUUID, timingSafeEqual,
} from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROOF_RE = /^[a-f0-9]{64}$/i;
const digest = value => createHash("sha256").update(value).digest("hex");

function sameDigest(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === 32 && b.length === 32 && timingSafeEqual(a, b);
}

const publicIdentity = row => ({
  accountId: row.account_id,
  playerId: row.player_id,
  createdAt: row.created_at,
});

/** D1 implementation of the P27 local-player identity registry. */
export class D1PlayerIdentityRepository {
  constructor(db, {
    now = () => Date.now(),
    idFactory = () => String(randomInt(100_000, 1_000_000)),
    maxAttempts = 1_000,
    maxLocalProfiles = 8,
  } = {}) {
    if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
      throw new Error("D1_DATABASE_BINDING_REQUIRED");
    }
    this.db = db;
    this.now = now;
    this.idFactory = idFactory;
    this.maxAttempts = Math.max(1, Math.min(10_000, Number(maxAttempts) || 1_000));
    this.maxLocalProfiles = Math.max(1, Math.min(20, Number(maxLocalProfiles) || 8));
  }

  async findLocalProfileCredential(localProfileKey) {
    return this.db.prepare(
      "SELECT c.local_profile_key, c.account_id, c.proof_hash, c.created_at, i.player_id " +
      "FROM p27_local_profile_credentials c " +
      "JOIN p27_player_identities i ON i.account_id = c.account_id " +
      "WHERE c.local_profile_key = ?"
    ).bind(localProfileKey).first();
  }

  async resumeExisting(row, suppliedProofHash) {
    if (row.proof_hash && !sameDigest(row.proof_hash, suppliedProofHash)) {
      throw new Error("LOCAL_PROFILE_PROOF_INVALID");
    }

    if (!row.proof_hash) {
      await this.db.prepare(
        "UPDATE p27_local_profile_credentials SET proof_hash = ? " +
        "WHERE local_profile_key = ? AND proof_hash IS NULL"
      ).bind(suppliedProofHash, row.local_profile_key).run();

      const refreshed = await this.findLocalProfileCredential(row.local_profile_key);
      if (!refreshed || !sameDigest(refreshed.proof_hash, suppliedProofHash)) {
        throw new Error("LOCAL_PROFILE_PROOF_INVALID");
      }
      row = refreshed;
    }

    return { ...publicIdentity(row), alreadyReserved: true };
  }

  async reserve({ localProfileKey, localProofSecret } = {}) {
    if (typeof localProfileKey !== "string" || !UUID_RE.test(localProfileKey)) {
      throw new Error("INVALID_LOCAL_PROFILE_KEY");
    }
    if (typeof localProofSecret !== "string" || !PROOF_RE.test(localProofSecret)) {
      throw new Error("INVALID_LOCAL_PROFILE_PROOF");
    }

    const suppliedProofHash = digest(localProofSecret);
    const existing = await this.findLocalProfileCredential(localProfileKey);
    if (existing) return this.resumeExisting(existing, suppliedProofHash);

    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      const number = String(this.idFactory());
      if (!/^\d{6}$/.test(number)) throw new Error("INVALID_PLAYER_ID_GENERATOR");

      const accountId = randomUUID();
      const playerId = "FRP-" + number;
      const createdAt = new Date(this.now()).toISOString();

      try {
        await this.db.batch([
          this.db.prepare(
            "INSERT INTO p27_player_identities (account_id, player_id, created_at) VALUES (?, ?, ?)"
          ).bind(accountId, playerId, createdAt),
          this.db.prepare(
            "INSERT INTO p27_local_profile_credentials " +
            "(local_profile_key, account_id, proof_hash, created_at, is_primary) VALUES (?, ?, ?, ?, 1)"
          ).bind(localProfileKey, accountId, suppliedProofHash, createdAt),
        ]);
        return { accountId, playerId, createdAt, alreadyReserved: false };
      } catch (error) {
        const raced = await this.findLocalProfileCredential(localProfileKey);
        if (raced) return this.resumeExisting(raced, suppliedProofHash);

        const message = String(error?.message || "");
        if (
          message.includes("p27_player_identities.player_id") ||
          message.includes("p27_player_identities.account_id")
        ) continue;

        throw new Error("PLAYER_IDENTITY_PERSISTENCE_FAILED");
      }
    }

    throw new Error("PLAYER_ID_SPACE_EXHAUSTED");
  }

  async createReplica(accountId) {
    if (typeof accountId !== "string" || !UUID_RE.test(accountId)) {
      throw new Error("INVALID_ACCOUNT_ID");
    }
    const identity = await this.db.prepare(
      "SELECT account_id, player_id, created_at FROM p27_player_identities WHERE account_id = ?"
    ).bind(accountId).first();
    if (!identity) throw new Error("PLAYER_IDENTITY_NOT_FOUND");

    const localProfileKey = randomUUID();
    const localProofSecret = randomBytes(32).toString("hex");
    const createdAt = new Date(this.now()).toISOString();
    const result = await this.db.prepare(
      "INSERT INTO p27_local_profile_credentials " +
      "(local_profile_key, account_id, proof_hash, created_at, is_primary) " +
      "SELECT ?, ?, ?, ?, 0 " +
      "WHERE (SELECT COUNT(*) FROM p27_local_profile_credentials WHERE account_id = ?) < ?"
    ).bind(
      localProfileKey, accountId, digest(localProofSecret), createdAt,
      accountId, this.maxLocalProfiles,
    ).run();

    if (Number(result?.meta?.changes) !== 1) {
      throw new Error("LOCAL_PROFILE_REPLICA_LIMIT");
    }
    return {
      accountId,
      playerId: identity.player_id,
      localProfileKey,
      localProofSecret,
      createdAt,
    };
  }

  async verifyLocalProof({ localProfileKey, localProofSecret } = {}) {
    if (
      typeof localProfileKey !== "string" || !UUID_RE.test(localProfileKey) ||
      typeof localProofSecret !== "string" || !PROOF_RE.test(localProofSecret)
    ) return null;

    const row = await this.findLocalProfileCredential(localProfileKey);
    if (!row?.proof_hash || !sameDigest(row.proof_hash, digest(localProofSecret))) return null;
    return publicIdentity(row);
  }

  async getByLocalProfileKey(localProfileKey) {
    if (typeof localProfileKey !== "string" || !UUID_RE.test(localProfileKey)) return null;
    const row = await this.findLocalProfileCredential(localProfileKey);
    return row ? publicIdentity(row) : null;
  }

  async getByAccountId(accountId) {
    if (typeof accountId !== "string" || !UUID_RE.test(accountId)) return null;
    const row = await this.db.prepare(
      "SELECT account_id, player_id, created_at FROM p27_player_identities WHERE account_id = ?"
    ).bind(accountId).first();
    return row ? publicIdentity(row) : null;
  }
}

const RATE_LIMIT_WINDOW_MS = 15 * 60_000;
const RATE_LIMIT_MAX_ATTEMPTS = 8;

/** Retains only a digest of the client address, never the raw address. */
export async function allowPlayerIdentityAttempt(
  db, clientAddress, now = Date.now(), scope = "player-identities",
) {
  if (typeof scope !== "string" || !/^[a-z0-9-]{1,48}$/.test(scope)) {
    throw new Error("INVALID_RATE_LIMIT_SCOPE");
  }
  const subjectHash = digest(String(clientAddress || "unknown").slice(0, 128));
  await db.prepare(
    "DELETE FROM p27_rate_limit_buckets WHERE expires_at <= ?"
  ).bind(now).run();

  const row = await db.prepare(
    "INSERT INTO p27_rate_limit_buckets " +
    "(scope, subject_hash, window_started_at, attempt_count, expires_at) " +
    "VALUES (?, ?, ?, 1, ?) " +
    "ON CONFLICT(scope, subject_hash) DO UPDATE SET " +
    "window_started_at = CASE WHEN p27_rate_limit_buckets.window_started_at <= ? " +
    "THEN excluded.window_started_at ELSE p27_rate_limit_buckets.window_started_at END, " +
    "attempt_count = CASE WHEN p27_rate_limit_buckets.window_started_at <= ? " +
    "THEN 1 ELSE p27_rate_limit_buckets.attempt_count + 1 END, " +
    "expires_at = CASE WHEN p27_rate_limit_buckets.window_started_at <= ? " +
    "THEN excluded.expires_at ELSE p27_rate_limit_buckets.expires_at END " +
    "RETURNING attempt_count"
  ).bind(
    scope,
    subjectHash,
    now,
    now + RATE_LIMIT_WINDOW_MS,
    now - RATE_LIMIT_WINDOW_MS,
    now - RATE_LIMIT_WINDOW_MS,
    now - RATE_LIMIT_WINDOW_MS,
  ).first();

  return Number(row?.attempt_count) <= RATE_LIMIT_MAX_ATTEMPTS;
}
