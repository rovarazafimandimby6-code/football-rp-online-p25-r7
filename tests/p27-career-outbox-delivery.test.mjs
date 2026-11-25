import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonCareerStore } from "../server/career-store.js";
import { CareerStoreSyncQueue } from "../server/career-sync-queue.js";
import { CareerSyncService } from "../server/career-sync-service.js";

const accountId = "123e4567-e89b-42d3-a456-426614174000";
const playerId = "FRP-123456";
const secret = "p27-integrated-outbox-delivery-test-secret-32-characters";
const now = 1_800_000_000_000;
const match = {
  matchId: "room-integrated-delivery-01",
  result: "win",
  finalizedAt: now,
  name: "Joueur test",
  role: "MID",
  teamName: "Club test",
  opponent: "Club adverse",
  clubName: "Club test",
  minutesPlayedMs: 120_000,
  rating: 8.1,
  stats: { goals: 1, assists: 1, shots: 3, passes: 18, completedPasses: 15, tackles: 2, interceptions: 1, saves: 0 },
};

function fixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "p27-integrated-outbox-delivery-"));
  const store = new JsonCareerStore(directory);
  store.recordFinalizedMatch(accountId, playerId, match, {
    syncEvent: { accountId, playerId, matchId: match.matchId, payload: match },
  });
  const queue = new CareerStoreSyncQueue(store, { now: () => now });
  return { directory, store, queue, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

test("integrated career outbox sends the Worker contract and acknowledges only its accepted response", async () => {
  const f = fixture();
  try {
    let request;
    const service = new CareerSyncService(f.queue, {
      url: "https://p27.example/internal/matches/career",
      secret,
      now: () => now,
      fetchImpl: async (url, options) => {
        request = { url, options };
        return new Response(JSON.stringify({ accepted: true, duplicate: false, revision: 1 }), { status: 200 });
      },
    });

    const result = await service.flush();
    assert.deepEqual(result, { sent: 1, failed: 0, remaining: 0 });
    assert.equal(request.url, "https://p27.example/internal/matches/career");

    const body = JSON.parse(request.options.body);
    assert.deepEqual(body, { accountId, playerId, match });
    const timestamp = Number(request.options.headers["x-p27-signature"].match(/^t=(\d+),/)[1]);
    const digest = createHmac("sha256", secret).update(timestamp + "." + request.options.body).digest("hex");
    assert.equal(request.options.headers["x-p27-signature"], "t=" + timestamp + ",v1=" + digest);

    assert.equal(f.store.getPlayerCareer(playerId).totals.matches, 1);
    assert.equal(f.store.get(accountId).totals.matches, 1);
    assert.equal(f.queue.pendingCount, 0);
    assert.equal(new JsonCareerStore(f.directory).pendingCloudMatchCount, 0);
  } finally {
    f.cleanup();
  }
});

test("integrated career outbox retains the event and persists retry metadata when Worker does not accept it", async () => {
  const f = fixture();
  try {
    const service = new CareerSyncService(f.queue, {
      url: "https://p27.example/internal/matches/career",
      secret,
      now: () => now,
      fetchImpl: async () => new Response(JSON.stringify({ accepted: false }), { status: 409 }),
    });

    const result = await service.flush();
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 1);
    assert.equal(f.queue.pendingCount, 1);
    assert.equal(f.queue.listPending()[0].attempts, 1);
    assert.equal(f.queue.listDue({ now }).length, 0);

    const restarted = new JsonCareerStore(f.directory);
    assert.equal(restarted.pendingCloudMatchCount, 1);
    assert.equal(restarted.listPendingCloudMatches()[0].nextAttemptAt, now + 30_000);
    assert.equal(restarted.getPlayerCareer(playerId).totals.matches, 1);
  } finally {
    f.cleanup();
  }
});
