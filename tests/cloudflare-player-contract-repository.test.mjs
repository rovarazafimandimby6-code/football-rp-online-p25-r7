import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { D1PlayerContractRepository } from "../src/cloudflare/player-contract-repository.js";

const accountId = "123e4567-e89b-42d3-a456-426614174000";
const otherAccountId = "123e4567-e89b-42d3-a456-426614174002";
const playerId = "FRP-123456";
const migration = readFileSync(fileURLToPath(new URL("../migrations/d1/0008_player_contracts.sql", import.meta.url)), "utf8");

class SqliteD1 {
  constructor(db) { this.db = db; }
  prepare(sql) {
    const statement = this.db.prepare(sql);
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async first() { return statement.get(...this.values) ?? null; },
      async all() { return { results: statement.all(...this.values) }; },
      async run() { const result = statement.run(...this.values); return { meta: { changes: Number(result.changes) } }; },
    };
  }
  close() { this.db.close(); }
}
function createRepository() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;" +
    "CREATE TABLE p27_accounts (id TEXT PRIMARY KEY);" +
    "CREATE TABLE p27_player_identities (account_id TEXT PRIMARY KEY REFERENCES p27_accounts(id), player_id TEXT NOT NULL UNIQUE);" +
    "INSERT INTO p27_accounts (id) VALUES ('" + accountId + "');" +
    "INSERT INTO p27_accounts (id) VALUES ('" + otherAccountId + "');" +
    "INSERT INTO p27_player_identities (account_id, player_id) VALUES ('" + accountId + "', '" + playerId + "');");
  sqlite.exec(migration);
  const db = new SqliteD1(sqlite);
  return { db, repository: new D1PlayerContractRepository(db) };
}
const contract = (overrides = {}) => ({
  playerId, clubId: "club-a", status: "active", salary: 500,
  signedAt: "2027-01-01T00:00:00.000Z", expiresAt: "2027-06-30T00:00:00.000Z",
  ...overrides,
});
const event = (overrides = {}) => ({
  eventId: "contract-event-0001", eventType: "signing",
  expectedRevision: 0, occurredAt: 1_800_000_000_000, contract: contract(),
  ...overrides,
});

test("D1 contract event atomically creates current state and immutable revision history", async () => {
  const { db, repository } = createRepository();
  try {
    const result = await repository.applyEvent(accountId, playerId, event());
    assert.equal(result.duplicate, false);
    assert.equal(result.current.revision, 1);
    assert.equal(result.current.status, "active");
    assert.equal(result.current.clubId, "club-a");
    assert.equal(result.current.contract.salary, 500);
    const history = await repository.getHistory(accountId);
    assert.equal(history.events.length, 1);
    assert.equal(history.events[0].eventType, "signing");
    assert.equal(history.events[0].revision, 1);
  } finally { db.close(); }
});

test("replayed contract event is idempotent and does not create a second revision", async () => {
  const { db, repository } = createRepository();
  try {
    await repository.applyEvent(accountId, playerId, event());
    const replay = await repository.applyEvent(accountId, playerId, event());
    assert.equal(replay.duplicate, true);
    assert.equal(replay.current.revision, 1);
    assert.equal((await repository.getHistory(accountId)).events.length, 1);
  } finally { db.close(); }
});

test("stale contract revision is rejected instead of overwriting newer state", async () => {
  const { db, repository } = createRepository();
  try {
    await repository.applyEvent(accountId, playerId, event());
    await assert.rejects(repository.applyEvent(accountId, playerId, event({
      eventId: "contract-event-0002", eventType: "renewal", expectedRevision: 0,
      contract: contract({ salary: 900 }),
    })), /CONTRACT_REVISION_CONFLICT/);
    const current = await repository.getCurrent(accountId);
    assert.equal(current.revision, 1);
    assert.equal(current.contract.salary, 500);
  } finally { db.close(); }
});

test("renewal advances revision and history cursor pages without losing events", async () => {
  const { db, repository } = createRepository();
  try {
    await repository.applyEvent(accountId, playerId, event());
    await repository.applyEvent(accountId, playerId, event({
      eventId: "contract-event-0002", eventType: "renewal", expectedRevision: 1,
      occurredAt: 1_800_000_000_100, contract: contract({ salary: 900 }),
    }));
    const first = await repository.getHistory(accountId, { limit: 1 });
    assert.equal(first.events[0].revision, 2);
    assert.equal(first.nextCursor, 2);
    const second = await repository.getHistory(accountId, { limit: 1, beforeRevision: first.nextCursor });
    assert.equal(second.events[0].revision, 1);
    assert.equal(second.nextCursor, null);
    assert.equal((await repository.getCurrent(accountId)).contract.salary, 900);
  } finally { db.close(); }
});

test("contract repository rejects account/player identity mismatch", async () => {
  const { db, repository } = createRepository();
  try {
    await assert.rejects(repository.applyEvent(otherAccountId, playerId, event()), /PLAYER_IDENTITY_MISMATCH/);
  } finally { db.close(); }
});

test("contract termination stores free-agent state without deleting history", async () => {
  const { db, repository } = createRepository();
  try {
    await repository.applyEvent(accountId, playerId, event());
    const terminated = await repository.applyEvent(accountId, playerId, event({
      eventId: "contract-event-0002", eventType: "termination", expectedRevision: 1,
      occurredAt: 1_800_000_000_100, contract: null,
    }));
    assert.equal(terminated.current.status, "free-agent");
    assert.equal(terminated.current.contract, null);
    assert.equal((await repository.getHistory(accountId)).events.length, 2);
  } finally { db.close(); }
});


test("contract repository rejects a payload bound to another player identity", async () => {
  const { db, repository } = createRepository();
  try {
    await assert.rejects(repository.applyEvent(accountId, playerId, event({
      contract: contract({ playerId: "FRP-654321" }),
    })), /PLAYER_IDENTITY_MISMATCH/);
    assert.equal(await repository.getCurrent(accountId), null);
  } finally { db.close(); }
});

test("contract event identifiers are validated rather than silently sanitized", async () => {
  const { db, repository } = createRepository();
  try {
    await assert.rejects(repository.applyEvent(accountId, playerId, event({ eventId: "event<1>" })), /INVALID_CONTRACT_EVENT/);
    await assert.rejects(repository.applyEvent(accountId, playerId, event({ eventId: " event-1 " })), /INVALID_CONTRACT_EVENT/);
    assert.equal(await repository.getCurrent(accountId), null);
  } finally { db.close(); }
});

test("contract repository rejects malformed club identifiers and status whitespace", async () => {
  const { db, repository } = createRepository();
  try {
    await assert.rejects(repository.applyEvent(accountId, playerId, event({
      contract: contract({ clubId: "club<evil>" }),
    })), /INVALID_PLAYER_CONTRACT/);
    await assert.rejects(repository.applyEvent(accountId, playerId, event({
      contract: contract({ status: " active " }),
    })), /INVALID_PLAYER_CONTRACT/);
    assert.equal(await repository.getCurrent(accountId), null);
  } finally { db.close(); }
});
