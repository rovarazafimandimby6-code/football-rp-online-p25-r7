import { RoomManager } from "../../server/room-manager.js";
import { D1MatchRoomRepository } from "./match-room-repository.js";

const ROOM_ID = /^[a-f0-9]{12}$/;
const ACTIVE_PHASES = new Set(["lobby", "playing", "halftime"]);
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

function createMemoryStores() {
  const rooms = new Map();
  const results = new Map();
  return {
    rooms: {
      save(snapshot) { rooms.set(snapshot.id, clone(snapshot)); },
      saveMany(snapshots) { for (const snapshot of snapshots) rooms.set(snapshot.id, clone(snapshot)); },
      readAll() { return [...rooms.values()].map(clone); },
      delete(id) { rooms.delete(id); },
    },
    results: {
      save(result) { results.set(result.roomId, clone(result)); },
      get(id) { return clone(results.get(id) || null); },
      list() { return [...results.values()].map(clone); },
      page({ limit = 20, offset = 0 } = {}) {
        const all = this.list().sort((a, b) => b.finalizedAt - a.finalizedAt);
        const selected = all.slice(offset, offset + limit);
        return { results: selected, pagination: { limit, offset, total: all.length, hasMore: offset + selected.length < all.length, nextOffset: offset + selected.length < all.length ? offset + selected.length : null } };
      },
    },
  };
}

/**
 * One authoritative RoomManager per Durable Object. Live state is checkpointed
 * to this object's storage; D1 is only the cross-room index/result ledger.
 *
 * The public Worker must authenticate account sessions and forward only
 * verified account/player IDs to this internal object endpoint.
 */
export class P27MatchRoomDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.roomId = state.id?.name || null;
    if (!ROOM_ID.test(String(this.roomId || ""))) throw new Error("INVALID_MATCH_ROOM_OBJECT_NAME");
    this.stores = createMemoryStores();
    this.manager = null;
    this.repository = env.P27_DB ? new D1MatchRoomRepository(env.P27_DB) : null;
    this.timer = null;
    this.lastFlushAt = 0;
    this.ready = state.blockConcurrencyWhile(async () => {
      const [snapshot, result] = await Promise.all([
        state.storage.get("room-checkpoint"),
        state.storage.get("finalized-result"),
      ]);
      if (snapshot) this.stores.rooms.save(snapshot);
      if (result) this.stores.results.save(result);
      this.manager = new RoomManager({
        roomStore: this.stores.rooms,
        resultStore: this.stores.results,
        roomIdFactory: () => this.roomId,
      });
      this.lastFlushAt = Date.now();
      const room = this.manager.rooms.get(this.roomId);
      if (this.stores.results.get(this.roomId)) {
        try { await this._syncFinalizedResult(); }
        catch { await state.storage.setAlarm(Date.now() + 1_000); }
      } else if (room && ACTIVE_PHASES.has(room.phase)) {
        await state.storage.setAlarm(Date.now() + 1_000);
        this._scheduleTick(50);
      }
    });
  }

  async _flush() {
    const room = this.manager?.rooms.get(this.roomId);
    if (room && ACTIVE_PHASES.has(room.phase)) this.manager.persistRoom(room);
    const snapshot = this.stores.rooms.readAll().find(item => item.id === this.roomId);
    const result = this.stores.results.get(this.roomId);
    if (snapshot) await this.state.storage.put("room-checkpoint", snapshot);
    else await this.state.storage.delete("room-checkpoint");
    if (result) await this.state.storage.put("finalized-result", result);
    this.lastFlushAt = Date.now();
  }

  async _syncRegistry() {
    if (!this.repository) return;
    const room = this.manager.rooms.get(this.roomId);
    if (!room || !ACTIVE_PHASES.has(room.phase)) return;
    const humans = { blue: 0, red: 0 };
    for (const player of room.players.values()) {
      if (!player.isBot && player.connected) humans[player.team]++;
    }
    await this.repository.upsertRoom({
      roomId: room.id, phase: room.phase, mode: "friendly", name: room.name,
      durationMinutes: room.durationMinutes, blueHumans: humans.blue, redHumans: humans.red,
      createdAt: room.createdAt, updatedAt: room.updatedAt,
      expiresAt: room.updatedAt + 30 * 60_000,
    });
  }

  async _syncFinalizedResult() {
    const result = this.stores.results.get(this.roomId);
    if (!result) return null;
    // The result is written to DO storage first, so a D1 outage cannot lose it.
    await this.state.storage.put("finalized-result", result);
    if (this.repository) await this.repository.recordFinalizedResult(this.roomId, result);
    await this.state.storage.delete("room-checkpoint");
    return result;
  }

  _scheduleTick(delay = 50) {
    if (this.timer || !this.manager) return;
    const room = this.manager.rooms.get(this.roomId);
    if (!room || !["playing", "halftime"].includes(room.phase)) return;
    this.timer = setTimeout(async () => {
      this.timer = null;
      try {
        await this._tick();
      } catch (error) {
        // Keep the durable checkpoint; the next alarm/request can retry.
        this.lastTickError = String(error?.message || "MATCH_TICK_FAILED").slice(0, 120);
      }
      const current = this.manager.rooms.get(this.roomId);
      if (current && ["playing", "halftime"].includes(current.phase)) this._scheduleTick(50);
    }, delay);
  }

  async _tick() {
    this.manager.tick(0.05);
    const room = this.manager.rooms.get(this.roomId);
    const result = this.stores.results.get(this.roomId);
    if (result) {
      await this._syncFinalizedResult();
      return;
    }
    if (room && Date.now() - this.lastFlushAt >= 1_000) {
      await this._flush();
      await this._syncRegistry();
    }
  }

  async alarm() {
    await this.ready;
    try { await this._tick(); }
    catch (error) { this.lastTickError = String(error?.message || "MATCH_TICK_FAILED").slice(0, 120); }
    const pendingResult = this.stores.results.get(this.roomId);
    const room = this.manager.rooms.get(this.roomId);
    if (pendingResult || (room && ["playing", "halftime"].includes(room.phase))) {
      await this.state.storage.setAlarm(Date.now() + 1_000);
      this._scheduleTick(50);
    }
  }

  async _persistMutation() {
    await this._flush();
    try { await this._syncRegistry(); } catch (error) { this.registrySyncError = String(error?.message || "MATCH_ROOM_INDEX_WRITE_FAILED").slice(0, 120); }
    const room = this.manager.rooms.get(this.roomId);
    if (room && ["playing", "halftime"].includes(room.phase)) {
      await this.state.storage.setAlarm(Date.now() + 1_000);
      this._scheduleTick(50);
    }
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/internal/health") {
      return json(200, { ok: true, roomId: this.roomId, phase: this.manager.rooms.get(this.roomId)?.phase || "missing" });
    }

    try {
      if (request.method === "POST" && url.pathname === "/internal/create") {
        const body = await request.json();
        if (body.roomId !== this.roomId) return json(400, { error: "MATCH_ROOM_ID_MISMATCH" });
        if (this.manager.rooms.has(this.roomId)) return json(409, { error: "ROOM_ALREADY_EXISTS" });
        const state = this.manager.create({
          name: body.name, durationMinutes: body.durationMinutes,
          blueClubId: body.blueClubId, redClubId: body.redClubId,
        });
        await this._persistMutation();
        return json(201, state);
      }

      if (request.method === "POST" && url.pathname === "/internal/join") {
        const body = await request.json();
        const joined = this.manager.join(this.roomId, {
          displayName: body.displayName, preferredTeam: body.preferredTeam,
          role: body.role, accountId: body.accountId, careerPlayerId: body.careerPlayerId,
        });
        await this._persistMutation();
        return json(200, joined);
      }

      if (request.method === "GET" && url.pathname === "/internal/state") {
        return json(200, this.manager.get(this.roomId));
      }
      if (request.method === "GET" && url.pathname === "/internal/delta") {
        const afterSequence = Number(url.searchParams.get("afterSequence") ?? -1);
        const afterEventId = Number(url.searchParams.get("afterEventId") ?? 0);
        return json(200, this.manager.getDelta(this.roomId, { afterSequence, afterEventId }));
      }
      if (request.method === "GET" && url.pathname === "/internal/result") {
        return json(200, this.manager.getResult(this.roomId));
      }

      if (request.method === "POST") {
        const body = await request.json();
        let result;
        switch (url.pathname) {
          case "/internal/input":
            result = this.manager.submitInput(this.roomId, body.token, body.input || body);
            break;
          case "/internal/heartbeat":
            result = this.manager.heartbeat(this.roomId, body.token);
            break;
          case "/internal/reconnect":
            result = this.manager.reconnect(this.roomId, body.token);
            break;
          case "/internal/leave":
            result = this.manager.leave(this.roomId, body.token);
            break;
          case "/internal/entry-request":
            result = this.manager.requestEntry(this.roomId, body.token);
            break;
          case "/internal/rotation":
            result = this.manager.rotate(this.roomId, body.token, {
              outgoingId: body.outgoingId, incomingId: body.incomingId,
            });
            break;
          default:
            return json(404, { error: "MATCH_ROOM_ROUTE_NOT_FOUND" });
        }
        await this._persistMutation();
        return json(200, result === true ? { left: true } : result);
      }
      return json(405, { error: "METHOD_NOT_ALLOWED" });
    } catch (error) {
      const code = String(error?.message || "MATCH_ROOM_ERROR");
      const status = code === "ROOM_NOT_FOUND" ? 404
        : code === "UNAUTHORIZED" || code === "PLAYER_DISCONNECTED" ? 401
        : code === "ROOM_FULL" || code === "MATCH_ALREADY_FINISHED" || code === "MATCH_NOT_PLAYING" ||
          code === "PLAYER_ON_BENCH" || code === "STALE_INPUT" || code === "ROTATION_NOT_AVAILABLE" ||
          code === "NOT_A_STOPPAGE" || code === "ROTATION_NOT_ALLOWED" || code === "RETURN_COOLDOWN" ? 409
        : 400;
      return json(status, { error: code });
    }
  }
}
