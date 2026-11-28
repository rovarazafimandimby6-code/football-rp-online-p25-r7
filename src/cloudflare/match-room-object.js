import { createHash, timingSafeEqual } from "node:crypto";
import { createMatchMessage } from "../online-match-protocol.js";
import { RoomManager } from "../../server/room-manager.js";
import { D1MatchRoomRepository } from "./match-room-repository.js";
import { D1PlayerCareerRepository } from "./player-career-repository.js";
import { D1PlayerProgressionRepository } from "./player-progression-repository.js";

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
    this.careerRepository = env.P27_DB ? new D1PlayerCareerRepository(env.P27_DB) : null;
    this.progressionRepository = env.P27_DB ? new D1PlayerProgressionRepository(env.P27_DB) : null;
    this.careerOutbox = null;
    this.careerOutboxComplete = false;
    this.timer = null;
    this.lastFlushAt = 0;
    this.resultSynced = false;
    this.ready = state.blockConcurrencyWhile(async () => {
      const [snapshot, result, resultSynced, careerOutbox, careerOutboxComplete] = await Promise.all([
        state.storage.get("room-checkpoint"),
        state.storage.get("finalized-result"),
        state.storage.get("finalized-result-synced"),
        state.storage.get("career-outbox"),
        state.storage.get("career-outbox-complete"),
      ]);
      this.resultSynced = resultSynced === true;
      this.careerOutbox = Array.isArray(careerOutbox) ? careerOutbox : null;
      this.careerOutboxComplete = careerOutboxComplete === true;
      if (snapshot) this.stores.rooms.save(snapshot);
      if (result) this.stores.results.save(result);
      this.manager = new RoomManager({
        roomStore: this.stores.rooms,
        resultStore: this.stores.results,
        roomIdFactory: () => this.roomId,
      });
      this.lastFlushAt = Date.now();
      const room = this.manager.rooms.get(this.roomId);
      if (this.stores.results.get(this.roomId) && !this.resultSynced) {
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

  _buildCareerOutbox(result) {
    const room = this.manager.rooms.get(this.roomId);
    if (!room || !Array.isArray(result?.players)) return [];
    const score = result.score || { blue: 0, red: 0 };
    const awardPlayerId = result.awards?.playerOfMatch?.playerId || null;
    const events = [];
    for (const playerResult of result.players) {
      const live = room.players.get(playerResult.playerId);
      if (!live || live.isBot || typeof live.accountId !== "string" ||
          !/^FRP-[0-9]{6}$/.test(live.careerPlayerId || "") || playerResult.minutesPlayedMs < 15_000) continue;
      const teamName = room.teams[live.team]?.name || "";
      const opponentTeam = live.team === "blue" ? "red" : "blue";
      const outcome = score.blue === score.red ? "draw" : (live.team === result.outcome ? "win" : "loss");
      events.push({
        accountId: live.accountId, playerId: live.careerPlayerId,
        match: {
          matchId: room.id, result: outcome, finalizedAt: result.finalizedAt,
          teamName, opponent: room.teams[opponentTeam]?.name || "", role: playerResult.role,
          rating: playerResult.rating, minutesPlayedMs: playerResult.minutesPlayedMs,
          playerOfMatch: awardPlayerId === playerResult.playerId,
          cleanSheet: (live.team === "blue" ? score.red : score.blue) === 0,
          stats: playerResult.stats || {}, name: playerResult.name, clubName: teamName,
        },
      });
    }
    return events;
  }

  async _syncFinalizedResult() {
    const result = this.stores.results.get(this.roomId);
    if (!result) return null;
    if (this.careerOutbox === null) {
      this.careerOutbox = this._buildCareerOutbox(result);
      const storage = this.state.storage;
      if (typeof storage.transaction === "function") {
        await storage.transaction(async transaction => {
          await transaction.put("finalized-result", result);
          await transaction.put("career-outbox", this.careerOutbox);
          await transaction.delete("room-checkpoint");
        });
      } else {
        await storage.put("career-outbox", this.careerOutbox);
        await storage.put("finalized-result", result);
        await storage.delete("room-checkpoint");
      }
    } else {
      await this.state.storage.put("finalized-result", result);
    }
    if (!this.careerOutboxComplete) {
      if (this.careerOutbox.length && (!this.careerRepository || !this.progressionRepository)) {
        throw new Error("MATCH_CAREER_REPOSITORIES_UNAVAILABLE");
      }
      for (const event of this.careerOutbox) {
        await this.careerRepository.recordFinalizedMatch(event.accountId, event.playerId, event.match);
        await this.progressionRepository.grantMatchReward(event.accountId, {
          matchId: event.match.matchId, result: event.match.result,
          minutesPlayedMs: event.match.minutesPlayedMs, rating: event.match.rating,
        });
      }
      await this.state.storage.put("career-outbox-complete", true);
      this.careerOutboxComplete = true;
    }
    if (!this.repository) throw new Error("MATCH_RESULT_REPOSITORY_UNAVAILABLE");
    await this.repository.recordFinalizedResult(this.roomId, result);
    await this.state.storage.put("finalized-result-synced", true);
    this.resultSynced = true;
    await this.state.storage.delete("room-checkpoint");
    await this.state.storage.delete("career-outbox");
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
    if (Date.now() - (this.lastBroadcastAt || 0) >= 80) {
      await this._broadcastSockets();
      this.lastBroadcastAt = Date.now();
    }
    if (result) {
      if (!this.resultSynced) await this._syncFinalizedResult();
      return;
    }
    if (room && Date.now() - this.lastFlushAt >= 1_000) {
      await this._flush();
      try { await this._syncRegistry(); } catch (error) { this.registrySyncError = String(error?.message || "MATCH_ROOM_INDEX_WRITE_FAILED").slice(0, 120); }
    }
  }

  async alarm() {
    await this.ready;
    try { await this._tick(); }
    catch (error) { this.lastTickError = String(error?.message || "MATCH_TICK_FAILED").slice(0, 120); }
    const pendingResult = this.stores.results.get(this.roomId) && !this.resultSynced;
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


  _upgradeWebSocket() {
    if (!this.manager.rooms.has(this.roomId)) return json(404, { error: "ROOM_NOT_FOUND" });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  _sendSocket(socket, type, payload = {}) {
    let message = { v: 1, type, ...payload };
    let encoded = JSON.stringify(message);
    if (new TextEncoder().encode(encoded).byteLength > 16 * 1024 && message.state) {
      message = {
        ...message,
        state: { ...message.state, events: [] },
        ...(Array.isArray(message.events) ? { events: [...message.events] } : {}),
      };
      // Trim only the tail of the pending event batch; never skip older events.
      const previousCursor = Number.isSafeInteger(message.eventCursor) ? message.eventCursor : 0;
      while (new TextEncoder().encode(JSON.stringify(message)).byteLength > 16 * 1024 &&
             Array.isArray(message.events) && message.events.length > 0) {
        message.events.pop();
        message.eventCursor = message.events.length
          ? message.events[message.events.length - 1].id : previousCursor;
      }
      encoded = JSON.stringify(message);
    }
    if (new TextEncoder().encode(encoded).byteLength > 16 * 1024) throw new Error("MATCH_SOCKET_MESSAGE_TOO_LARGE");
    socket.send(encoded);
    return message;
  }

  _socketPlayer(socket) {
    let attachment;
    try { attachment = socket.deserializeAttachment(); } catch { return null; }
    if (!attachment || attachment.roomId !== this.roomId ||
        typeof attachment.playerId !== "string" || !/^[a-f0-9]{64}$/.test(String(attachment.tokenHash || ""))) return null;
    const room = this.manager.rooms.get(this.roomId);
    const player = room?.players.get(attachment.playerId);
    if (!player || player.isBot) return null;
    const storedHash = typeof player.tokenHash === "string" ? player.tokenHash
      : typeof player.token === "string" ? createHash("sha256").update(player.token).digest("hex") : "";
    if (!/^[a-f0-9]{64}$/.test(storedHash)) return null;
    const expected = Buffer.from(attachment.tokenHash, "hex");
    const actual = Buffer.from(storedHash, "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    return { attachment, player };
  }

  async webSocketMessage(socket, rawMessage) {
    await this.ready;
    try {
      if (typeof rawMessage !== "string" || new TextEncoder().encode(rawMessage).byteLength > 16 * 1024) {
        throw new Error("MATCH_SOCKET_MESSAGE_INVALID");
      }
      const parsed = JSON.parse(rawMessage);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.v !== 1 ||
          typeof parsed.type !== "string") throw new Error("MATCH_SOCKET_MESSAGE_INVALID");
      const { v: _version, type, ...payload } = parsed;
      const message = createMatchMessage(type, payload);

      if (message.type === "hello") {
        if (socket.deserializeAttachment?.()) throw new Error("MATCH_SOCKET_ALREADY_AUTHENTICATED");
        if (message.roomId !== this.roomId) throw new Error("MATCH_SOCKET_ROOM_MISMATCH");
        const { player } = this.manager.authenticate(this.roomId, message.token);
        const tokenHash = createHash("sha256").update(message.token).digest("hex");
        socket.serializeAttachment({
          roomId: this.roomId, playerId: player.id, tokenHash,
          lastEventId: message.afterEventId, lastStateSequence: message.afterSequence,
        });
        this.manager.reconnectForPlayer(this.roomId, player.id);
        const current = socket.deserializeAttachment();
        this._sendSocket(socket, "welcome", {
          playerId: player.id, nextSequence: Math.max(1, player.lastInputSequence + 1),
        });
        this._sendSocket(socket, "snapshot", { state: this.manager.get(this.roomId) });
        current.lastStateSequence = this.manager.get(this.roomId).sequence;
        socket.serializeAttachment(current);
        await this._persistMutation();
        return;
      }

      const authenticated = this._socketPlayer(socket);
      if (!authenticated) throw new Error("UNAUTHORIZED");
      const { attachment, player } = authenticated;
      if (message.type === "input") {
        this.manager.submitInputForPlayer(this.roomId, player.id, message);
        attachment.lastInputSequence = message.sequence;
        socket.serializeAttachment(attachment);
        this._sendSocket(socket, "ack", { sequence: message.sequence });
        return;
      }
      if (message.type === "heartbeat") {
        this.manager.heartbeatForPlayer(this.roomId, player.id);
        attachment.lastInputSequence = Math.max(attachment.lastInputSequence || 0, message.lastSequence);
        socket.serializeAttachment(attachment);
        this._sendSocket(socket, "ack", { sequence: message.lastSequence });
        return;
      }
      if (message.type === "leave") {
        this.manager.leaveForPlayer(this.roomId, player.id);
        await this._persistMutation();
        this._sendSocket(socket, "ack", { sequence: Math.max(0, attachment.lastInputSequence || 0) });
        socket.close(1000, "player left");
        return;
      }
      throw new Error("MATCH_SOCKET_MESSAGE_UNSUPPORTED");
    } catch (error) {
      const code = String(error?.message || "MATCH_SOCKET_ERROR").slice(0, 80);
      try { this._sendSocket(socket, "error", { code, fatal: true }); } catch {}
      try { socket.close(1008, "invalid match message"); } catch {}
    }
  }

  async _broadcastSockets() {
    if (typeof this.state.getWebSockets !== "function") return;
    const room = this.manager.rooms.get(this.roomId);
    if (!room) return;
    const state = this.manager.get(this.roomId);
    for (const socket of this.state.getWebSockets()) {
      const authenticated = this._socketPlayer(socket);
      if (!authenticated) {
        try { socket.close(1008, "match session expired"); } catch {}
        continue;
      }
      const attachment = authenticated.attachment;
      // Deliver pending events in bounded batches without skipping older events.
      const events = state.events
        .filter(event => Number.isSafeInteger(event.id) && event.id > (attachment.lastEventId || 0))
        .slice(0, 20);
      try {
        const sent = this._sendSocket(socket, "delta", {
          eventCursor: attachment.lastEventId || 0, events,
          state: { ...state, events: [] },
        });
        attachment.lastEventId = Number.isSafeInteger(sent.eventCursor)
          ? sent.eventCursor : (attachment.lastEventId || 0);
        attachment.lastStateSequence = state.sequence;
        socket.serializeAttachment(attachment);
      } catch {
        try { socket.close(1011, "match update failed"); } catch {}
      }
    }
  }

  async webSocketClose() {}
  async webSocketError() {}

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket" && url.pathname === `/api/rooms/${this.roomId}/socket`) {
      return this._upgradeWebSocket();
    }
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
