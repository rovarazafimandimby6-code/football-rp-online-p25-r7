import test from "node:test";
import assert from "node:assert/strict";
import {
  appendMatchReplayFrame,
  createMatchReplay,
  getMatchReplayFrame,
  MATCH_REPLAY_MAX_FRAMES,
  validateMatchReplay
} from "../src/match-replay.js";

function sample(tick, overrides = {}) {
  return {
    tick,
    move: { x: 0.25, z: -1 },
    sprint: true,
    actions: [{ type: "shoot", power: 0.9 }, { type: "call_for_pass" }],
    ...overrides
  };
}

test("match replay stores one normalized input sample per consecutive fixed tick", () => {
  const replay = createMatchReplay({ seed: 0x12345678 });
  assert.equal(appendMatchReplayFrame(replay, sample(0)), 1);
  assert.equal(appendMatchReplayFrame(replay, sample(1, { move: { x: 0.123456, z: 0 } })), 2);
  assert.deepEqual(getMatchReplayFrame(replay, 0), {
    tick: 0,
    move: { x: 0.25, z: -1 },
    sprint: true,
    actions: [{ type: "shoot", power: 0.9 }, { type: "call_for_pass" }]
  });
  assert.equal(replay.frames[1].move.x, 0.1235);
  assert.deepEqual(validateMatchReplay(replay), { valid: true, frameCount: 2, tickRate: 30 });
});

test("replay rejects missing, duplicate, and reordered ticks", () => {
  const replay = createMatchReplay({ seed: 1 });
  assert.throws(() => appendMatchReplayFrame(replay, sample(1)), /INVALID_REPLAY_TICK/);
  appendMatchReplayFrame(replay, sample(0));
  assert.throws(() => appendMatchReplayFrame(replay, sample(0)), /INVALID_REPLAY_TICK/);
});

test("replay rejects malformed movement, action types, duplicate actions, and invalid power", () => {
  const invalid = [
    sample(0, { move: { x: 2, z: 0 } }),
    sample(0, { move: { x: NaN, z: 0 } }),
    sample(0, { actions: [{ type: "teleport" }] }),
    sample(0, { actions: [{ type: "lob" }, { type: "lob" }] }),
    sample(0, { actions: [{ type: "shoot", power: 1.1 }] }),
    sample(0, { actions: [{ type: "pass_press", power: 0.5 }] }),
    sample(0, { sprint: 1 })
  ];
  for (const frame of invalid) {
    const replay = createMatchReplay({ seed: 2 });
    assert.throws(() => appendMatchReplayFrame(replay, frame));
  }
});

test("replay validation detects tampering after recording", () => {
  const replay = createMatchReplay({ seed: 3 });
  appendMatchReplayFrame(replay, sample(0));
  replay.frames[0].move.x = 5;
  assert.deepEqual(validateMatchReplay(replay), { valid: false, reason: "INVALID_REPLAY_MOVE" });
});

test("replay rejects unsupported schema, tick rate, seed, and frame limit", () => {
  assert.equal(validateMatchReplay({ schemaVersion: 2, seed: 1, tickRate: 30, frames: [] }).valid, false);
  assert.equal(validateMatchReplay({ schemaVersion: 1, seed: 1, tickRate: 60, frames: [] }).valid, false);
  assert.equal(validateMatchReplay({ schemaVersion: 1, seed: -1, tickRate: 30, frames: [] }).valid, false);
  const replay = createMatchReplay({ seed: 4 });
  replay.frames = Array.from({ length: MATCH_REPLAY_MAX_FRAMES + 1 }, (_, tick) => sample(tick));
  assert.equal(validateMatchReplay(replay).valid, false);
});

test("replay lookup refuses ticks outside the recorded stream", () => {
  const replay = createMatchReplay({ seed: 5 });
  appendMatchReplayFrame(replay, sample(0));
  assert.throws(() => getMatchReplayFrame(replay, 1), /REPLAY_FRAME_NOT_FOUND/);
  assert.throws(() => getMatchReplayFrame(replay, -1), /INVALID_REPLAY_TICK/);
});
