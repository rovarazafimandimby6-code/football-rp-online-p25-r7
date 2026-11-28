/**
 * Small deterministic PRNG for replayable match simulations.
 * The caller owns seed creation and persistence; this module has no gameplay side effects.
 */
export function normalizeMatchSeed(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error("INVALID_MATCH_SEED");
  }
  return value >>> 0;
}

/** Mulberry32: deterministic 32-bit stream with a compact, dependency-free implementation. */
export function createSeededRandom(seed) {
  let state = normalizeMatchSeed(seed);
  return function random() {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14) >>> 0) >>> 0) / 4294967296;
  };
}

/** Creates a seed once at match creation; replay code must persist and reuse this value. */
export function createMatchSeed(cryptoProvider = globalThis.crypto) {
  if (cryptoProvider && typeof cryptoProvider.getRandomValues === "function") {
    const words = new Uint32Array(1);
    cryptoProvider.getRandomValues(words);
    return words[0] >>> 0;
  }
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
