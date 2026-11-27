import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonProgressionStore } from '../server/progression-store.js';
import { JsonClubFinanceService } from '../server/club-finance-service.js';
import { JsonShopService } from '../server/shop-service.js';

function fixture(){
 const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-shop-service-'));
 const clubs=[{id:'club-one',budget:100000,roster:[]}];
 const progressionStore=new JsonProgressionStore(path.join(directory,'progression'));
 const clubFinanceService=new JsonClubFinanceService(path.join(directory,'finance'),{clubs});
 const ownerByClub={'club-one':'owner-one'};
 const service=new JsonShopService(path.join(directory,'shop'),{progressionStore,clubFinanceService,resolveClubOwner:id=>ownerByClub[id]||null,now:()=>1000});
 return {directory,progressionStore,clubFinanceService,service,cleanup:()=>rmSync(directory,{recursive:true,force:true})};
}

test('P27 boutique achat joueur : débit les pièces et persiste l’inventaire une seule fois',()=>{
 const f=fixture();try{
  const before=f.progressionStore.get('player-one').coins;
  const first=f.service.purchase({shop:'player',itemId:'boots-standard',actorId:'player-one',purchaseId:'player-buy-1'});
  assert.equal(first.ok,true);assert.equal(first.item.paidPrice,500);
  assert.equal(f.progressionStore.get('player-one').coins,before-500);
  assert.equal(f.service.inventory('player','player-one').length,1);
  const duplicate=f.service.purchase({shop:'player',itemId:'boots-standard',actorId:'player-one',purchaseId:'player-buy-1'});
  assert.equal(duplicate.ok,true);assert.equal(duplicate.duplicate,true);
  assert.equal(f.progressionStore.get('player-one').coins,before-500);
 }finally{f.cleanup();}
});

test('P27 boutique achat joueur : refuse solde insuffisant et articles déjà possédés',()=>{
 const f=fixture();try{
  const poor=f.service.purchase({shop:'player',itemId:'boots-premium',actorId:'poor-player',purchaseId:'poor-buy'});
  assert.equal(poor.ok,false);assert.equal(poor.reason,'insufficient-coins');
  const first=f.service.purchase({shop:'player',itemId:'boots-standard',actorId:'player-one',purchaseId:'owned-buy'});
  assert.equal(first.ok,true);
  assert.equal(f.service.purchase({shop:'player',itemId:'boots-standard',actorId:'player-one',purchaseId:'owned-buy-2'}).reason,'already-owned');
 }finally{f.cleanup();}
});

test('P27 boutique achat club : seul le propriétaire achète et la trésorerie du club est débitée',()=>{
 const f=fixture();try{
  const before=f.clubFinanceService.store.balance('club-one');
  const denied=f.service.purchase({shop:'club',itemId:'club-kit-home',actorId:'member-one',clubId:'club-one',purchaseId:'club-denied'});
  assert.equal(denied.reason,'club-owner-required');
  const bought=f.service.purchase({shop:'club',itemId:'club-kit-home',actorId:'owner-one',clubId:'club-one',purchaseId:'club-buy'});
  assert.equal(bought.ok,true);
  assert.equal(f.clubFinanceService.store.balance('club-one'),before-8000);
  assert.equal(f.service.inventory('club','club-one').length,1);
 }finally{f.cleanup();}
});

test('P27 boutique : respecte les promotions serveur et calcule la revente sur le prix payé',()=>{
 const f=fixture();
 try{
  f.service.promotionProvider=()=>({startsAt:500,endsAt:1500,discountPercent:30,itemIds:['boots-premium']});
  const bought=f.service.purchase({shop:'player',itemId:'boots-premium',actorId:'player-one',purchaseId:'promo-buy'});
  assert.equal(bought.purchase.paidPrice,2100);
  const before=f.progressionStore.get('player-one').coins;
  const sold=f.service.resale({shop:'player',actorId:'player-one',itemId:'boots-premium',resaleId:'promo-sale'});
  assert.equal(sold.ok,true);
  assert.equal(sold.resale.amount,1260);
  assert.equal(f.progressionStore.get('player-one').coins,before+1260);
  assert.equal(f.service.resale({shop:'player',actorId:'player-one',itemId:'boots-premium',resaleId:'promo-sale'}).duplicate,true);
 }finally{f.cleanup();}
});

test('P27 boutique : refuse la revente des extensions et conserve les achats du club après redémarrage',()=>{
 const f=fixture();try{
  const first=f.service.purchase({shop:'club',itemId:'club-capacity-level-1',actorId:'owner-one',clubId:'club-one',purchaseId:'upgrade-1'});
  assert.equal(first.ok,true);
  const second=f.service.purchase({shop:'club',itemId:'club-capacity-level-2',actorId:'owner-one',clubId:'club-one',purchaseId:'upgrade-2'});
  assert.equal(second.ok,true);
  assert.equal(f.service.resale({shop:'club',actorId:'owner-one',clubId:'club-one',itemId:'club-capacity-level-1',resaleId:'upgrade-sale'}).reason,'item-not-resellable');
  const restored=new JsonShopService(path.join(f.directory,'shop'),{progressionStore:f.progressionStore,clubFinanceService:f.clubFinanceService,resolveClubOwner:()=> 'owner-one'});
  assert.equal(restored.inventory('club','club-one').length,2);
 }finally{f.cleanup();}
});

test('P27 boutique : transaction de revente et d’achat reste liée à son propriétaire',()=>{
 const f=fixture();try{
  f.service.purchase({shop:'player',itemId:'boots-standard',actorId:'player-one',purchaseId:'player-owned'});
  const denied=f.service.resale({shop:'player',actorId:'player-two',itemId:'boots-standard',resaleId:'foreign-sale'});
  assert.equal(denied.reason,'item-not-owned');
 }finally{f.cleanup();}
});
