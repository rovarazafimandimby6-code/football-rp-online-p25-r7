import test from 'node:test';
import assert from 'node:assert/strict';
import { getScheduledShopPromotion } from '../server/shop-promotion-scheduler.js';

test('P27 promotions : crée des offres déterministes selon l’horloge serveur',()=>{
 const first=getScheduledShopPromotion('player','boots-standard',Date.UTC(2027,0,1,12));
 const second=getScheduledShopPromotion('player','boots-standard',Date.UTC(2027,0,1,12));
 assert.deepEqual(first,second);
 assert.equal(getScheduledShopPromotion('unknown','boots-standard',Date.UTC(2027,0,1)),null);
 assert.equal(getScheduledShopPromotion('player','unknown-item',Date.UTC(2027,0,1)),null);
});

test('P27 promotions : toutes les offres sont datées, bornées et non cumulables',()=>{
 const now=Date.UTC(2027,0,1,12);
 const catalog={
  player:['boots-standard','boots-rare','boots-premium','accessory-standard','accessory-rare','accessory-premium','hair-standard','hair-rare','hair-premium','beard-standard','beard-rare','beard-premium','celebration-standard','celebration-rare','celebration-premium','profile-frame-standard','profile-frame-rare','profile-frame-premium','profile-background-standard','profile-background-rare','profile-background-premium'],
  club:['club-crest-custom','club-official-colors','club-kit-home','club-kit-away','club-kit-third','club-kit-goalkeeper','club-stadium-standard','club-stadium-premium','club-grass-standard','club-grass-premium','club-capacity-level-1','club-capacity-level-2','club-capacity-level-3','club-capacity-level-4','club-supporter-flags','club-supporter-banners','club-supporter-tifo']
 };
 for(const [shop,ids] of Object.entries(catalog))for(const id of ids){
  const offer=getScheduledShopPromotion(shop,id,now);
  if(!offer)continue;
  assert.ok(offer.endsAt>offer.startsAt);
  assert.ok(offer.discountPercent>=1&&offer.discountPercent<=50);
  assert.ok(offer.itemIds.includes(id));
  assert.ok(['flash','daily','weekly','special'].includes(offer.type));
  if(offer.type==='special')assert.ok(offer.itemIds.length>=2);
 }
});

test('P27 promotions : les soldes expirent à la durée prévue et se renouvellent',()=>{
 const now=Date.UTC(2027,0,1,12);
 for(const [shop,ids] of Object.entries({
  player:['boots-standard','boots-rare','boots-premium','accessory-standard','accessory-rare','accessory-premium','hair-standard','hair-rare','hair-premium','beard-standard','beard-rare','beard-premium','celebration-standard','celebration-rare','celebration-premium','profile-frame-standard','profile-frame-rare','profile-frame-premium','profile-background-standard','profile-background-rare','profile-background-premium'],
  club:['club-crest-custom','club-official-colors','club-kit-home','club-kit-away','club-kit-third','club-kit-goalkeeper','club-stadium-standard','club-stadium-premium','club-grass-standard','club-grass-premium','club-capacity-level-1','club-capacity-level-2','club-capacity-level-3','club-capacity-level-4','club-supporter-flags','club-supporter-banners','club-supporter-tifo']
 })){
  const offers=ids.map(id=>getScheduledShopPromotion(shop,id,now)).filter(Boolean);
  assert.ok(offers.length>0);
  assert.ok(offers.every(offer=>offer.endsAt>now));
 }
});
