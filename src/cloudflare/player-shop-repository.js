import { calculateResaleValue, getShopCatalog, getShopItem, getShopPrice, validateShopPurchase } from "../p27-shop-catalog.js";
import { getScheduledShopPromotion } from "../../server/shop-promotion-scheduler.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cleanId = value => typeof value === "string" ? value.trim() : "";
const transactionId = value => { const id = cleanId(value); return id.length > 0 && id.length <= 64 ? id : ""; };
const clone = value => JSON.parse(JSON.stringify(value));

function accountIdOrThrow(value) {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new Error("INVALID_ACCOUNT_ID");
  return value;
}

/** D1-backed player shop. Wallet changes and inventory journals are committed in one D1 batch. */
export class D1PlayerShopRepository {
  constructor(db, { now = () => Date.now() } = {}) {
    if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
      throw new Error("D1_DATABASE_BINDING_REQUIRED");
    }
    this.db = db;
    this.now = now;
  }

  async ensureWallet(accountId) {
    accountIdOrThrow(accountId);
    await this.db.prepare(
      "INSERT INTO p27_player_progression (account_id, attributes_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(account_id) DO NOTHING"
    ).bind(accountId, JSON.stringify({ pace:55, shooting:50, passing:50, defense:45, stamina:55, control:50 }),
      new Date(this.now()).toISOString()).run();
  }

  async catalog() {
    const now = this.now();
    return getShopCatalog("player").map(item => {
      const promotion = getScheduledShopPromotion("player", item.id, now);
      return { ...item, ...getShopPrice(item, { promotion, now }), promotionType: promotion?.type || null,
        promotionLabel: promotion?.label || null };
    });
  }

  async inventory(accountId) {
    accountIdOrThrow(accountId);
    const result = await this.db.prepare(
      "SELECT purchase_id AS purchaseId, item_id AS itemId, category, rarity, equip_slot AS equipSlot, " +
      "paid_price AS paidPrice, currency, resellable, resale_rate AS resaleRate, equipped, status, " +
      "purchased_at AS purchasedAt, resold_at AS resoldAt, resale_id AS resaleId " +
      "FROM p27_player_shop_inventory WHERE account_id = ? ORDER BY purchased_at DESC"
    ).bind(accountId).all();
    return (result?.results || []).map(row => ({ ...row, resellable: row.resellable === 1,
      equipped: row.equipped === 1, equipSlot: row.equipSlot || null }));
  }

  async purchase(accountId, { itemId, purchaseId } = {}) {
    accountIdOrThrow(accountId);
    const id = transactionId(purchaseId);
    if (!id) return { ok:false, reason:"invalid-purchase" };
    const auth = validateShopPurchase({ shop:"player", itemId, actorId:accountId, ownerId:accountId, now:this.now() });
    if (!auth.ok) return auth;
    const item = auth.item;
    const prior = await this.db.prepare(
      "SELECT item_id AS itemId FROM p27_player_shop_purchases WHERE account_id = ? AND purchase_id = ?"
    ).bind(accountId, id).first();
    if (prior) {
      if (prior.itemId !== item.id) return { ok:false, reason:"purchase-id-conflict" };
      return { ok:true, duplicate:true, inventory:await this.inventory(accountId) };
    }
    const owned = await this.db.prepare(
      "SELECT 1 AS owned FROM p27_player_shop_inventory WHERE account_id = ? AND item_id = ? AND status = 'owned'"
    ).bind(accountId, item.id).first();
    if (owned) return { ok:false, reason:"already-owned" };

    const now = this.now();
    const promotion = getScheduledShopPromotion("player", item.id, now);
    const price = getShopPrice(item, { promotion, now });
    await this.ensureWallet(accountId);
    const statements = [
      this.db.prepare(
        "UPDATE p27_player_progression SET coins = coins - ?, revision = revision + 1, updated_at = ? " +
        "WHERE account_id = ? AND coins >= ?"
      ).bind(price.price, new Date(now).toISOString(), accountId, price.price),
      this.db.prepare(
        "INSERT INTO p27_player_shop_purchases (account_id,purchase_id,item_id,category,rarity,equip_slot,base_price,paid_price,discount_percent,currency,status,created_at) " +
        "SELECT ?,?,?,?,?,?,?,?,?,?,'completed',? WHERE changes() = 1"
      ).bind(accountId,id,item.id,item.category,item.rarity,item.equipSlot || null,price.basePrice,price.price,
        price.discountPercent,item.currency,now),
      this.db.prepare(
        "INSERT INTO p27_player_shop_inventory (account_id,purchase_id,item_id,category,rarity,equip_slot,paid_price,currency,resellable,resale_rate,equipped,status,purchased_at) " +
        "SELECT ?,?,?,?,?,?,?,?,?,?,0,'owned',? WHERE EXISTS (SELECT 1 FROM p27_player_shop_purchases WHERE account_id = ? AND purchase_id = ?)"
      ).bind(accountId,id,item.id,item.category,item.rarity,item.equipSlot || null,price.price,item.currency,
        item.resellable ? 1 : 0,item.resaleRate || 0,now,accountId,id),
    ];
    try {
      const result = await this.db.batch(statements);
      if (Number(result?.[0]?.meta?.changes) !== 1) return { ok:false, reason:"INSUFFICIENT_COINS" };
    } catch (error) {
      const latest = await this.db.prepare(
        "SELECT 1 AS owned FROM p27_player_shop_inventory WHERE account_id = ? AND item_id = ? AND status = 'owned'"
      ).bind(accountId,item.id).first();
      if (latest) return { ok:false, reason:"already-owned" };
      throw error;
    }
    return { ok:true, duplicate:false, item, paidPrice:price.price, discountPercent:price.discountPercent,
      inventory:await this.inventory(accountId) };
  }

  async resale(accountId, { itemId, resaleId } = {}) {
    accountIdOrThrow(accountId);
    const id = transactionId(resaleId);
    if (!id) return { ok:false, reason:"invalid-resale" };
    const item = getShopItem(itemId);
    if (!item || item.shop !== "player") return { ok:false, reason:"item-not-found" };
    const prior = await this.db.prepare(
      "SELECT item_id AS itemId FROM p27_player_shop_resales WHERE account_id = ? AND resale_id = ?"
    ).bind(accountId,id).first();
    if (prior) return prior.itemId === item.id
      ? { ok:true, duplicate:true, inventory:await this.inventory(accountId) }
      : { ok:false, reason:"resale-id-conflict" };
    const owned = await this.db.prepare(
      "SELECT purchase_id AS purchaseId, paid_price AS paidPrice, currency, equipped FROM p27_player_shop_inventory " +
      "WHERE account_id = ? AND item_id = ? AND status = 'owned'"
    ).bind(accountId,item.id).first();
    if (!owned) return { ok:false, reason:"item-not-owned" };
    if (owned.equipped === 1) return { ok:false, reason:"item-active" };
    const amount = calculateResaleValue(item, Number(owned.paidPrice));
    if (amount === null) return { ok:false, reason:"item-not-resellable" };
    if (amount <= 0) return { ok:false, reason:"resale-value-zero" };
    const now = this.now();
    const statements = [
      this.db.prepare(
        "UPDATE p27_player_shop_inventory SET status='resold',resold_at=?,resale_id=? " +
        "WHERE account_id=? AND purchase_id=? AND status='owned' AND equipped=0"
      ).bind(now,id,accountId,owned.purchaseId),
      this.db.prepare(
        "UPDATE p27_player_progression SET coins=MIN(1000000000,coins+?),revision=revision+1,updated_at=? " +
        "WHERE account_id=? AND changes()=1"
      ).bind(amount,new Date(now).toISOString(),accountId),
      this.db.prepare(
        "INSERT INTO p27_player_shop_resales (account_id,resale_id,purchase_id,item_id,amount,currency,created_at) " +
        "SELECT ?,?,?,?,?,?,? WHERE changes()=1"
      ).bind(accountId,id,owned.purchaseId,item.id,amount,owned.currency,now),
    ];
    const result = await this.db.batch(statements);
    if (Number(result?.[0]?.meta?.changes) !== 1) return { ok:false, reason:"item-not-owned" };
    return { ok:true, duplicate:false, amount, currency:item.currency, inventory:await this.inventory(accountId) };
  }

  async setEquipped(accountId, { itemId, equipped = true } = {}) {
    accountIdOrThrow(accountId);
    if (typeof equipped !== "boolean") return { ok:false, reason:"invalid-equipped-state" };
    const item = getShopItem(itemId);
    if (!item || item.shop !== "player") return { ok:false, reason:"item-not-found" };
    const owned = await this.db.prepare(
      "SELECT purchase_id FROM p27_player_shop_inventory WHERE account_id=? AND item_id=? AND status='owned'"
    ).bind(accountId,item.id).first();
    if (!owned) return { ok:false, reason:"item-not-owned" };
    if (equipped && item.equipSlot) {
      await this.db.batch([
        this.db.prepare(
          "UPDATE p27_player_shop_inventory SET equipped=0 WHERE account_id=? AND equip_slot=? AND status='owned'"
        ).bind(accountId,item.equipSlot),
        this.db.prepare(
          "UPDATE p27_player_shop_inventory SET equipped=1 WHERE account_id=? AND purchase_id=? AND status='owned'"
        ).bind(accountId,owned.purchase_id),
      ]);
    } else {
      await this.db.prepare(
        "UPDATE p27_player_shop_inventory SET equipped=? WHERE account_id=? AND purchase_id=? AND status='owned'"
      ).bind(equipped ? 1 : 0,accountId,owned.purchase_id).run();
    }
    return { ok:true, itemId:item.id, equipped };
  }
}
