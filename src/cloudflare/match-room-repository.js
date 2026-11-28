import { createHash } from "node:crypto";

const ROOM_ID = /^[a-f0-9]{12}$/;
const PHASES = new Set(["lobby", "playing", "halftime", "fulltime", "closed"]);
const MODES = new Set(["friendly", "career", "competition"]);
const MAX_RESULT_BYTES = 65_536;
const TERMINAL_PHASES = new Set(["fulltime", "closed"]);

function roomIdOrThrow(value) {
  if (typeof value !== "string" || !ROOM_ID.test(value)) throw new Error("INVALID_MATCH_ROOM_ID");
  return value;
}

function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("INVALID_MATCH_RESULT");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("INVALID_MATCH_RESULT");
  }
  return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
}

function normalizeRoom(input = {}, now) {
  const roomId = roomIdOrThrow(input.roomId);
  if (!PHASES.has(input.phase) || TERMINAL_PHASES.has(input.phase)) throw new Error("INVALID_MATCH_ROOM_PHASE");
  const mode = input.mode ?? "friendly";
  if (!MODES.has(mode)) throw new Error("INVALID_MATCH_ROOM_MODE");
  const durationMinutes = input.durationMinutes ?? 5;
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 3 || durationMinutes > 5) {
    throw new Error("INVALID_MATCH_ROOM_DURATION");
  }
  const blueHumans = input.blueHumans ?? 0;
  const redHumans = input.redHumans ?? 0;
  if (![blueHumans, redHumans].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 7)) {
    throw new Error("INVALID_MATCH_ROOM_COUNTS");
  }
  const createdAt = input.createdAt ?? now;
  const updatedAt = input.updatedAt ?? now;
  const expiresAt = input.expiresAt ?? now + 30 * 60_000;
  if (![createdAt, updatedAt, expiresAt].every(value => Number.isSafeInteger(value) && value >= 0) || expiresAt < createdAt) {
    throw new Error("INVALID_MATCH_ROOM_TIMESTAMPS");
  }
  const name = String(input.name ?? "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 64);
  return { roomId, mode, phase: input.phase, name, durationMinutes, blueHumans, redHumans, createdAt, updatedAt, expiresAt };
}

/**
 * D1 discovery index and immutable result ledger.
 * Live simulation/checkpoints belong to the room's Durable Object, never D1.
 */
export class D1MatchRoomRepository {
  constructor(db, { now = () => Date.now() } = {}) {
    if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
      throw new Error("D1_DATABASE_BINDING_REQUIRED");
    }
    this.db = db;
    this.now = now;
  }

  async upsertRoom(input = {}) {
    const room = normalizeRoom(input, this.now());
    const result = await this.db.prepare(
      "INSERT INTO p27_match_rooms (room_id, object_name, phase, mode, room_name, duration_minutes, blue_humans, red_humans, max_humans, created_at, updated_at, expires_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 14, ?, ?, ?) " +
      "ON CONFLICT(room_id) DO UPDATE SET phase=excluded.phase, mode=excluded.mode, room_name=excluded.room_name, " +
      "duration_minutes=excluded.duration_minutes, blue_humans=excluded.blue_humans, red_humans=excluded.red_humans, " +
      "updated_at=excluded.updated_at, expires_at=excluded.expires_at " +
      "WHERE p27_match_rooms.phase IN ('lobby', 'playing', 'halftime') " +
      "AND excluded.updated_at >= p27_match_rooms.updated_at " +
      "AND (p27_match_rooms.phase = excluded.phase " +
      "OR (p27_match_rooms.phase = 'lobby' AND excluded.phase IN ('playing', 'halftime')) " +
      "OR (p27_match_rooms.phase = 'playing' AND excluded.phase = 'halftime') " +
      "OR (p27_match_rooms.phase = 'halftime' AND excluded.phase = 'playing'))"
    ).bind(
      room.roomId, room.roomId, room.phase, room.mode, room.name, room.durationMinutes,
      room.blueHumans, room.redHumans, room.createdAt, room.updatedAt, room.expiresAt,
    ).run();
    if (Number(result?.meta?.changes) !== 1) {
      const existing = await this.getRoom(room.roomId);
      if (!existing) throw new Error("MATCH_ROOM_WRITE_FAILED");
      if (TERMINAL_PHASES.has(existing.phase)) throw new Error("MATCH_ROOM_TERMINAL");
      if (existing.updatedAt > room.updatedAt) throw new Error("MATCH_ROOM_STALE_UPDATE");
      throw new Error("MATCH_ROOM_PHASE_REGRESSION");
    }
    return this.getRoom(room.roomId);
  }

  async getRoom(roomId) {
    roomIdOrThrow(roomId);
    const row = await this.db.prepare("SELECT * FROM p27_match_rooms WHERE room_id = ?")
      .bind(roomId).first();
    return row ? {
      roomId: row.room_id, objectName: row.object_name, phase: row.phase, mode: row.mode,
      name: row.room_name, durationMinutes: Number(row.duration_minutes),
      humanCounts: { blue: Number(row.blue_humans), red: Number(row.red_humans) },
      maxHumans: Number(row.max_humans), createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at), expiresAt: Number(row.expires_at),
    } : null;
  }

  async listDiscoverable({ limit = 50, now = this.now() } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
        !Number.isSafeInteger(now) || now < 0) throw new Error("INVALID_MATCH_ROOM_QUERY");
    const rows = await this.db.prepare(
      "SELECT room_id, phase, mode, room_name, duration_minutes, blue_humans, red_humans, max_humans, updated_at " +
      "FROM p27_match_rooms WHERE phase IN ('lobby', 'playing', 'halftime') AND expires_at > ? " +
      "ORDER BY updated_at DESC, room_id ASC LIMIT ?"
    ).bind(now, limit).all();
    return (rows?.results || []).map(row => ({
      id: row.room_id, phase: row.phase, mode: row.mode, name: row.room_name,
      durationMinutes: Number(row.duration_minutes),
      humanCounts: { blue: Number(row.blue_humans), red: Number(row.red_humans) },
      totalHumans: Number(row.blue_humans) + Number(row.red_humans),
      maxHumans: Number(row.max_humans), updatedAt: Number(row.updated_at),
    }));
  }

  async recordFinalizedResult(roomId, result) {
    roomIdOrThrow(roomId);
    if (!result || typeof result !== "object" || Array.isArray(result) || result.roomId !== roomId ||
        result.phase !== "fulltime") throw new Error("INVALID_MATCH_RESULT");
    const resultJson = canonicalJson(result);
    if (new TextEncoder().encode(resultJson).byteLength > MAX_RESULT_BYTES) throw new Error("MATCH_RESULT_TOO_LARGE");
    const hash = createHash("sha256").update(resultJson).digest("hex");
    const finalizedAt = Number.isSafeInteger(result.finalizedAt) && result.finalizedAt >= 0
      ? result.finalizedAt : this.now();
    const now = this.now();
    const batchResults = await this.db.batch([
      this.db.prepare(
        "INSERT INTO p27_match_results (room_id, result_hash, result_json, finalized_at, created_at) " +
        "VALUES (?, ?, ?, ?, ?) ON CONFLICT(room_id) DO NOTHING"
      ).bind(roomId, hash, resultJson, finalizedAt, now),
      this.db.prepare(
        "UPDATE p27_match_rooms SET phase='fulltime', updated_at=?, expires_at=? WHERE room_id=? AND phase IN ('lobby','playing','halftime')"
      ).bind(now, now, roomId),
    ]);
    const stored = await this.db.prepare(
      "SELECT result_hash, result_json, finalized_at FROM p27_match_results WHERE room_id = ?"
    ).bind(roomId).first();
    if (!stored) throw new Error("MATCH_RESULT_PERSIST_FAILED");
    if (stored.result_hash !== hash) throw new Error("MATCH_RESULT_IDEMPOTENCY_CONFLICT");
    return {
      accepted: true, duplicate: Number(batchResults?.[0]?.meta?.changes) !== 1,
      finalizedAt: Number(stored.finalized_at), result: JSON.parse(stored.result_json),
    };
  }

  async getFinalizedResult(roomId) {
    roomIdOrThrow(roomId);
    const row = await this.db.prepare(
      "SELECT result_json, finalized_at FROM p27_match_results WHERE room_id = ?"
    ).bind(roomId).first();
    return row ? { result: JSON.parse(row.result_json), finalizedAt: Number(row.finalized_at) } : null;
  }
}
