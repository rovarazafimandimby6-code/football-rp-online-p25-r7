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
    const targetClubCount = group.conference ? 16 : ({ D1: 16, D2: 20, D3: 24 }[group.division]);
    season.competitions.push({
      id: competitionId,
      type: 'league',
      name: group.competitionName,
      leagueName: group.leagueName,
      division: group.division,
      conference: group.conference,
      status: members.length >= targetClubCount ? 'active' : 'pending-population',
      members,
      targetClubCount,
      fixtures,
      standings: members.map(club => ({ ...club, played:0, wins:0, draws:0, losses:0, goalsFor:0, goalsAgainst:0, points:0 }))
    });
  }
  const divisionOrder = { D1:1, D2:2, D3:3, D4:4, D5:5 };
  const seededClubs = [...clubs].sort((a,b) =>
    (divisionOrder[a.division] || 9) - (divisionOrder[b.division] || 9)
    || Number(b.rating || 0) - Number(a.rating || 0)
    || a.id.localeCompare(b.id)
  );
  const cupMembers = seededClubs.map(club => ({ id: club.id, name: club.name }));
  const cupFixtures = [];
  const playInClubs = seededClubs.slice(100);
  const byeClubs = seededClubs.slice(0, 100);
  // 56 clubs play 28 preliminary ties; 100 seeded clubs receive a bye.
  for (let i = 0; i < playInClubs.length; i += 2) {
    cupFixtures.push({ id:`${seasonId}-cup-r1-${i/2+1}`, competitionId:`${seasonId}-cup`, type:'cup', round:1,
      homeClubId:playInClubs[i].id, awayClubId:playInClubs[i+1].id, status:'scheduled', result:null, roomId:null });
  }
  // Round of 128: 36 ties are fully seeded, 28 await a preliminary winner.
  for (let i = 0; i < 64; i++) {
    const home = i < 36 ? byeClubs[i*2] : byeClubs[72 + i - 36];
    const away = i < 36 ? byeClubs[i*2+1] : null;
    cupFixtures.push({ id:`${seasonId}-cup-r2-${i+1}`, competitionId:`${seasonId}-cup`, type:'cup', round:2,
      homeClubId:home?.id || null, awayClubId:away?.id || null, status:away ? 'scheduled' : 'waiting', result:null, roomId:null });
  }
  let count = 64;
  for (let round = 3; round <= 8; round++) {
    count = Math.floor(count / 2);
    for (let i = 0; i < count; i++) cupFixtures.push({ id:`${seasonId}-cup-r${round}-${i+1}`, competitionId:`${seasonId}-cup`, type:'cup', round,
      homeClubId:null, awayClubId:null, status:'waiting', result:null, roomId:null });
  }
  season.competitions.push({ id:`${seasonId}-cup`, type:'cup', name:'Coupe des Clubs', status:'active', members:cupMembers, fixtures:cupFixtures, championClubId:null });
  return season;
}

export class JsonCompetitionStore {
  constructor(directory, { clubs = DEFAULT_CLUBS, seasonId = '2026-27', now = () => Date.now() } = {}) {
    this.directory = path.resolve(directory); this.file = path.join(this.directory,'competitions.json');
    this.clubs = new Map(clubs.map(club => [club.id,{...club}]));
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
    if(fixture.round===8){competition.status='completed';competition.championClubId=winnerId;const club=this.clubs.get(winnerId);if(club&&!this.activeSeason.trophies.some(item=>item.competitionId===competition.id))this.activeSeason.trophies.push({id:`${competition.id}-champion`,competitionId:competition.id,competitionName:competition.name,clubId:winnerId,clubName:club.name,awardedAt:fixture.result.finalizedAt});}
  }
  finalizeSeason({ nextSeasonId, movements = [], completedAt = this.now() } = {}) {
    const current = this.activeSeason;
    const nextId = clean(nextSeasonId, 48);
    if (!nextId || !Number.isFinite(completedAt)) return { ok:false, reason:'invalid-season-transition' };
    if (this.state.seasons.some(season => season.id === nextId)) return { ok:false, reason:'season-already-exists' };
    if (current.competitions.some(competition => competition.status !== 'completed')) return { ok:false, reason:'season-competitions-incomplete' };
    const divisionOrder = { D1:1, D2:2, D3:3, D4:4, D5:5 };
    const nextClubs = new Map([...this.clubs].map(([id,club]) => [id,{...club}]));
    const moved = new Set();
    for (const movement of movements) {
      const clubId = clean(movement?.clubId, 80);
      const target = movement?.toDivision;
      const club = nextClubs.get(clubId);
      if (!club || moved.has(clubId)) return { ok:false, reason:'invalid-or-duplicate-club-movement' };
      if (!divisionOrder[target] || Math.abs(divisionOrder[club.division] - divisionOrder[target]) !== 1)
        return { ok:false, reason:'movement-must-be-adjacent-division' };
      const conference = target === 'D4' || target === 'D5' ? clean(movement.toConference, 16) : null;
      if ((target === 'D4' && !['Nord','Sud'].includes(conference)) ||
          (target === 'D5' && !['Nord','Sud','Est','Ouest'].includes(conference)))
        return { ok:false, reason:'destination-conference-required' };
      club.division = target;
      club.conference = conference;
      moved.add(clubId);
    }
    const targets = { D1:16, D2:20, D3:24, D4:32, D5:64 };
    const counts = Object.fromEntries(Object.keys(targets).map(division => [division,0]));
    const conferenceCounts = { D4:{Nord:0,Sud:0}, D5:{Nord:0,Sud:0,Est:0,Ouest:0} };
    for (const club of nextClubs.values()) {
      if (!Object.hasOwn(counts,club.division)) return { ok:false, reason:'invalid-club-division' };
      counts[club.division]++;
      if (club.division === 'D4' || club.division === 'D5') {
        const conference = club.conference;
        if (!Object.hasOwn(conferenceCounts[club.division],conference)) return { ok:false, reason:'invalid-club-conference' };
        conferenceCounts[club.division][conference]++;
      }
    }
    if (Object.entries(targets).some(([division,count]) => counts[division] !== count))
      return { ok:false, reason:'division-capacity-mismatch', counts };
    if (Object.values(conferenceCounts.D4).some(count => count !== 16) ||
        Object.values(conferenceCounts.D5).some(count => count !== 16))
      return { ok:false, reason:'conference-capacity-mismatch', conferenceCounts };
    current.status = 'completed';
    current.completedAt = completedAt;
    current.movements = movements.map(item => ({ clubId:clean(item.clubId,80), fromDivision:this.clubs.get(clean(item.clubId,80)).division, toDivision:item.toDivision, toConference:item.toConference || null }));
    this.clubs = nextClubs;
    const nextSeason = createSeason(nextId,[...nextClubs.values()],completedAt);
    this.state.seasons.push(nextSeason);
    this.persist();
    return { ok:true, seasonId:current.id, nextSeasonId:nextId, movements:current.movements.length, nextSeasonStatus:nextSeason.status };
  }
  seasonHistory() {
    return this.state.seasons.map(season => ({
      id:season.id, status:season.status, startedAt:season.startedAt,
      completedAt:season.completedAt || null,
      competitions:season.competitions.map(competition => ({
        id:competition.id, name:competition.name, type:competition.type,
        division:competition.division || null, conference:competition.conference || null,
        status:competition.status, championClubId:competition.championClubId || null,
        championClubName:competition.type === 'league'
          ? competition.standings?.find(row => row.id === competition.championClubId)?.name || null
          : this.clubs.get(competition.championClubId)?.name || null
      })),
      trophies:clone(season.trophies || []),
      movements:clone(season.movements || [])
    }));
  }
  snapshot() {
    const season=this.activeSeason;
    return {season:{id:season.id,status:season.status,startedAt:season.startedAt},competitions:season.competitions.map(item=>({...clone(item),fixtures:item.fixtures.map(f=>({...f}))})),trophies:clone(season.trophies)};
  }
}
