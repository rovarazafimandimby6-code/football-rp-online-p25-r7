import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerSeasonStats } from '../src/player-season-stats.js';
function storage(){const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))};}

test('P27 carrière : conserve statistiques détaillées, minutes et distinctions après rechargement',()=>{
 const saved=storage(), first=new PlayerSeasonStats(saved,'career-history');
 first.recordMatch({matchId:'match-1',result:'win',date:'2026-11-24T10:00:00Z',stats:{goals:2,assists:1,passes:20,completedPasses:17,tackles:3,interceptions:2},minutesPlayedMs:245000,role:'FWD',rating:8.7,playerOfMatch:true,opponent:'Toamasina United'});
 const snapshot=new PlayerSeasonStats(saved,'career-history').snapshot();
 assert.equal(snapshot.totals.matches,1); assert.equal(snapshot.totals.minutesPlayedMs,245000); assert.equal(snapshot.totals.completedPasses,17);
 assert.equal(snapshot.totals.playerOfMatch,1); assert.equal(snapshot.averageRating,8.7); assert.equal(snapshot.matches[0].opponent,'Toamasina United'); assert.equal(snapshot.matches[0].role,'FWD');
});

test('P27 carrière : forme sur cinq matchs et idempotence',()=>{
 const stats=new PlayerSeasonStats(storage(),'career-form');
 for(let i=0;i<6;i++) stats.recordMatch({matchId:`m-${i}`,result:i%2?'loss':'win',rating:6+i/10});
 const before=stats.snapshot(); assert.equal(before.currentForm.length,5); assert.equal(before.currentForm[0].matchId,'m-1'); assert.equal(before.currentForm[4].matchId,'m-5');
 assert.equal(stats.recordMatch({matchId:'m-5',result:'win',rating:10}).duplicate,true); assert.equal(stats.snapshot().totals.matches,6); assert.equal(stats.snapshot().averageRating,before.averageRating);
});

test('P27 carrière : normalise les données invalides',()=>{
 const stats=new PlayerSeasonStats(storage(),'career-legacy');
 stats.recordMatch({result:'draw',stats:{goals:-2,passes:4.8},rating:99,minutesPlayedMs:-1});
 const entry=stats.snapshot().matches[0]; assert.equal(entry.goals,0); assert.equal(entry.passes,4); assert.equal(entry.rating,10); assert.equal(entry.minutesPlayedMs,0);
});
