import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonCareerStore } from '../server/career-store.js';
import { auditPlayerCareerHistory } from '../server/player-career-audit.js';

function fixture(){const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-player-audit-'));return {directory,store:new JsonCareerStore(directory),cleanup:()=>rmSync(directory,{recursive:true,force:true})};}

test('P27 audit joueur : rapproche les statistiques cumulées et la chronologie des clubs',()=>{
 const f=fixture();
 try {
  f.store.recordPlayerMatch('player-a',{matchId:'season-1-match',result:'win',finalizedAt:100,name:'Mika',role:'FWD',clubName:'Tana FC',teamName:'Tana FC',minutesPlayedMs:90000,rating:8,stats:{goals:1,passes:12,completedPasses:10}});
  f.store.recordPlayerMatch('player-a',{matchId:'season-2-match',result:'draw',finalizedAt:200,name:'Mika',role:'FWD',clubName:'Toamasina United',teamName:'Toamasina United',minutesPlayedMs:60000,rating:7,stats:{assists:1,passes:8,completedPasses:7}});
  const career=new JsonCareerStore(f.directory).getPlayerCareer('player-a');
  const audit=auditPlayerCareerHistory({career});
  assert.equal(audit.ok,true,JSON.stringify(audit.errors));
  assert.equal(audit.retainedMatches,2);
  assert.deepEqual(career.clubHistory.map(row=>row.clubName),['Tana FC','Toamasina United']);
 } finally { f.cleanup(); }
});

test('P27 audit joueur : détecte statistiques falsifiées et doublons de match',()=>{
 const f=fixture();
 try {
  f.store.recordPlayerMatch('player-b',{matchId:'same-match',result:'win',finalizedAt:100,name:'Lova',teamName:'Tana FC',stats:{goals:2}});
  const career=new JsonCareerStore(f.directory).getPlayerCareer('player-b');
  career.totals.goals=0;
  career.matches.push({...career.matches[0]});
  const audit=auditPlayerCareerHistory({career});
  assert.equal(audit.ok,false);
  assert.ok(audit.errors.some(row=>row.code==='PLAYER_CAREER_TOTAL_BELOW_RETAINED_MATCHES'));
  assert.ok(audit.errors.some(row=>row.code==='PLAYER_MATCH_DUPLICATE'));
 } finally { f.cleanup(); }
});

test('P27 audit joueur : contrôle la continuité et l’ordre des transferts',()=>{
 const career={player:{name:'Lova'},totals:{matches:0,minutesPlayedMs:0,wins:0,draws:0,losses:0,goals:0,assists:0,shots:0,passes:0,completedPasses:0,tackles:0,interceptions:0,saves:0,cleanSheets:0,playerOfMatch:0},matches:[],clubHistory:[]};
 const valid=[{id:'t1',type:'transfer',at:'2026-01-01T00:00:00Z',fromClubId:'club-a',toClubId:'club-b'},{id:'t2',type:'transfer',at:'2026-02-01T00:00:00Z',fromClubId:'club-b',toClubId:'club-c'}];
 assert.equal(auditPlayerCareerHistory({career,transferHistory:valid,currentClubId:'club-c'}).ok,true);
 const broken=auditPlayerCareerHistory({career,transferHistory:[...valid,{id:'t3',type:'transfer',at:'2026-03-01T00:00:00Z',fromClubId:'club-x',toClubId:'club-d'}]});
 assert.ok(broken.errors.some(row=>row.code==='PLAYER_TRANSFER_CHAIN_BROKEN'));
});
