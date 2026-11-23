import { readJsonWithBackup, writeJsonWithBackup } from './persistent-json.js';

const KEY = 'football-rp-online.player-season-stats.v1';
const FIELDS = ['matches','goals','assists','shots','passes','tackles','interceptions','cleanSheets','wins','draws','losses'];
const count = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1_000_000, Math.floor(Number(value)))) : 0;
const blank = () => Object.fromEntries(FIELDS.map(field => [field, 0]));
const normalizeSeason = data => {
  if (!data || typeof data !== 'object' || Array.isArray(data) || (!data.totals && !Array.isArray(data.matches))) return null;
  return { totals: { ...blank(), ...Object.fromEntries(FIELDS.map(field => [field, count(data.totals?.[field])])) }, matches: Array.isArray(data.matches) ? data.matches.filter(match => match && typeof match === 'object' && ['win','draw','loss'].includes(match.result)).slice(-100).map(match => ({ ...match })) : [], processedMatchIds: Array.isArray(data.processedMatchIds) ? [...new Set(data.processedMatchIds.filter(id => typeof id === 'string' && id.trim()).map(id => id.slice(0, 64)))].slice(-2000) : [] };
};

export function calculateMatchRating(stats = {}, result = 'draw') {
  const goals = count(stats.goals), assists = count(stats.assists);
  const shots = count(stats.shots), passes = count(stats.passes);
  const tackles = count(stats.tackles), interceptions = count(stats.interceptions);
  const hasCompletionData = stats.completedPasses !== undefined && stats.completedPasses !== null && Number.isFinite(Number(stats.completedPasses));
  const accuracy = passes && hasCompletionData ? Math.min(1, count(stats.completedPasses) / passes) : 0.65;
  let rating = 6 + goals * 0.8 + assists * 0.5 + Math.min(1, shots * 0.12)
    + Math.min(1, tackles * 0.12) + Math.min(1, interceptions * 0.12) + accuracy * 0.6;
  if (result === 'win') rating += 0.35;
  if (result === 'loss') rating -= 0.25;
  return Math.round(Math.max(1, Math.min(10, rating)) * 10) / 10;
}

export class PlayerSeasonStats {
  constructor(storage, key = KEY) {
    if (storage === undefined) { try { storage = globalThis.localStorage; } catch (_) { storage = null; } }
    this.storage = storage; this.key = key; this.totals = blank(); this.matches = []; this.processedMatchIds = []; this.load();
  }
  load() {
    const data = readJsonWithBackup(this.storage, this.key, normalizeSeason);
    this.totals = data?.totals || blank(); this.matches = data?.matches || []; this.processedMatchIds = data?.processedMatchIds || [];
    return this.snapshot();
  }
  snapshot() { return { totals: { ...this.totals }, matches: this.matches.map(m => ({ ...m })), processedMatchIds: [...this.processedMatchIds] }; }
  save() { return writeJsonWithBackup(this.storage, this.key, this.snapshot(), normalizeSeason); }
  recordMatch({ result = 'draw', stats = {}, date = new Date().toISOString(), matchId = null } = {}) {
    if (!['win','draw','loss'].includes(result)) return { ok: false, reason: 'invalid-result' };
    const id = typeof matchId === 'string' ? matchId.trim().slice(0, 64) : '';
    if (id && this.processedMatchIds.includes(id)) return { ok: true, duplicate: true, totals: { ...this.totals } };
    const entry = {};
    for (const field of ['goals','assists','shots','passes','completedPasses','tackles','interceptions']) entry[field] = count(stats[field]);
    entry.rating = calculateMatchRating(entry, result);
    entry.result = result; if (id) entry.matchId = id; entry.date = Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : new Date().toISOString();
    this.totals.matches++;
    for (const field of ['goals','assists','shots','passes','tackles','interceptions']) this.totals[field] += entry[field];
    if (result === 'win') this.totals.wins++;
    else if (result === 'draw') this.totals.draws++;
    else this.totals.losses++;
    if (stats.cleanSheet) this.totals.cleanSheets++;
    this.matches.push(entry); this.matches = this.matches.slice(-100);
    if (id) { this.processedMatchIds.push(id); this.processedMatchIds = this.processedMatchIds.slice(-2000); }
    this.save();
    return { ok: true, match: { ...entry }, totals: { ...this.totals } };
  }
}
