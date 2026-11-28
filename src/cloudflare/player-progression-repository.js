const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATTRIBUTES = Object.freeze({ pace: 55, shooting: 50, passing: 50, defense: 45, stamina: 55, control: 50 });
const clampInt = (value, min, max, fallback = min) => Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Math.round(Number(value)))) : fallback;
const emptyProgression = () => ({ level: 1, experience: 0, coins: 250, trainingPoints: 0, attributes: { ...ATTRIBUTES }, processedMatchIds: [] });

function normalize(row, processedMatchIds = []) {
  let attrs = {};
  try { attrs = JSON.parse(row?.attributes_json || "{}"); } catch { throw new Error("PROGRESSION_STORE_CORRUPT"); }
  const level = clampInt(row?.level, 1, 99, 1);
  return {
    level,
    experience: level >= 99 ? 0 : clampInt(row?.experience, 0, 1_000_000_000),
    coins: clampInt(row?.coins, 0, 1_000_000_000, 250),
    trainingPoints: clampInt(row?.training_points, 0, 100_000),
    attributes: Object.fromEntries(Object.keys(ATTRIBUTES).map(key => [key, clampInt(attrs[key], 1, 99, ATTRIBUTES[key])])),
    processedMatchIds,
  };
}

function addExperience(state, amount) {
  state.experience = Math.min(1_000_000_000, state.experience + amount);
  while (state.level < 99 && state.experience >= state.level * 100) {
    state.experience -= state.level * 100;
    state.level++;
    state.trainingPoints += 2;
    state.coins = Math.min(1_000_000_000, state.coins + 50);
  }
  if (state.level >= 99) state.experience = 0;
}

function accountIdOrThrow(value) {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new Error("INVALID_ACCOUNT_ID");
  return value;
}

/** D1 progression repository. Match rewards are idempotent and must be called only by trusted match authority. */
export class D1PlayerProgressionRepository {
  constructor(db, { now = () => Date.now() } = {}) {
    if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") throw new Error("D1_DATABASE_BINDING_REQUIRED");
    this.db = db;
    this.now = now;
  }

  async ensure(accountId) {
    accountIdOrThrow(accountId);
    await this.db.prepare(
      "INSERT INTO p27_player_progression (account_id, attributes_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(account_id) DO NOTHING"
    ).bind(accountId, JSON.stringify(ATTRIBUTES), new Date(this.now()).toISOString()).run();
  }

  async hasMatchEvent(accountId, matchId) {
    const row = await this.db.prepare(
      "SELECT 1 AS applied FROM p27_progression_match_events WHERE account_id = ? AND match_id = ?"
    ).bind(accountId, matchId).first();
    return Boolean(row);
  }

  async get(accountId) {
    accountIdOrThrow(accountId);
    const row = await this.db.prepare(
      "SELECT level, experience, coins, training_points, attributes_json, revision FROM p27_player_progression WHERE account_id = ?"
    ).bind(accountId).first();
    if (!row) return { progression: emptyProgression(), revision: 0 };
    const events = await this.db.prepare(
      "SELECT match_id FROM p27_progression_match_events WHERE account_id = ? ORDER BY applied_at DESC LIMIT 2000"
    ).bind(accountId).all();
    const ids = (events?.results || []).map(item => item.match_id).reverse();
    return { progression: normalize(row, ids), revision: Number(row.revision) };
  }

  async grantMatchReward(accountId, { matchId, result, minutesPlayedMs = 0, rating = null } = {}) {
    accountIdOrThrow(accountId);
    const id = typeof matchId === "string" ? matchId.trim().slice(0, 64) : "";
    if (!id || !["win", "draw", "loss"].includes(result)) throw new Error("INVALID_MATCH_REWARD");
    const minutes = clampInt(minutesPlayedMs, 0, 600_000) / 60_000;
    const score = Number.isFinite(Number(rating)) ? Math.max(1, Math.min(10, Number(rating))) : 5;
    const experience = Math.round(20 + minutes * 12 + score * 3);
    const coins = Math.round(8 + (result === "win" ? 18 : result === "draw" ? 10 : 4) + score * 2);
    await this.ensure(accountId);

    for (let attempt = 0; attempt < 4; attempt++) {
      const current = await this.get(accountId);
      if (current.progression.processedMatchIds.includes(id) || await this.hasMatchEvent(accountId, id)) {
        return { duplicate: true, progression: current.progression, reward: { experience: 0, coins: 0 }, revision: current.revision };
      }
      const next = structuredClone(current.progression);
      addExperience(next, experience);
      next.coins = Math.min(1_000_000_000, next.coins + coins);
      const now = new Date(this.now()).toISOString();
      const results = await this.db.batch([
        this.db.prepare(
          "UPDATE p27_player_progression SET level = ?, experience = ?, coins = ?, training_points = ?, attributes_json = ?, revision = revision + 1, updated_at = ? " +
          "WHERE account_id = ? AND revision = ? AND NOT EXISTS (SELECT 1 FROM p27_progression_match_events WHERE account_id = ? AND match_id = ?)"
        ).bind(next.level, next.experience, next.coins, next.trainingPoints, JSON.stringify(next.attributes), now, accountId, current.revision, accountId, id),
        this.db.prepare(
          "INSERT OR IGNORE INTO p27_progression_match_events (account_id, match_id, experience_awarded, coins_awarded, applied_at) " +
          "SELECT ?, ?, ?, ?, ? WHERE changes() = 1"
        ).bind(accountId, id, experience, coins, now),
      ]);
      if (Number(results?.[0]?.meta?.changes) === 1) {
        next.processedMatchIds = [...current.progression.processedMatchIds, id].slice(-2000);
        return { duplicate: false, progression: next, reward: { experience, coins }, revision: current.revision + 1 };
      }
    }
    const latest = await this.get(accountId);
    if (latest.progression.processedMatchIds.includes(id) || await this.hasMatchEvent(accountId, id)) {
      return { duplicate: true, progression: latest.progression, reward: { experience: 0, coins: 0 }, revision: latest.revision };
    }
    throw new Error("PROGRESSION_CONCURRENT_UPDATE");
  }

  async spend(accountId, attribute, amount = 1, mode = "training") {
    accountIdOrThrow(accountId);
    if (!Object.hasOwn(ATTRIBUTES, attribute)) throw new Error("INVALID_ATTRIBUTE");
    const points = clampInt(amount, 1, mode === "practice" ? 3 : 5, 1);
    if (!(["training", "practice"].includes(mode))) throw new Error("INVALID_PROGRESSION_MODE");
    await this.ensure(accountId);
    const cost = points * (mode === "practice" ? 80 : 40);
    for (let attempt = 0; attempt < 4; attempt++) {
      const current = await this.get(accountId);
      const p = current.progression;
      if (p.attributes[attribute] + points > 99) return { ok: false, reason: "ATTRIBUTE_CAP", ...current };
      if (p.coins < cost || (mode === "training" && p.trainingPoints < points)) {
        return { ok: false, reason: mode === "training" ? "INSUFFICIENT_RESOURCES" : "INSUFFICIENT_COINS", ...current };
      }
      const next = structuredClone(p);
      next.attributes[attribute] += points;
      next.coins -= cost;
      if (mode === "training") next.trainingPoints -= points;
      else addExperience(next, points * 25);
      const updatedAt = new Date(this.now()).toISOString();
      const result = await this.db.prepare(
        "UPDATE p27_player_progression SET level = ?, experience = ?, coins = ?, training_points = ?, attributes_json = ?, revision = revision + 1, updated_at = ? WHERE account_id = ? AND revision = ?"
      ).bind(next.level, next.experience, next.coins, next.trainingPoints, JSON.stringify(next.attributes), updatedAt, accountId, current.revision).run();
      if (Number(result?.meta?.changes) === 1) {
        return { ok: true, attribute, value: next.attributes[attribute], spentCoins: cost, progression: next, revision: current.revision + 1 };
      }
    }
    throw new Error("PROGRESSION_CONCURRENT_UPDATE");
  }
}
