import test from "node:test";
import assert from "node:assert/strict";
import { D1PlayerProfileRepository, normalizePlayerProfile } from "../src/cloudflare/player-profile-repository.js";

const accountId = "123e4567-e89b-42d3-a456-426614174000";
const profileInput = {
  identity: { displayName: "  Rova <script>", number: 120, preferredFoot: "both", role: "FWD" },
  appearance: { kit: "crimson", skinTone: "dark", hairStyle: "fade", hairColor: "brown", bodyBuild: "lean", faceShape: "angular", eyeShape: "hooded" },
};

class ProfileD1 {
  constructor() { this.row = null; }
  prepare(sql) {
    const db = this;
    return {
      values: [], bind(...values) { this.values = values; return this; },
      async first() {
        if (sql.startsWith("SELECT profile_json")) return db.row ? { ...db.row } : null;
        if (sql.startsWith("INSERT INTO p27_player_profiles")) {
          const [id, json, updatedAt, expected] = this.values;
          if (!db.row && expected === 0) db.row = { profile_json: json, revision: 1, updated_at: updatedAt };
          else if (db.row && db.row.revision === expected) db.row = { profile_json: json, revision: db.row.revision + 1, updated_at: updatedAt };
          else return null;
          return { ...db.row };
        }
        throw new Error("UNEXPECTED_QUERY");
      },
    };
  }
}

test("profile normalization preserves the existing player-profile schema and clamps unsafe values", () => {
  const profile = normalizePlayerProfile(profileInput, () => Date.parse("2026-11-25T12:00:00.000Z"));
  assert.equal(profile.schemaVersion, 1);
  assert.equal(profile.identity.displayName, "Rova script");
  assert.equal(profile.identity.number, 99);
  assert.equal(profile.identity.role, "FWD");
  assert.equal(profile.identity.preferredFoot, "both");
  assert.equal(profile.appearance.kit, "crimson");
  assert.equal(profile.appearance.faceShape, "angular");
  assert.equal(profile.appearance.eyeShape, "hooded");
  assert.equal(profile.updatedAt, "2026-11-25T12:00:00.000Z");
});

test("D1 profile repository creates revision 1 and reads an empty profile without fabricating data", async () => {
  const repository = new D1PlayerProfileRepository(new ProfileD1(), { now: () => Date.parse("2026-11-25T12:00:00.000Z") });
  assert.deepEqual(await repository.get(accountId), { profile: null, revision: 0, updatedAt: null });
  const saved = await repository.save(accountId, profileInput, 0);
  assert.equal(saved.revision, 1);
  assert.equal(saved.profile.identity.number, 99);
  assert.equal((await repository.get(accountId)).revision, 1);
});

test("D1 profile repository increments revisions and rejects stale writes without overwriting newer data", async () => {
  const repository = new D1PlayerProfileRepository(new ProfileD1());
  await repository.save(accountId, profileInput, 0);
  const newer = await repository.save(accountId, { identity: { displayName: "Nouvelle carrière" } }, 1);
  assert.equal(newer.revision, 2);
  await assert.rejects(repository.save(accountId, profileInput, 1), error => {
    assert.equal(error.message, "PROFILE_REVISION_CONFLICT");
    assert.equal(error.currentRevision, 2);
    return true;
  });
  assert.equal((await repository.get(accountId)).profile.identity.displayName, "Nouvelle carrière");
});

test("D1 profile repository rejects invalid revisions and malformed account identifiers", async () => {
  const repository = new D1PlayerProfileRepository(new ProfileD1());
  await assert.rejects(repository.save(accountId, profileInput, -1), /INVALID_PROFILE_REVISION/);
  await assert.rejects(repository.get("not-an-account"), /INVALID_ACCOUNT_ID/);
});
