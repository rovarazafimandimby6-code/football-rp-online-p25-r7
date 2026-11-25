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
      return { version: 1, pendingCloudMatches: Array.isArray(parsed.pendingCloudMatches) ? parsed.pendingCloudMatches.map(item => ({ ...item, attempts: Number.isSafeInteger(item?.attempts) && item.attempts >= 0 ? item.attempts : 0, nextAttemptAt: Number.isSafeInteger(item?.nextAttemptAt) && item.nextAttemptAt >= 0 ? item.nextAttemptAt : 0 })) : [], playerCareers: Array.isArray(parsed.playerCareers) ? parsed.playerCareers.filter(row => row && typeof row.playerId === 'string' && row.totals && Array.isArray(row.matches)) : [], careers: parsed.careers.filter(row => row && typeof row.accountId === 'string' && row.totals && Array.isArray(row.matches)).map(row => ({ ...row, processedMatchIds: Array.isArray(row.processedMatchIds) ? [...new Set(row.processedMatchIds.filter(id => typeof id === 'string' && id.trim()).map(id => id.slice(0,64)))].slice(-5000) : row.matches.map(match => match.matchId).filter(Boolean) })) };
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, careers: [], playerCareers: [], pendingCloudMatches: [] };
      throw new Error('CAREER_STORE_CORRUPT');
    }
  }
  persist() {
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, JSON.stringify(this.state), { mode: 0o600 }); renameSync(temporary, this.file); }
    catch (error) { try { unlinkSync(temporary); } catch {} throw error; }
  }
  transaction(mutator) {
    const previous = this.state;
    this.state = structuredClone(previous);
    try {
      const outcome = mutator();
      if (outcome.persist === false) { this.state = previous; return outcome.value; }
      this.persist();
      return outcome.value;
    } catch (error) { this.state = previous; throw error; }
  }
  getPlayerCareer(playerId) {
    const id = clean(playerId, 96);
    const row = this.state.playerCareers.find(item => item.playerId === id);
    if (!row) return { player: null, totals: emptyTotals(), matches: [], currentForm: [], averageRating: null };
    const matches = row.matches.map(match => ({ ...match, stats: { ...match.stats } }));
    const rated = matches.filter(match => Number.isFinite(match.rating));
    const clubs = new Map();
    for (const match of matches) {
      const clubName = clean(match.teamName, 48);
      if (!clubName) continue;
      const history = clubs.get(clubName) || { clubName, appearances: 0, firstMatchAt: match.finalizedAt, lastMatchAt: match.finalizedAt };
      history.appearances++;
      history.firstMatchAt = Math.min(history.firstMatchAt, match.finalizedAt);
      history.lastMatchAt = Math.max(history.lastMatchAt, match.finalizedAt);
      clubs.set(clubName, history);
    }
    return {
      player: { name: clean(row.name, 24), role: ['GK','DEF','MID','FWD'].includes(row.role) ? row.role : 'MID', clubName: clean(row.clubName,48) },
      totals: { ...emptyTotals(), ...row.totals }, matches, clubHistory: [...clubs.values()],
      currentForm: matches.slice(-5).map(match => ({ matchId: match.matchId, result: match.result, rating: match.rating, finalizedAt: match.finalizedAt })),
      averageRating: rated.length ? Math.round(rated.reduce((sum, match) => sum + match.rating, 0) / rated.length * 10) / 10 : null
    };
  }
  recordPlayerMatch(playerId, input = {}) {
    const id = clean(playerId, 96), matchId = clean(input.matchId,64);
    if (!id || !matchId || !['win','draw','loss'].includes(input.result)) throw new Error('INVALID_PLAYER_CAREER_MATCH');
    return this.transaction(() => {
      let row = this.state.playerCareers.find(item => item.playerId === id);
      if (row?.processedMatchIds?.includes(matchId)) return { persist:false, value:{ ok:true, duplicate:true, career:this.getPlayerCareer(id) } };
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
      const entry = { matchId, result:input.result, finalizedAt:Number.isFinite(input.finalizedAt)?input.finalizedAt:Date.now(), teamName:clean(input.teamName,48), opponent:clean(input.opponent,48), role:row.role, minutesPlayedMs:safeCount(input.minutesPlayedMs), rating:safeRating(input.rating), cleanSheet:input.cleanSheet===true, playerOfMatch:input.playerOfMatch===true, stats };
      row.matches.push(entry); row.matches=row.matches.slice(-this.maxMatchesPerCareer);
      row.processedMatchIds=[...row.processedMatchIds,matchId].slice(-5000);
      row.totals.matches++; row.totals.minutesPlayedMs+=entry.minutesPlayedMs;
      row.totals[input.result==='win'?'wins':input.result==='draw'?'draws':'losses']++;
      for (const field of Object.keys(stats)) row.totals[field]+=stats[field];
      if(input.cleanSheet===true) row.totals.cleanSheets++;
      if(entry.playerOfMatch) row.totals.playerOfMatch++;
      return { value:{ok:true,duplicate:false,career:this.getPlayerCareer(id)} };
    });
  }

  recordFinalizedMatch(accountId, playerId, input = {}, { syncEvent = null } = {}) {
    const playerKey = clean(playerId, 96), accountKey = clean(accountId, 64), matchId = clean(input.matchId, 64);
    if (!playerKey || !matchId || !['win','draw','loss'].includes(input.result)) throw new Error('INVALID_PLAYER_CAREER_MATCH');
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const PLAYER_ID_RE = /^FRP-[0-9]{6}$/;
    const cloudEligible = Boolean(syncEvent && accountKey && UUID_RE.test(accountKey) && PLAYER_ID_RE.test(syncEvent.playerId || '') &&
      syncEvent.playerId === playerKey && syncEvent.matchId === matchId && syncEvent.payload &&
      syncEvent.payload.matchId === matchId && ['win','draw','loss'].includes(syncEvent.payload.result));
    return this.transaction(() => {
      let playerRow = this.state.playerCareers.find(item => item.playerId === playerKey);
      let accountRow = accountKey ? this.state.careers.find(item => item.accountId === accountKey) : null;
      const playerDuplicate = Boolean(playerRow?.processedMatchIds?.includes(matchId) || playerRow?.matches?.some(match => match.matchId === matchId));
      const accountDuplicate = Boolean(accountRow?.processedMatchIds?.includes(matchId) || accountRow?.matches?.some(match => match.matchId === matchId));
      const stats = Object.fromEntries(['goals','assists','shots','passes','completedPasses','tackles','interceptions','saves'].map(field => [field, safeCount(input.stats?.[field])]));
      stats.completedPasses = Math.min(stats.passes, stats.completedPasses);
      const finalizedAt = Number.isFinite(input.finalizedAt) ? input.finalizedAt : Date.now();
      const minutesPlayedMs = safeCount(input.minutesPlayedMs);
      const resultKey = input.result === 'win' ? 'wins' : input.result === 'draw' ? 'draws' : 'losses';
      if (!playerDuplicate) {
        if (!playerRow) {
          playerRow = { playerId:playerKey, name:clean(input.name,24), role:['GK','DEF','MID','FWD'].includes(input.role)?input.role:'MID', clubName:clean(input.clubName,48), totals:emptyTotals(), matches:[], processedMatchIds:[] };
          this.state.playerCareers.push(playerRow);
        } else {
          playerRow.name = clean(input.name,24) || playerRow.name;
          playerRow.role = ['GK','DEF','MID','FWD'].includes(input.role)?input.role:playerRow.role;
          playerRow.clubName = clean(input.clubName,48) || playerRow.clubName;
        }
        const entry = { matchId, result:input.result, finalizedAt, teamName:clean(input.teamName,48), opponent:clean(input.opponent,48), role:playerRow.role, minutesPlayedMs, rating:safeRating(input.rating), cleanSheet:input.cleanSheet===true, playerOfMatch:input.playerOfMatch===true, stats };
        playerRow.matches.push(entry); playerRow.matches=playerRow.matches.slice(-this.maxMatchesPerCareer);
        playerRow.processedMatchIds=[...(playerRow.processedMatchIds || []),matchId].slice(-5000);
        playerRow.totals.matches++; playerRow.totals.minutesPlayedMs+=minutesPlayedMs; playerRow.totals[resultKey]++;
        for (const field of Object.keys(stats)) playerRow.totals[field]+=stats[field];
        if (entry.cleanSheet) playerRow.totals.cleanSheets++;
        if (entry.playerOfMatch) playerRow.totals.playerOfMatch++;
      }
      if (accountKey && !accountDuplicate) {
        if (!accountRow) {
          accountRow = { accountId:accountKey, totals:emptyTotals(), matches:[], processedMatchIds:[] };
          this.state.careers.push(accountRow);
        }
        const entry = { matchId, result:input.result, finalizedAt, teamName:clean(input.teamName,48), opponent:clean(input.opponent,48), role:['GK','DEF','MID','FWD'].includes(input.role)?input.role:'MID', minutesPlayedMs, rating:safeRating(input.rating), playerOfMatch:input.playerOfMatch===true, stats };
        accountRow.matches.push(entry); accountRow.matches=accountRow.matches.slice(-this.maxMatchesPerCareer);
        accountRow.processedMatchIds=[...(accountRow.processedMatchIds || []),matchId].slice(-5000);
        accountRow.totals.matches++; accountRow.totals.minutesPlayedMs+=minutesPlayedMs; accountRow.totals[resultKey]++;
        for (const field of Object.keys(stats)) accountRow.totals[field]+=stats[field];
        if (input.cleanSheet===true) accountRow.totals.cleanSheets++;
        if (entry.playerOfMatch) accountRow.totals.playerOfMatch++;
      }
      if (cloudEligible) {
        const existing = this.state.pendingCloudMatches.find(item => item.accountId === accountKey && item.matchId === matchId);
        if (existing && existing.playerId !== playerKey) throw new Error('CAREER_SYNC_IDENTITY_CONFLICT');
        if (!existing) {
          if (this.state.pendingCloudMatches.length >= 10_000) throw new Error('CAREER_SYNC_QUEUE_FULL');
          this.state.pendingCloudMatches.push({ accountId:accountKey, playerId:playerKey, matchId, queuedAt:Date.now(), attempts:0, nextAttemptAt:0, payload:structuredClone(input) });
        }
      }
      return { value:{ ok:true, duplicate:playerDuplicate && (!accountKey || accountDuplicate), playerCareer:this.getPlayerCareer(playerKey), career:accountKey ? this.get(accountKey) : null, queued:cloudEligible } };
    });
  }

  listPendingCloudMatches({ limit = 100 } = {}) {
    const safeLimit = Number.isSafeInteger(limit) ? Math.max(1, Math.min(10_000, limit)) : 100;
    return this.state.pendingCloudMatches.slice(0, safeLimit).map(item => structuredClone(item));
  }

  listDueCloudMatches({ limit = 25, now = Date.now() } = {}) {
    const safeLimit = Number.isSafeInteger(limit) ? Math.max(1, Math.min(100, limit)) : 25;
    const timestamp = Number.isSafeInteger(now) ? now : Date.now();
    return this.state.pendingCloudMatches.filter(item => item.nextAttemptAt <= timestamp).slice(0, safeLimit).map(item => structuredClone(item));
  }

  markCloudMatchAttempt(accountId, matchId, now = Date.now()) {
    return this.transaction(() => {
      const index = this.state.pendingCloudMatches.findIndex(item => item.accountId === accountId && item.matchId === matchId);
      if (index < 0) return { persist:false, value:{ updated:false, retryAt:null } };
      const item = this.state.pendingCloudMatches[index];
      const attempts = item.attempts + 1;
      const retryAt = now + Math.min(6 * 60 * 60_000, 15_000 * (2 ** Math.min(attempts, 10)));
      this.state.pendingCloudMatches[index] = { ...item, attempts, lastAttemptAt:now, nextAttemptAt:retryAt };
      return { value:{ updated:true, attempts, retryAt } };
    });
  }

  acknowledgeCloudMatch(accountId, matchId) {
    return this.transaction(() => {
      const index = this.state.pendingCloudMatches.findIndex(item => item.accountId === accountId && item.matchId === matchId);
      if (index < 0) return { persist:false, value:{ acknowledged:false, pending:this.state.pendingCloudMatches.length } };
      this.state.pendingCloudMatches.splice(index, 1);
      return { value:{ acknowledged:true, pending:this.state.pendingCloudMatches.length } };
    });
  }

  get pendingCloudMatchCount() { return this.state.pendingCloudMatches.length; }

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
    return this.transaction(() => {
      let row = this.state.careers.find(item => item.accountId === id);
      if (row?.processedMatchIds.includes(matchId)) return { persist:false, value:{ ok:true, duplicate:true, career:this.get(id) } };
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
      return { value:{ ok: true, duplicate: false, career: this.get(id) } };
    });
  }
}
