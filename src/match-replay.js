import { normalizeMatchSeed } from "./deterministic-rng.js";

export const MATCH_REPLAY_SCHEMA_VERSION = 1;
export const MATCH_REPLAY_TICK_RATE = 30;
export const MATCH_REPLAY_MAX_FRAMES = 20000;
const ACTION_TYPES = new Set(["pass", "press", "shoot", "lob", "call_for_pass"]);

function fail(code) {
  throw new Error(code);
}

function normalizeFrame(frame, expectedTick) {
  if (!frame || typeof frame !== "object" || Array.isArray(frame)) fail("INVALID_REPLAY_FRAME");
  if (!Number.isSafeInteger(frame.tick) || frame.tick !== expectedTick) fail("INVALID_REPLAY_TICK");
  const move = frame.move;
  if (!move || typeof move !== "object" || Array.isArray(move)) fail("INVALID_REPLAY_MOVE");
  const x = Number(move.x);
  const z = Number(move.z);
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 1 || Math.abs(z) > 1) {
    fail("INVALID_REPLAY_MOVE");
  }
  if (typeof frame.sprint !== "boolean") fail("INVALID_REPLAY_SPRINT");
  if (!Array.isArray(frame.actions) || frame.actions.length > ACTION_TYPES.size) fail("INVALID_REPLAY_ACTIONS");

  const seen = new Set();
  const actions = frame.actions.map((action) => {
    if (!action || typeof action !== "object" || Array.isArray(action) || !ACTION_TYPES.has(action.type)) {
      fail("INVALID_REPLAY_ACTION");
    }
    if (seen.has(action.type)) fail("DUPLICATE_REPLAY_ACTION");
    seen.add(action.type);
    if (action.type === "shoot") {
      const power = Number(action.power);
      if (!Number.isFinite(power) || power < 0 || power > 1) fail("INVALID_REPLAY_ACTION_POWER");
      return { type: action.type, power: Math.round(power * 10000) / 10000 };
    }
    if (Object.hasOwn(action, "power")) fail("UNEXPECTED_REPLAY_ACTION_POWER");
    return { type: action.type };
  });

  return {
    tick: frame.tick,
    move: {
      x: Math.round(x * 10000) / 10000,
      z: Math.round(z * 10000) / 10000
    },
    sprint: frame.sprint,
    actions
  };
}

export function createMatchReplay({ seed } = {}) {
  return {
    schemaVersion: MATCH_REPLAY_SCHEMA_VERSION,
    seed: normalizeMatchSeed(seed),
    tickRate: MATCH_REPLAY_TICK_RATE,
    frames: []
  };
}

/**
 * Append exactly one complete input sample per fixed simulation tick.
 * Missing, repeated, or reordered ticks are rejected rather than guessed.
 */
export function appendMatchReplayFrame(replay, frame) {
  if (!replay || replay.schemaVersion !== MATCH_REPLAY_SCHEMA_VERSION ||
      replay.tickRate !== MATCH_REPLAY_TICK_RATE || !Array.isArray(replay.frames)) {
    fail("INVALID_MATCH_REPLAY");
  }
  if (replay.frames.length >= MATCH_REPLAY_MAX_FRAMES) fail("REPLAY_FRAME_LIMIT");
  const normalized = normalizeFrame(frame, replay.frames.length);
  replay.frames.push(normalized);
  return replay.frames.length;
}

export function validateMatchReplay(replay) {
  try {
    if (!replay || replay.schemaVersion !== MATCH_REPLAY_SCHEMA_VERSION ||
        replay.tickRate !== MATCH_REPLAY_TICK_RATE || !Array.isArray(replay.frames) ||
        replay.frames.length > MATCH_REPLAY_MAX_FRAMES) {
      fail("INVALID_MATCH_REPLAY");
    }
    normalizeMatchSeed(replay.seed);
    for (let index = 0; index < replay.frames.length; index++) {
      normalizeFrame(replay.frames[index], index);
    }
    return { valid: true, frameCount: replay.frames.length, tickRate: replay.tickRate };
  } catch (error) {
    return { valid: false, reason: String(error?.message || "INVALID_MATCH_REPLAY") };
  }
}

export function getMatchReplayFrame(replay, tick) {
  if (!Number.isSafeInteger(tick) || tick < 0 || !Array.isArray(replay?.frames)) {
    fail("INVALID_REPLAY_TICK");
  }
  const frame = replay.frames[tick];
  if (!frame || frame.tick !== tick) fail("REPLAY_FRAME_NOT_FOUND");
  return frame;
}
