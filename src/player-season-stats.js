import { readJsonWithBackup, writeJsonWithBackup } from './persistent-json.js';

const KEY = 'football-rp-online.player-season-stats.v1';
const FIELDS = ['matches','minutesPlayedMs','goals','assists','shots','passes','completedPasses','tackles','interceptions','saves','cleanSheets','wins','draws','losses','playerOfMatch'];
const count = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1_000_000_000, Math.floor(Number(value)))) : 0;
const ratingValue = value => Number.isFinite(Number(value)) ? Math.round(Math.max(1, Math.min(10, Number(value))) * 10) / 10 : null;
const blank = () => Object.fromEntries(FIELDS.map(field => [field, 0]));

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

const normalizeMatch = match => {
  if (!match || typeof match !== 'object' || !['win','draw','loss'].includes(match.result)) return null;
  const stats = Object.fromEntries(['goals','assists','shots','passes','completedPasses','tackles','interceptions','saves'].map(field => [field, count(match[field])]));
  return {
    ...stats, result: match.result, rating: ratingValue(match.rating) ?? calculateMatchRating(stats, match.result),
    minutesPlayedMs: count(match.minutesPlayedMs), role: ['GK','DEF','MID','FWD'].includes(match.role) ? match.role : 'MID',
    cleanSheet: match.cleanSheet === true, playerOfMatch: match.playerOfMatch === true,
    ...(typeof match.matchId === 'string' ? { matchId: match.matchId.slice(0,64) } : {}),
    opponent: typeof match.opponent === 'string' ? match.opponent.replace(/[<>\u0000-\u001f]/g,'').slice(0,48) : '',
    date: Number.isFinite(Date.parse(match.date)) ? new Date(match.date).toISOString() : new Date(0).toISOString()
  };
};
const normalizeSeason = data => {
  if (!data || typeof data !== 'object' || Array.isArray(data) || (!data.totals && !Array.isArray(data.matches))) return null;
  return {
    totals: { ...blank(), ...Object.fromEntries(FIELDS.map(field => [field, count(data.totals?.[field])])) },
    matches: Array.isArray(data.matches) ? data.matches.map(normalizeMatch).filter(Boolean).slice(-200) : [],
    processedMatchIds: Array.isArray(data.processedMatchIds) ? [...new Set(data.processedMatchIds.filter(id => typeof id === 'string' && id.trim()).map(id => id.slice(0,64)))].slice(-2000) : []
  };
};

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
  snapshot() {
    const rated = this.matches.filter(match => Number.isFinite(match.rating));
    return {
      totals: { ...this.totals }, matches: this.matches.map(match => ({ ...match })),
      processedMatchIds: [...this.processedMatchIds],
      averageRating: rated.length ? Math.round(rated.reduce((sum, match) => sum + match.rating, 0) / rated.length * 10) / 10 : null,
      currentForm: this.matches.slice(-5).map(match => ({ result: match.result, rating: match.rating, date: match.date, matchId: match.matchId || null }))
    };
  }
  save() { return writeJsonWithBackup(this.storage, this.key, this.snapshot(), normalizeSeason); }
  recordMatch({ result = 'draw', stats = {}, date = new Date().toISOString(), matchId = null, minutesPlayedMs = 0, role = 'MID', rating = null, playerOfMatch = false, opponent = '' } = {}) {
    if (!['win','draw','loss'].includes(result)) return { ok: false, reason: 'invalid-result' };
    const id = typeof matchId === 'string' ? matchId.trim().slice(0,64) : '';
    if (id && this.processedMatchIds.includes(id)) return { ok: true, duplicate: true, totals: { ...this.totals } };
    const entry = Object.fromEntries(['goals','assists','shots','passes','completedPasses','tackles','interceptions','saves'].map(field => [field, count(stats[field])]));
    Object.assign(entry, {
      rating: ratingValue(rating) ?? calculateMatchRating(entry, result), result,
      ...(id ? { matchId: id } : {}),
      date: Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : new Date().toISOString(),
      minutesPlayedMs: count(minutesPlayedMs), role: ['GK','DEF','MID','FWD'].includes(role) ? role : 'MID',
      cleanSheet: stats.cleanSheet === true, playerOfMatch: playerOfMatch === true,
      opponent: typeof opponent === 'string' ? opponent.replace(/[<>\u0000-\u001f]/g,'').slice(0,48) : ''
    });
    this.totals.matches++; this.totals.minutesPlayedMs += entry.minutesPlayedMs;
    for (const field of ['goals','assists','shots','passes','completedPasses','tackles','interceptions','saves']) this.totals[field] += entry[field];
    if (result === 'win') this.totals.wins++; else if (result === 'draw') this.totals.draws++; else this.totals.losses++;
    if (entry.cleanSheet) this.totals.cleanSheets++;
    if (entry.playerOfMatch) this.totals.playerOfMatch++;
    this.matches.push(entry); this.matches = this.matches.slice(-200);
    if (id) { this.processedMatchIds.push(id); this.processedMatchIds = this.processedMatchIds.slice(-2000); }
    this.save();
    return { ok: true, match: { ...entry }, totals: { ...this.totals }, averageRating: this.snapshot().averageRating };
  }
}
