import test from "node:test";
import assert from "node:assert/strict";
import { createMatchSeed, createSeededRandom, normalizeMatchSeed } from "../src/deterministic-rng.js";

test("seeded random streams are reproducible and independent", () => {
  const first = createSeededRandom(0x12345678);
  const replay = createSeededRandom(0x12345678);
  const other = createSeededRandom(0x12345679);
  const firstValues = Array.from({ length: 32 }, () => first());
  const replayValues = Array.from({ length: 32 }, () => replay());
  const otherValues = Array.from({ length: 32 }, () => other());
  assert.deepEqual(firstValues, replayValues);
  assert.notDeepEqual(firstValues, otherValues);
  assert.ok(firstValues.every(value => value >= 0 && value < 1));
});

test("match seeds are normalized as unsigned 32-bit integers", () => {
  assert.equal(normalizeMatchSeed(0), 0);
  assert.equal(normalizeMatchSeed(0xffffffff), 0xffffffff);
  assert.throws(() => normalizeMatchSeed(-1), /INVALID_MATCH_SEED/);
  assert.throws(() => normalizeMatchSeed(1.5), /INVALID_MATCH_SEED/);
  assert.throws(() => normalizeMatchSeed(Number.MAX_SAFE_INTEGER), /INVALID_MATCH_SEED/);
});

test("match seed generation uses the supplied cryptographic provider", () => {
  const provider = { getRandomValues(words) { words[0] = 0xfedcba98; return words; } };
  assert.equal(createMatchSeed(provider), 0xfedcba98);
});

test("match seed generation has a valid fallback when crypto is unavailable", () => {
  const seed = createMatchSeed(null);
  assert.ok(Number.isInteger(seed));
  assert.ok(seed >= 0 && seed <= 0xffffffff);
});
