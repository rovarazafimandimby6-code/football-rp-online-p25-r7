const PLAYER_RATES = Object.freeze({ standard:0.50, rare:0.55, premium:0.60 });
const cleanId = value => String(value ?? '').trim().slice(0,80);
const safeMoney = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const clone = value => JSON.parse(JSON.stringify(value));

const PLAYER_ITEMS = [
  ['boots-standard','crampons','Crampons standard',500,'standard'],
  ['boots-rare','crampons','Crampons rares',1500,'rare'],
  ['boots-premium','crampons','Crampons premium',3000,'premium'],
  ['accessory-standard','accessories','Accessoires sportifs standard',300,'standard'],
  ['accessory-rare','accessories','Accessoires sportifs rares',700,'rare'],
  ['accessory-premium','accessories','Accessoires sportifs premium',1200,'premium'],
  ['hair-standard','hair','Coiffure standard',800,'standard'],
  ['hair-rare','hair','Coiffure rare',1400,'rare'],
  ['hair-premium','hair','Coiffure premium',2000,'premium'],
  ['beard-standard','beard','Barbe standard',500,'standard'],
  ['beard-rare','beard','Barbe rare',900,'rare'],
  ['beard-premium','beard','Barbe premium',1200,'premium'],
  ['celebration-standard','celebrations','Célébration standard',1000,'standard'],
  ['celebration-rare','celebrations','Célébration rare',2000,'rare'],
  ['celebration-premium','celebrations','Célébration premium',3000,'premium'],
  ['profile-frame-standard','profile-frames','Cadre de profil standard',500,'standard'],
  ['profile-frame-rare','profile-frames','Cadre de profil rare',1000,'rare'],
  ['profile-frame-premium','profile-frames','Cadre de profil premium',1500,'premium'],
  ['profile-background-standard','profile-backgrounds','Fond de profil standard',800,'standard'],
  ['profile-background-rare','profile-backgrounds','Fond de profil rare',1400,'rare'],
  ['profile-background-premium','profile-backgrounds','Fond de profil premium',2000,'premium']
].map(([id,category,name,price,rarity]) => ({
  id, shop:'player', category, name, price, rarity, currency:'player-coins',
  resellable:true, resaleRate:PLAYER_RATES[rarity], permanent:true
}));

const CLUB_ITEMS = [
  ['club-crest-custom','identity','Écusson personnalisé',5000,true],
  ['club-official-colors','identity','Couleurs officielles',3000,true],
  ['club-kit-home','kits','Maillot domicile',8000,true],
  ['club-kit-away','kits','Maillot extérieur',6000,true],
  ['club-kit-third','kits','Troisième maillot',7000,true],
  ['club-kit-goalkeeper','kits','Maillot gardien',5000,true],
  ['club-stadium-standard','stadium','Apparence du stade',8000,true],
  ['club-stadium-premium','stadium','Apparence du stade premium',20000,true],
  ['club-grass-standard','stadium','Pelouse personnalisée',5000,true],
  ['club-grass-premium','stadium','Pelouse premium',12000,true],
  ['club-capacity-level-1','capacity','Extension du stade — niveau 1',15000,false],
  ['club-capacity-level-2','capacity','Extension du stade — niveau 2',25000,false],
  ['club-capacity-level-3','capacity','Extension du stade — niveau 3',40000,false],
  ['club-capacity-level-4','capacity','Extension du stade — niveau 4',60000,false],
  ['club-supporter-flags','supporters','Drapeaux des supporters',2000,true],
  ['club-supporter-banners','supporters','Banderoles des supporters',3000,true],
  ['club-supporter-tifo','supporters','Tifo personnalisé',8000,true]
].map(([id,category,name,price,resellable]) => ({
  id, shop:'club', category, name, price, rarity:'standard', currency:'club-coins',
  resellable, resaleRate:resellable ? 0.50 : 0, permanent:true,
  ...(category==='capacity' ? { upgradeLevel:Number(id.slice(-1)) } : {})
}));

const CATALOG = Object.freeze([...PLAYER_ITEMS,...CLUB_ITEMS].map(item=>Object.freeze(item)));

export function getShopCatalog(shop) {
  if (!['player','club'].includes(shop)) return [];
  return CATALOG.filter(item=>item.shop===shop).map(clone);
}

export function getShopItem(itemId) {
  const id=cleanId(itemId);
  const item=CATALOG.find(entry=>entry.id===id);
  return item ? clone(item) : null;
}

export function isPromotionActive(promotion, now=Date.now()) {
  if (!promotion || !Number.isSafeInteger(now) || now<0) return false;
  const startsAt=promotion.startsAt, endsAt=promotion.endsAt, discount=promotion.discountPercent;
  return Number.isSafeInteger(startsAt) && Number.isSafeInteger(endsAt) &&
    startsAt>=0 && endsAt>startsAt && now>=startsAt && now<endsAt &&
    Number.isInteger(discount) && discount>=1 && discount<=50;
}

export function getShopPrice(itemOrId, { promotion=null, now=Date.now() }={}) {
  const item=typeof itemOrId==='string' ? getShopItem(itemOrId) : itemOrId;
  if (!item || safeMoney(item.price)===null) return null;
  if (!promotion || !isPromotionActive(promotion,now)) return { basePrice:item.price, price:item.price, discountPercent:0, promotionActive:false };
  const appliesTo=Array.isArray(promotion.itemIds) ? promotion.itemIds : [];
  if (!appliesTo.includes(item.id)) return { basePrice:item.price, price:item.price, discountPercent:0, promotionActive:false };
  const price=Math.max(1,Math.round(item.price*(100-promotion.discountPercent)/100));
  return { basePrice:item.price, price, discountPercent:promotion.discountPercent, promotionActive:true, endsAt:promotion.endsAt };
}

export function calculateResaleValue(itemOrId, paidPrice) {
  const item=typeof itemOrId==='string' ? getShopItem(itemOrId) : itemOrId;
  const paid=safeMoney(paidPrice);
  if (!item || paid===null || item.resellable!==true) return null;
  const rate=Number(item.resaleRate);
  if (!Number.isFinite(rate) || rate<=0 || rate>1) return null;
  return Math.floor(paid*rate);
}

export function validateShopPurchase({ shop, itemId, actorId, ownerId=null, now=Date.now() }={}) {
  const item=getShopItem(itemId);
  if (!item || item.shop!==shop) return { ok:false, reason:'item-not-found' };
  if (!cleanId(actorId)) return { ok:false, reason:'invalid-actor' };
  if (shop==='club' && (!cleanId(ownerId) || cleanId(actorId)!==cleanId(ownerId))) {
    return { ok:false, reason:'club-owner-required' };
  }
  if (!Number.isSafeInteger(now) || now<0) return { ok:false, reason:'invalid-time' };
  return { ok:true, item };
}
