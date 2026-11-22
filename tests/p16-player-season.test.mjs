import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerSeasonStats, calculateMatchRating } from '../src/player-season-stats.js';
import { readFile } from 'node:fs/promises';
function storage(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};}
test('P16 : statistiques personnelles persistées après un match',()=>{
 const s=storage(), stats=new PlayerSeasonStats(s,'p16');
 const out=stats.recordMatch({result:'win',stats:{goals:1,shots:3,passes:12,tackles:2,interceptions:1,cleanSheet:true},date:'2026-11-22T00:00:00Z'});
 assert.equal(out.ok,true); assert.equal(out.totals.matches,1); assert.equal(out.totals.goals,1); assert.equal(out.totals.cleanSheets,1);
 const restored=new PlayerSeasonStats(s,'p16'); assert.equal(restored.snapshot().totals.passes,12); assert.equal(restored.snapshot().matches[0].rating,out.match.rating);
});
test('P16 : rejette les résultats invalides et borne les statistiques',()=>{
 const stats=new PlayerSeasonStats(storage(),'p16-invalid');
 assert.equal(stats.recordMatch({result:'abandon'}).reason,'invalid-result');
 const out=stats.recordMatch({result:'draw',stats:{goals:-4,shots:Infinity,passes:5.9}});
 assert.equal(out.match.goals,0); assert.equal(out.match.shots,0); assert.equal(out.match.passes,5);
});
test('P16 : note individuelle bornée et valorise les performances',()=>{
 assert.ok(calculateMatchRating({goals:3,assists:2,shots:8,passes:20,completedPasses:18,tackles:5,interceptions:4},'win') > calculateMatchRating({},'loss'));
 assert.ok(calculateMatchRating({goals:99},'win') <= 10);
});
test('P16 : les statistiques du personnage sont transmises en fin de match et affichées au profil',async()=>{
 const game=await readFile(new URL('../src/game.js',import.meta.url),'utf8');
 const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(game,/playerStats: \{ \.\.\.this\.playerMatchStats/);
 assert.match(game,/if \(passer\.isControlled\) \{/);
 assert.match(game,/this\.playerMatchStats\.passes\+\+/);
 assert.match(game,/if \(shooter\.isControlled\) this\.playerMatchStats\.shots\+\+/);
 assert.match(main,/seasonStats\.recordMatch\(/); assert.match(main,/Statistiques personnelles/);
});
