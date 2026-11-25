import { normalizeMatchSeed } from "./deterministic-rng.js";
import { MATCH_REPLAY_TICK_RATE } from "./match-replay.js";

export const MATCH_REPLAY_SNAPSHOT_SCHEMA_VERSION = 1;
export const LOCAL_SIMULATION_VERSION = "p27-local-physics-1";

function fail(code) {
  throw new Error(code);
}

function clonePlain(value, path = "state") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("INVALID_SNAPSHOT_NUMBER");
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => clonePlain(item, `${path}[${index}]`));
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("INVALID_SNAPSHOT_VALUE");
  }
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) continue;
    if (typeof value[key] === "function" || typeof value[key] === "symbol" || typeof value[key] === "bigint") {
      fail("INVALID_SNAPSHOT_VALUE");
    }
    output[key] = clonePlain(value[key], `${path}.${key}`);
  }
  return output;
}

function vector(value, label) {
  if (!value || typeof value !== "object") fail(`INVALID_SNAPSHOT_${label.toUpperCase()}`);
  const output = {};
  for (const key of ["x", "y", "z"]) {
    if (key in value) {
      if (!Number.isFinite(value[key])) fail(`INVALID_SNAPSHOT_${label.toUpperCase()}`);
      output[key] = value[key];
    }
  }
  if (!("x" in output) || !("z" in output)) fail(`INVALID_SNAPSHOT_${label.toUpperCase()}`);
  return output;
}

function capturePlayer(player) {
  if (!player || player.id === null || player.id === undefined) fail("INVALID_SNAPSHOT_PLAYER");
  const output = {
    id: String(player.id),
    team: player.team,
    number: player.number,
    name: String(player.name ?? ""),
    role: player.role,
    specialty: player.specialty ?? "balanced",
    attributes: clonePlain(player.attributes || {}),
    preferredFoot: player.preferredFoot ?? null,
    slotIndex: player.slotIndex,
    homePos: vector(player.homePos, "home_position"),
    pos: vector(player.pos, "player_position"),
    vel: vector(player.vel, "player_velocity"),
    facing: player.facing,
    stamina: player.stamina,
    decisionTimer: player.decisionTimer,
    dribblePhase: player.dribblePhase,
    isControlled: player.isControlled === true,
    isOnPitch: player.isOnPitch !== false,
    animState: player.animState ?? "idle",
    animTimer: player.animTimer ?? 0,
    actionCooldown: player.actionCooldown ?? 0,
    diveDir: player.diveDir ?? 0,
    tackleTimer: player.tackleTimer ?? 0,
    stridePhase: player.stridePhase ?? 0,
    previousVisualSpeed: player.previousVisualSpeed ?? 0,
    callTimer: player.callTimer ?? 0,
    stats: clonePlain(player.stats || {})
  };
  for (const key of ["facing", "stamina", "decisionTimer", "dribblePhase", "animTimer", "actionCooldown", "diveDir", "tackleTimer", "stridePhase", "previousVisualSpeed", "callTimer"]) {
    if (!Number.isFinite(output[key])) fail("INVALID_SNAPSHOT_PLAYER");
  }
  if (!["blue", "red"].includes(output.team)) fail("INVALID_SNAPSHOT_PLAYER_TEAM");
  return output;
}

/**
 * Captures simulation-relevant local match state without retaining Three.js
 * objects, DOM nodes, callbacks, or live Player/Ball references.
 */
export function createMatchReplaySnapshot({ seed, tick = 0, game } = {}) {
  if (!game || !Array.isArray(game.players) || !game.ball || !game.match || !game.ai || !game.physics || !game.weather) {
    fail("INVALID_SNAPSHOT_GAME");
  }
  if (!Number.isSafeInteger(tick) || tick < 0) fail("INVALID_SNAPSHOT_TICK");

  const players = game.players.map(capturePlayer);
  const playerIds = new Set();
  for (const player of players) {
    if (playerIds.has(player.id)) fail("DUPLICATE_SNAPSHOT_PLAYER");
    playerIds.add(player.id);
  }

  const state = {
    players,
    benchPlayers: {
      blue: clonePlain(game.benchPlayers?.blue || []),
      red: clonePlain(game.benchPlayers?.red || [])
    },
    activePlayerId: game.activePlayer?.id === undefined ? null : String(game.activePlayer.id),
    ball: {
      pos: vector(game.ball.pos, "ball_position"),
      vel: vector(game.ball.vel, "ball_velocity"),
      spin: Number(game.ball.spin) || 0,
      ownerId: game.ball.owner?.id === undefined ? null : String(game.ball.owner.id),
      lastTouchTeam: game.ball.lastTouchTeam ?? null,
      lastTouchPlayerId: game.ball.lastTouchPlayer?.id === undefined ? null : String(game.ball.lastTouchPlayer.id)
    },
    match: {
      durationMinutes: game.match.durationMinutes,
      halfDuration: game.match.halfDuration,
      pendingDurationMinutes: game.match.pendingDurationMinutes ?? null,
      blueScore: game.match.blueScore,
      redScore: game.match.redScore,
      period: game.match.period,
      timeLeft: game.match.timeLeft,
      phase: game.match.phase,
      phaseTimer: game.match.phaseTimer,
      totalPossessionTime: clonePlain(game.match.totalPossessionTime),
      elapsedMatchTime: game.match.elapsedMatchTime,
      eventSequence: game.match.eventSequence,
      events: clonePlain(game.match.events),
      stats: clonePlain(game.match.stats)
    },
    ai: {
      formation: game.ai.formation,
      mentality: game.ai.mentality,
      pressStyle: game.ai.pressStyle,
      attackDirection: clonePlain(game.ai.attackDirection)
    },
    physics: { gravity: game.physics.gravity },
    weather: {
      mode: game.weather.mode,
      rainFrictionFactor: game.weather.rainFrictionFactor
    },
    substitutionsUsed: clonePlain(game.substitutionsUsed || { blue: 0, red: 0 }),
    substitutionLimit: game.substitutionLimit ?? 3,
    aiSubstitutionCheckTimer: game.aiSubstitutionCheckTimer ?? 0,
    callForPassCooldown: game.callForPassCooldown ?? 0,
    playerMatchStats: clonePlain(game.playerMatchStats || {})
  };

  const numericState = [
    state.ball.spin, state.match.durationMinutes, state.match.halfDuration,
    state.match.blueScore, state.match.redScore, state.match.period,
    state.match.timeLeft, state.match.phaseTimer, state.match.elapsedMatchTime,
    state.physics.gravity, state.weather.rainFrictionFactor,
    state.substitutionLimit, state.aiSubstitutionCheckTimer, state.callForPassCooldown
  ];
  if (numericState.some(value => !Number.isFinite(value))) fail("INVALID_SNAPSHOT_STATE");

  return {
    schemaVersion: MATCH_REPLAY_SNAPSHOT_SCHEMA_VERSION,
    simulationVersion: LOCAL_SIMULATION_VERSION,
    seed: normalizeMatchSeed(seed),
    tickRate: MATCH_REPLAY_TICK_RATE,
    tick,
    state
  };
}

export function validateMatchReplaySnapshot(snapshot) {
  try {
    if (!snapshot || snapshot.schemaVersion !== MATCH_REPLAY_SNAPSHOT_SCHEMA_VERSION ||
        snapshot.simulationVersion !== LOCAL_SIMULATION_VERSION ||
        snapshot.tickRate !== MATCH_REPLAY_TICK_RATE ||
        !Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0 ||
        !snapshot.state || !Array.isArray(snapshot.state.players)) {
      fail("INVALID_MATCH_REPLAY_SNAPSHOT");
    }
    normalizeMatchSeed(snapshot.seed);
    const ids = new Set();
    for (const player of snapshot.state.players) {
      if (!player || typeof player.id !== "string" || !["blue", "red"].includes(player.team) ||
          !player.pos || !player.vel || !Number.isFinite(player.facing) ||
          !Number.isFinite(player.stamina) || !Number.isFinite(player.decisionTimer) ||
          !Number.isFinite(player.dribblePhase)) fail("INVALID_SNAPSHOT_PLAYER");
      if (ids.has(player.id)) fail("DUPLICATE_SNAPSHOT_PLAYER");
      ids.add(player.id);
    }
    if (!snapshot.state.ball?.pos || !snapshot.state.ball?.vel ||
        !snapshot.state.match || !snapshot.state.ai || !snapshot.state.physics ||
        !snapshot.state.weather || !Array.isArray(snapshot.state.benchPlayers?.blue) ||
        !Array.isArray(snapshot.state.benchPlayers?.red)) fail("INVALID_SNAPSHOT_STATE");
    clonePlain(snapshot.state);
    return { valid: true, playerCount: snapshot.state.players.length, tick: snapshot.tick };
  } catch (error) {
    return { valid: false, reason: String(error?.message || "INVALID_MATCH_REPLAY_SNAPSHOT") };
  }
}
