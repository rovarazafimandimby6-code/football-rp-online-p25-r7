import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { calculateResaleValue, getP27StadiumCapacity, getShopCatalog, getShopItem, getShopPrice, validateShopPurchase } from '../src/p27-shop-catalog.js';

const cleanId=value=>String(value??'').trim().slice(0,80);
const cleanTransactionId=value=>{const id=String(value??'').trim();return id.length>0&&id.length<=64?id:'';};
const clone=value=>JSON.parse(JSON.stringify(value));
const validShop=shop=>shop==='player'||shop==='club';
const emptyState=()=>({version:1,players:[],clubs:[],purchases:[],resales:[]});

function validPersistedState(value){
  if(value?.version!==1||!Array.isArray(value.players)||!Array.isArray(value.clubs)||
    !Array.isArray(value.purchases)||!Array.isArray(value.resales))return false;
  const purchaseById=new Map(), resaleById=new Map(), inventoryByPurchase=new Map();
  for(const [shop,rows] of [['player',value.players],['club',value.clubs]]){
    const owners=new Set();
    for(const row of rows){
      if(!row||!cleanId(row.ownerId)||owners.has(cleanId(row.ownerId))||!Array.isArray(row.items))return false;
      owners.add(cleanId(row.ownerId));
      const activeItems=new Set();
      const equippedSlots=new Set();
      for(const entry of row.items){
        const item=getShopItem(entry?.itemId);
        if(!item||item.shop!==shop||entry.category!==item.category||entry.rarity!==item.rarity||
          (Object.hasOwn(entry,'equipSlot')&&entry.equipSlot!==(item.equipSlot||null))||
          entry.upgradeLevel!==(item.upgradeLevel||null)||!['owned','resold'].includes(entry.status)||
          !Number.isSafeInteger(entry.paidPrice)||entry.paidPrice<1||entry.paidPrice>item.price||
          entry.currency!==item.currency||entry.resellable!==item.resellable||
          entry.resaleRate!==item.resaleRate||typeof entry.equipped!=='boolean'||
          !cleanTransactionId(entry.purchaseId)||inventoryByPurchase.has(entry.purchaseId))return false;
        if(entry.status==='owned'){
          if(activeItems.has(entry.itemId)||entry.resaleId||entry.resoldAt!==undefined)return false;
          activeItems.add(entry.itemId);
          if(entry.equipped===true&&item.equipSlot){
            if(equippedSlots.has(item.equipSlot))return false;
            equippedSlots.add(item.equipSlot);
          }
        }else if(entry.equipped===true||!cleanTransactionId(entry.resaleId)||
          !Number.isSafeInteger(entry.resoldAt)||entry.resoldAt<0)return false;
        inventoryByPurchase.set(entry.purchaseId,{shop,ownerId:cleanId(row.ownerId),entry});
      }
    }
  }
  for(const purchase of value.purchases){
    const item=getShopItem(purchase?.itemId);
    if(!cleanTransactionId(purchase?.id)||purchaseById.has(purchase.id)||!item||
      purchase.shop!==item.shop||!cleanId(purchase.ownerId)||!cleanId(purchase.actorId)||
      (purchase.shop==='player'&&purchase.actorId!==purchase.ownerId)||
      purchase.category!==item.category||purchase.rarity!==item.rarity||
      (Object.hasOwn(purchase,'equipSlot')&&purchase.equipSlot!==(item.equipSlot||null))||
      !['pending','completed','failed'].includes(purchase.status)||
      !Number.isSafeInteger(purchase.paidPrice)||purchase.paidPrice<1||purchase.paidPrice>item.price||
      purchase.basePrice!==item.price||!Number.isInteger(purchase.discountPercent)||
      purchase.discountPercent<0||purchase.discountPercent>50||
      purchase.paidPrice!==Math.max(1,Math.round(item.price*(100-purchase.discountPercent)/100))||
      purchase.currency!==item.currency||!Number.isSafeInteger(purchase.createdAt)||purchase.createdAt<0)return false;
    const inventory=inventoryByPurchase.get(purchase.id);
    if(purchase.status==='completed'){
      if(!inventory||inventory.shop!==purchase.shop||inventory.ownerId!==purchase.ownerId||
        inventory.entry.itemId!==purchase.itemId||inventory.entry.purchasedAt!==purchase.createdAt)return false;
    }else if(inventory)return false;
    purchaseById.set(purchase.id,purchase);
  }
  for(const [purchaseId,inventory] of inventoryByPurchase){
    const purchase=purchaseById.get(purchaseId);
    if(!purchase||purchase.status!=='completed'||purchase.ownerId!==inventory.ownerId||
      purchase.shop!==inventory.shop||purchase.itemId!==inventory.entry.itemId)return false;
  }
  for(const resale of value.resales){
    const item=getShopItem(resale?.itemId), inventory=inventoryByPurchase.get(resale?.purchaseId)||[...inventoryByPurchase.values()].find(record=>record.shop===resale?.shop&&record.ownerId===cleanId(resale?.ownerId)&&record.entry.itemId===resale?.itemId&&(resale?.status==='completed'?record.entry.resaleId===resale?.id:record.entry.status==='owned'));
    if(!cleanTransactionId(resale?.id)||resaleById.has(resale.id)||!item||
      resale.shop!==item.shop||!cleanId(resale.ownerId)||!cleanId(resale.actorId)||
      (resale.shop==='player'&&resale.actorId!==resale.ownerId)||
      !['pending','completed'].includes(resale.status)||!Number.isSafeInteger(resale.amount)||
      resale.amount<1||resale.currency!==item.currency||!Number.isSafeInteger(resale.createdAt)||
      resale.createdAt<0||!inventory||inventory.shop!==resale.shop||
      inventory.ownerId!==resale.ownerId||inventory.entry.itemId!==resale.itemId||
      calculateResaleValue(item,inventory.entry.paidPrice)!==resale.amount)return false;
    if(resale.status==='completed'){
      if(inventory.entry.status!=='resold'||inventory.entry.resaleId!==resale.id)return false;
    }else if(inventory.entry.status!=='owned')return false;
    resaleById.set(resale.id,resale);
  }
  for(const inventory of inventoryByPurchase.values()){
    if(inventory.entry.status==='resold'&&!resaleById.has(inventory.entry.resaleId))return false;
  }
  return true;
}

/**
 * Persistent shop orchestration. Player balances are debited by the progression
 * ledger; club balances are debited by the club finance ledger. The shop journal
 * is written before money moves, so an interrupted operation can be safely retried.
 */
export class JsonShopService {
  constructor(directory,{progressionStore,clubFinanceService,resolveClubOwner=()=>null,promotionProvider=()=>null,now=()=>Date.now()}={}){
    if(!progressionStore||!clubFinanceService)throw new Error('SHOP_DEPENDENCIES_REQUIRED');
    this.directory=path.resolve(directory);
    this.file=path.join(this.directory,'shop-inventory.json');
    this.progressionStore=progressionStore;
    this.clubFinanceService=clubFinanceService;
    this.resolveClubOwner=resolveClubOwner;
    this.promotionProvider=promotionProvider;
    this.now=now;
    mkdirSync(this.directory,{recursive:true});
    this.state=this.read();
  }
  read(){
    try{
      const value=JSON.parse(readFileSync(this.file,'utf8'));
      if(!validPersistedState(value))throw new Error('bad schema or ledger invariants');
      return value;
    }catch(error){
      if(error.code==='ENOENT')return emptyState();
      throw new Error('SHOP_STORE_CORRUPT');
    }
  }
  persist(){
    const temp=`${this.file}.${process.pid}.${randomUUID()}.tmp`;
    try{writeFileSync(temp,JSON.stringify(this.state),{mode:0o600});renameSync(temp,this.file);}
    catch(error){try{unlinkSync(temp);}catch{}throw error;}
  }
  transaction(mutator){
    const previous=this.state;
    this.state=clone(previous);
    try{const value=mutator();this.persist();return value;}
    catch(error){this.state=previous;throw error;}
  }
  ownerOf(clubId){
    const owner=this.resolveClubOwner(clubId);
    return owner===null||owner===undefined?null:cleanId(owner)||null;
  }
  catalog(shop){
    if(!['player','club'].includes(shop))return [];
    return getShopCatalog(shop).map(item=>{
      const promotion=this.promotionProvider(shop,item.id)||null;
      return {...item,...getShopPrice(item,{promotion,now:this.now()}),promotionType:promotion?.type||null,promotionLabel:promotion?.label||null};
    });
  }
  publicAppearance(clubId){
    const id=cleanId(clubId);
    if(!id)return {equippedItemIds:[],stadiumExpansionLevel:0,stadiumCapacity:getP27StadiumCapacity(0)};
    const items=this.inventory('club',id).filter(entry=>entry.status==='owned');
    const equippedItemIds=items
      .filter(entry=>entry.equipped===true && ['identity','kits','stadium','supporters'].includes(entry.category))
      .map(entry=>entry.itemId)
      .filter(itemId=>getShopItem(itemId)?.shop==='club');
    const stadiumExpansionLevel=Math.max(0,...items
      .filter(entry=>entry.category==='capacity' && Number.isInteger(entry.upgradeLevel) && entry.upgradeLevel>=1 && entry.upgradeLevel<=4)
      .map(entry=>entry.upgradeLevel));
    return {equippedItemIds,stadiumExpansionLevel,stadiumCapacity:getP27StadiumCapacity(stadiumExpansionLevel)};
  }
  inventory(shop,ownerId){
    if(!validShop(shop)||!cleanId(ownerId))return [];
    const rows=shop==='player'?this.state.players:this.state.clubs;
    const row=rows.find(item=>item.ownerId===ownerId);
    return clone(row?.items||[]);
  }
  findInventoryRow(shop,ownerId,create=false){
    if(!validShop(shop)||!cleanId(ownerId))return null;
    const rows=shop==='player'?this.state.players:this.state.clubs;
    let row=rows.find(item=>item.ownerId===ownerId);
    if(!row&&create){row={ownerId,items:[]};rows.push(row);}
    return row||null;
  }
  purchase({shop,itemId,actorId,clubId=null,purchaseId}={}){
    if(!validShop(shop))return {ok:false,reason:'invalid-shop'};
    const id=cleanTransactionId(purchaseId),actor=cleanId(actorId),club=cleanId(clubId);
    if(!id||!actor)return {ok:false,reason:'invalid-purchase'};
    const target=shop==='player'?actor:club;
    if(!target)return {ok:false,reason:'invalid-club'};
    const owner=shop==='player'?actor:this.ownerOf(club);
    const auth=validateShopPurchase({shop,itemId,actorId:actor,ownerId:owner,now:this.now()});
    if(!auth.ok)return auth;
    const item=auth.item;
    if(shop==='club'&&owner!==actor)return {ok:false,reason:'club-owner-required'};
    const prior=this.state.purchases.find(row=>row.id===id);
    if(prior){
      if(prior.shop!==shop||prior.itemId!==item.id||prior.ownerId!==target)return {ok:false,reason:'purchase-id-conflict'};
      if(prior.status==='completed')return {ok:true,duplicate:true,purchase:clone(prior),inventory:this.inventory(shop,target)};
      if(prior.status==='failed')return {ok:false,reason:prior.failureReason||'purchase-failed'};
    }
    const owned=this.inventory(shop,target).find(entry=>entry.itemId===item.id&&entry.status!=='resold');
    if(owned)return {ok:false,reason:'already-owned'};
    if(shop==='club'&&item.category==='capacity'){
      const levels=this.inventory('club',club).filter(entry=>entry.category==='capacity'&&entry.status!=='resold').map(entry=>entry.upgradeLevel||0);
      const current=Math.max(0,...levels);
      if(item.upgradeLevel!==current+1)return {ok:false,reason:'stadium-upgrade-order'};
    }
    const offer=this.promotionProvider(shop,item.id)||null;
    const price=getShopPrice(item,{promotion:offer,now:this.now()});
    if(!price)return {ok:false,reason:'invalid-price'};
    let journal=prior;
    if(!journal){
      journal={id,shop,ownerId:target,actorId:actor,itemId:item.id,category:item.category,rarity:item.rarity,equipSlot:item.equipSlot||null,
        basePrice:price.basePrice,paidPrice:price.price,discountPercent:price.discountPercent,promotionType:offer?.type||null,promotionEndsAt:price.endsAt||null,
        currency:item.currency,status:'pending',createdAt:this.now()};
      this.transaction(()=>{this.state.purchases.push(journal);return true;});
    }
    const debit=this.debit(journal);
    if(!debit.ok){
      this.transaction(()=>{const row=this.state.purchases.find(entry=>entry.id===id);row.status='failed';row.failureReason=debit.reason;return true;});
      return {ok:false,reason:debit.reason};
    }
    const completed={...journal,status:'completed',completedAt:this.now()};
    const ownedItem={itemId:item.id,category:item.category,rarity:item.rarity,paidPrice:journal.paidPrice,
      currency:item.currency,resellable:item.resellable===true,resaleRate:item.resaleRate||0,
      upgradeLevel:item.upgradeLevel||null,equipSlot:item.equipSlot||null,equipped:false,status:'owned',purchasedAt:journal.createdAt,purchaseId:id};
    this.transaction(()=>{
      const row=this.findInventoryRow(shop,target,true);
      if(row.items.some(entry=>entry.itemId===item.id&&entry.status!=='resold'))throw new Error('ALREADY_OWNED');
      row.items.push(ownedItem);
      const stored=this.state.purchases.find(entry=>entry.id===id);
      Object.assign(stored,completed);
      return true;
    });
    return {ok:true,duplicate:false,purchase:clone(completed),item:clone(ownedItem),inventory:this.inventory(shop,target)};
  }
  debit(purchase){
    if(purchase.shop==='player'){
      const result=this.progressionStore.spendCoins(purchase.ownerId,{transactionId:'shop-buy-'+purchase.id,amount:purchase.paidPrice});
      return {ok:result.ok,reason:result.reason||null};
    }
    const result=this.clubFinanceService.store.post(purchase.ownerId,{
      id:'shop-buy-'+purchase.id,category:'other',amount:purchase.paidPrice,direction:'expense',
      description:'Achat boutique du club',createdAt:purchase.createdAt,referenceId:purchase.itemId
    });
    return {ok:result.ok,reason:result.reason||null};
  }
  resale({shop,actorId,clubId=null,itemId,resaleId}={}){
    if(!validShop(shop))return {ok:false,reason:'invalid-shop'};
    const id=cleanTransactionId(resaleId),actor=cleanId(actorId),club=cleanId(clubId);
    if(!id||!actor)return {ok:false,reason:'invalid-resale'};
    const owner=shop==='player'?actor:this.ownerOf(club);
    const target=shop==='player'?actor:club;
    if(!target)return {ok:false,reason:'invalid-club'};
    if(shop==='club'&&owner!==actor)return {ok:false,reason:'club-owner-required'};
    const prior=this.state.resales.find(row=>row.id===id);
    if(prior){
      if(prior.shop!==shop||prior.ownerId!==target||prior.itemId!==itemId)return {ok:false,reason:'resale-id-conflict'};
      if(prior.status==='completed')return {ok:true,duplicate:true,resale:clone(prior),inventory:this.inventory(shop,target)};
    }
    const inventory=this.findInventoryRow(shop,target);
    const owned=inventory?.items.find(entry=>entry.itemId===itemId&&entry.status==='owned');
    if(!owned)return {ok:false,reason:'item-not-owned'};
    if(owned.equipped===true)return {ok:false,reason:'item-active'};
    const value=calculateResaleValue(itemId,owned.paidPrice);
    if(value===null)return {ok:false,reason:'item-not-resellable'};
    if(value<=0)return {ok:false,reason:'resale-value-zero'};
    let journal=prior;
    if(!journal){
      journal={id,shop,ownerId:target,actorId:actor,itemId,purchaseId:owned.purchaseId,amount:value,currency:owned.currency,status:'pending',createdAt:this.now()};
      this.transaction(()=>{this.state.resales.push(journal);return true;});
    }
    const credit=this.credit(journal);
    if(!credit.ok)return {ok:false,reason:credit.reason||'resale-credit-failed'};
    const completed={...journal,status:'completed',completedAt:this.now()};
    this.transaction(()=>{
      const row=this.findInventoryRow(shop,target);
      const entry=row?.items.find(value=>value.itemId===itemId&&value.status==='owned');
      if(!entry)throw new Error('ITEM_NOT_OWNED');
      entry.status='resold';entry.resoldAt=completed.completedAt;entry.resaleId=id;
      Object.assign(this.state.resales.find(value=>value.id===id),completed);
      return true;
    });
    return {ok:true,duplicate:false,resale:clone(completed),inventory:this.inventory(shop,target)};
  }
  credit(resale){
    if(resale.shop==='player'){
      const result=this.progressionStore.creditCoins(resale.ownerId,{transactionId:'shop-resale-'+resale.id,amount:resale.amount});
      return {ok:result.ok,reason:result.reason||null};
    }
    const result=this.clubFinanceService.store.post(resale.ownerId,{
      id:'shop-resale-'+resale.id,category:'other',amount:resale.amount,direction:'income',
      description:'Revente boutique du club',createdAt:resale.createdAt,referenceId:resale.itemId
    });
    return {ok:result.ok,reason:result.reason||null};
  }
  setEquipped({shop,actorId,clubId=null,itemId,equipped=true}={}){
    if(!validShop(shop))return {ok:false,reason:'invalid-shop'};
    const actor=cleanId(actorId),club=cleanId(clubId),target=shop==='player'?actor:club;
    if(!actor||!target)return {ok:false,reason:'invalid-owner'};
    if(shop==='club'&&this.ownerOf(club)!==actor)return {ok:false,reason:'club-owner-required'};
    if(typeof equipped!=='boolean')return {ok:false,reason:'invalid-equipped-state'};
    const existing=this.findInventoryRow(shop,target)?.items.find(entry=>entry.itemId===itemId&&entry.status==='owned');
    if(!existing)return {ok:false,reason:'item-not-owned'};
    this.transaction(()=>{
      const row=this.findInventoryRow(shop,target);
      const item=row.items.find(entry=>entry.itemId===itemId&&entry.status==='owned');
      if(!item)throw new Error('ITEM_NOT_OWNED');
      const slot=getShopItem(itemId)?.equipSlot||null;
      if(equipped&&slot){
        for(const other of row.items){
          if(other.status==='owned'&&other.purchaseId!==item.purchaseId&&
            (getShopItem(other.itemId)?.equipSlot||null)===slot)other.equipped=false;
        }
      }
      item.equipped=equipped;
      return true;
    });
    return {ok:true,item:clone(this.findInventoryRow(shop,target).items.find(entry=>entry.itemId===itemId))};
  }
  getHistory({shop,ownerId}={}){
    if(!validShop(shop)||!cleanId(ownerId))return {purchases:[],resales:[]};
    const id=cleanId(ownerId);
    return {purchases:clone(this.state.purchases.filter(row=>row.shop===shop&&row.ownerId===id)),
      resales:clone(this.state.resales.filter(row=>row.shop===shop&&row.ownerId===id))};
  }
}
