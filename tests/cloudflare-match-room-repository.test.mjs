import test from "node:test";
import assert from "node:assert/strict";
import { D1MatchRoomRepository } from "../src/cloudflare/match-room-repository.js";

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async run() { return this.db.run(this.sql, this.values); }
  async first() { return this.db.first(this.sql, this.values); }
  async all() { return this.db.all(this.sql, this.values); }
}

class FakeD1 {
  constructor() { this.rooms = new Map(); this.results = new Map(); }
  prepare(sql) { return new FakeStatement(this, sql); }
  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
  async run(sql, v) {
    if (sql.startsWith("INSERT INTO p27_match_rooms")) {
      const [roomId, objectName, phase, mode, name, duration, blue, red, createdAt, updatedAt, expiresAt] = v;
      const current = this.rooms.get(roomId);
      if (current && !["lobby", "playing", "halftime"].includes(current.phase)) return { meta: { changes: 0 } };
      this.rooms.set(roomId, {
        room_id: roomId, object_name: objectName, phase, mode, room_name: name,
        duration_minutes: duration, blue_humans: blue, red_humans: red, max_humans: 10,
        created_at: current?.created_at ?? createdAt, updated_at: updatedAt, expires_at: expiresAt,
      });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith("INSERT INTO p27_match_results")) {
      const [roomId, hash, json, finalizedAt, createdAt] = v;
      if (this.results.has(roomId)) return { meta: { changes: 0 } };
      this.results.set(roomId, { room_id: roomId, result_hash: hash, result_json: json, finalized_at: finalizedAt, created_at: createdAt });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith("UPDATE p27_match_rooms")) {
      const [updatedAt, expiresAt, roomId] = v;
      const room = this.rooms.get(roomId);
      if (room && ["lobby", "playing", "halftime"].includes(room.phase)) {
        room.phase = "fulltime"; room.updated_at = updatedAt; room.expires_at = expiresAt;
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }
    throw new Error("UNSUPPORTED_SQL:" + sql);
  }
  async first(sql, v) {
    if (sql.includes("FROM p27_match_rooms WHERE room_id")) return this.rooms.get(v[0]) || null;
    if (sql.includes("FROM p27_match_results WHERE room_id")) return this.results.get(v[0]) || null;
    throw new Error("UNSUPPORTED_SQL:" + sql);
  }
  async all(sql, v) {
    if (!sql.includes("FROM p27_match_rooms WHERE phase")) throw new Error("UNSUPPORTED_SQL:" + sql);
    const [now, limit] = v;
    return { results: [...this.rooms.values()]
      .filter(room => ["lobby", "playing", "halftime"].includes(room.phase) && room.expires_at > now)
      .sort((a, b) => b.updated_at - a.updated_at || a.room_id.localeCompare(b.room_id))
      .slice(0, limit) };
  }
}

const roomId = "a1b2c3d4e5f6";
const finalized = {
  roomId, phase: "fulltime", finalizedAt: 1_700_000_000_000,
  score: { blue: 2, red: 1 }, outcome: "blue",
  players: [{ playerId: "p1", goals: 1 }],
};

test("D1 match room repository validates and indexes discoverable rooms", async () => {
  const db = new FakeD1();
  const repository = new D1MatchRoomRepository(db, { now: () => 1_000 });
  const room = await repository.upsertRoom({
    roomId, phase: "lobby", name: "  Test <room>  ", mode: "friendly",
    durationMinutes: 5, blueHumans: 2, redHumans: 1, expiresAt: 50_000,
  });
  assert.equal(room.objectName, roomId);
  assert.equal(room.name, "Test room");
  assert.deepEqual(room.humanCounts, { blue: 2, red: 1 });
  assert.equal((await repository.listDiscoverable({ now: 2_000 })).length, 1);
  assert.equal((await repository.listDiscoverable({ now: 50_000 })).length, 0);
  await assert.rejects(() => repository.upsertRoom({ roomId: "BAD", phase: "lobby" }), /INVALID_MATCH_ROOM_ID/);
  await assert.rejects(() => repository.listDiscoverable({ limit: 101 }), /INVALID_MATCH_ROOM_QUERY/);
});

test("finalized match result is immutable and idempotent", async () => {
  const db = new FakeD1();
  const repository = new D1MatchRoomRepository(db, { now: () => 2_000 });
  await repository.upsertRoom({ roomId, phase: "playing", updatedAt: 1_500, expiresAt: 60_000 });
  const first = await repository.recordFinalizedResult(roomId, finalized);
  const duplicate = await repository.recordFinalizedResult(roomId, { ...finalized, score: { red: 1, blue: 2 } });
  assert.equal(first.accepted, true);
  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual((await repository.getFinalizedResult(roomId)).result, finalized);
  assert.equal((await repository.getRoom(roomId)).phase, "fulltime");
  await assert.rejects(
    () => repository.recordFinalizedResult(roomId, { ...finalized, score: { blue: 3, red: 1 } }),
    /MATCH_RESULT_IDEMPOTENCY_CONFLICT/,
  );
  await assert.rejects(
    () => repository.upsertRoom({ roomId, phase: "lobby" }),
    /MATCH_ROOM_TERMINAL/,
  );
});

test("result ledger rejects oversized or mismatched payloads", async () => {
  const repository = new D1MatchRoomRepository(new FakeD1(), { now: () => 2_000 });
  await assert.rejects(() => repository.recordFinalizedResult(roomId, { ...finalized, roomId: "ffffffffffff" }), /INVALID_MATCH_RESULT/);
  await assert.rejects(() => repository.recordFinalizedResult(roomId, {
    ...finalized, players: [{ data: "x".repeat(66_000) }],
  }), /MATCH_RESULT_TOO_LARGE/);
});
