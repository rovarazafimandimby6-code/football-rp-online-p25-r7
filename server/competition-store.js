import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { DEFAULT_CLUBS } from '../src/club-manager.js';

const clean = (value, max = 64) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const scoreValue = value => Number.isSafeInteger(value) && value >= 0 && value <= 99 ? value : null;
const clone = value => JSON.parse(JSON.stringify(value));

function createSeason(seasonId, clubs, now) {
  const season = { id: seasonId, status: 'active', startedAt: now, competitions: [], trophies: [] };
  for (const division of ['D1','D2','D3','AMATEUR']) {
    const members = clubs.filter(club => club.division === division).map(club => ({ id: club.id, name: club.name }));
    const fixtures = [];
    let round = 1;
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
      fixtures.push({ id: `${seasonId}-${division}-${round++}`, competitionId: `${seasonId}-league-${division}`, type: 'league', round: round - 1, homeClubId: members[i].id, awayClubId: members[j].id, status: 'scheduled', result: null, roomId: null });
    }
    season.competitions.push({ id: `${seasonId}-league-${division}`, type: 'league', name: `Championnat · ${division}`, division, status: 'active', members, fixtures, standings: members.map(club => ({ ...club, played:0, wins:0, draws:0, losses:0, goalsFor:0, goalsAgainst:0, points:0 })) });
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
      if(fixture.status!=='scheduled'||!fixture.homeClubId||!fixture.awayClubId) return {ok:false,reason:'fixture-not-ready'};
      fixture.status='completed'; fixture.roomId=room; fixture.result={home,away,finalizedAt};
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
    if(fixture.result.home===fixture.result.away){fixture.status='awaiting-tiebreak';return;}
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
