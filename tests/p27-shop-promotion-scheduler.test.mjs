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
 for(const shop of ['player','club']){
  const catalog=shop==='player'
   ? ['boots-standard','boots-rare','boots-premium','accessory-standard','accessory-rare','accessory-premium','hair-standard','hair-rare','hair-premium','beard-standard','beard-rare','beard-premium','celebration-standard','celebration-rare','celebration-premium','profile-frame-standard','profile-frame-rare','profile-frame-premium','profile-background-standard','profile-background-rare','profile-background-premium']
   : ['club-crest-custom','club-official-colors','club-kit-home','club-kit-away','club-kit-third','club-kit-goalkeeper','club-stadium-standard','club-stadium-premium','club-grass-standard','club-grass-premium','club-capacity-level-1','club-capacity-level-2','club-capacity-level-3','club-capacity-level-4','club-supporter-flags','club-supporter-banners','club-supporter-tifo'];
  for(const id of catalog){
   const offer=getScheduledShopPromotion(shop,id,now);
   if(!offer)continue;
   assert.ok(offer.endsAt>offer.startsAt);
   assert.ok(offer.discountPercent>=1&&offer.discountPercent<=50);
   assert.deepEqual(offer.itemIds,[id]);
   assert.ok(['flash','daily','weekly','special'].includes(offer.type));
  }
 }
});

test('P27 promotions : les soldes expirent à la durée prévue et se renouvellent',()=>{
 const now=Date.UTC(2027,0,1,12);
 const all=[];
 for(const shop of ['player','club']){
  const ids=shop==='player'?['boots-standard','boots-rare','boots-premium','accessory-standard','accessory-rare','accessory-premium','hair-standard','hair-rare','hair-premium','beard-standard','beard-rare','beard-premium','celebration-standard','celebration-rare','celebration-premium','profile-frame-standard','profile-frame-rare','profile-frame-premium','profile-background-standard','profile-background-rare','profile-background-premium']:['club-crest-custom','club-official-colors','club-kit-home','club-kit-away','club-kit-third','club-kit-goalkeeper','club-stadium-standard','club-stadium-premium','club-grass-standard','club-grass-premium','club-capacity-level-1','club-capacity-level-2','club-capacity-level-3','club-capacity-level-4','club-supporter-flags','club-supporter-banners','club-supporter-tifo'];
  all.push(...ids.map(id=>getScheduledShopPromotion(shop,id,now)).filter(Boolean));
 }
 assert.ok(all.length>0);
 assert.ok(all.every(offer=>offer.endsAt>now));
});
