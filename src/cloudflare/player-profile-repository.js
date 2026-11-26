const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean = (value, max, fallback = "") => String(value ?? fallback)
  .replace(/[<>]/g, "").split("").filter(character => character.charCodeAt(0) >= 32)
  .join("").trim().slice(0, max) || fallback;
const oneOf = (value, values, fallback) => values.includes(value) ? value : fallback;

export function normalizePlayerProfile(input = {}, now = () => Date.now()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_PLAYER_PROFILE");
  const identity = input.identity && typeof input.identity === "object" && !Array.isArray(input.identity) ? input.identity : {};
  const appearance = input.appearance && typeof input.appearance === "object" && !Array.isArray(input.appearance) ? input.appearance : {};
  return {
    schemaVersion: 1,
    identity: {
      displayName: clean(identity.displayName, 20, "Nouveau joueur"),
      number: Number.isFinite(Number(identity.number)) ? Math.max(1, Math.min(99, Math.round(Number(identity.number)))) : 10,
      preferredFoot: oneOf(identity.preferredFoot, ["left", "right", "both"], "right"),
      role: oneOf(identity.role, ["GK", "DEF", "MID", "FWD"], "MID"),
    },
    appearance: {
      kit: oneOf(appearance.kit, ["emerald", "crimson", "gold", "violet", "monochrome"], "emerald"),
      skinTone: oneOf(appearance.skinTone, ["light", "medium", "dark"], "medium"),
      hairStyle: oneOf(appearance.hairStyle, ["short", "curly", "shaved", "fade", "afro"], "short"),
      hairColor: oneOf(appearance.hairColor, ["dark", "brown", "blond"], "dark"),
      bodyBuild: oneOf(appearance.bodyBuild, ["lean", "athletic", "strong"], "athletic"),
      faceShape: oneOf(appearance.faceShape, ["oval", "round", "angular", "long", "square"], "oval"),
      eyeShape: oneOf(appearance.eyeShape, ["almond", "round", "hooded"], "almond"),
    },
    updatedAt: new Date(now()).toISOString(),
  };
}

function decode(row) {
  if (!row) return null;
  let profile;
  try { profile = JSON.parse(row.profile_json); } catch { throw new Error("PLAYER_PROFILE_STORE_CORRUPT"); }
  if (!profile || profile.schemaVersion !== 1 || !Number.isSafeInteger(Number(row.revision)) || Number(row.revision) < 1) {
    throw new Error("PLAYER_PROFILE_STORE_CORRUPT");
  }
  return { profile, revision: Number(row.revision), updatedAt: row.updated_at };
}

/** D1 profile snapshot repository with optimistic concurrency; only cosmetic/player identity fields live here. */
export class D1PlayerProfileRepository {
  constructor(db, { now = () => Date.now() } = {}) {
    if (!db || typeof db.prepare !== "function") throw new Error("D1_DATABASE_BINDING_REQUIRED");
    this.db = db;
    this.now = now;
  }

  async get(accountId) {
    if (typeof accountId !== "string" || !UUID_RE.test(accountId)) throw new Error("INVALID_ACCOUNT_ID");
    const row = await this.db.prepare(
      "SELECT profile_json, revision, updated_at FROM p27_player_profiles WHERE account_id = ?"
    ).bind(accountId).first();
    return decode(row) || { profile: null, revision: 0, updatedAt: null };
  }

  async save(accountId, input, expectedRevision) {
    if (typeof accountId !== "string" || !UUID_RE.test(accountId)) throw new Error("INVALID_ACCOUNT_ID");
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("INVALID_PROFILE_REVISION");
    const profile = normalizePlayerProfile(input, this.now);
    const serialized = JSON.stringify(profile);
    if (new TextEncoder().encode(serialized).byteLength > 4096) throw new Error("PLAYER_PROFILE_TOO_LARGE");
    const updatedAt = profile.updatedAt;
    const row = await this.db.prepare(
      "INSERT INTO p27_player_profiles (account_id, schema_version, profile_json, revision, updated_at) " +
      "VALUES (?, 1, ?, 1, ?) " +
      "ON CONFLICT(account_id) DO UPDATE SET " +
      "profile_json = excluded.profile_json, revision = p27_player_profiles.revision + 1, updated_at = excluded.updated_at " +
      "WHERE p27_player_profiles.revision = ? " +
      "RETURNING profile_json, revision, updated_at"
    ).bind(accountId, serialized, updatedAt, expectedRevision).first();
    if (row) return decode(row);
    const current = await this.get(accountId);
    const error = new Error("PROFILE_REVISION_CONFLICT");
    error.currentRevision = current.revision;
    throw error;
  }
}
