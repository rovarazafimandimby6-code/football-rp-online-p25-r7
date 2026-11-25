import test from "node:test";
import assert from "node:assert/strict";
import { D1GoogleIdentityRepository } from "../src/cloudflare/google-identity-repository.js";

const accountA = "123e4567-e89b-42d3-a456-426614174000";
const accountB = "123e4567-e89b-42d3-a456-426614174001";

class FakeD1 {
  constructor() { this.links = []; this.audit = []; }
  prepare(sql) {
    const db = this;
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async first() {
        const [value] = this.values;
        if (sql.includes("WHERE google_subject = ?")) {
          const row = db.links.find(item => item.google_subject === value);
          return row ? { ...row } : null;
        }
        if (sql.includes("WHERE account_id = ?")) {
          const row = db.links.find(item => item.account_id === value);
          return row ? { ...row } : null;
        }
        throw new Error("UNSUPPORTED_FAKE_QUERY");
      },
      async run() {
        const v = this.values;
        if (sql.startsWith("INSERT INTO p27_google_identity_links")) {
          if (db.links.some(row => row.account_id === v[0] || row.google_subject === v[1])) {
            throw new Error("UNIQUE constraint failed");
          }
          db.links.push({ account_id: v[0], google_subject: v[1], linked_at: v[2] });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("INSERT INTO p27_google_identity_audit") && sql.includes("'google_linked'")) {
          db.audit.push({ id: v[0], account_id: v[1], event_type: "google_linked", occurred_at: v[2] });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("UPDATE p27_google_identity_links")) {
          const row = db.links.find(item => item.account_id === v[2] && item.google_subject === v[3]);
          if (!row) return { meta: { changes: 0 } };
          if (db.links.some(item => item.google_subject === v[0] && item !== row)) {
            throw new Error("UNIQUE constraint failed");
          }
          row.google_subject = v[0]; row.linked_at = v[1];
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("INSERT INTO p27_google_identity_audit") && sql.includes("'google_transferred'")) {
          const row = db.links.find(item => item.account_id === v[6] && item.google_subject === v[7] && item.linked_at === v[8]);
          if (row) db.audit.push({ id: v[0], account_id: v[1], event_type: "google_transferred", previous_subject: v[2], new_subject: v[3], occurred_at: v[4] });
          return { meta: { changes: row ? 1 : 0 } };
        }
        throw new Error("UNSUPPORTED_FAKE_WRITE");
      },
    };
  }
  async batch(statements) {
    const before = structuredClone({ links: this.links, audit: this.audit });
    try { return await Promise.all(statements.map(statement => statement.run())); }
    catch (error) { this.links = before.links; this.audit = before.audit; throw error; }
  }
}

const makeRepo = () => {
  const db = new FakeD1();
  return { db, repo: new D1GoogleIdentityRepository(db, { now: () => 1_800_000_000_000 }) };
};

test("D1 Google links require verified identity and enforce one-to-one ownership", async () => {
  const { db, repo } = makeRepo();
  await assert.rejects(repo.linkInitial({ accountId: accountA, googleSubject: "google-subject-0001" }), /GOOGLE_IDENTITY_NOT_VERIFIED/);
  await repo.linkInitial({ accountId: accountA, googleSubject: "google-subject-0001", googleIdentityVerified: true });
  assert.equal((await repo.getByGoogleSubject("google-subject-0001")).accountId, accountA);
  assert.equal((await repo.getByAccountId(accountA)).googleSubject, "google-subject-0001");
  await assert.rejects(repo.linkInitial({ accountId: accountA, googleSubject: "google-subject-0002", googleIdentityVerified: true }), /UNIQUE/);
  await assert.rejects(repo.linkInitial({ accountId: accountB, googleSubject: "google-subject-0001", googleIdentityVerified: true }), /UNIQUE/);
  assert.equal(db.links.length, 1);
  assert.equal(db.audit.length, 1);
});

test("D1 Google transfer requires two verified identities and explicit confirmation", async () => {
  const { db, repo } = makeRepo();
  await repo.linkInitial({ accountId: accountA, googleSubject: "google-subject-0001", googleIdentityVerified: true });
  await assert.rejects(repo.transfer({
    accountId: accountA, currentGoogleSubject: "google-subject-0001",
    newGoogleSubject: "google-subject-0002", currentIdentityVerified: true,
    newIdentityVerified: true,
  }), /GOOGLE_TRANSFER_NOT_CONFIRMED/);
  await repo.transfer({
    accountId: accountA, currentGoogleSubject: "google-subject-0001",
    newGoogleSubject: "google-subject-0002", currentIdentityVerified: true,
    newIdentityVerified: true, confirmed: true,
  });
  assert.equal(await repo.getByGoogleSubject("google-subject-0001"), null);
  assert.equal((await repo.getByGoogleSubject("google-subject-0002")).accountId, accountA);
  assert.equal(db.audit.at(-1).event_type, "google_transferred");
});

test("D1 Google transfer rejects a subject already owned by another P27 account atomically", async () => {
  const { db, repo } = makeRepo();
  await repo.linkInitial({ accountId: accountA, googleSubject: "google-subject-0001", googleIdentityVerified: true });
  await repo.linkInitial({ accountId: accountB, googleSubject: "google-subject-0002", googleIdentityVerified: true });
  const before = structuredClone(db);
  await assert.rejects(repo.transfer({
    accountId: accountA, currentGoogleSubject: "google-subject-0001",
    newGoogleSubject: "google-subject-0002", currentIdentityVerified: true,
    newIdentityVerified: true, confirmed: true,
  }), /UNIQUE/);
  assert.deepEqual(db.links, before.links);
  assert.deepEqual(db.audit, before.audit);
});
