import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { DEFAULT_CLUBS } from '../src/club-manager.js';
import { getCompetitionGroups, conferenceForClub } from '../src/league-structure.js';
import { calculateSeasonMovements, createPromotionPlayoff, advancePromotionPlayoff, REQUIRED_PROMOTION_PLAYOFFS } from '../src/season-movement-policy.js';
import { auditLeagueSchedules } from '../src/league-schedule-audit.js';
import { auditCupBracket } from '../src/cup-bracket-audit.js';
import { auditSeasonTimeline } from '../src/season-timeline-audit.js';

const clean = (value, max = 64) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const scoreValue = value => Number.isSafeInteger(value) && value >= 0 && value <= 99 ? value : null;
const clone = value => JSON.parse(JSON.stringify(value));

function createSeason(seasonId, clubs, now) {
  const season = { id: seasonId, status: 'active', startedAt: now, competitions: [], trophies: [] };
  for (const group of getCompetitionGroups()) {
    const members = clubs
      .filter(club => club.division === group.division && (!group.conference || conferenceForClub(club) === group.conference))
      .map(club => ({ id: club.id, name: club.name, division: club.division, conference: conferenceForClub(club) || null }));
    const fixtures = [];
    const rotation = members.map(member => member.id);
    const scheduled = rotation.length % 2 ? [...rotation, null] : [...rotation];
    const rounds = Math.max(0, scheduled.length - 1);
    const homeCounts = new Map(rotation.map(id => [id,0]));
    const awayCounts = new Map(rotation.map(id => [id,0]));
    const groupKey = group.conference ? `-${group.conference.toLocaleUpperCase('fr')}` : '';
    const competitionId = `${seasonId}-league-${group.division}${groupKey}`;
    const matchFormat = ['D1','D2','D3'].includes(group.division) ? 'home-away' : 'single-leg';
    const firstLegFixtures = [];
    for (let round = 1; round <= rounds; round++) {
      for (let match = 0; match < scheduled.length / 2; match++) {
        let home = scheduled[match], away = scheduled[scheduled.length - 1 - match];
        if (!home || !away) continue;
        const homeBalance=homeCounts.get(home)-awayCounts.get(home);
        const awayBalance=homeCounts.get(away)-awayCounts.get(away);
        if (homeBalance > awayBalance || (homeBalance === awayBalance && (round + match) % 2))
          [home, away] = [away, home];
        homeCounts.set(home,homeCounts.get(home)+1);
        awayCounts.set(away,awayCounts.get(away)+1);
        firstLegFixtures.push({ id: `${seasonId}-${group.division}${groupKey}-R${round}-M${match+1}-L1`, competitionId, type: 'league', round, leg:1, homeClubId: home, awayClubId: away, status: 'scheduled', result: null, roomId: null });
      }
      const last = scheduled.pop();
      scheduled.splice(1, 0, last);
    }
    fixtures.push(...firstLegFixtures);
    if (matchFormat === 'home-away') {
      for (const fixture of firstLegFixtures) fixtures.push({
        ...fixture,
        id: fixture.id.replace(/-L1$/, '-L2'),
        round: fixture.round + rounds,
        leg:2,
        homeClubId:fixture.awayClubId,
        awayClubId:fixture.homeClubId
      });
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
      matchFormat,
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
    const storedState = this.read();
    this.state = storedState || { version:1, seasons:[createSeason(seasonId,clubs,this.now())] };
    if (Array.isArray(this.state.clubAssignments)) this.clubs = new Map(this.state.clubAssignments.map(club => [club.id,{...club}]));
    if (!this.state.seasons.length) this.state.seasons.push(createSeason(seasonId,clubs,this.now()));
    if (!storedState) this.persist();
    if (this.migrateActiveSeasonCalendars()) this.persist();
  }
  read() {
    try { const value=JSON.parse(readFileSync(this.file,'utf8')); if(value?.version!==1||!Array.isArray(value.seasons)) throw new Error('schema'); return value; }
    catch(error){ if(error.code==='ENOENT') return null; throw new Error('COMPETITION_STORE_CORRUPT'); }
  }
  persist() {
    if (this._transactionDepth) { this._transactionDirty = true; return true; }
    const temp=`${this.file}.${process.pid}.${randomUUID()}.tmp`;
    try { writeFileSync(temp,JSON.stringify(this.state),{mode:0o600}); renameSync(temp,this.file); }
    catch(error){ try{unlinkSync(temp);}catch{} throw error; }
    return true;
  }
  transaction(mutator) {
    if (this._transactionDepth) return mutator();
    // Keep live object identity during successful writes: room and UI services may
    // hold references to competition records while a result is being committed.
    const snapshotState = clone(this.state);
    const snapshotClubs = new Map([...this.clubs].map(([id, club]) => [id, clone(club)]));
    this._transactionDepth = 1;
    this._transactionDirty = false;
    try {
      const result = mutator();
      const dirty = this._transactionDirty;
      this._transactionDepth = 0;
      this._transactionDirty = false;
      if (dirty) this.persist();
      return result;
    } catch (error) {
      this.state = snapshotState;
      this.clubs = snapshotClubs;
      this._transactionDepth = 0;
      this._transactionDirty = false;
      throw error;
    }
  }
  migrateActiveSeasonCalendars() {
    const season=this.state.seasons.find(item=>item.status==='active');
    if(!season)return false;
    let changed=false;
    for(const competition of season.competitions||[]) {
      if(competition.type!=='league'||!['D1','D2','D3','D4','D5'].includes(competition.division))continue;
      const format=['D1','D2','D3'].includes(competition.division)?'home-away':'single-leg';
      const fixtures=competition.fixtures||[];
      const clubCount=competition.members?.length||0;
      const baseRounds=Math.max(0,clubCount-1);
      if(competition.matchFormat!==format){competition.matchFormat=format;changed=true;}
      for(const fixture of fixtures)if(!fixture.leg){fixture.leg=1;changed=true;}
      if(format!=='home-away')continue;
      const existingReturns=new Set(fixtures.filter(item=>item.leg===2).map(item=>[item.homeClubId,item.awayClubId].sort().join('|')));
      const additions=[];
      for(const fixture of fixtures.filter(item=>item.leg===1)) {
        const pair=[fixture.homeClubId,fixture.awayClubId].sort().join('|');
        if(existingReturns.has(pair))continue;
        additions.push({...fixture,id:`${fixture.id}-RETURN`,round:fixture.round+baseRounds,leg:2,
          homeClubId:fixture.awayClubId,awayClubId:fixture.homeClubId,status:'scheduled',result:null,roomId:null});
        existingReturns.add(pair);
      }
      if(additions.length) {
        competition.fixtures.push(...additions);
        if(competition.status==='completed') {
          competition.status='active';
          competition.championClubId=null;
          season.trophies=(season.trophies||[]).filter(item=>item.competitionId!==competition.id);
        }
        changed=true;
      }
    }
    return changed;
  }
  get activeSeason(){ return this.state.seasons.find(season=>season.status==='active') || this.state.seasons.at(-1); }
  getFixture(fixtureId) {
    const id=clean(fixtureId,96);
    for(const competition of this.activeSeason.competitions){ const fixture=competition.fixtures.find(item=>item.id===id); if(fixture) return clone({...fixture,competitionName:competition.name}); }
    return null;
  }
  recordFixtureResult(fixtureId, input = {}) { return this.transaction(() => this._recordFixtureResult(fixtureId, input)); }
  _recordFixtureResult(fixtureId,{roomId,homeGoals,awayGoals,finalizedAt=this.now()}={}) {
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
      else if(competition.type==='promotion-playoff') advancePromotionPlayoff(competition,fixture);
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
  ensurePromotionPlayoffs() { return this.transaction(() => this._ensurePromotionPlayoffs()); }
  _ensurePromotionPlayoffs() {
    const season=this.activeSeason;
    let changed=false;
    for(const [division,conference] of REQUIRED_PROMOTION_PLAYOFFS) {
      const league=season.competitions.find(item=>item.type==='league'&&item.division===division&&(item.conference||null)===conference);
      if(!league||league.status!=='completed')continue;
      const expectedCount=conference?16:({D2:20,D3:24}[division]);
      if(!Array.isArray(league.standings)||league.standings.length!==expectedCount)continue;
      const existing=season.competitions.find(item=>item.type==='promotion-playoff'&&item.division===division&&(item.conference||null)===conference);
      if(existing)continue;
      season.competitions.push(createPromotionPlayoff({seasonId:season.id,division,conference,standings:league.standings}));
      changed=true;
    }
    if(changed)this.persist();
    return changed;
  }
  previewSeasonMovements() {
    const season=this.activeSeason;
    this.ensurePromotionPlayoffs();
    const preview=calculateSeasonMovements({competitions:season.competitions,clubs:[...this.clubs.values()]});
    return {...preview,seasonId:season.id,seasonStatus:season.status};
  }
  finalizeSeason(input = {}) { return this.transaction(() => this._finalizeSeason(input)); }
  _finalizeSeason({ nextSeasonId, movements = [], completedAt = this.now() } = {}) {
    const current = this.activeSeason;
    const nextId = clean(nextSeasonId, 48);
    if (!Array.isArray(movements)) return { ok:false, reason:'invalid-movement-list' };
    if (!nextId || !Number.isSafeInteger(completedAt) || completedAt < 0 || current.status !== 'active') return { ok:false, reason:'invalid-season-transition' };
    this.ensurePromotionPlayoffs();
    if(current.competitions.some(competition=>competition.status!=='completed'))return {ok:false,reason:'season-competitions-incomplete'};
    const approved=this.previewSeasonMovements();
    if(!approved.ok)return {ok:false,reason:'season-movements-not-ready',details:approved.reason};
    const expectedMoves=new Map(approved.movements.map(item=>[item.clubId,item]));
    if(movements.length!==expectedMoves.size||movements.some(item=>{
      const expected=expectedMoves.get(item?.clubId);
      return !expected||item.toDivision!==expected.toDivision||(item.toConference||null)!==expected.toConference||item.type!==expected.type||item.finalPosition!==expected.finalPosition;
    }))return {ok:false,reason:'movement-list-does-not-match-approved-preview'};
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
      if ((target === 'D4' && !['A','B'].includes(conference)) ||
          (target === 'D5' && !['A','B','C','D'].includes(conference)))
        return { ok:false, reason:'destination-conference-required' };
      club.division = target;
      club.conference = conference;
      moved.add(clubId);
    }
    const targets = { D1:16, D2:20, D3:24, D4:32, D5:64 };
    const counts = Object.fromEntries(Object.keys(targets).map(division => [division,0]));
    const conferenceCounts = { D4:{A:0,B:0}, D5:{A:0,B:0,C:0,D:0} };
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
    current.movements = movements.map(item => {
      const clubId=clean(item.clubId,80);
      const club=this.clubs.get(clubId);
      return {
        clubId, clubName:club.name,
        fromDivision:club.division, fromConference:conferenceForClub(club),
        toDivision:item.toDivision, toConference:item.toConference || null,
        type:['promotion','relegation'].includes(item.type) ? item.type : null,
        finalPosition:Number.isSafeInteger(item.finalPosition) ? item.finalPosition : null,
        competitionId:clean(item.competitionId,96) || null,
        competitionName:clean(item.competitionName,100) || null,
        qualificationStage:item.qualificationStage==='playoff'?'playoff':'direct'
      };
    });
    this.clubs = nextClubs;
    this.state.clubAssignments = [...nextClubs.values()].map(club => ({...club}));
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
          : this.clubs.get(competition.championClubId)?.name || null,
        finalStandings:clone(competition.standings || []),
        results:(competition.fixtures || []).filter(fixture => fixture.status === 'completed').map(fixture => ({
          fixtureId:fixture.id, round:fixture.round, stage:fixture.stage||null, homeClubId:fixture.homeClubId,
          awayClubId:fixture.awayClubId, result:clone(fixture.result), roomId:fixture.roomId
        }))
      })),
      trophies:clone(season.trophies || []),
      movements:clone(season.movements || [])
    }));
  }
  clubHistoricalRecords() {
    const records = new Map([...this.clubs.values()].map(club => [club.id, {
      clubId:club.id, clubName:club.name, seasonsParticipated:0,
      leagueTitles:0, cupTitles:0, trophies:[], bestLeaguePosition:null,
      promotions:0, relegations:0, matches:0, wins:0, draws:0, losses:0,
      goalsFor:0, goalsAgainst:0, competitions:0, seasonIds:[]
    }]));
    const meetings = new Map();
    for (const season of this.state.seasons) {
      const participated = new Set();
      for (const competition of season.competitions || []) {
        const competitionParticipants = new Set();
        const names = new Map((competition.members || []).map(member => [member.id, member.name]));
        for (const row of competition.standings || []) names.set(row.id, row.name);
        for (const member of competition.members || []) { participated.add(member.id); competitionParticipants.add(member.id); }
        for (const row of competition.standings || []) {
          participated.add(row.id); competitionParticipants.add(row.id);
          const record = records.get(row.id);
          if (record && competition.type === 'league') {
            const position = (competition.standings || []).findIndex(item => item.id === row.id) + 1;
            if (position > 0 && (record.bestLeaguePosition === null || position < record.bestLeaguePosition))
              record.bestLeaguePosition = position;
          }
        }
        for (const fixture of competition.fixtures || []) {
          if (fixture.status !== 'completed' || !fixture.result ||
              !fixture.homeClubId || !fixture.awayClubId) continue;
          const home = records.get(fixture.homeClubId), away = records.get(fixture.awayClubId);
          const hg = fixture.result.home, ag = fixture.result.away;
          if (!home || !away || !Number.isSafeInteger(hg) || !Number.isSafeInteger(ag)) continue;
          participated.add(home.clubId); participated.add(away.clubId);
          competitionParticipants.add(home.clubId); competitionParticipants.add(away.clubId);
          home.matches++; away.matches++;
          home.goalsFor += hg; home.goalsAgainst += ag;
          away.goalsFor += ag; away.goalsAgainst += hg;
          if (hg > ag) { home.wins++; away.losses++; }
          else if (ag > hg) { away.wins++; home.losses++; }
          else { home.draws++; away.draws++; }
          const pair = [fixture.homeClubId, fixture.awayClubId].sort();
          const key = pair.join('|');
          if (!meetings.has(key)) meetings.set(key, { clubAId:pair[0], clubBId:pair[1], matches:0, clubAWins:0, draws:0, clubBWins:0, goalsA:0, goalsB:0 });
          const duel = meetings.get(key); duel.matches++;
          const aGoals = fixture.homeClubId === pair[0] ? hg : ag;
          const bGoals = fixture.homeClubId === pair[1] ? hg : ag;
          duel.goalsA += aGoals; duel.goalsB += bGoals;
          if (aGoals > bGoals) duel.clubAWins++;
          else if (bGoals > aGoals) duel.clubBWins++;
          else duel.draws++;
        }
        for (const clubId of competitionParticipants) {
          const record = records.get(clubId);
          if (record) record.competitions++;
        }
      }
      for (const clubId of participated) {
        const record = records.get(clubId);
        if (record && !record.seasonIds.includes(season.id)) {
          record.seasonsParticipated++;
          record.seasonIds.push(season.id);
        }
      }
      for (const trophy of season.trophies || []) {
        const record = records.get(trophy.clubId);
        if (!record) continue;
        record.trophies.push({ ...trophy, seasonId:season.id });
        if (trophy.competitionId?.includes('-cup')) record.cupTitles++;
        else record.leagueTitles++;
      }
      for (const movement of season.movements || []) {
        const record = records.get(movement.clubId);
        if (!record) continue;
        const order = { D1:1, D2:2, D3:3, D4:4, D5:5 };
        if (order[movement.toDivision] < order[movement.fromDivision]) record.promotions++;
        if (order[movement.toDivision] > order[movement.fromDivision]) record.relegations++;
      }
    }
    return [...records.values()].map(record => ({
      ...record, trophies:clone(record.trophies), seasonIds:[...record.seasonIds]
    })).sort((a,b) => a.clubName.localeCompare(b.clubName));
  }
  headToHead(clubAId, clubBId) {
    const a = clean(clubAId, 80), b = clean(clubBId, 80);
    if (!a || !b || a === b || !this.clubs.has(a) || !this.clubs.has(b)) return null;
    const pair = [a,b].sort();
    const record = new Map(this.clubHistoricalRecords().map(item => [item.clubId,item]));
    const meetings = { matches:0, clubAWins:0, draws:0, clubBWins:0, goalsA:0, goalsB:0 };
    for (const season of this.state.seasons) for (const competition of season.competitions || [])
      for (const fixture of competition.fixtures || []) {
        if (fixture.status !== 'completed' || !fixture.result ||
            ![fixture.homeClubId,fixture.awayClubId].includes(a) ||
            ![fixture.homeClubId,fixture.awayClubId].includes(b)) continue;
        const aGoals = fixture.homeClubId === a ? fixture.result.home : fixture.result.away;
        const bGoals = fixture.homeClubId === b ? fixture.result.home : fixture.result.away;
        meetings.matches++; meetings.goalsA += aGoals; meetings.goalsB += bGoals;
        if (aGoals > bGoals) meetings.clubAWins++;
        else if (bGoals > aGoals) meetings.clubBWins++;
        else meetings.draws++;
      }
    return { clubAId:a, clubAName:record.get(a)?.clubName, clubBId:b, clubBName:record.get(b)?.clubName, ...meetings };
  }
  snapshot() {
    const season=this.activeSeason;
    const leagueTablesComplete = season.competitions.filter(item=>item.type==='league').length===9 && season.competitions.filter(item=>item.type==='league').every(item=>item.status==='completed');
    const movementPreview = leagueTablesComplete ? this.previewSeasonMovements() : null;
    const scheduleAudit = auditLeagueSchedules(season.competitions);
    const cupAudit = auditCupBracket(season.competitions.find(item=>item.type==='cup'));
    const timelineAudit = auditSeasonTimeline(this.state);
    return {season:{id:season.id,status:season.status,startedAt:season.startedAt},competitions:season.competitions.map(item=>({...clone(item),fixtures:item.fixtures.map(f=>({...f}))})),trophies:clone(season.trophies),movementPreview,scheduleAudit,cupAudit,timelineAudit};
  }
}
