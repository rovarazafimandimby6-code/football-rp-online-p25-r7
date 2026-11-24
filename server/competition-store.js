import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { DEFAULT_CLUBS } from '../src/club-manager.js';
import { getCompetitionGroups, conferenceForClub } from '../src/league-structure.js';

const clean = (value, max = 64) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const scoreValue = value => Number.isSafeInteger(value) && value >= 0 && value <= 99 ? value : null;
const clone = value => JSON.parse(JSON.stringify(value));

function createSeason(seasonId, clubs, now) {
  const season = { id: seasonId, status: 'active', startedAt: now, competitions: [], trophies: [] };
  for (const group of getCompetitionGroups()) {
    const members = clubs
      .filter(club => club.division === group.division && (!group.conference || conferenceForClub(club) === group.conference))
      .map(club => ({ id: club.id, name: club.name }));
    const fixtures = [];
    const rotation = members.map(member => member.id);
    const scheduled = rotation.length % 2 ? [...rotation, null] : [...rotation];
    const rounds = Math.max(0, scheduled.length - 1);
    const groupKey = group.conference ? `-${group.conference.toLocaleUpperCase('fr')}` : '';
    const competitionId = `${seasonId}-league-${group.division}${groupKey}`;
    for (let round = 1; round <= rounds; round++) {
      for (let match = 0; match < scheduled.length / 2; match++) {
        let home = scheduled[match], away = scheduled[scheduled.length - 1 - match];
        if (!home || !away) continue;
        if ((round + match) % 2) [home, away] = [away, home];
        fixtures.push({ id: `${seasonId}-${group.division}${groupKey}-R${round}-M${match+1}`, competitionId, type: 'league', round, homeClubId: home, awayClubId: away, status: 'scheduled', result: null, roomId: null });
      }
      const last = scheduled.pop();
      scheduled.splice(1, 0, last);
    }
    season.competitions.push({
      id: competitionId,
      type: 'league',
      name: group.competitionName,
      leagueName: group.leagueName,
      division: group.division,
      conference: group.conference,
      status: members.length > 1 ? 'active' : 'pending-population',
      members,
      targetClubCount: group.conference ? 16 : ({ D1: 16, D2: 20, D3: 24 }[group.division]),
      fixtures,
      standings: members.map(club => ({ ...club, played:0, wins:0, draws:0, losses:0, goalsFor:0, goalsAgainst:0, points:0 }))
    });
  }
  const cupMembers = clubs.map(club => ({ id: club.id, name: club.name })).sort((a,b) => a.id.localeCompare(b.id));
  const cupFixtures = [];
  for (let i = 0; i < cupMembers.length; i += 2) cupFixtures.push({ id: `${seasonId}-cup-r1-${i/2+1}`, competitionId: `${seasonId}-cup`, type:'cup', round:1, homeClubId:cupMembers[i].id, awayClubId:cupMembers[i+1].id, status:'scheduled', result:null, roomId:null });
  let count = cupFixtures.length;
  for (let round = 2; round <= 4; round++) {
    count = Math.floor(count / 2);
    for (let i = 0; i < count; i++) cupFixtures.push({ id: `${seasonId}-cup-r${round}-${i+1}`, competitionId: `${seasonId}-cup`, type:'cup', round, homeClubId:null, awayClubId:null, status:'waiting', result:null, roomId:null });
  }
  season.competitions.push({ id:`${seasonId}-cup`, type:'cup', name:'Coupe des Clubs', status:'active', members:cupMembers, fixtures:cupFixtures, championClubId:null });
  return season;
}

export class JsonCompetitionStore {
  constructor(directory, { clubs = DEFAULT_CLUBS, seasonId = '2026-27', now = () => Date.now() } = {}) {
    this.directory = path.resolve(directory); this.file = path.join(this.directory,'competitions.json');
    this.clubs = new Map(clubs.map(club => [club.id,{id:club.id,name:club.name,division:club.division}]));
    this.now = now; mkdirSync(this.directory,{recursive:true});
    this.state = this.read() || { version:1, seasons:[createSeason(seasonId,clubs,this.now())] };
    if (!this.state.seasons.length) this.state.seasons.push(createSeason(seasonId,clubs,this.now()));
    if (!this.read()) this.persist();
  }
  read() {
    try { const value=JSON.parse(readFileSync(this.file,'utf8')); if(value?.version!==1||!Array.isArray(value.seasons)) throw new Error('schema'); return value; }
    catch(error){ if(error.code==='ENOENT') return null; throw new Error('COMPETITION_STORE_CORRUPT'); }
  }
  persist() {
    const temp=`${this.file}.${process.pid}.${randomUUID()}.tmp`;
    try { writeFileSync(temp,JSON.stringify(this.state),{mode:0o600}); renameSync(temp,this.file); }
    catch(error){ try{unlinkSync(temp);}catch{} throw error; }
  }
  get activeSeason(){ return this.state.seasons.find(season=>season.status==='active') || this.state.seasons.at(-1); }
  getFixture(fixtureId) {
    const id=clean(fixtureId,96);
    for(const competition of this.activeSeason.competitions){ const fixture=competition.fixtures.find(item=>item.id===id); if(fixture) return clone({...fixture,competitionName:competition.name}); }
    return null;
  }
  recordFixtureResult(fixtureId,{roomId,homeGoals,awayGoals,finalizedAt=this.now()}={}) {
    const id=clean(fixtureId,96), room=clean(roomId,64), home=scoreValue(homeGoals), away=scoreValue(awayGoals);
    if(!id||!room||home===null||away===null||!Number.isFinite(finalizedAt)) return {ok:false,reason:'invalid-result'};
    for(const competition of this.activeSeason.competitions){
      const fixture=competition.fixtures.find(item=>item.id===id);
      if(!fixture) continue;
      if(fixture.status==='completed') return fixture.roomId===room ? {ok:true,duplicate:true,fixture:clone(fixture)} : {ok:false,reason:'fixture-already-completed'};
      if(!['scheduled','replay-required'].includes(fixture.status)||!fixture.homeClubId||!fixture.awayClubId) return {ok:false,reason:'fixture-not-ready'};
      if(fixture.result) fixture.replays=[...(fixture.replays||[]),fixture.result];
      fixture.roomId=room; fixture.result={home,away,finalizedAt};
      fixture.status='completed';
      if(competition.type==='league') this.applyLeagueResult(competition,fixture);
      else this.advanceCup(competition,fixture);
      this.persist(); return {ok:true,duplicate:false,fixture:clone(fixture)};
    }
    return {ok:false,reason:'fixture-not-found'};
  }
  applyLeagueResult(competition,fixture) {
    const home=competition.standings.find(row=>row.id===fixture.homeClubId), away=competition.standings.find(row=>row.id===fixture.awayClubId);
    if(!home||!away) throw new Error('COMPETITION_CLUB_MISSING');
    const {home: hg,away:ag}=fixture.result;
    home.played++; away.played++; home.goalsFor+=hg; home.goalsAgainst+=ag; away.goalsFor+=ag; away.goalsAgainst+=hg;
    if(hg>ag){home.wins++;home.points+=3;away.losses++;} else if(ag>hg){away.wins++;away.points+=3;home.losses++;} else {home.draws++;away.draws++;home.points++;away.points++;}
    competition.standings.sort((a,b)=>b.points-a.points||(b.goalsFor-b.goalsAgainst)-(a.goalsFor-a.goalsAgainst)||b.goalsFor-a.goalsFor||a.name.localeCompare(b.name));
    if(competition.fixtures.every(item=>item.status==='completed')){
      competition.status='completed'; competition.championClubId=competition.standings[0]?.id||null;
      if(competition.championClubId&&!this.activeSeason.trophies.some(item=>item.competitionId===competition.id)) this.activeSeason.trophies.push({id:`${competition.id}-champion`,competitionId:competition.id,competitionName:competition.name,clubId:competition.championClubId,clubName:competition.standings[0].name,awardedAt:fixture.result.finalizedAt});
    }
  }
  advanceCup(competition,fixture) {
    if(fixture.result.home===fixture.result.away){fixture.status='replay-required';fixture.replayCount=(fixture.replayCount||0)+1;return;}
    const winnerId=fixture.result.home>fixture.result.away?fixture.homeClubId:fixture.awayClubId;
    const next=competition.fixtures.find(item=>item.round===fixture.round+1&&(!item.homeClubId||!item.awayClubId));
    if(next){if(!next.homeClubId) next.homeClubId=winnerId; else if(!next.awayClubId) next.awayClubId=winnerId; if(next.homeClubId&&next.awayClubId) next.status='scheduled';}
    if(fixture.round===4){competition.status='completed';competition.championClubId=winnerId;const club=this.clubs.get(winnerId);if(club&&!this.activeSeason.trophies.some(item=>item.competitionId===competition.id))this.activeSeason.trophies.push({id:`${competition.id}-champion`,competitionId:competition.id,competitionName:competition.name,clubId:winnerId,clubName:club.name,awardedAt:fixture.result.finalizedAt});}
  }
  snapshot() {
    const season=this.activeSeason;
    return {season:{id:season.id,status:season.status,startedAt:season.startedAt},competitions:season.competitions.map(item=>({...clone(item),fixtures:item.fixtures.map(f=>({...f}))})),trophies:clone(season.trophies)};
  }
}
