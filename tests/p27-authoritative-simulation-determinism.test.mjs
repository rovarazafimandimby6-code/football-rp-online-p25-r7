import test from "node:test";
import assert from "node:assert/strict";
import { stepRoomSimulation } from "../server/simulation.js";

function makeRoom() {
  const players = new Map();
  for (let index = 0; index < 10; index++) {
    const team = index < 5 ? "blue" : "red";
    const slot = index % 5;
    players.set(`p${index}`, {
      id: `p${index}`,
      team,
      role: slot === 0 ? "GK" : "MID",
      isOnPitch: true,
      connected: true,
      aiControlled: false,
      x: team === "blue" ? -18 + slot * 2 : 18 - slot * 2,
      z: -10 + slot * 5,
      vx: 0,
      vz: 0,
      facing: team === "blue" ? Math.PI / 2 : -Math.PI / 2,
      input: {
        x: slot % 2 === 0 ? 0.6 : -0.25,
        z: slot % 2 === 0 ? -0.2 : 0.75,
        sprint: slot === 2
      },
      stats: {}
    });
  }
  return {
    players,
    ball: {
      x: -0.8, y: 0.36, z: 1.1,
      vx: 8.5, vy: 1.2, vz: -2.4,
      ownerId: null,
      lastTouchTeam: "blue",
      lastTouchPlayerId: "p2",
      previousTouchPlayerId: null,
      pendingPasserId: null,
      lastShotPlayerId: null,
      lastShotTeam: null,
      lastShotAt: null
    },
    score: { blue: 0, red: 0 },
    events: [],
    elapsedMs: 12_000,
    goalPauseMs: 0,
    attackDirection: { blue: 1, red: -1 }
  };
}

function cloneRoom(room) {
  return {
    ...room,
    players: new Map([...room.players].map(([id, player]) => [id, structuredClone(player)])),
    ball: structuredClone(room.ball),
    score: { ...room.score },
    events: structuredClone(room.events),
    attackDirection: { ...room.attackDirection }
  };
}

test("P27 authoritative simulation kernel reproduces identical state for identical snapshots and fixed ticks", () => {
  const initial = makeRoom();
  const first = cloneRoom(initial);
  const second = cloneRoom(initial);

  for (let tick = 0; tick < 90; tick++) {
    stepRoomSimulation(first, 1 / 30);
    stepRoomSimulation(second, 1 / 30);
    first.elapsedMs += 1000 / 30;
    second.elapsedMs += 1000 / 30;
  }

  assert.deepEqual(second, first);
  for (const player of first.players.values()) {
    assert.ok(Number.isFinite(player.x) && Number.isFinite(player.z));
    assert.ok(Number.isFinite(player.vx) && Number.isFinite(player.vz));
  }
  assert.ok(Number.isFinite(first.ball.x) && Number.isFinite(first.ball.y) && Number.isFinite(first.ball.z));
});

test("P27 authoritative simulation kernel clamps oversized frame deltas consistently", () => {
  const oversized = makeRoom();
  const bounded = cloneRoom(oversized);
  stepRoomSimulation(oversized, 0.2);
  stepRoomSimulation(bounded, 0.05);
  assert.deepEqual(oversized, bounded);
});
