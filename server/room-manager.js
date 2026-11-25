import { randomBytes } from 'node:crypto';
import { applyPlayerAction, stepRoomSimulation, resetRoomBall } from './simulation.js';
import { resolveMatchClub, cloneMatchTeams } from './club-catalog.js';
import { averageAiShouldAct, averageAiAim, averageAiMovement } from '../src/average-ai.js';
import { validateRotation } from '../src/rotation-rules.js';
import { buildMatchPerformance } from './player-rating.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Authoritative in-memory 5v5 room manager. One input stream controls one avatar. */
export class RoomManager {
  constructor({ now = () => Date.now(), roomTtlMs = 30 * 60_000, disconnectGraceMs = 20_000, resultStore = null, roomStore = null, careerStore = null, careerSyncQueue = null, progressionStore = null, competitionStore = null } = {}) {
    this.now = now;
    this.roomTtlMs = roomTtlMs;
    this.disconnectGraceMs = disconnectGraceMs;
    this.resultStore = resultStore;
    this.roomStore = roomStore;
    this.careerStore = careerStore;
    this.careerSyncQueue = careerSyncQueue;
    this.progressionStore = progressionStore;
    this.competitionStore = competitionStore;
    this.rooms = new Map();
    this.lastCheckpointAt = new Map();
    this.restoreCheckpoints();
  }

  serializeRoom(room) {
    const { players, halftimeUntil, ...state } = room;
    return {
      ...JSON.parse(JSON.stringify(state)),
      players: [...players.values()].map(player => JSON.parse(JSON.stringify(player))),
      halftimeRemainingMs: room.phase === 'halftime' && halftimeUntil !== null ? Math.max(0, halftimeUntil - this.now()) : 0,
    };
  }

  persistRoom(room) {
    if (!this.roomStore) return true;
    try {
      this.roomStore.save(this.serializeRoom(room));
      this.lastCheckpointAt.set(room.id, this.now());
      delete room.checkpointError;
      return true;
    } catch (error) {
      room.checkpointError = String(error?.message || 'ROOM_CHECKPOINT_FAILED').slice(0, 160);
      process.stderr.write(`P27 room checkpoint failed (${room.id}): ${room.checkpointError}\n`);
      return false;
    }
  }

  persistRooms(rooms) {
    const active = rooms.filter(room => ['lobby', 'playing', 'halftime'].includes(room.phase));
    if (!active.length) return { saved: 0, failed: [] };
    if (!this.roomStore) return { saved: active.length, failed: [] };
    try {
      const snapshots = active.map(room => this.serializeRoom(room));
      this.roomStore.saveMany(snapshots);
      const savedAt = this.now();
      for (const room of active) {
        this.lastCheckpointAt.set(room.id, savedAt);
        delete room.checkpointError;
      }
      return { saved: active.length, failed: [] };
    } catch (error) {
      const reason = String(error?.message || 'ROOM_CHECKPOINT_FAILED').slice(0, 160);
      for (const room of active) {
        room.checkpointError = reason;
        process.stderr.write(`P27 room checkpoint failed (${room.id}): ${reason}\n`);
      }
      return { saved: 0, failed: active.map(room => ({ roomId: room.id, reason })) };
    }
  }

  persistAllRooms() {
    return this.persistRooms([...this.rooms.values()]);
  }

  restoreCheckpoints() {
    if (!this.roomStore) return 0;
    const now = this.now();
    for (const snapshot of this.roomStore.readAll()) {
      if (this.resultStore?.get(snapshot.id)) {
        this.roomStore.delete(snapshot.id);
        continue;
      }
      if (snapshot.phase === 'lobby' && Number.isFinite(snapshot.updatedAt) && now - snapshot.updatedAt > this.roomTtlMs) {
        this.roomStore.delete(snapshot.id);
        continue;
      }
      const players = new Map();
      for (const saved of snapshot.players) {
        if (!saved || typeof saved.id !== 'string' || !saved.id || players.has(saved.id) ||
            !['blue', 'red'].includes(saved.team) || !Number.isSafeInteger(saved.slot)) throw new Error('ROOM_STORE_CORRUPT');
        const isBot = saved.isBot === true;
        players.set(saved.id, {
          ...saved,
          connected: isBot,
          controlMode: isBot ? 'ai' : 'ai',
          aiControlled: !isBot,
          disconnectedAt: isBot ? null : now,
          lastSeen: now,
          lastCallForPassAt: Number.isFinite(saved.lastCallForPassAt) ? saved.lastCallForPassAt : -Infinity,
          callForPassUntil: 0,
          input: { x: 0, z: 0, sprint: false },
        });
      }
      const { players: _savedPlayers, halftimeRemainingMs = 0, ...state } = snapshot;
      const room = {
        ...state, players,
        startedAt: snapshot.phase === 'lobby' ? null : now - snapshot.elapsedMs,
        lastTickAt: now, updatedAt: now,
        halftimeUntil: snapshot.phase === 'halftime' ? now + Math.max(0, Number(halftimeRemainingMs) || 0) : null,
        events: [...(snapshot.events || []), { type: 'server-recovery', at: snapshot.elapsedMs }],
        sequence: (Number(snapshot.sequence) || 0) + 1,
      };
      this.rooms.set(room.id, room);
      this.persistRoom(room);
    }
    return this.rooms.size;
  }

  create({ name = 'Match rapide', durationMinutes = 5, blueClubId = null, redClubId = null, competitionFixtureId = null } = {}) {
    const blueClub = resolveMatchClub(blueClubId, this.competitionStore?.clubs);
    const redClub = resolveMatchClub(redClubId, this.competitionStore?.clubs);
    if (Boolean(blueClub) !== Boolean(redClub)) throw new Error('INVALID_CLUB_MATCHUP');
    if (blueClub && redClub && blueClub.id === redClub.id) throw new Error('INVALID_CLUB_MATCHUP');
    let competitionFixture = null;
    if (competitionFixtureId) {
      competitionFixture = this.competitionStore?.getFixture(competitionFixtureId);
      if (!competitionFixture) throw new Error('COMPETITION_FIXTURE_NOT_FOUND');
      if (!['scheduled','replay-required'].includes(competitionFixture.status)) throw new Error('COMPETITION_FIXTURE_NOT_READY');
      if (!blueClub || blueClub.id !== competitionFixture.homeClubId || redClub.id !== competitionFixture.awayClubId) throw new Error('COMPETITION_FIXTURE_MISMATCH');
    }
    const roomId = randomBytes(6).toString('hex');
    const room = {
      id: roomId, name: String(name).trim().slice(0, 36) || 'Match rapide', competitionFixtureId: competitionFixture?.id || null,
      durationMinutes: durationMinutes === 3 ? 3 : 5,
      phase: 'lobby', createdAt: this.now(), updatedAt: this.now(),
      startedAt: null, elapsedMs: 0, sequence: 0, players: new Map(),
      period: 1, halftimeUntil: null, halftimeDurationMs: 5_000, goalPauseMs: 0, lastTickAt: this.now(), attackDirection: { blue: 1, red: -1 },
      teams: { blue: blueClub, red: redClub },
      nextEventId: 1, result: null, rotationRequests: [], score: { blue: 0, red: 0 }, ball: { x: 0, y: 0.36, z: 0, vx: 0, vy: 0, vz: 0, ownerId: null, lastTouchTeam: null }, events: [],
    };
    this.rooms.set(roomId, room);
    this.persistRoom(room);
    return this.publicState(room);
  }

  join(roomId, { displayName = 'Joueur', preferredTeam = 'auto', role = null, accountId = null, careerPlayerId = null } = {}) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    if (room.phase === 'fulltime') throw new Error('MATCH_ALREADY_FINISHED');
    const humans = { blue: 0, red: 0 };
    for (const player of room.players.values()) if (!player.isBot && player.connected) humans[player.team]++;
    let team = preferredTeam === 'blue' || preferredTeam === 'red' ? preferredTeam : (humans.blue <= humans.red ? 'blue' : 'red');
    if (humans[team] >= 5) team = team === 'blue' ? 'red' : 'blue';
    if (humans[team] >= 5) throw new Error('ROOM_FULL');

    // Human arrivals take the place of a reserve bot first, preserving the 5-player cap.
    const reserve = [...room.players.values()].find(p => p.isBot && p.team === team && p.isOnPitch !== false);
    const usedSlots = new Set([...room.players.values()].filter(p => p.team === team && p !== reserve).map(p => p.slot));
    const slot = reserve?.slot ?? [0,1,2,3,4].find(value => !usedSlots.has(value));
    if (slot === undefined || (!reserve && room.players.size >= 10)) throw new Error('ROOM_FULL');
    if (reserve) room.players.delete(reserve.id);
    const token = randomBytes(24).toString('base64url');
    const player = {
      id: randomBytes(8).toString('hex'), token,
      accountId: typeof accountId === 'string' && accountId.length <= 64 ? accountId : null,
      careerPlayerId: typeof careerPlayerId === 'string' && /^FRP-[0-9]{6}$/.test(careerPlayerId) ? careerPlayerId : null,
      name: String(displayName).replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 20) || 'Joueur',
      team, slot, x: team === 'blue' ? -18 + slot * 2 : 18 - slot * 2,
      z: -12 + slot * 6, vx: 0, vz: 0, facing: team === 'blue' ? Math.PI / 2 : -Math.PI / 2,
      role: ['GK','DEF','MID','FWD'].includes(role) ? role : (['GK','DEF','MID','FWD','FWD'][slot] || 'FWD'), isBot: false,
      isOnPitch: true, matchTimePlayedMs: 0, lastSubstitutedOutAt: null,
      input: { x: 0, z: 0, sprint: false }, lastInputSequence: -1, lastActionAt: 0, lastCallForPassAt: -Infinity, callForPassUntil: 0,
      connected: true, controlMode: 'human', aiControlled: false, lastSeen: this.now(), disconnectedAt: null,
      stats: { passes: 0, completedPasses: 0, shots: 0, tackles: 0, goals: 0, assists: 0, saves: 0, interceptions: 0 },
    };
    room.players.set(player.id, player);
    this.ensureBotCoverage(room);
    room.updatedAt = this.now();
    if (this.teamCounts(room).blue >= 5 && this.teamCounts(room).red >= 5) this.start(room);
    this.persistRoom(room);
    return { token, playerId: player.id, team, slot, state: this.publicState(room) };
  }

  ensureBotCoverage(room) {
    if (room.phase === 'fulltime') return;
    for (const team of ['blue', 'red']) {
      let count = [...room.players.values()].filter(p => p.team === team && p.isOnPitch !== false && (p.connected || p.aiControlled)).length;
      while (count < 5 && room.players.size < 20) {
        const usedSlots = new Set([...room.players.values()].filter(p => p.team === team).map(p => p.slot));
        const slot = [0,1,2,3,4].find(value => !usedSlots.has(value)) ?? count;
        const club = room.teams[team];
        const rosterPlayer = club?.roster?.[slot] || null;
        const id = rosterPlayer ? `bot-${team}-${rosterPlayer.id}` : `bot-${team}-${randomBytes(5).toString('hex')}`;
        room.players.set(id, {
          id, token: null, careerPlayerId: rosterPlayer && club ? `club-${club.id}-${rosterPlayer.id}` : null, name: rosterPlayer?.name || `${team === 'blue' ? 'Académie bleue' : 'Académie rouge'} ${slot + 1}`,
          team, slot, x: team === 'blue' ? -18 + slot * 2 : 18 - slot * 2,
          z: -12 + slot * 6, vx: 0, vz: 0, facing: team === 'blue' ? Math.PI / 2 : -Math.PI / 2,
          role: rosterPlayer?.role || ['GK', 'DEF', 'MID', 'FWD', 'FWD'][slot] || 'MID', isBot: true,
          isOnPitch: true, matchTimePlayedMs: 0, lastSubstitutedOutAt: null,
          input: { x: 0, z: 0, sprint: false }, lastInputSequence: -1, lastActionAt: 0,
          connected: true, controlMode: 'ai', aiControlled: false, lastSeen: this.now(), disconnectedAt: null,
          stats: { passes: 0, completedPasses: 0, shots: 0, tackles: 0, goals: 0, assists: 0, saves: 0, interceptions: 0 },
        });
        count++;
      }
      let benchCount = [...room.players.values()].filter(p => p.team === team && p.isOnPitch === false).length;
      while (benchCount < 2 && room.players.size < 20) {
        const slot = 5 + benchCount;
        const id = `bench-${team}-${randomBytes(5).toString('hex')}`;
        room.players.set(id, {
          id, token: null, name: `${team === 'blue' ? 'Réserve bleue' : 'Réserve rouge'} ${benchCount + 1}`,
          team, slot, x: team === 'blue' ? -18 + benchCount * 3 : 18 - benchCount * 3,
          z: -19.5, vx: 0, vz: 0, facing: team === 'blue' ? Math.PI / 2 : -Math.PI / 2,
          role: ['DEF', 'MID', 'FWD', 'FWD', 'GK'][benchCount] || 'MID', isBot: true,
          isOnPitch: false, matchTimePlayedMs: 0, lastSubstitutedOutAt: null,
          input: { x: 0, z: 0, sprint: false }, lastInputSequence: -1, lastActionAt: 0,
          connected: true, controlMode: 'bench', aiControlled: false, lastSeen: this.now(), disconnectedAt: null,
          stats: { passes: 0, shots: 0, tackles: 0, goals: 0, assists: 0, saves: 0, interceptions: 0 },
        });
        benchCount++;
      }
    }
  }

  updateBots(room) {
    const activePlayers = [...room.players.values()].filter(p => p.isOnPitch !== false && (p.connected || p.aiControlled));
    const bots = activePlayers.filter(p => p.isBot || p.aiControlled);
    const playersByTeam = {
      blue: activePlayers.filter(p => p.team === 'blue'),
      red: activePlayers.filter(p => p.team === 'red'),
    };
    const opponentsByTeam = {
      blue: playersByTeam.red,
      red: playersByTeam.blue,
    };
    const nearestToBallByTeam = {};
    for (const team of ['blue', 'red']) {
      let nearest = null, nearestDistance = Infinity;
      for (const player of playersByTeam[team]) {
        const distance = Math.hypot(player.x - room.ball.x, player.z - room.ball.z);
        if (distance < nearestDistance) { nearest = player; nearestDistance = distance; }
      }
      nearestToBallByTeam[team] = nearest;
    }
    const ball = room.ball;
    for (const bot of bots) {
      const teammates = playersByTeam[bot.team].filter(p => p.id !== bot.id);
      const opponents = opponentsByTeam[bot.team];
      const owner = ball.ownerId ? room.players.get(ball.ownerId) : null;
      const nearestTeammate = nearestToBallByTeam[bot.team];
      const now = this.now();
      let targetX = ball.x, targetZ = ball.z;
      const attackDir = room.attackDirection[bot.team] || (bot.team === 'blue' ? 1 : -1);
      if (bot.role === 'GK') {
        // Le gardien protège d'abord sa ligne et ne sort que sur un ballon proche.
        const goalX = -attackDir * 25.6;
        const danger = (ball.x - goalX) * attackDir < 11 && Math.abs(ball.z) < 10;
        targetX = danger ? Math.max(-27, Math.min(27, ball.x - attackDir * 1.2)) : goalX;
        targetZ = Math.max(-2.9, Math.min(2.9, ball.z * 0.62));
      } else if (owner?.team === bot.team) {
        if (owner.id === bot.id) {
          const goalX = attackDir * 27;
          targetX = goalX; targetZ = Math.max(-2.2, Math.min(2.2, -bot.z * 0.18));
          const goalDistance = Math.hypot(goalX - bot.x, bot.z);
          const pressured = opponents.some(opponent => Math.hypot(opponent.x - bot.x, opponent.z - bot.z) < 3.1);
          const forwardMate = teammates
            .filter(mate => (mate.x - bot.x) * attackDir > 2)
            .sort((a, b) => Math.hypot(a.x - bot.x, a.z - bot.z) - Math.hypot(b.x - bot.x, b.z - bot.z))[0];
          const requestedMate = teammates
            .filter(mate => !mate.isBot && Number.isFinite(mate.callForPassUntil) && mate.callForPassUntil >= now)
            .filter(mate => { const d = Math.hypot(mate.x - bot.x, mate.z - bot.z); return d >= 2.5 && d <= 22; })
            .sort((a, b) => Math.hypot(a.x - bot.x, a.z - bot.z) - Math.hypot(b.x - bot.x, b.z - bot.z))
            .find(mate => {
              const dx = mate.x - bot.x, dz = mate.z - bot.z;
              const lengthSq = dx * dx + dz * dz;
              return !opponents.some(opponent => {
                const t = clamp(((opponent.x - bot.x) * dx + (opponent.z - bot.z) * dz) / lengthSq, 0, 1);
                const nearestX = bot.x + dx * t, nearestZ = bot.z + dz * t;
                return Math.hypot(opponent.x - nearestX, opponent.z - nearestZ) < 1.65;
              });
            });
          if (goalDistance < 16 && Math.abs(bot.z) < 8) {
            bot.facing = Math.atan2(goalX - bot.x, -bot.z);
            if (!bot.aiControlled || averageAiShouldAct(bot, room.elapsedMs, 'shoot', 0.34)) {
              if (bot.aiControlled) bot.facing = averageAiAim(bot, room.elapsedMs, bot.facing, 'shoot');
              if (applyPlayerAction(room, bot, 'shoot', this.now())) { bot.stats.shots++; }
            }
          } else if (requestedMate) {
            // L'IA moyenne comprend l'appel, mais peut hésiter ou mal ajuster sa passe.
            bot.facing = Math.atan2(requestedMate.x - bot.x, requestedMate.z - bot.z);
            if (!bot.aiControlled || averageAiShouldAct(bot, room.elapsedMs, 'pass-request', 0.46)) {
              if (bot.aiControlled) bot.facing = averageAiAim(bot, room.elapsedMs, bot.facing, 'pass');
              if (applyPlayerAction(room, bot, 'pass', now)) { bot.stats.passes++; }
            }
          } else if (pressured && forwardMate) {
            bot.facing = Math.atan2(forwardMate.x - bot.x, forwardMate.z - bot.z);
            if (!bot.aiControlled || averageAiShouldAct(bot, room.elapsedMs, 'pass-pressure', 0.38)) {
              if (bot.aiControlled) bot.facing = averageAiAim(bot, room.elapsedMs, bot.facing, 'pass');
              if (applyPlayerAction(room, bot, 'pass', this.now())) { bot.stats.passes++; }
            }
          }
        } else {
          const lane = bot.slot % 2 ? -5 : 5;
          targetX = owner.x + attackDir * (bot.role === 'FWD' ? 7 : 4.5);
          targetZ = Math.max(-13, Math.min(13, owner.z + lane));
        }
      } else if (owner && owner.team !== bot.team) {
        // Un seul défenseur presse directement ; les autres protègent les lignes.
        if (nearestTeammate.id === bot.id || bot.role === 'DEF') {
          targetX = owner.x; targetZ = owner.z;
        } else {
          targetX = bot.x + (owner.x - bot.x) * 0.28;
          targetZ = bot.z + (owner.z - bot.z) * 0.28;
        }
      } else if (nearestTeammate.id !== bot.id) {
        targetX = bot.x + (ball.x - bot.x) * 0.32 + attackDir * (bot.role === 'FWD' ? 3.5 : 0);
        targetZ = bot.z + (ball.z - bot.z) * 0.32;
      }
      const dx = targetX - bot.x, dz = targetZ - bot.z;
      const distance = Math.hypot(dx, dz) || 1;
      const decisionX = Math.abs(dx) < 0.8 ? 0 : dx / distance;
      const decisionZ = Math.abs(dz) < 0.8 ? 0 : dz / distance;
      // L'IA de remplacement reste volontairement moyenne : déplacements plus mesurés et aucun sprint automatique.
      const movement = bot.aiControlled ? averageAiMovement(bot, room.elapsedMs, decisionX, decisionZ) : { x: decisionX, z: decisionZ };
      bot.input = { x: movement.x, z: movement.z, sprint: !bot.aiControlled && distance > 8 };
      if (distance > 0.2) bot.facing = Math.atan2(dx, dz);
      if (bot.role !== 'GK' && owner && owner.team !== bot.team && Math.hypot(owner.x-bot.x, owner.z-bot.z) < 1.5) {
        if (!bot.aiControlled || averageAiShouldAct(bot, room.elapsedMs, 'tackle', 0.40)) applyPlayerAction(room, bot, 'tackle', this.now());
      }
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
    for (const p of room.players.values()) if (p.isOnPitch !== false && (p.connected || p.aiControlled)) counts[p.team]++;
    return counts;
  }

  authenticate(roomId, token) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    if (typeof token !== 'string' || token.length < 16) throw new Error('UNAUTHORIZED');
    const player = [...room.players.values()].find(p => typeof p.token === 'string' && p.token.length >= 16 && p.token === token);
    if (!player) throw new Error('UNAUTHORIZED');
    return { room, player };
  }

  submitInput(roomId, token, payload = {}) {
    const { room, player } = this.authenticate(roomId, token);
    if (room.phase !== 'playing') throw new Error('MATCH_NOT_PLAYING');
    if (!player.connected) throw new Error('PLAYER_DISCONNECTED');
    if (player.isOnPitch === false) throw new Error('PLAYER_ON_BENCH');
    const sequence = payload.sequence;
    if (!Number.isSafeInteger(sequence) || sequence <= player.lastInputSequence) throw new Error('STALE_INPUT');
    const x = payload.x, z = payload.z;
    if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) throw new Error('INVALID_INPUT');
    const magnitude = Math.hypot(x, z) || 1;
    player.input = { x: clamp(x / Math.max(1, magnitude), -1, 1), z: clamp(z / Math.max(1, magnitude), -1, 1), sprint: payload.sprint === true };
    if (magnitude > 0.1) player.facing = Math.atan2(player.input.x, player.input.z);
    player.lastInputSequence = sequence;
    const inputAt = this.now();
    if (payload.callForPass === true && inputAt - (player.lastCallForPassAt ?? -Infinity) >= 1_200) {
      player.lastCallForPassAt = inputAt;
      player.callForPassUntil = inputAt + 1_600;
      room.events.push({ type: 'call-for-pass', team: player.team, playerId: player.id, at: room.elapsedMs });
    }
    player.lastSeen = inputAt;
    room.updatedAt = inputAt;
    const action = ['pass', 'shoot', 'tackle'].includes(payload.action) ? payload.action : null;
    const actionAccepted = action ? applyPlayerAction(room, player, action, this.now()) : false;
    if (actionAccepted) {
      player.stats ||= { passes: 0, shots: 0, tackles: 0, goals: 0 };
      if (action === 'pass') player.stats.passes++;
      if (action === 'shoot') player.stats.shots++;
      if (action === 'tackle') player.stats.tackles++;
    }
    return { accepted: true, sequence, actionAccepted };
  }

  tick(deltaSeconds) {
    const dt = clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, 0.05);
    const now = this.now();
    const checkpointRooms = [];
    for (const [id, room] of this.rooms) {
      const pendingOfficialResult = room.phase === 'fulltime' && !room.result;
      const roomExpired = now - room.updatedAt > this.roomTtlMs && room.phase !== 'playing' && room.phase !== 'halftime' && !pendingOfficialResult;
      const allPlayersExpired = !pendingOfficialResult && room.phase !== 'playing' && room.phase !== 'halftime' && room.players.size > 0 && [...room.players.values()].every(p => !p.connected && p.disconnectedAt && now - p.disconnectedAt > this.disconnectGraceMs);
      if (roomExpired || allPlayersExpired) {
        this.rooms.delete(id); this.lastCheckpointAt.delete(id);
        if (this.roomStore) this.roomStore.delete(id);
        continue;
      }
      if (room.phase === 'fulltime') {
        if (!room.result && this.tryFinalizeResult(room)) {
          if (this.roomStore) this.roomStore.delete(room.id);
          this.lastCheckpointAt.delete(room.id);
        }
        continue;
      }
      for (const p of room.players.values()) {
        if (!p.isBot && p.connected && now - p.lastSeen > this.disconnectGraceMs) {
          p.connected = false; p.controlMode = 'ai'; p.aiControlled = true; p.disconnectedAt = now; p.input = { x: 0, z: 0, sprint: false };
          p.callForPassUntil = 0;
          room.events.push({ type: 'control-takeover', controller: 'ai', skill: 'average', playerId: p.id, at: room.elapsedMs });
        }
      }
      // Un avatar humain déconnecté reste dans le match et passe sous contrôle IA jusqu'au coup de sifflet final.
      this.ensureBotCoverage(room);
      this.processRotationRequests(room);
      if (room.phase === 'halftime') {
        room.lastTickAt = now;
        if (room.halftimeUntil !== null && now >= room.halftimeUntil) {
          const pauseMs = room.halftimeDurationMs;
          room.startedAt += pauseMs;
          room.elapsedMs = room.durationMinutes * 30_000;
          room.period = 2;
          room.phase = 'playing';
          room.halftimeUntil = null;
          room.events.push({ type: 'second-half', at: room.elapsedMs });
          for (const p of room.players.values()) {
            if (p.isOnPitch !== false) p.x *= -1;
            p.input = { x: 0, z: 0, sprint: false };
            p.vx = 0; p.vz = 0;
            p.facing = p.team === 'blue' ? Math.PI / 2 : -Math.PI / 2;
          }
          room.attackDirection.blue *= -1;
          room.attackDirection.red *= -1;
          resetRoomBall(room);
        }
        for (const event of room.events) if (!Number.isSafeInteger(event.id)) event.id = room.nextEventId++;
        room.sequence++;
        if (now - (this.lastCheckpointAt.get(id) ?? 0) >= 1_000) checkpointRooms.push(room);
        continue;
      }
      if (room.phase !== 'playing') { room.lastTickAt = now; continue; }
      const elapsedSinceTick = Math.max(0, Math.min(0.25, (now - room.lastTickAt) / 1000));
      room.lastTickAt = now;
      // Temps de jeu individuel : seules les périodes réellement jouées sont comptées.
      // La mi-temps est traitée plus haut et n'entre donc pas dans ce cumul.
      const playedDeltaMs = elapsedSinceTick * 1000;
      if (playedDeltaMs > 0) {
        for (const player of room.players.values()) {
          if (player.isOnPitch !== false) player.matchTimePlayedMs = Math.max(0, Number(player.matchTimePlayedMs) || 0) + playedDeltaMs;
        }
      }
      room.elapsedMs = Math.max(0, now - room.startedAt);
      const maxMs = room.durationMinutes * 60_000;
      const halfMs = maxMs / 2;
      if (room.elapsedMs >= maxMs) {
        room.elapsedMs = maxMs; room.phase = 'fulltime';
        this.tryFinalizeResult(room);
        for (const p of room.players.values()) p.input = { x: 0, z: 0, sprint: false };
      } else if (room.elapsedMs >= halfMs && room.period === 1) {
        room.elapsedMs = halfMs;
        room.phase = 'halftime';
        room.halftimeUntil = now + room.halftimeDurationMs;
        room.events.push({ type: 'halftime', at: room.elapsedMs });
        for (const p of room.players.values()) {
          p.input = { x: 0, z: 0, sprint: false };
          p.vx = 0; p.vz = 0;
        }
        resetRoomBall(room);
        // Catch up safely if the server tick was delayed beyond the whole break.
        if (now >= room.startedAt + halfMs + room.halftimeDurationMs) {
          room.startedAt += room.halftimeDurationMs;
          room.elapsedMs = Math.max(halfMs, now - room.startedAt);
          room.period = 2;
          room.phase = 'playing';
          room.halftimeUntil = null;
          room.events.push({ type: 'second-half', at: room.elapsedMs });
          for (const p of room.players.values()) {
            p.x *= -1; p.input = { x: 0, z: 0, sprint: false };
            p.vx = 0; p.vz = 0;
            p.facing = p.team === 'blue' ? Math.PI / 2 : -Math.PI / 2;
          }
          room.attackDirection.blue *= -1;
          room.attackDirection.red *= -1;
          resetRoomBall(room);
          if (room.elapsedMs >= maxMs) { room.elapsedMs = maxMs; room.phase = 'fulltime'; this.tryFinalizeResult(room); }
        }
      }
      if (room.phase === 'playing') {
        room.updatedAt = now;
        if (room.goalPauseMs <= 0) this.updateBots(room);
        stepRoomSimulation(room, Math.min(Math.max(dt, elapsedSinceTick), 0.05));
      }
      for (const event of room.events) if (!Number.isSafeInteger(event.id)) event.id = room.nextEventId++;
      room.sequence++;
      if (now - (this.lastCheckpointAt.get(id) ?? 0) >= 1_000) checkpointRooms.push(room);
    }
    if (checkpointRooms.length) this.persistRooms(checkpointRooms);
  }

  tryFinalizeResult(room) {
    try {
      this.finalizeResult(room);
      delete room.finalizationError;
      return true;
    } catch (error) {
      room.finalizationError = String(error?.message || 'RESULT_FINALIZATION_FAILED').slice(0, 160);
      return false;
    }
  }

  finalizeResult(room) {
    if (room.result) return room.result;
    const players = [...room.players.values()].map(player => ({
      playerId: player.id, careerPlayerId: player.careerPlayerId || null, name: player.name, team: player.team, role: player.role,
      isBot: player.isBot === true, minutesPlayedMs: Math.round(Number(player.matchTimePlayedMs) || 0),
      stats: { passes: player.stats?.passes || 0, completedPasses: player.stats?.completedPasses || 0, shots: player.stats?.shots || 0, tackles: player.stats?.tackles || 0, goals: player.stats?.goals || 0, assists: player.stats?.assists || 0, saves: player.stats?.saves || 0, interceptions: player.stats?.interceptions || 0 },
    }));
    const performance = buildMatchPerformance(players);
    const blue = room.score.blue, red = room.score.red;
    const finalizedResult = Object.freeze({
      roomId: room.id, phase: 'fulltime', score: Object.freeze({ blue, red }),
      teams: Object.freeze(cloneMatchTeams(room.teams)),
      outcome: blue === red ? 'draw' : blue > red ? 'blue' : 'red',
      durationMs: room.elapsedMs, durationMinutes: room.durationMinutes,
      awards: Object.freeze(performance.awards),
      finalizedAt: this.now(), players: Object.freeze(performance.players.map(player => Object.freeze({ ...player, stats: Object.freeze({ ...player.stats }) }))),
      teamStats: Object.freeze({
        blue: Object.freeze({ passes: players.filter(p => p.team === 'blue').reduce((n,p) => n+p.stats.passes,0), completedPasses: players.filter(p => p.team === 'blue').reduce((n,p) => n+p.stats.completedPasses,0), shots: players.filter(p => p.team === 'blue').reduce((n,p) => n+p.stats.shots,0), tackles: players.filter(p => p.team === 'blue').reduce((n,p) => n+p.stats.tackles,0), goals: players.filter(p => p.team === 'blue').reduce((n,p) => n+p.stats.goals,0), assists: players.filter(p => p.team === 'blue').reduce((n,p) => n+p.stats.assists,0), saves: players.filter(p => p.team === 'blue').reduce((n,p) => n+p.stats.saves,0), interceptions: players.filter(p => p.team === 'blue').reduce((n,p) => n+p.stats.interceptions,0) }),
        red: Object.freeze({ passes: players.filter(p => p.team === 'red').reduce((n,p) => n+p.stats.passes,0), completedPasses: players.filter(p => p.team === 'red').reduce((n,p) => n+p.stats.completedPasses,0), shots: players.filter(p => p.team === 'red').reduce((n,p) => n+p.stats.shots,0), tackles: players.filter(p => p.team === 'red').reduce((n,p) => n+p.stats.tackles,0), goals: players.filter(p => p.team === 'red').reduce((n,p) => n+p.stats.goals,0), assists: players.filter(p => p.team === 'red').reduce((n,p) => n+p.stats.assists,0), saves: players.filter(p => p.team === 'red').reduce((n,p) => n+p.stats.saves,0), interceptions: players.filter(p => p.team === 'red').reduce((n,p) => n+p.stats.interceptions,0) }),
      }),
    });
    let committedResult = finalizedResult;
    if (room.competitionFixtureId) {
      const competitionResult = this.competitionStore?.recordFixtureResult(room.competitionFixtureId, { roomId: room.id, homeGoals: blue, awayGoals: red, finalizedAt: finalizedResult.finalizedAt });
      if (!competitionResult?.ok || !competitionResult.fixture?.result) throw new Error(competitionResult?.reason || 'COMPETITION_RESULT_REJECTED');
      committedResult = Object.freeze({ ...finalizedResult, competition: { fixtureId: room.competitionFixtureId, result: competitionResult.fixture.result } });
    }
    if (this.careerStore) {
      for (const player of performance.players) {
        const livePlayer = room.players.get(player.playerId);
        if (!livePlayer?.careerPlayerId || player.minutesPlayedMs < 15_000) continue;
        const outcome = blue === red ? 'draw' : (player.team === (blue > red ? 'blue' : 'red') ? 'win' : 'loss');
        const teamName = room.teams[player.team]?.name || '';
        const opponentTeam = player.team === 'blue' ? 'red' : 'blue';
        const careerInput = {
          matchId: room.id, result: outcome, finalizedAt: finalizedResult.finalizedAt,
          teamName, opponent: room.teams[opponentTeam]?.name || '', role: player.role,
          rating: player.rating, minutesPlayedMs: player.minutesPlayedMs,
          playerOfMatch: performance.awards.playerOfMatch?.playerId === player.playerId,
          cleanSheet: (player.team === 'blue' ? red : blue) === 0,
          stats: player.stats, name: player.name, clubName: teamName
        };
        this.careerStore.recordPlayerMatch(livePlayer.careerPlayerId, careerInput);
        if (livePlayer?.accountId && !player.isBot) this.careerStore.recordMatch(livePlayer.accountId, careerInput);
        if (livePlayer?.accountId && !player.isBot && /^FRP-[0-9]{6}$/.test(livePlayer.careerPlayerId || '')) {
          this.careerSyncQueue?.enqueue({ accountId: livePlayer.accountId, playerId: livePlayer.careerPlayerId, matchId: room.id, payload: careerInput });
        }
      }
    }
    for (const player of performance.players) {
      const livePlayer = room.players.get(player.playerId);
      if (!livePlayer?.accountId || player.isBot || player.minutesPlayedMs < 15_000) continue;
      const outcome = blue === red ? 'draw' : (player.team === (blue > red ? 'blue' : 'red') ? 'win' : 'loss');
      this.progressionStore?.grantMatchReward(livePlayer.accountId, { matchId: room.id, result: outcome, minutesPlayedMs: player.minutesPlayedMs, rating: player.rating });
    }
    this.resultStore?.save(committedResult);
    room.result = committedResult;
    if (this.roomStore) this.roomStore.delete(room.id);
    this.lastCheckpointAt.delete(room.id);
    room.events.push({ type: 'fulltime', at: room.elapsedMs, score: { ...room.score } });
    return room.result;
  }

  getResult(roomId) {
    const room = this.rooms.get(roomId);
    if (room?.phase === 'fulltime' && !room.result) throw new Error('RESULT_NOT_READY');
    if (room?.result) return room.result;
    const archived = this.resultStore?.get(roomId);
    if (archived) return archived;
    if (!room) throw new Error('ROOM_NOT_FOUND');
    throw new Error('RESULT_NOT_READY');
  }

  listResults(options = {}) { return this.resultStore?.list(options) ?? []; }

  pageResults(options = {}) {
    if (this.resultStore?.page) return this.resultStore.page(options);
    const results = this.listResults(options);
    return { results, pagination: { limit: results.length, offset: 0, total: results.length, hasMore: false, nextOffset: null } };
  }

  requestEntry(roomId, token) {
    const { room, player } = this.authenticate(roomId, token);
    if (room.phase === 'lobby' || room.phase === 'fulltime') throw new Error('ROTATION_NOT_AVAILABLE');
    if (player.isBot || !player.connected || player.isOnPitch !== false) throw new Error('PLAYER_NOT_ON_BENCH');
    const existing = room.rotationRequests.find(request => request.playerId === player.id);
    if (existing) return { queued: true, duplicate: true, request: { ...existing }, state: this.publicState(room) };
    const request = { playerId: player.id, team: player.team, requestedAt: this.now() };
    room.rotationRequests.push(request);
    room.events.push({ type: 'rotation-request', team: player.team, playerId: player.id, at: room.elapsedMs });
    room.updatedAt = this.now();
    if (room.phase === 'halftime' || (room.phase === 'playing' && room.goalPauseMs > 0)) this.processRotationRequests(room);
    room.sequence++;
    this.persistRoom(room);
    return { queued: room.rotationRequests.some(item => item.playerId === player.id), request: { ...request }, state: this.publicState(room) };
  }

  processRotationRequests(room) {
    if (room.phase !== 'halftime' && !(room.phase === 'playing' && room.goalPauseMs > 0)) return 0;
    let processed = 0;
    for (const request of [...room.rotationRequests]) {
      const incoming = room.players.get(request.playerId);
      if (!incoming || !incoming.connected || incoming.isOnPitch !== false) {
        room.rotationRequests = room.rotationRequests.filter(item => item.playerId !== request.playerId);
        continue;
      }
      const outgoingCandidates = [...room.players.values()]
        .filter(player => player.team === request.team && player.isOnPitch !== false)
        .filter(player => player.isBot || (player.aiControlled && !player.connected))
        .sort((a, b) => Number(b.isBot) - Number(a.isBot)
          || (Number(b.matchTimePlayedMs) || 0) - (Number(a.matchTimePlayedMs) || 0)
          || String(a.id).localeCompare(String(b.id)));
      const outgoing = outgoingCandidates.find(candidate => {
        const result = validateRotation({
          phase: room.phase === 'halftime' ? 'halftime' : 'stoppage',
          elapsedMatchSeconds: room.elapsedMs / 1000,
          outgoing: candidate,
          incoming,
          teamPlayers: [...room.players.values()],
        });
        return result.ok;
      });
      if (!outgoing) {
        room.rotationRequests = room.rotationRequests.filter(item => item.playerId !== request.playerId);
        room.events.push({ type: 'rotation-request-unavailable', team: request.team, playerId: request.playerId, at: room.elapsedMs });
        continue;
      }
      try {
        this.rotate(room.id, incoming.token, { outgoingId: outgoing.id, incomingId: incoming.id });
        room.rotationRequests = room.rotationRequests.filter(item => item.playerId !== request.playerId);
        room.events.push({ type: 'rotation-request-completed', team: request.team, playerId: request.playerId, outgoingId: outgoing.id, at: room.elapsedMs });
        processed++;
      } catch {
        room.rotationRequests = room.rotationRequests.filter(item => item.playerId !== request.playerId);
      }
    }
    return processed;
  }

  rotate(roomId, token, { outgoingId, incomingId } = {}) {
    const { room, player: requester } = this.authenticate(roomId, token);
    if (room.phase === 'fulltime' || room.phase === 'lobby') throw new Error('ROTATION_NOT_AVAILABLE');
    if (room.phase !== 'halftime' && !(room.phase === 'playing' && room.goalPauseMs > 0)) throw new Error('NOT_A_STOPPAGE');
    const outgoing = room.players.get(String(outgoingId || ''));
    const incoming = room.players.get(String(incomingId || ''));
    if (!outgoing || !incoming || outgoing.team !== requester.team || incoming.team !== requester.team) throw new Error('INVALID_ROTATION_PAIR');
    if (!outgoing.isBot && outgoing.id !== requester.id) throw new Error('OUTGOING_PLAYER_CONSENT_REQUIRED');
    if (!incoming.isBot && incoming.id !== requester.id) throw new Error('INCOMING_PLAYER_CONSENT_REQUIRED');
    if (outgoing.isOnPitch === false || incoming.isOnPitch !== false) throw new Error('PLAYER_NOT_IN_EXPECTED_LIST');
    if (!outgoing.isBot && !outgoing.connected && !outgoing.aiControlled) throw new Error('OUTGOING_UNAVAILABLE');
    if (!incoming.isBot && !incoming.connected && !incoming.aiControlled) throw new Error('INCOMING_UNAVAILABLE');
    const elapsedMatchSeconds = room.elapsedMs / 1000;
    const validation = validateRotation({ phase: room.phase === 'halftime' ? 'halftime' : 'stoppage', elapsedMatchSeconds, outgoing, incoming, teamPlayers: [...room.players.values()] });
    if (!validation.ok) throw new Error(validation.code === 'return-cooldown' ? 'RETURN_COOLDOWN' : 'ROTATION_NOT_ALLOWED');
    const slot = outgoing.slot;
    const position = { x: outgoing.x, z: outgoing.z, facing: outgoing.facing };
    outgoing.isOnPitch = false; outgoing.slot = incoming.slot;
    outgoing.x = incoming.x; outgoing.z = incoming.z; outgoing.lastSubstitutedOutAt = elapsedMatchSeconds;
    outgoing.input = { x: 0, z: 0, sprint: false }; outgoing.vx = 0; outgoing.vz = 0;
    incoming.isOnPitch = true; incoming.slot = slot;
    incoming.x = position.x; incoming.z = position.z; incoming.facing = position.facing;
    incoming.vx = 0; incoming.vz = 0; incoming.input = { x: 0, z: 0, sprint: false };
    if (room.ball.ownerId === outgoing.id) { room.ball.ownerId = null; room.ball.x = outgoing.x; room.ball.z = outgoing.z; room.ball.vx = 0; room.ball.vy = 0; room.ball.vz = 0; }
    room.events.push({ type: 'rotation', team: requester.team, outgoingId: outgoing.id, incomingId: incoming.id, at: room.elapsedMs });
    room.updatedAt = this.now(); room.sequence++;
    this.persistRoom(room);
    return { rotated: true, state: this.publicState(room) };
  }

  reconnect(roomId, token) {
    const { room, player } = this.authenticate(roomId, token);
    if (player.isBot || room.phase === 'fulltime') throw new Error('UNAUTHORIZED');
    const now = this.now();
    const wasAiControlled = player.aiControlled === true;
    player.lastSeen = now; player.connected = true; player.controlMode = 'human'; player.aiControlled = false; player.disconnectedAt = null;
    player.input = { x: 0, z: 0, sprint: false };
    if (wasAiControlled) room.events.push({ type: 'control-restored', controller: 'human', playerId: player.id, at: room.elapsedMs });
    room.updatedAt = now;
    this.persistRoom(room);
    return { alive: true, reconnected: true, nextSequence: Math.max(1, player.lastInputSequence + 1), state: this.publicState(room) };
  }

  heartbeat(roomId, token) { const result = this.reconnect(roomId, token); return { alive: result.alive, nextSequence: result.nextSequence }; }

  leave(roomId, token) {
    const { room, player } = this.authenticate(roomId, token);
    player.connected = false; player.controlMode = 'ai'; player.aiControlled = true; player.disconnectedAt = this.now(); player.input = { x: 0, z: 0, sprint: false };
    player.callForPassUntil = 0;
    room.events.push({ type: 'control-takeover', controller: 'ai', skill: 'average', playerId: player.id, at: room.elapsedMs });
    room.updatedAt = this.now();
    this.persistRoom(room);
    return true;
  }

  list() {
    const result = [];
    for (const room of this.rooms.values()) {
      if (this.now() - room.updatedAt > this.roomTtlMs || room.phase === 'fulltime') continue;
      const humans = { blue: 0, red: 0 };
      for (const player of room.players.values()) if (!player.isBot && player.connected) humans[player.team]++;
      result.push({ id: room.id, name: room.name, phase: room.phase, durationMinutes: room.durationMinutes,
        humanCounts: humans, totalHumans: humans.blue + humans.red, maxHumans: 10, updatedAt: room.updatedAt });
    }
    return result.sort((a, b) => b.updatedAt - a.updatedAt);
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
    const players = [...room.players.values()].map(({ token, accountId, careerPlayerId, input, lastInputSequence, lastSeen, disconnectedAt, lastActionAt, ...p }) => ({ ...p, ...(p.isBot && typeof careerPlayerId === 'string' ? { careerPlayerId } : {}) }));
    return {
      id: room.id, name: room.name, durationMinutes: room.durationMinutes,
      phase: room.phase, period: room.period, halftimeRemainingMs: room.phase === 'halftime' && room.halftimeUntil ? Math.max(0, room.halftimeUntil - this.now()) : 0, attackDirection: { ...room.attackDirection }, elapsedMs: room.elapsedMs, durationMs: room.durationMinutes * 60_000, sequence: room.sequence,
      virtualClock: `${String(Math.floor(Math.min(5400, room.elapsedMs / (room.durationMinutes * 60_000) * 5400) / 60)).padStart(2,'0')}:${String(Math.floor(Math.min(5400, room.elapsedMs / (room.durationMinutes * 60_000) * 5400) % 60)).padStart(2,'0')}`,
      score: { ...room.score }, teams: cloneMatchTeams(room.teams), counts: this.teamCounts(room), rotationAvailable: room.phase === 'halftime' || (room.phase === 'playing' && room.goalPauseMs > 0),
      players, rotationRequests: (room.rotationRequests || []).map(request => ({ ...request })), benchCounts: { blue: players.filter(p => p.team === 'blue' && p.isOnPitch === false).length, red: players.filter(p => p.team === 'red' && p.isOnPitch === false).length }, ball: { ...room.ball }, result: room.result, events: room.events.slice(-40), eventCursor: room.nextEventId - 1,
    };
  }
}
