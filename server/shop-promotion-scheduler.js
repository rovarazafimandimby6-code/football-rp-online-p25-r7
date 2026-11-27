import { getShopCatalog } from '../src/p27-shop-catalog.js';

const HOUR=60*60*1000;
const DAY=24*HOUR;
const WEEK=7*DAY;
const FORTNIGHT=14*DAY;
function hash(value){
  let result=2166136261;
  for(const char of String(value)){result^=char.charCodeAt(0);result=Math.imul(result,16777619);}
  return result>>>0;
}
function featured(shop,period,slot,count){
  return count?hash(shop+':'+period+':'+slot)%count:-1;
}

/** Deterministic server-clock promotions. One offer per shop/slot; no client clock or stacking. */
export function getScheduledShopPromotion(shop,itemId,now=Date.now()){
  if(!['player','club'].includes(shop)||!Number.isSafeInteger(now)||now<0)return null;
  const catalog=getShopCatalog(shop);
  const index=catalog.findIndex(item=>item.id===itemId);
  if(index<0||!catalog.length)return null;
  const flashStart=Math.floor(now/(6*HOUR))*6*HOUR;
  if(index===featured(shop,'flash',flashStart,catalog.length)){
    return {type:'flash',label:'Promotion flash',startsAt:flashStart,endsAt:flashStart+6*HOUR,
      discountPercent:20+hash(shop+itemId+flashStart)%11,itemIds:[itemId]};
  }
  const dayStart=Math.floor(now/DAY)*DAY;
  if(index===featured(shop,'daily',dayStart,catalog.length)){
    return {type:'daily',label:'Offre du jour',startsAt:dayStart,endsAt:dayStart+DAY,
      discountPercent:10+hash(itemId+dayStart)%11,itemIds:[itemId]};
  }
  const weekStart=Math.floor(now/WEEK)*WEEK;
  const weekA=featured(shop,'weekly-a',weekStart,catalog.length);
  // Keep the two weekly slots distinct whenever the catalogue has at least two items.
  const weekB=catalog.length>1
    ? (weekA+1+(hash(shop+':weekly-b:'+weekStart)%(catalog.length-1)))%catalog.length
    : weekA;
  if(index===weekA||index===weekB){
    return {type:'weekly',label:'Soldes hebdomadaires',startsAt:weekStart,endsAt:weekStart+WEEK,
      discountPercent:20+hash(shop+itemId+weekStart)%11,itemIds:[itemId]};
  }
  const specialStart=Math.floor(now/FORTNIGHT)*FORTNIGHT;
  const specialCategory=catalog[featured(shop,'special-category',specialStart,catalog.length)]?.category;
  const specialItems=catalog.filter(item=>item.category===specialCategory).slice(0,3).map(item=>item.id);
  if(specialItems.includes(itemId)){
    return {type:'special',label:'Collection spéciale',startsAt:specialStart,endsAt:specialStart+FORTNIGHT,
      discountPercent:25+hash(itemId+specialStart)%11,itemIds:specialItems};
  }
  return null;
}
