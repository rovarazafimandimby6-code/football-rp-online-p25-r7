import test from "node:test";
import assert from "node:assert/strict";
import { D1MatchRoomRepository } from "../src/cloudflare/match-room-repository.js";

class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  run() { return this.db.run(this.sql, this.values); }
  first() { return this.db.first(this.sql, this.values); }
}
class FakeD1 {
  constructor() { this.rooms = new Map(); }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
  async run(sql, v) {
    if (!sql.startsWith("INSERT INTO p27_match_rooms")) throw new Error("UNSUPPORTED_SQL");
    const [id, objectName, phase, mode, name, duration, blue, red, createdAt, updatedAt, expiresAt] = v;
    const current = this.rooms.get(id);
    const active = ["lobby", "playing", "halftime"];
    const allowed = !current || (
      active.includes(current.phase) &&
      updatedAt >= current.updated_at &&
      (current.phase === phase ||
        (current.phase === "lobby" && ["playing", "halftime"].includes(phase)) ||
        (current.phase === "playing" && phase === "halftime") ||
        (current.phase === "halftime" && phase === "playing"))
    );
    if (!allowed) return { meta: { changes: 0 } };
    this.rooms.set(id, {
      room_id: id, object_name: objectName, phase, mode, room_name: name,
      duration_minutes: duration, blue_humans: blue, red_humans: red,
      max_humans: 14, created_at: current?.created_at ?? createdAt,
      updated_at: updatedAt, expires_at: expiresAt,
    });
    return { meta: { changes: 1 } };
  }
  async first(sql, v) {
    if (!sql.includes("FROM p27_match_rooms WHERE room_id")) throw new Error("UNSUPPORTED_SQL");
    const row = this.rooms.get(v[0]);
    return row || null;
  }
}
const id = "a1b2c3d4e5f6";
const repo = db => new D1MatchRoomRepository(db, { now: () => 10_000 });
const put = (repository, phase, updatedAt) => repository.upsertRoom({
  roomId: id, phase, updatedAt, createdAt: 50, expiresAt: 20_000,
});

test("room index rejects an older write after a newer heartbeat or state update", async () => {
  const repository = repo(new FakeD1());
  await put(repository, "lobby", 100);
  await put(repository, "playing", 200);
  await assert.rejects(() => put(repository, "playing", 150), /MATCH_ROOM_STALE_UPDATE/);
  assert.equal((await repository.getRoom(id)).updatedAt, 200);
});

test("room index prevents phase regression but permits the normal halftime transition", async () => {
  const repository = repo(new FakeD1());
  await put(repository, "lobby", 100);
  await put(repository, "playing", 200);
  await assert.rejects(() => put(repository, "lobby", 300), /MATCH_ROOM_PHASE_REGRESSION/);
  await put(repository, "halftime", 300);
  await put(repository, "playing", 400);
  assert.equal((await repository.getRoom(id)).phase, "playing");
  assert.equal((await repository.getRoom(id)).updatedAt, 400);
});
