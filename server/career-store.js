import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const safeCount = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1_000_000_000, Math.floor(Number(value)))) : 0;
const safeRating = value => Number.isFinite(Number(value)) ? Math.round(Math.max(1, Math.min(10, Number(value))) * 10) / 10 : null;
const clean = (value, max = 64) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const emptyTotals = () => ({ matches:0, minutesPlayedMs:0, wins:0, draws:0, losses:0, goals:0, assists:0, shots:0, passes:0, completedPasses:0, tackles:0, interceptions:0, saves:0, cleanSheets:0, playerOfMatch:0 });

/** Account-keyed authoritative career history. Never accepts client-submitted match results. */
export class JsonCareerStore {
  constructor(directory, { maxMatchesPerCareer = 500 } = {}) {
    this.directory = path.resolve(directory);
    this.file = path.join(this.directory, 'careers.json');
    this.maxMatchesPerCareer = Math.max(50, Math.min(2000, Math.floor(maxMatchesPerCareer) || 500));
    mkdirSync(this.directory, { recursive: true });
    this.state = this.read();
  }
  read() {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.careers)) throw new Error('bad schema');
      return { version: 1, playerCareers: Array.isArray(parsed.playerCareers) ? parsed.playerCareers.filter(row => row && typeof row.playerId === 'string' && row.totals && Array.isArray(row.matches)) : [], careers: parsed.careers.filter(row => row && typeof row.accountId === 'string' && row.totals && Array.isArray(row.matches)).map(row => ({ ...row, processedMatchIds: Array.isArray(row.processedMatchIds) ? [...new Set(row.processedMatchIds.filter(id => typeof id === 'string' && id.trim()).map(id => id.slice(0,64)))].slice(-5000) : row.matches.map(match => match.matchId).filter(Boolean) })) };
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, careers: [], playerCareers: [] };
      throw new Error('CAREER_STORE_CORRUPT');
    }
  }
  persist() {
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, JSON.stringify(this.state), { mode: 0o600 }); renameSync(temporary, this.file); }
    catch (error) { try { unlinkSync(temporary); } catch {} throw error; }
  }
  getPlayerCareer(playerId) {
    const id = clean(playerId, 96);
    const row = this.state.playerCareers.find(item => item.playerId === id);
    if (!row) return { player: null, totals: emptyTotals(), matches: [], currentForm: [], averageRating: null };
    const matches = row.matches.map(match => ({ ...match, stats: { ...match.stats } }));
    const rated = matches.filter(match => Number.isFinite(match.rating));
    return {
      player: { name: clean(row.name, 24), role: ['GK','DEF','MID','FWD'].includes(row.role) ? row.role : 'MID', clubName: clean(row.clubName,48) },
      totals: { ...emptyTotals(), ...row.totals }, matches,
      currentForm: matches.slice(-5).map(match => ({ matchId: match.matchId, result: match.result, rating: match.rating, finalizedAt: match.finalizedAt })),
      averageRating: rated.length ? Math.round(rated.reduce((sum, match) => sum + match.rating, 0) / rated.length * 10) / 10 : null
    };
  }
  recordPlayerMatch(playerId, input = {}) {
    const id = clean(playerId, 96), matchId = clean(input.matchId,64);
    if (!id || !matchId || !['win','draw','loss'].includes(input.result)) throw new Error('INVALID_PLAYER_CAREER_MATCH');
    let row = this.state.playerCareers.find(item => item.playerId === id);
    if (row?.processedMatchIds?.includes(matchId)) return { ok:true, duplicate:true, career:this.getPlayerCareer(id) };
    if (!row) {
      row = { playerId:id, name:clean(input.name,24), role:['GK','DEF','MID','FWD'].includes(input.role)?input.role:'MID', clubName:clean(input.clubName,48), totals:emptyTotals(), matches:[], processedMatchIds:[] };
      this.state.playerCareers.push(row);
    } else {
      row.name = clean(input.name,24) || row.name;
      row.role = ['GK','DEF','MID','FWD'].includes(input.role)?input.role:row.role;
      row.clubName = clean(input.clubName,48) || row.clubName;
    }
    const stats = Object.fromEntries(['goals','assists','shots','passes','completedPasses','tackles','interceptions','saves'].map(field => [field,safeCount(input.stats?.[field])]));
    stats.completedPasses = Math.min(stats.passes,stats.completedPasses);
    const entry = { matchId, result:input.result, finalizedAt:Number.isFinite(input.finalizedAt)?input.finalizedAt:Date.now(), teamName:clean(input.teamName,48), opponent:clean(input.opponent,48), role:row.role, minutesPlayedMs:safeCount(input.minutesPlayedMs), rating:safeRating(input.rating), playerOfMatch:input.playerOfMatch===true, stats };
    row.matches.push(entry); row.matches=row.matches.slice(-this.maxMatchesPerCareer);
    row.processedMatchIds=[...row.processedMatchIds,matchId].slice(-5000);
    row.totals.matches++; row.totals.minutesPlayedMs+=entry.minutesPlayedMs;
    row.totals[input.result==='win'?'wins':input.result==='draw'?'draws':'losses']++;
    for (const field of Object.keys(stats)) row.totals[field]+=stats[field];
    if(input.cleanSheet===true) row.totals.cleanSheets++;
    if(entry.playerOfMatch) row.totals.playerOfMatch++;
    this.persist();
    return {ok:true,duplicate:false,career:this.getPlayerCareer(id)};
  }
  get(accountId) {
    const id = clean(accountId, 64);
    const row = this.state.careers.find(item => item.accountId === id);
    if (!row) return { totals: emptyTotals(), matches: [], currentForm: [], averageRating: null };
    const matches = row.matches.map(match => ({ ...match }));
    const rated = matches.filter(match => Number.isFinite(match.rating));
    return {
      totals: { ...emptyTotals(), ...row.totals }, matches,
      currentForm: matches.slice(-5).map(match => ({ matchId: match.matchId, result: match.result, rating: match.rating, finalizedAt: match.finalizedAt })),
      averageRating: rated.length ? Math.round(rated.reduce((sum, match) => sum + match.rating, 0) / rated.length * 10) / 10 : null
    };
  }
  recordMatch(accountId, input = {}) {
    const id = clean(accountId, 64), matchId = clean(input.matchId, 64);
    if (!id || !matchId || !['win','draw','loss'].includes(input.result)) throw new Error('INVALID_CAREER_MATCH');
    let row = this.state.careers.find(item => item.accountId === id);
    if (row?.processedMatchIds.includes(matchId)) return { ok: true, duplicate: true, career: this.get(id) };
    if (!row) { row = { accountId: id, totals: emptyTotals(), matches: [], processedMatchIds: [] }; this.state.careers.push(row); }
    const stats = Object.fromEntries(['goals','assists','shots','passes','completedPasses','tackles','interceptions','saves'].map(field => [field, safeCount(input.stats?.[field])]));
    stats.completedPasses = Math.min(stats.passes, stats.completedPasses);
    const entry = {
      matchId, result: input.result, finalizedAt: Number.isFinite(input.finalizedAt) ? input.finalizedAt : Date.now(),
      teamName: clean(input.teamName, 48), opponent: clean(input.opponent, 48),
      role: ['GK','DEF','MID','FWD'].includes(input.role) ? input.role : 'MID',
      minutesPlayedMs: safeCount(input.minutesPlayedMs), rating: safeRating(input.rating),
      playerOfMatch: input.playerOfMatch === true, stats
    };
    row.matches.push(entry); row.matches = row.matches.slice(-this.maxMatchesPerCareer);
    row.processedMatchIds = [...row.processedMatchIds, matchId].slice(-5000);
    row.totals.matches++;
    row.totals.minutesPlayedMs += entry.minutesPlayedMs;
    row.totals[input.result === 'win' ? 'wins' : input.result === 'draw' ? 'draws' : 'losses']++;
    for (const field of Object.keys(stats)) row.totals[field] += stats[field];
    if (input.cleanSheet === true) row.totals.cleanSheets++;
    if (entry.playerOfMatch) row.totals.playerOfMatch++;
    this.persist();
    return { ok: true, duplicate: false, career: this.get(id) };
  }
}
