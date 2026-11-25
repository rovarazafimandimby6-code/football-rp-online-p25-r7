import test from "node:test";
import assert from "node:assert/strict";
import {
  createMatchReplaySnapshot,
  validateMatchReplaySnapshot,
  MATCH_REPLAY_SNAPSHOT_SCHEMA_VERSION,
  LOCAL_SIMULATION_VERSION
} from "../src/match-replay-snapshot.js";

function player(id, team, slotIndex) {
  return {
    id, team, number: slotIndex + 1, name: `Player ${id}`, role: slotIndex === 0 ? "GK" : "MID",
    specialty: "balanced", attributes: { pace: 55, shooting: 50 }, preferredFoot: "right",
    slotIndex, homePos: { x: team === "blue" ? -10 : 10, z: slotIndex * 2 },
    pos: { x: team === "blue" ? -10 : 10, y: 0, z: slotIndex * 2 },
    vel: { x: 0, z: 0 }, facing: team === "blue" ? Math.PI / 2 : -Math.PI / 2,
    stamina: 0.94, decisionTimer: 0.12 + slotIndex * 0.01,
    dribblePhase: 1.25 + slotIndex, isControlled: id === "blue-1",
    isOnPitch: true, animState: "idle", animTimer: 0, actionCooldown: 0,
    diveDir: 0, tackleTimer: 0, stridePhase: 0.5, previousVisualSpeed: 0,
    callTimer: 0, stats: { goals: 0, assists: 0 }
  };
}

function makeGame() {
  const blue = player("blue-1", "blue", 0);
  const red = player("red-1", "red", 1);
  return {
    players: [blue, red],
    benchPlayers: {
      blue: [{ id: "blue-reserve", team: "blue", role: "MID", rating: 63 }],
      red: [{ id: "red-reserve", team: "red", role: "DEF", rating: 60 }]
    },
    activePlayer: blue,
    ball: {
      pos: { x: -2, y: 0.36, z: 1 }, vel: { x: 3, y: 0, z: -1 },
      spin: 0.12, owner: blue, lastTouchTeam: "blue", lastTouchPlayer: blue
    },
    match: {
      durationMinutes: 5, halfDuration: 150, pendingDurationMinutes: null,
      blueScore: 1, redScore: 0, period: 1, timeLeft: 112,
      phase: "playing", phaseTimer: 0, totalPossessionTime: { blue: 20, red: 18 },
      elapsedMatchTime: 38, eventSequence: 1,
      events: [{ id: 1, type: "goal", team: "blue" }],
      stats: { blue: { shots: 2 }, red: { shots: 1 } }
    },
    ai: {
      formation: "2-2", mentality: "balanced", pressStyle: "normal",
      attackDirection: { blue: 1, red: -1 }
    },
    physics: { gravity: 24 },
    weather: { mode: "rain", rainFrictionFactor: 0.82 },
    substitutionsUsed: { blue: 1, red: 0 },
    substitutionLimit: 3,
    aiSubstitutionCheckTimer: 2.5,
    callForPassCooldown: 0.4,
    playerMatchStats: { goals: 1, assists: 0 }
  };
}

test("snapshot captures the simulation inputs and validates its schema", () => {
  const snapshot = createMatchReplaySnapshot({ seed: 123456, tick: 45, game: makeGame() });
  assert.equal(snapshot.schemaVersion, MATCH_REPLAY_SNAPSHOT_SCHEMA_VERSION);
  assert.equal(snapshot.simulationVersion, LOCAL_SIMULATION_VERSION);
  assert.equal(snapshot.seed, 123456);
  assert.equal(snapshot.tick, 45);
  assert.deepEqual(validateMatchReplaySnapshot(snapshot), { valid: true, playerCount: 2, tick: 45 });
});

test("snapshot is detached from live game objects and contains no renderer references", () => {
  const game = makeGame();
  const snapshot = createMatchReplaySnapshot({ seed: 7, game });
  game.players[0].pos.x = 999;
  game.ball.pos.x = 999;
  game.benchPlayers.blue[0].rating = 1;
  assert.equal(snapshot.state.players[0].pos.x, -10);
  assert.equal(snapshot.state.ball.pos.x, -2);
  assert.equal(snapshot.state.benchPlayers.blue[0].rating, 63);
  assert.equal(JSON.stringify(snapshot).includes("visual"), false);
});

test("snapshot preserves pending pass resolution and queued user controls", () => {
  const game = makeGame();
  game.pendingControlledPass = { passer: game.players[0], target: game.players[1], remaining: 2.75 };
  game.controls = {
    joy: { x: 0.6, z: -0.4 }, keys: new Set(["KeyW", "ShiftLeft"]),
    sprintHeld: true, pendingPass: { lofted: false }, pendingPress: true,
    pendingShoot: { power: 0.82 }, pendingLob: false, pendingCallForPass: true,
    role: "FWD", benchMode: false
  };
  const snapshot = createMatchReplaySnapshot({ seed: 12, game });
  assert.deepEqual(snapshot.state.pendingControlledPass, {
    passerId: "blue-1", targetId: "red-1", remaining: 2.75
  });
  assert.deepEqual(snapshot.state.controls, {
    move: { x: 0.6, z: -0.4 }, keys: ["KeyW", "ShiftLeft"],
    sprintHeld: true, pendingPass: { lofted: false }, pendingPress: true,
    pendingShoot: { power: 0.82 }, pendingLob: false, pendingCallForPass: true,
    role: "FWD", benchMode: false
  });
  assert.equal(validateMatchReplaySnapshot(snapshot).valid, true);
});

test("snapshot captures random-initialized player phases and mutable match configuration", () => {
  const snapshot = createMatchReplaySnapshot({ seed: 99, game: makeGame() });
  assert.equal(snapshot.state.players[0].decisionTimer, 0.12);
  assert.equal(snapshot.state.players[1].dribblePhase, 2.25);
  assert.equal(snapshot.state.weather.mode, "rain");
  assert.equal(snapshot.state.weather.rainFrictionFactor, 0.82);
  assert.deepEqual(snapshot.state.ai.attackDirection, { blue: 1, red: -1 });
  assert.equal(snapshot.state.ball.ownerId, "blue-1");
});

test("snapshot validates player references and pending control payloads", () => {
  const snapshot = createMatchReplaySnapshot({ seed: 19, game: makeGame() });
  snapshot.state.ball.ownerId = "missing-player";
  assert.equal(validateMatchReplaySnapshot(snapshot).reason, "INVALID_SNAPSHOT_PLAYER_REFERENCE");

  const pending = createMatchReplaySnapshot({ seed: 20, game: makeGame() });
  pending.state.pendingControlledPass = { passerId: "blue-1", targetId: "missing-player", remaining: 1 };
  assert.equal(validateMatchReplaySnapshot(pending).reason, "INVALID_SNAPSHOT_PENDING_PASS");

  const controls = makeGame();
  controls.controls = {
    joy: { x: 0, z: 0 }, keys: new Set(), sprintHeld: false,
    pendingPass: null, pendingPress: false, pendingShoot: { power: 1.2 },
    pendingLob: false, pendingCallForPass: false, role: "FWD", benchMode: false
  };
  const invalidControls = createMatchReplaySnapshot({ seed: 21, game: controls });
  assert.equal(validateMatchReplaySnapshot(invalidControls).reason, "INVALID_SNAPSHOT_CONTROLS");
});

test("snapshot rejects invalid seed, duplicate player IDs and tampering", () => {
  assert.throws(() => createMatchReplaySnapshot({ seed: -1, game: makeGame() }), /INVALID_MATCH_SEED/);
  const game = makeGame();
  game.players.push({ ...game.players[0] });
  assert.throws(() => createMatchReplaySnapshot({ seed: 1, game }), /DUPLICATE_SNAPSHOT_PLAYER/);
  const snapshot = createMatchReplaySnapshot({ seed: 1, game: makeGame() });
  snapshot.state.players[0].stamina = "not-a-number";
  assert.equal(validateMatchReplaySnapshot(snapshot).valid, false);
});
