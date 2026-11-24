import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSupporterProfile, buildSupporterDirectory } from '../src/p27-supporters.js';
test('P27 supporters: les indices sont déterministes, bornés et ne prétendent pas compter les spectateurs',()=>{
 const club={id:'support-club',name:'Support Club',division:'D3',reputation:68,location:{countryCode:'MG'}};
 const first=generateSupporterProfile(club,{matches:20,wins:12,draws:4,leagueTitles:1,seasonsParticipated:4});
 assert.deepEqual(first,generateSupporterProfile(club,{matches:20,wins:12,draws:4,leagueTitles:1,seasonsParticipated:4}));
 for(const key of ['popularityIndex','loyaltyIndex','localRootsIndex','internationalReachIndex','atmospherePotential']) assert.ok(first[key]>=0&&first[key]<=100);
 assert.equal(first.attendance,'not-estimated-without-verified-stadium-capacity');
 assert.equal(first.basis,'derived-from-club-profile-and-archived-results');
});
test('P27 supporters: les performances et titres archivés influencent la popularité',()=>{
 const club={id:'support-trend',division:'D5',reputation:45};
 const poor=generateSupporterProfile(club,{matches:10,wins:1,draws:1});
 const strong=generateSupporterProfile(club,{matches:10,wins:8,draws:1,leagueTitles:2});
 assert.ok(strong.popularityIndex>poor.popularityIndex);
 assert.equal(strong.trend,'rising');
 assert.equal(poor.trend,'declining');
});
test('P27 supporters: annuaire complet conserve une entrée par club',()=>{
 const clubs=[{id:'a',name:'A',division:'D1'},{id:'b',name:'B',division:'D5'}];
 const directory=buildSupporterDirectory(clubs,[{clubId:'a',matches:5,wins:4}]);
 assert.equal(directory.length,2);assert.deepEqual(directory.map(x=>x.clubId),['a','b']);
});
