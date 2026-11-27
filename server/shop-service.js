import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { calculateResaleValue, getShopItem, getShopPrice, validateShopPurchase } from '../src/p27-shop-catalog.js';

const cleanId=value=>String(value??'').trim().slice(0,80);
const clone=value=>JSON.parse(JSON.stringify(value));
const emptyState=()=>({version:1,players:[],clubs:[],purchases:[],resales:[]});

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
      if(value?.version!==1||!Array.isArray(value.players)||!Array.isArray(value.clubs)||!Array.isArray(value.purchases)||!Array.isArray(value.resales))throw new Error('bad schema');
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
  inventory(shop,ownerId){
    const rows=shop==='player'?this.state.players:this.state.clubs;
    const row=rows.find(item=>item.ownerId===ownerId);
    return clone(row?.items||[]);
  }
  findInventoryRow(shop,ownerId,create=false){
    const rows=shop==='player'?this.state.players:this.state.clubs;
    let row=rows.find(item=>item.ownerId===ownerId);
    if(!row&&create){row={ownerId,items:[]};rows.push(row);}
    return row||null;
  }
  purchase({shop,itemId,actorId,clubId=null,purchaseId,promotion=null}={}){
    const id=cleanId(purchaseId),actor=cleanId(actorId),club=cleanId(clubId);
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
    const offer=promotion||this.promotionProvider(shop,item.id)||null;
    const price=getShopPrice(item,{promotion:offer,now:this.now()});
    if(!price)return {ok:false,reason:'invalid-price'};
    let journal=prior;
    if(!journal){
      journal={id,shop,ownerId:target,actorId:actor,itemId:item.id,category:item.category,rarity:item.rarity,
        basePrice:price.basePrice,paidPrice:price.price,discountPercent:price.discountPercent,
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
      upgradeLevel:item.upgradeLevel||null,status:'owned',purchasedAt:journal.createdAt,purchaseId:id};
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
    const id=cleanId(resaleId),actor=cleanId(actorId),club=cleanId(clubId);
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
    const value=calculateResaleValue(itemId,owned.paidPrice);
    if(value===null)return {ok:false,reason:'item-not-resellable'};
    if(value<=0)return {ok:false,reason:'resale-value-zero'};
    let journal=prior;
    if(!journal){
      journal={id,shop,ownerId:target,actorId:actor,itemId,amount:value,currency:owned.currency,status:'pending',createdAt:this.now()};
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
  getHistory({shop,ownerId}={}){
    const id=cleanId(ownerId);
    return {purchases:clone(this.state.purchases.filter(row=>row.shop===shop&&row.ownerId===id)),
      resales:clone(this.state.resales.filter(row=>row.shop===shop&&row.ownerId===id))};
  }
}
