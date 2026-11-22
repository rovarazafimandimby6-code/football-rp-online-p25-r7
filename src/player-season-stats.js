const KEY = 'football-rp-online.player-season-stats.v1';
const FIELDS = ['matches','goals','assists','shots','passes','tackles','interceptions','cleanSheets','wins','draws','losses'];
const count = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1_000_000, Math.floor(Number(value)))) : 0;
const blank = () => Object.fromEntries(FIELDS.map(field => [field, 0]));

export function calculateMatchRating(stats = {}, result = 'draw') {
  const goals = count(stats.goals), assists = count(stats.assists);
  const shots = count(stats.shots), passes = count(stats.passes);
  const tackles = count(stats.tackles), interceptions = count(stats.interceptions);
  const accuracy = passes ? Math.min(1, count(stats.completedPasses) / passes) : 0.65;
  let rating = 6 + goals * 0.8 + assists * 0.5 + Math.min(1, shots * 0.12)
    + Math.min(1, tackles * 0.12) + Math.min(1, interceptions * 0.12) + accuracy * 0.6;
  if (result === 'win') rating += 0.35;
  if (result === 'loss') rating -= 0.25;
  return Math.round(Math.max(1, Math.min(10, rating)) * 10) / 10;
}

export class PlayerSeasonStats {
  constructor(storage, key = KEY) {
    if (storage === undefined) { try { storage = globalThis.localStorage; } catch (_) { storage = null; } }
    this.storage = storage; this.key = key; this.totals = blank(); this.matches = []; this.load();
  }
  load() {
    try {
      const data = JSON.parse(this.storage?.getItem(this.key) || 'null');
      if (data && typeof data === 'object') {
        this.totals = { ...blank(), ...Object.fromEntries(FIELDS.map(f => [f, count(data.totals?.[f])])) };
        this.matches = Array.isArray(data.matches) ? data.matches.slice(-100).filter(m => m && typeof m === 'object') : [];
      }
    } catch (_) { this.totals = blank(); this.matches = []; }
    return this.snapshot();
  }
  snapshot() { return { totals: { ...this.totals }, matches: this.matches.map(m => ({ ...m })) }; }
  save() { try { this.storage?.setItem(this.key, JSON.stringify(this.snapshot())); return true; } catch (_) { return false; } }
  recordMatch({ result = 'draw', stats = {}, date = new Date().toISOString() } = {}) {
    if (!['win','draw','loss'].includes(result)) return { ok: false, reason: 'invalid-result' };
    const entry = {};
    for (const field of ['goals','assists','shots','passes','completedPasses','tackles','interceptions']) entry[field] = count(stats[field]);
    entry.rating = calculateMatchRating(entry, result);
    entry.result = result; entry.date = Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : new Date().toISOString();
    this.totals.matches++;
    for (const field of ['goals','assists','shots','passes','tackles','interceptions']) this.totals[field] += entry[field];
    if (result === 'win') this.totals.wins++;
    else if (result === 'draw') this.totals.draws++;
    else this.totals.losses++;
    if (stats.cleanSheet) this.totals.cleanSheets++;
    this.matches.push(entry); this.matches = this.matches.slice(-100); this.save();
    return { ok: true, match: { ...entry }, totals: { ...this.totals } };
  }
}
