import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateResaleValue, getShopCatalog, getShopItem, getShopPrice, isPromotionActive, validateShopPurchase } from '../src/p27-shop-catalog.js';

test('P27 boutique : sépare les catalogues personnels et clubs avec leurs monnaies',()=>{
 const player=getShopCatalog('player'),club=getShopCatalog('club');
 assert.ok(player.length>0&&club.length>0);
 assert.ok(player.every(item=>item.currency==='player-coins'&&item.shop==='player'));
 assert.ok(club.every(item=>item.currency==='club-coins'&&item.shop==='club'));
 assert.equal(getShopCatalog('unknown').length,0);
 assert.equal(getShopItem('club-kit-home').shop,'club');
});

test('P27 boutique : conserve les tarifs personnels V1 et les taux de revente par rareté',()=>{
 assert.equal(getShopItem('boots-standard').price,500);
 assert.equal(getShopItem('boots-rare').price,1500);
 assert.equal(getShopItem('boots-premium').price,3000);
 assert.equal(calculateResaleValue('boots-standard',500),250);
 assert.equal(calculateResaleValue('boots-rare',1500),825);
 assert.equal(calculateResaleValue('boots-premium',3000),1800);
});

test('P27 boutique : revente calculée sur le prix promotionnel réellement payé',()=>{
 const price=getShopPrice('boots-premium',{promotion:{startsAt:100,endsAt:200,discountPercent:30,itemIds:['boots-premium']},now:150});
 assert.equal(price.price,2100);
 assert.equal(calculateResaleValue('boots-premium',price.price),1260);
});

test('P27 boutique : respecte les tarifs du club et interdit la revente des extensions',()=>{
 assert.equal(getShopItem('club-kit-home').price,8000);
 assert.equal(getShopItem('club-capacity-level-1').price,15000);
 assert.equal(calculateResaleValue('club-kit-home',8000),4000);
 assert.equal(calculateResaleValue('club-capacity-level-1',15000),null);
});

test('P27 boutique : promotion datée, non cumulable et plafonnée à 50 pour cent',()=>{
 const promo={startsAt:100,endsAt:200,discountPercent:30,itemIds:['boots-premium']};
 assert.equal(isPromotionActive(promo,99),false);
 assert.equal(isPromotionActive(promo,100),true);
 assert.equal(isPromotionActive(promo,199),true);
 assert.equal(isPromotionActive(promo,200),false);
 assert.equal(getShopPrice('boots-premium',{promotion:promo,now:150}).price,2100);
 assert.equal(getShopPrice('boots-standard',{promotion:promo,now:150}).price,500);
 assert.equal(getShopPrice('boots-premium',{promotion:{...promo,discountPercent:80},now:150}).price,3000);
});

test('P27 boutique : seuls les propriétaires peuvent acheter dans la boutique du club',()=>{
 assert.equal(validateShopPurchase({shop:'club',itemId:'club-kit-home',actorId:'member-1',ownerId:'owner-1'}).reason,'club-owner-required');
 assert.equal(validateShopPurchase({shop:'club',itemId:'club-kit-home',actorId:'owner-1',ownerId:'owner-1'}).ok,true);
 assert.equal(validateShopPurchase({shop:'player',itemId:'boots-standard',actorId:'player-1'}).ok,true);
 assert.equal(validateShopPurchase({shop:'player',itemId:'club-kit-home',actorId:'player-1'}).reason,'item-not-found');
});
