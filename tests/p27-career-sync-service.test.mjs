import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHmac } from "node:crypto";
import { JsonCareerSyncQueue } from "../server/career-sync-queue.js";
import { CareerSyncService } from "../server/career-sync-service.js";

const accountId = "123e4567-e89b-42d3-a456-426614174000";
const secret = "p27-sync-service-test-secret-with-at-least-32-characters";
const event = { accountId, playerId: "FRP-123456", matchId: "room-0001", payload: { matchId: "room-0001", result: "win", stats: {} } };
function setup(now = 1_800_000_000_000) {
  const directory = mkdtempSync(path.join(tmpdir(), "p27-career-sync-service-"));
  const queue = new JsonCareerSyncQueue(directory, { now: () => now });
  queue.enqueue(event);
  return { directory, queue, now };
}
function cleanup(directory) { rmSync(directory, { recursive: true, force: true }); }

test("queue retry metadata persists and delays failed events", () => {
  const { directory, queue, now } = setup();
  try {
    const attempt = queue.markAttempt(accountId, "room-0001");
    assert.equal(attempt.attempts, 1);
    assert.equal(attempt.retryAt, now + 30_000);
    assert.equal(queue.listDue({ now }).length, 0);
    const restarted = new JsonCareerSyncQueue(directory, { now: () => now });
    assert.equal(restarted.listPending()[0].attempts, 1);
    assert.equal(restarted.listDue({ now: now + 30_000 }).length, 1);
  } finally { cleanup(directory); }
});

test("sync service signs and acknowledges a successful server-side insert", async () => {
  const { directory, queue, now } = setup();
  try {
    let received;
    const service = new CareerSyncService(queue, {
      url: "https://p27.example/internal/matches/career", secret, now: () => now,
      fetchImpl: async (url, options) => {
        received = { url, options };
        return new Response(JSON.stringify({ accepted: true, duplicate: false }), { status: 200 });
      },
    });
    const result = await service.flush();
    assert.deepEqual(result, { sent: 1, failed: 0, remaining: 0 });
    const timestamp = Number(received.options.headers["x-p27-signature"].match(/^t=(\d+),/)[1]);
    const expected = createHmac("sha256", secret).update(timestamp + "." + received.options.body).digest("hex");
    assert.equal(received.options.headers["x-p27-signature"], "t=" + timestamp + ",v1=" + expected);
    assert.equal(queue.pendingCount, 0);
  } finally { cleanup(directory); }
});

test("failed network delivery remains queued and receives exponential retry delay", async () => {
  const { directory, queue, now } = setup();
  try {
    const service = new CareerSyncService(queue, {
      url: "https://p27.example/internal/matches/career", secret, now: () => now,
      fetchImpl: async () => new Response("unavailable", { status: 503 }),
    });
    const result = await service.flush();
    assert.equal(result.failed, 1);
    assert.equal(queue.pendingCount, 1);
    assert.equal(queue.listPending()[0].attempts, 1);
    assert.equal(queue.listDue({ now }).length, 0);
  } finally { cleanup(directory); }
});

test("sync service does not transmit when URL or secret is missing", async () => {
  const { directory, queue } = setup();
  try {
    let calls = 0;
    const service = new CareerSyncService(queue, { fetchImpl: async () => { calls++; } });
    assert.equal((await service.flush()).disabled, true);
    assert.equal(calls, 0);
    assert.equal(queue.pendingCount, 1);
  } finally { cleanup(directory); }
});
