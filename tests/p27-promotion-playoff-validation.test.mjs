import test from 'node:test';
import assert from 'node:assert/strict';
import { createPromotionPlayoff, advancePromotionPlayoff } from '../src/season-movement-policy.js';

const standings=Array.from({length:20},(_,index)=>({id:`club-${index+1}`,name:`Club ${index+1}`}));

test('P27 barrages : refuse une saison ou des participants invalides',()=>{
 assert.throws(()=>createPromotionPlayoff({division:'D2',standings}),/INVALID_PROMOTION_PLAYOFF_SEASON/);
 assert.throws(()=>createPromotionPlayoff({seasonId:'2026-27',division:'D2',standings:standings.map((row,index)=>index===19?{...row,id:'club-1'}:row)}),/INVALID_PROMOTION_PLAYOFF_STANDING_IDS/);
 assert.throws(()=>createPromotionPlayoff({seasonId:'2026-27',division:'D2',standings:standings.map((row,index)=>index===19?{...row,id:''}:row)}),/INVALID_PROMOTION_PLAYOFF_STANDING_IDS/);
});

test('P27 barrages : refuse une fixture forgée ou un score invalide',()=>{
 const playoff=createPromotionPlayoff({seasonId:'2026-27',division:'D2',standings});
 const stored=playoff.fixtures[0];
 const forged={...stored,result:{home:2,away:1},status:'completed'};
 assert.equal(advancePromotionPlayoff(playoff,forged).reason,'invalid-playoff-fixture');
 stored.result={home:-1,away:0};stored.status='completed';
 assert.equal(advancePromotionPlayoff(playoff,stored).reason,'invalid-playoff-fixture');
 stored.result={home:2,away:1};
 assert.equal(advancePromotionPlayoff(playoff,stored).ok,true);
 const final=playoff.fixtures.find(item=>item.round===2);
 assert.equal(final.homeClubId,'club-4');
 assert.equal(final.status,'waiting');
});

test('P27 barrages : un final ne peut pas être attribué deux fois au même demi-finaliste',()=>{
 const playoff=createPromotionPlayoff({seasonId:'2026-27',division:'D2',standings});
 const first=playoff.fixtures[0],second=playoff.fixtures[1];
 first.result={home:2,away:0};first.status='completed';
 assert.equal(advancePromotionPlayoff(playoff,first).ok,true);
 second.homeClubId=first.homeClubId;second.awayClubId=first.awayClubId;
 second.result={home:3,away:0};second.status='completed';
 assert.equal(advancePromotionPlayoff(playoff,second).reason,'playoff-final-slot-conflict');
});
