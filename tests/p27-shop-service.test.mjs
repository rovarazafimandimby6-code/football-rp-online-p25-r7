import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonProgressionStore } from '../server/progression-store.js';
import { JsonClubFinanceService } from '../server/club-finance-service.js';
import { JsonShopService } from '../server/shop-service.js';

function fund(progressionStore,accountId,amount=10000){progressionStore.creditCoins(accountId,{transactionId:'test-fund-'+accountId,amount});}

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
  fund(f.progressionStore,'player-one');
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
  fund(f.progressionStore,'player-one');
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
  fund(f.progressionStore,'player-one');
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
  fund(f.progressionStore,'player-one');
  f.service.purchase({shop:'player',itemId:'boots-standard',actorId:'player-one',purchaseId:'player-owned'});
  const denied=f.service.resale({shop:'player',actorId:'player-two',itemId:'boots-standard',resaleId:'foreign-sale'});
  assert.equal(denied.reason,'item-not-owned');
 }finally{f.cleanup();}
});

test('P27 boutique : une interruption après débit reprend sans double prélèvement',()=>{
 const f=fixture();try{
  fund(f.progressionStore,'player-recovery');
  const original=f.progressionStore.spendCoins.bind(f.progressionStore);
  let interrupted=false;
  f.progressionStore.spendCoins=(accountId,args)=>{
   const result=original(accountId,args);
   if(!interrupted){interrupted=true;throw new Error('SIMULATED_PROCESS_INTERRUPTION');}
   return result;
  };
  assert.throws(()=>f.service.purchase({shop:'player',itemId:'boots-standard',actorId:'player-recovery',purchaseId:'recover-buy'}),/SIMULATED_PROCESS_INTERRUPTION/);
  const afterFirstDebit=f.progressionStore.get('player-recovery').coins;
  f.progressionStore.spendCoins=original;
  const resumed=f.service.purchase({shop:'player',itemId:'boots-standard',actorId:'player-recovery',purchaseId:'recover-buy'});
  assert.equal(resumed.ok,true);
  assert.equal(f.progressionStore.get('player-recovery').coins,afterFirstDebit);
  assert.equal(f.service.inventory('player','player-recovery').length,1);
 }finally{f.cleanup();}
});

test('P27 boutique : une promotion fournie par le client est ignorée',()=>{
 const f=fixture();try{
  fund(f.progressionStore,'player-client-promo');
  const bought=f.service.purchase({shop:'player',itemId:'boots-premium',actorId:'player-client-promo',purchaseId:'client-promo',
   promotion:{startsAt:0,endsAt:999999,discountPercent:50,itemIds:['boots-premium']}});
  assert.equal(bought.ok,true);
  assert.equal(bought.purchase.paidPrice,3000);
 }finally{f.cleanup();}
});

test('P27 boutique : empêche la revente d’un article actuellement équipé',()=>{
 const f=fixture();try{
  fund(f.progressionStore,'player-equipped');
  const bought=f.service.purchase({shop:'player',itemId:'boots-standard',actorId:'player-equipped',purchaseId:'equip-buy'});
  assert.equal(bought.ok,true);
  assert.equal(f.service.setEquipped({shop:'player',actorId:'player-equipped',itemId:'boots-standard'}).ok,true);
  assert.equal(f.service.resale({shop:'player',actorId:'player-equipped',itemId:'boots-standard',resaleId:'equip-sale'}).reason,'item-active');
  assert.equal(f.service.setEquipped({shop:'player',actorId:'player-equipped',itemId:'boots-standard',equipped:false}).ok,true);
  assert.equal(f.service.resale({shop:'player',actorId:'player-equipped',itemId:'boots-standard',resaleId:'equip-sale-2'}).ok,true);
 }finally{f.cleanup();}
});

test('P27 boutique club : revend les cosmétiques au club et bloque les biens équipés',()=>{
 const f=fixture();try{
  const before=f.clubFinanceService.store.balance('club-one');
  assert.equal(f.service.purchase({shop:'club',itemId:'club-kit-home',actorId:'owner-one',clubId:'club-one',purchaseId:'club-kit-buy'}).ok,true);
  assert.equal(f.service.setEquipped({shop:'club',itemId:'club-kit-home',actorId:'owner-one',clubId:'club-one'}).ok,true);
  assert.equal(f.service.resale({shop:'club',itemId:'club-kit-home',actorId:'owner-one',clubId:'club-one',resaleId:'club-kit-sale'}).reason,'item-active');
  f.service.setEquipped({shop:'club',itemId:'club-kit-home',actorId:'owner-one',clubId:'club-one',equipped:false});
  const sold=f.service.resale({shop:'club',itemId:'club-kit-home',actorId:'owner-one',clubId:'club-one',resaleId:'club-kit-sale'});
  assert.equal(sold.ok,true);
  assert.equal(sold.resale.amount,4000);
  assert.equal(f.clubFinanceService.store.balance('club-one'),before-4000);
 }finally{f.cleanup();}
});

test('P27 boutique : inventaire personnel persistant après redémarrage du service',()=>{
 const f=fixture();try{
  fund(f.progressionStore,'player-restart');
  f.service.purchase({shop:'player',itemId:'boots-standard',actorId:'player-restart',purchaseId:'restart-buy'});
  const restarted=new JsonShopService(path.join(f.directory,'shop'),{progressionStore:f.progressionStore,clubFinanceService:f.clubFinanceService,resolveClubOwner:()=> 'owner-one'});
  assert.equal(restarted.inventory('player','player-restart').length,1);
  assert.equal(restarted.inventory('player','player-other').length,0);
 }finally{f.cleanup();}
});


test('P27 boutique club : le changement de propriétaire conserve les biens et transfère les permissions',()=>{
 const f=fixture();try{
  let currentOwner='owner-one';
  f.service.resolveClubOwner=id=>id==='club-one'?currentOwner:null;
  const bought=f.service.purchase({shop:'club',itemId:'club-kit-home',actorId:'owner-one',clubId:'club-one',purchaseId:'owner-transfer-buy'});
  assert.equal(bought.ok,true);
  const originalInventory=f.service.inventory('club','club-one');
  currentOwner='owner-two';
  assert.equal(f.service.purchase({shop:'club',itemId:'club-kit-away',actorId:'owner-one',clubId:'club-one',purchaseId:'former-owner-buy'}).reason,'club-owner-required');
  assert.equal(f.service.resale({shop:'club',actorId:'owner-one',clubId:'club-one',itemId:'club-kit-home',resaleId:'former-owner-sale'}).reason,'club-owner-required');
  const newOwnerInventory=f.service.inventory('club','club-one');
  assert.deepEqual(newOwnerInventory,originalInventory);
  assert.equal(f.service.purchase({shop:'club',itemId:'club-kit-away',actorId:'owner-two',clubId:'club-one',purchaseId:'new-owner-buy'}).ok,true);
  assert.equal(f.service.inventory('club','club-one').length,2);
 }finally{f.cleanup();}
});

test('P27 boutique : refuse une revente dont l’identifiant est réutilisé pour un autre article',()=>{
 const f=fixture();try{
  fund(f.progressionStore,'player-resale-id');
  f.service.purchase({shop:'player',itemId:'boots-standard',actorId:'player-resale-id',purchaseId:'resale-id-buy-1'});
  f.service.purchase({shop:'player',itemId:'accessory-standard',actorId:'player-resale-id',purchaseId:'resale-id-buy-2'});
  const first=f.service.resale({shop:'player',actorId:'player-resale-id',itemId:'boots-standard',resaleId:'same-resale-id'});
  assert.equal(first.ok,true);
  const conflict=f.service.resale({shop:'player',actorId:'player-resale-id',itemId:'accessory-standard',resaleId:'same-resale-id'});
  assert.equal(conflict.ok,false);
  assert.equal(conflict.reason,'resale-id-conflict');
  assert.equal(f.service.inventory('player','player-resale-id').filter(item=>item.status==='resold').length,1);
 }finally{f.cleanup();}
});


test('P27 boutique : inventaire et journal de revente restent cohérents après redémarrage',()=>{
 const f=fixture();try{
  fund(f.progressionStore,'player-sale-restart');
  const bought=f.service.purchase({shop:'player',itemId:'boots-premium',actorId:'player-sale-restart',purchaseId:'sale-restart-buy'});
  assert.equal(bought.ok,true);
  const sold=f.service.resale({shop:'player',actorId:'player-sale-restart',itemId:'boots-premium',resaleId:'sale-restart-resale'});
  assert.equal(sold.ok,true);
  const restarted=new JsonShopService(path.join(f.directory,'shop'),{progressionStore:f.progressionStore,clubFinanceService:f.clubFinanceService,resolveClubOwner:()=> 'owner-one'});
  assert.equal(restarted.inventory('player','player-sale-restart')[0].status,'resold');
  assert.equal(restarted.getHistory({shop:'player',ownerId:'player-sale-restart'}).resales[0].purchaseId,'sale-restart-buy');
 }finally{f.cleanup();}
});

test('P27 boutique : rejette un inventaire persistant dont le prix payé dépasse le catalogue',()=>{
 const f=fixture();try{
  fund(f.progressionStore,'player-tampered-shop');
  f.service.purchase({shop:'player',itemId:'boots-standard',actorId:'player-tampered-shop',purchaseId:'tampered-shop-buy'});
  const state=JSON.parse(readFileSync(f.service.file,'utf8'));
  state.players[0].items[0].paidPrice=9000;
  writeFileSync(f.service.file,JSON.stringify(state));
  assert.throws(()=>new JsonShopService(path.join(f.directory,'shop'),{progressionStore:f.progressionStore,clubFinanceService:f.clubFinanceService}),/SHOP_STORE_CORRUPT/);
 }finally{f.cleanup();}
});


test('P27 boutique : refuse un journal personnel où acteur et propriétaire divergent',()=>{
 const f=fixture();try{
  fund(f.progressionStore,'player-ledger-identity');
  f.service.purchase({shop:'player',itemId:'boots-standard',actorId:'player-ledger-identity',purchaseId:'ledger-identity-buy'});
  const state=JSON.parse(readFileSync(f.service.file,'utf8'));
  state.purchases[0].actorId='different-player';
  writeFileSync(f.service.file,JSON.stringify(state));
  assert.throws(()=>new JsonShopService(path.join(f.directory,'shop'),{progressionStore:f.progressionStore,clubFinanceService:f.clubFinanceService}),/SHOP_STORE_CORRUPT/);
 }finally{f.cleanup();}
});


test('P27 boutique : un seul cosmétique équipé par emplacement et revente après remplacement',()=>{
 const f=fixture();try{
  fund(f.progressionStore,'player-equip-slot');
  assert.equal(f.service.purchase({shop:'player',itemId:'boots-standard',actorId:'player-equip-slot',purchaseId:'slot-boots-1'}).ok,true);
  assert.equal(f.service.purchase({shop:'player',itemId:'boots-rare',actorId:'player-equip-slot',purchaseId:'slot-boots-2'}).ok,true);
  assert.equal(f.service.setEquipped({shop:'player',actorId:'player-equip-slot',itemId:'boots-standard',equipped:true}).ok,true);
  assert.equal(f.service.setEquipped({shop:'player',actorId:'player-equip-slot',itemId:'boots-rare',equipped:true}).ok,true);
  const items=f.service.inventory('player','player-equip-slot');
  assert.equal(items.find(x=>x.itemId==='boots-standard').equipped,false);
  assert.equal(items.find(x=>x.itemId==='boots-rare').equipped,true);
  assert.equal(f.service.resale({shop:'player',actorId:'player-equip-slot',itemId:'boots-standard',resaleId:'slot-resale-old'}).ok,true);
  assert.equal(f.service.resale({shop:'player',actorId:'player-equip-slot',itemId:'boots-rare',resaleId:'slot-resale-active'}).reason,'item-active');
 }finally{f.cleanup();}
});

test('P27 boutique club : les quatre maillots gardent des emplacements distincts',()=>{
 const f=fixture();try{
  for(const itemId of ['club-kit-home','club-kit-away','club-kit-third','club-kit-goalkeeper']){
   assert.equal(f.service.purchase({shop:'club',itemId,actorId:'owner-one',clubId:'club-one',purchaseId:'kit-slot-'+itemId}).ok,true);
   assert.equal(f.service.setEquipped({shop:'club',actorId:'owner-one',clubId:'club-one',itemId,equipped:true}).ok,true);
  }
  assert.equal(f.service.inventory('club','club-one').filter(x=>x.equipped).length,4);
 }finally{f.cleanup();}
});
