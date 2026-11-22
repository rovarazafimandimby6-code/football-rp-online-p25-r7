import { randomBytes } from 'node:crypto';
import { applyPlayerAction, stepRoomSimulation, resetRoomBall } from './simulation.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Authoritative in-memory 5v5 room manager. One input stream controls one avatar. */
export class RoomManager {
  constructor({ now = () => Date.now(), roomTtlMs = 30 * 60_000, disconnectGraceMs = 20_000 } = {}) {
    this.now = now;
    this.roomTtlMs = roomTtlMs;
    this.disconnectGraceMs = disconnectGraceMs;
    this.rooms = new Map();
  }

  create({ name = 'Match rapide', durationMinutes = 5 } = {}) {
    const roomId = randomBytes(6).toString('hex');
    const room = {
      id: roomId, name: String(name).trim().slice(0, 36) || 'Match rapide',
      durationMinutes: durationMinutes === 3 ? 3 : 5,
      phase: 'lobby', createdAt: this.now(), updatedAt: this.now(),
      startedAt: null, elapsedMs: 0, sequence: 0, players: new Map(),
      period: 1, halftimeUntil: null, goalPauseMs: 0, lastTickAt: this.now(), attackDirection: { blue: 1, red: -1 },
      nextEventId: 1, score: { blue: 0, red: 0 }, ball: { x: 0, y: 0.36, z: 0, vx: 0, vy: 0, vz: 0, ownerId: null, lastTouchTeam: null }, events: [],
    };
    this.rooms.set(roomId, room);
    return this.publicState(room);
  }

  join(roomId, { displayName = 'Joueur', preferredTeam = 'auto', role = 'FWD' } = {}) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    if (room.phase === 'fulltime') throw new Error('MATCH_ALREADY_FINISHED');
    if (room.players.size >= 10) throw new Error('ROOM_FULL');
    const humans = { blue: 0, red: 0 };
    for (const player of room.players.values()) if (!player.isBot && player.connected) humans[player.team]++;
    let team = preferredTeam === 'blue' || preferredTeam === 'red' ? preferredTeam : (humans.blue <= humans.red ? 'blue' : 'red');
    if (humans[team] >= 5) team = team === 'blue' ? 'red' : 'blue';
    if (humans[team] >= 5) throw new Error('TEAM_FULL');

    // Human arrivals take the place of a reserve bot first, preserving the 5-player cap.
    const reserve = [...room.players.values()].find(p => p.isBot && p.team === team);
    if (reserve) room.players.delete(reserve.id);
    const usedSlots = new Set([...room.players.values()].filter(p => p.team === team).map(p => p.slot));
    const slot = reserve?.slot ?? [0,1,2,3,4].find(value => !usedSlots.has(value));
    if (room.players.size >= 10) throw new Error('ROOM_FULL');
    const token = randomBytes(24).toString('base64url');
    const player = {
      id: randomBytes(8).toString('hex'), token,
      name: String(displayName).replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 20) || 'Joueur',
      team, slot, x: team === 'blue' ? -18 + slot * 2 : 18 - slot * 2,
      z: -12 + slot * 6, vx: 0, vz: 0, facing: team === 'blue' ? Math.PI / 2 : -Math.PI / 2,
      role: ['GK','DEF','MID','FWD'].includes(role) ? role : 'FWD', isBot: false,
      input: { x: 0, z: 0, sprint: false }, lastInputSequence: -1, lastActionAt: 0,
      connected: true, lastSeen: this.now(), disconnectedAt: null,
    };
    room.players.set(player.id, player);
    this.ensureBotCoverage(room);
    room.updatedAt = this.now();
    if (this.teamCounts(room).blue >= 3 && this.teamCounts(room).red >= 3) this.start(room);
    return { token, playerId: player.id, team, slot, state: this.publicState(room) };
  }

  ensureBotCoverage(room) {
    if (room.phase === 'fulltime') return;
    for (const team of ['blue', 'red']) {
      let count = [...room.players.values()].filter(p => p.team === team && p.connected).length;
      while (count < 3 && room.players.size < 10) {
        const usedSlots = new Set([...room.players.values()].filter(p => p.team === team).map(p => p.slot));
        const slot = [0,1,2,3,4].find(value => !usedSlots.has(value)) ?? count;
        const id = `bot-${team}-${randomBytes(5).toString('hex')}`;
        room.players.set(id, {
          id, token: null, name: `${team === 'blue' ? 'Académie bleue' : 'Académie rouge'} ${slot + 1}`,
          team, slot, x: team === 'blue' ? -18 + slot * 2 : 18 - slot * 2,
          z: -12 + slot * 6, vx: 0, vz: 0, facing: team === 'blue' ? Math.PI / 2 : -Math.PI / 2,
          role: slot === 0 ? 'GK' : slot === 1 ? 'DEF' : 'MID', isBot: true,
          input: { x: 0, z: 0, sprint: false }, lastInputSequence: -1, lastActionAt: 0,
          connected: true, lastSeen: this.now(), disconnectedAt: null,
        });
        count++;
      }
    }
  }

  updateBots(room) {
    const bots = [...room.players.values()].filter(p => p.isBot && p.connected);
    const ball = room.ball;
    for (const bot of bots) {
      const teammates = [...room.players.values()].filter(p => p.team === bot.team && p.id !== bot.id && p.connected);
      const opponents = [...room.players.values()].filter(p => p.team !== bot.team && p.connected);
      const owner = ball.ownerId ? room.players.get(ball.ownerId) : null;
      const nearestTeammate = [bot, ...teammates].sort((a,b) => Math.hypot(a.x-ball.x,a.z-ball.z)-Math.hypot(b.x-ball.x,b.z-ball.z))[0];
      let targetX = ball.x, targetZ = ball.z;
      if (owner?.team === bot.team) {
        if (owner.id === bot.id) {
          const goalX = room.attackDirection[bot.team] * 27;
          targetX = goalX; targetZ = 0;
          const distanceToGoal = Math.abs(goalX - bot.x);
          if (distanceToGoal < 15 && Math.abs(bot.z) < 8) applyPlayerAction(room, bot, 'shoot', this.now());
        } else {
          const lane = bot.slot % 2 ? -5 : 5;
          targetX = owner.x + room.attackDirection[bot.team] * 5;
          targetZ = Math.max(-13, Math.min(13, owner.z + lane));
        }
      } else if (nearestTeammate.id !== bot.id && !owner) {
        targetX = ball.x + (bot.slot % 2 ? -4 : 4);
        targetZ = ball.z + (bot.slot % 2 ? -4 : 4);
      }
      const dx = targetX - bot.x, dz = targetZ - bot.z;
      const distance = Math.hypot(dx, dz) || 1;
      bot.input = { x: Math.abs(dx) < 0.8 ? 0 : dx / distance, z: Math.abs(dz) < 0.8 ? 0 : dz / distance, sprint: distance > 8 };
      if (distance > 0.2) bot.facing = Math.atan2(dx, dz);
      if (owner && owner.team !== bot.team && Math.hypot(owner.x-bot.x, owner.z-bot.z) < 1.5) applyPlayerAction(room, bot, 'tackle', this.now());
    }
  }

  start(room) {
    if (room.phase !== 'lobby') return;
    room.phase = 'playing';
    room.startedAt = this.now();
    room.lastTickAt = room.startedAt;
    room.elapsedMs = 0;
  }

  teamCounts(room) {
    const counts = { blue: 0, red: 0 };
    for (const p of room.players.values()) if (p.connected) counts[p.team]++;
    return counts;
  }

  authenticate(roomId, token) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    const player = [...room.players.values()].find(p => p.token === token);
    if (!player) throw new Error('UNAUTHORIZED');
    return { room, player };
  }

  submitInput(roomId, token, payload = {}) {
    const { room, player } = this.authenticate(roomId, token);
    if (room.phase !== 'playing') throw new Error('MATCH_NOT_PLAYING');
    const sequence = Number(payload.sequence);
    if (!Number.isSafeInteger(sequence) || sequence <= player.lastInputSequence) throw new Error('STALE_INPUT');
    const x = payload.x, z = payload.z;
    if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) throw new Error('INVALID_INPUT');
    const magnitude = Math.hypot(x, z) || 1;
    player.input = { x: clamp(x / Math.max(1, magnitude), -1, 1), z: clamp(z / Math.max(1, magnitude), -1, 1), sprint: payload.sprint === true };
    if (magnitude > 0.1) player.facing = Math.atan2(player.input.x, player.input.z);
    player.lastInputSequence = sequence;
    player.lastSeen = this.now();
    room.updatedAt = this.now();
    const action = ['pass', 'shoot', 'tackle'].includes(payload.action) ? payload.action : null;
    const actionAccepted = action ? applyPlayerAction(room, player, action, this.now()) : false;
    return { accepted: true, sequence, actionAccepted };
  }

  tick(deltaSeconds) {
    const dt = clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, 0.05);
    const now = this.now();
    for (const [id, room] of this.rooms) {
      if (now - room.updatedAt > this.roomTtlMs || [...room.players.values()].every(p => !p.connected && p.disconnectedAt && now - p.disconnectedAt > this.disconnectGraceMs)) {
        this.rooms.delete(id); continue;
      }
      for (const p of room.players.values()) {
        if (!p.isBot && p.connected && now - p.lastSeen > this.disconnectGraceMs) {
          p.connected = false; p.disconnectedAt = now; p.input = { x: 0, z: 0, sprint: false };
          if (room.ball.ownerId === p.id) room.ball.ownerId = null;
        }
      }
      for (const [playerId, p] of room.players) {
        if (!p.connected && p.disconnectedAt && now - p.disconnectedAt > this.disconnectGraceMs) room.players.delete(playerId);
      }
      this.ensureBotCoverage(room);
      if (room.phase !== 'playing') { room.lastTickAt = now; continue; }
      const elapsedSinceTick = Math.max(0, Math.min(0.25, (now - room.lastTickAt) / 1000));
      room.lastTickAt = now;
      room.elapsedMs = Math.max(0, now - room.startedAt);
      const maxMs = room.durationMinutes * 60_000;
      const halfMs = maxMs / 2;
      if (room.elapsedMs >= maxMs) {
        room.elapsedMs = maxMs; room.phase = 'fulltime';
        for (const p of room.players.values()) p.input = { x: 0, z: 0, sprint: false };
      } else if (room.elapsedMs >= halfMs && room.period === 1) {
        room.period = 2;
        room.events.push({ type: 'second-half', at: room.elapsedMs });
        for (const p of room.players.values()) { p.x *= -1; p.input = { x: 0, z: 0, sprint: false }; }
        room.attackDirection.blue *= -1; room.attackDirection.red *= -1;
        resetRoomBall(room);
      }
      if (room.phase === 'playing') {
        this.updateBots(room);
        stepRoomSimulation(room, Math.min(dt || elapsedSinceTick, 0.05));
      }
      for (const event of room.events) if (!Number.isSafeInteger(event.id)) event.id = room.nextEventId++;
      room.sequence++;
    }
  }

  heartbeat(roomId, token) {
    const { player } = this.authenticate(roomId, token);
    if (player.isBot) throw new Error('UNAUTHORIZED');
    player.lastSeen = this.now();
    player.connected = true;
    player.disconnectedAt = null;
    const room = this.rooms.get(roomId); if (room) room.updatedAt = this.now();
    return { alive: true };
  }

  leave(roomId, token) {
    const { room, player } = this.authenticate(roomId, token);
    player.connected = false; player.disconnectedAt = this.now(); player.input = { x: 0, z: 0, sprint: false };
    room.updatedAt = this.now();
    return true;
  }

  get(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    return this.publicState(room);
  }

  getDelta(roomId, { afterSequence = -1, afterEventId = 0 } = {}) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    const state = this.publicState(room);
    return {
      changed: state.sequence > afterSequence,
      state,
      events: state.events.filter(event => Number.isSafeInteger(event.id) && event.id > afterEventId),
      eventCursor: state.eventCursor,
    };
  }

  publicState(room) {
    const players = [...room.players.values()].map(({ token, input, lastInputSequence, lastSeen, disconnectedAt, lastActionAt, ...p }) => ({ ...p }));
    return {
      id: room.id, name: room.name, durationMinutes: room.durationMinutes,
      phase: room.phase, period: room.period, attackDirection: { ...room.attackDirection }, elapsedMs: room.elapsedMs, durationMs: room.durationMinutes * 60_000, sequence: room.sequence,
      virtualClock: `${String(Math.floor(Math.min(5400, room.elapsedMs / (room.durationMinutes * 60_000) * 5400) / 60)).padStart(2,'0')}:${String(Math.floor(Math.min(5400, room.elapsedMs / (room.durationMinutes * 60_000) * 5400) % 60)).padStart(2,'0')}`,
      score: { ...room.score }, counts: this.teamCounts(room),
      players, ball: { ...room.ball }, events: room.events.slice(-40), eventCursor: room.nextEventId - 1,
    };
  }
}
