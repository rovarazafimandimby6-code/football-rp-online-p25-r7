import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const clone = value => structuredClone(value);
const MAX_SEASONS = 100;
const MAX_RESULTS_PER_SEASON = 10000;
const ID = /^[a-z0-9][a-z0-9_-]{2,47}$/i;

export class JsonRpClubSeasonStore {
  constructor(directory, { now = () => Date.now(), idFactory = randomUUID } = {}) {
    this.directory = path.resolve(directory);
    this.file = path.join(this.directory, 'rp-club-seasons.json');
    this.now = now;
    this.idFactory = idFactory;
    mkdirSync(this.directory, { recursive:true });
    this.state = this.read();
  }

  read() {
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8'));
      if (!data || data.version !== 1 || !Array.isArray(data.seasons) || data.seasons.length > MAX_SEASONS)
        throw new Error('bad schema');
      const valid = data.seasons.every(season => season && typeof season.id === 'string'
        && ID.test(season.id) && typeof season.name === 'string' && season.name.length > 0
        && ['scheduled','active','completed'].includes(season.status)
        && Number.isFinite(Date.parse(season.startsAt)) && Number.isFinite(Date.parse(season.endsAt))
        && Date.parse(season.endsAt) > Date.parse(season.startsAt)
        && Array.isArray(season.results) && season.results.length <= MAX_RESULTS_PER_SEASON
        && season.results.every(result => result && typeof result.challengeId === 'string'
          && typeof result.roomId === 'string' && Number.isSafeInteger(result.blue) && result.blue >= 0
          && Number.isSafeInteger(result.red) && result.red >= 0 && Number.isFinite(result.finalizedAt)));
      if (!valid || new Set(data.seasons.map(item => item.id)).size !== data.seasons.length)
        throw new Error('invalid seasons');
      const active = data.seasons.filter(item => item.status === 'active');
      if (active.length > 1) throw new Error('multiple active seasons');
      return { version:1, seasons:data.seasons };
    } catch (error) {
      if (error.code === 'ENOENT') return { version:1, seasons:[] };
      throw new Error('RP_CLUB_SEASON_STORE_CORRUPT');
    }
  }

  persist() {
    const temp = this.file + '.' + process.pid + '.' + this.idFactory() + '.tmp';
    try {
      writeFileSync(temp, JSON.stringify(this.state), { mode:0o600 });
      renameSync(temp, this.file);
    } catch (error) {
      try { unlinkSync(temp); } catch {}
      throw error;
    }
  }

  transact(mutator) {
    const previous = this.state;
    this.state = clone(previous);
    try {
      const result = mutator();
      if (result?.ok === false) { this.state = previous; return result; }
      this.persist();
      return result;
    } catch (error) { this.state = previous; throw error; }
  }

  list() {
    return this.state.seasons.map(({ results, ...season }) => ({
      ...season, matchesPlayed:results.length
    })).sort((a,b) => b.startsAt.localeCompare(a.startsAt));
  }

  current() {
    const season = this.state.seasons.find(item => item.status === 'active');
    if (!season) return null;
    return { id:season.id, name:season.name, startsAt:season.startsAt, endsAt:season.endsAt, matchesPlayed:season.results.length };
  }

  create({ id, name, startsAt, endsAt } = {}) {
    const start = Date.parse(startsAt), end = Date.parse(endsAt);
    if (typeof id !== 'string' || !ID.test(id) || typeof name !== 'string' || !name.trim()
      || name.trim().length > 80 || !Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      return { ok:false, reason:'INVALID_RP_CLUB_SEASON' };
    if (this.state.seasons.some(item => item.id === id)) return { ok:false, reason:'RP_CLUB_SEASON_ALREADY_EXISTS' };
    if (this.state.seasons.length >= MAX_SEASONS) return { ok:false, reason:'RP_CLUB_SEASON_LIMIT' };
    const overlaps = this.state.seasons.some(item => start < Date.parse(item.endsAt) && end > Date.parse(item.startsAt));
    if (overlaps) return { ok:false, reason:'RP_CLUB_SEASON_OVERLAP' };
    const season = { id, name:name.trim(), startsAt:new Date(start).toISOString(), endsAt:new Date(end).toISOString(),
      status:'scheduled', createdAt:new Date(this.now()).toISOString(), activatedAt:null, completedAt:null, results:[] };
    return this.transact(() => { this.state.seasons.push(season); return { ok:true, season:this.list().find(item=>item.id===id) }; });
  }

  activate(seasonId) {
    const season = this.state.seasons.find(item => item.id === seasonId);
    if (!season) return { ok:false, reason:'RP_CLUB_SEASON_NOT_FOUND' };
    if (season.status !== 'scheduled') return { ok:false, reason:'RP_CLUB_SEASON_NOT_SCHEDULED' };
    if (this.state.seasons.some(item => item.status === 'active')) return { ok:false, reason:'RP_CLUB_SEASON_ALREADY_ACTIVE' };
    const now = this.now();
    if (now < Date.parse(season.startsAt) || now >= Date.parse(season.endsAt))
      return { ok:false, reason:'RP_CLUB_SEASON_OUTSIDE_WINDOW' };
    return this.transact(() => {
      const current = this.state.seasons.find(item => item.id === seasonId);
      current.status = 'active'; current.activatedAt = new Date(now).toISOString();
      return { ok:true, season:this.current() };
    });
  }

  close(seasonId) {
    const season = this.state.seasons.find(item => item.id === seasonId);
    if (!season) return { ok:false, reason:'RP_CLUB_SEASON_NOT_FOUND' };
    if (season.status !== 'active') return { ok:false, reason:'RP_CLUB_SEASON_NOT_ACTIVE' };
    return this.transact(() => {
      const current = this.state.seasons.find(item => item.id === seasonId);
      current.status = 'completed'; current.completedAt = new Date(this.now()).toISOString();
      return { ok:true, season:this.list().find(item=>item.id===seasonId) };
    });
  }

  recordResult({ seasonId, challengeId, roomId, challenger, target, score, finalizedAt } = {}) {
    const season = this.state.seasons.find(item => item.id === seasonId);
    if (!season || season.status !== 'active') return { ok:false, reason:'RP_CLUB_SEASON_NOT_ACTIVE' };
    const existing = season.results.find(item => item.challengeId === challengeId);
    if (existing) return existing.roomId === roomId
      ? { ok:true, duplicate:true, result:existing }
      : { ok:false, reason:'RP_CLUB_SEASON_RESULT_CONFLICT' };
    const blue = Number(score?.blue), red = Number(score?.red);
    if (typeof challengeId !== 'string' || !challengeId || typeof roomId !== 'string' || !roomId
      || !challenger?.id || !challenger?.name || !target?.id || !target?.name || challenger.id === target.id
      || !Number.isSafeInteger(blue) || blue < 0 || !Number.isSafeInteger(red) || red < 0
      || !Number.isFinite(finalizedAt) || finalizedAt < Date.parse(season.startsAt) || finalizedAt > Date.parse(season.endsAt))
      return { ok:false, reason:'INVALID_RP_CLUB_SEASON_RESULT' };
    if (season.results.length >= MAX_RESULTS_PER_SEASON) return { ok:false, reason:'RP_CLUB_SEASON_RESULT_LIMIT' };
    const result = { challengeId, roomId, challenger:clone(challenger), target:clone(target), blue, red, finalizedAt };
    return this.transact(() => {
      const current = this.state.seasons.find(item => item.id === seasonId);
      if (!current || current.status !== 'active') return { ok:false, reason:'RP_CLUB_SEASON_NOT_ACTIVE' };
      const duplicate = current.results.find(item => item.challengeId === challengeId);
      if (duplicate) return duplicate.roomId === roomId
        ? { ok:true, duplicate:true, result:duplicate }
        : { ok:false, reason:'RP_CLUB_SEASON_RESULT_CONFLICT' };
      current.results.push(result);
      return { ok:true, duplicate:false, result };
    });
  }

  leaderboard(seasonId) {
    const season = this.state.seasons.find(item => item.id === seasonId);
    if (!season) return null;
    const table = new Map();
    const row = club => {
      if (!table.has(club.id)) table.set(club.id, { clubId:club.id, name:club.name, tag:club.tag || '',
        played:0, wins:0, draws:0, losses:0, goalsFor:0, goalsAgainst:0, points:0 });
      return table.get(club.id);
    };
    for (const result of season.results) {
      const blue = row(result.challenger), red = row(result.target);
      blue.played++; red.played++;
      blue.goalsFor += result.blue; blue.goalsAgainst += result.red;
      red.goalsFor += result.red; red.goalsAgainst += result.blue;
      if (result.blue === result.red) { blue.draws++; red.draws++; blue.points++; red.points++; }
      else if (result.blue > result.red) { blue.wins++; red.losses++; blue.points += 3; }
      else { red.wins++; blue.losses++; red.points += 3; }
    }
    return [...table.values()].sort((a,b) => b.points-a.points
      || (b.goalsFor-b.goalsAgainst)-(a.goalsFor-a.goalsAgainst)
      || b.goalsFor-a.goalsFor || a.name.localeCompare(b.name));
  }
}
