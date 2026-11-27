import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { D1PlayerShopRepository } from "../src/cloudflare/player-shop-repository.js";

const accountId = "123e4567-e89b-42d3-a456-426614174000";

class SqliteD1 {
  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.db.exec("PRAGMA foreign_keys = ON");
    for (const file of [
      "migrations/d1/0001_identity.sql",
      "migrations/d1/0005_player_progression.sql",
      "migrations/d1/0010_player_shop.sql",
    ]) this.db.exec(readFileSync(new URL("../" + file, import.meta.url), "utf8"));
    this.db.prepare(
      "INSERT INTO p27_accounts (id,username,display_name,password_salt,password_hash,passwordless,player_id,created_at) VALUES (?,?,?,?,?,1,?,?)"
    ).run(accountId,"p27-test-account","FRP-123456","salt","hash","FRP-123456","2026-11-27T00:00:00.000Z");
    this.db.prepare(
      "INSERT INTO p27_player_progression (account_id,attributes_json,updated_at,coins) VALUES (?,?,?,10000)"
    ).run(accountId,JSON.stringify({pace:55,shooting:50,passing:50,defense:45,stamina:55,control:50}),"2026-11-27T00:00:00.000Z");
  }
  prepare(sql) {
    const statement = this.db.prepare(sql);
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      first() { return statement.get(...values) || null; },
      all() { return { results: statement.all(...values) }; },
      run() { const result = statement.run(...values); return { meta: { changes: Number(result.changes) } }; },
    };
  }
  async batch(statements) {
    this.db.exec("BEGIN");
    try {
      const results = statements.map(statement => statement.run());
      this.db.exec("COMMIT");
      return results;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() { this.db.close(); }
}

const now = () => Date.parse("2026-11-27T12:00:00.000Z");

test("D1 player shop purchase, equipment lock, resale and replay are atomic and idempotent", async () => {
  const db = new SqliteD1();
  try {
    const shop = new D1PlayerShopRepository(db, { now });
    const first = await shop.purchase(accountId,{itemId:"boots-standard",purchaseId:"purchase-boots-1"});
    assert.equal(first.ok,true);
    assert.equal(first.paidPrice,500);
    assert.equal(first.inventory.length,1);

    const duplicatePurchase = await shop.purchase(accountId,{itemId:"boots-standard",purchaseId:"purchase-boots-1"});
    assert.equal(duplicatePurchase.ok,true);
    assert.equal(duplicatePurchase.duplicate,true);

    const walletAfterPurchase = db.db.prepare("SELECT coins FROM p27_player_progression WHERE account_id=?").get(accountId).coins;
    assert.equal(walletAfterPurchase,9500);

    assert.equal((await shop.setEquipped(accountId,{itemId:"boots-standard",equipped:true})).ok,true);
    assert.deepEqual(await shop.resale(accountId,{itemId:"boots-standard",resaleId:"resale-boots-1"}),{ok:false,reason:"item-active"});

    assert.equal((await shop.setEquipped(accountId,{itemId:"boots-standard",equipped:false})).ok,true);
    const resale = await shop.resale(accountId,{itemId:"boots-standard",resaleId:"resale-boots-1"});
    assert.equal(resale.ok,true);
    assert.equal(resale.amount,250);
    assert.equal(resale.inventory[0].status,"resold");

    const duplicateResale = await shop.resale(accountId,{itemId:"boots-standard",resaleId:"resale-boots-1"});
    assert.equal(duplicateResale.ok,true);
    assert.equal(duplicateResale.duplicate,true);
    const walletAfterResale = db.db.prepare("SELECT coins FROM p27_player_progression WHERE account_id=?").get(accountId).coins;
    assert.equal(walletAfterResale,9750);
  } finally { db.close(); }
});

test("D1 player shop refuses insufficient coins and duplicate owned catalogue items", async () => {
  const db = new SqliteD1();
  try {
    const shop = new D1PlayerShopRepository(db,{now});
    db.db.prepare("UPDATE p27_player_progression SET coins=100 WHERE account_id=?").run(accountId);
    const poor = await shop.purchase(accountId,{itemId:"boots-standard",purchaseId:"purchase-too-poor"});
    assert.equal(poor.ok,false);
    assert.equal(poor.reason,"INSUFFICIENT_COINS");
    const balance = db.db.prepare("SELECT coins FROM p27_player_progression WHERE account_id=?").get(accountId).coins;
    assert.equal(balance,100);
    db.db.prepare("UPDATE p27_player_progression SET coins=10000 WHERE account_id=?").run(accountId);
    const first = await shop.purchase(accountId,{itemId:"boots-standard",purchaseId:"purchase-boots-a"});
    assert.equal(first.ok,true);
    const second = await shop.purchase(accountId,{itemId:"boots-standard",purchaseId:"purchase-boots-b"});
    assert.equal(second.ok,false);
    assert.equal(second.reason,"already-owned");
  } finally { db.close(); }
});

test("D1 player shop inventory has one equipped cosmetic per equipment slot", async () => {
  const db = new SqliteD1();
  try {
    const shop = new D1PlayerShopRepository(db,{now});
    await shop.purchase(accountId,{itemId:"boots-standard",purchaseId:"purchase-boots"});
    await shop.purchase(accountId,{itemId:"boots-rare",purchaseId:"purchase-boots-rare"});
    assert.equal((await shop.setEquipped(accountId,{itemId:"boots-standard",equipped:true})).ok,true);
    assert.equal((await shop.setEquipped(accountId,{itemId:"boots-rare",equipped:true})).ok,true);
    const inventory = await shop.inventory(accountId);
    assert.equal(inventory.filter(item=>item.equipped && item.equipSlot==="crampons").length,1);
    assert.equal(inventory.find(item=>item.itemId==="boots-rare").equipped,true);
  } finally { db.close(); }
});


test("D1 player shop rejects tampering with purchase and resale journals", async () => {
  const db = new SqliteD1();
  try {
    const shop = new D1PlayerShopRepository(db,{now});
    await shop.purchase(accountId,{itemId:"boots-standard",purchaseId:"purchase-immutable"});
    assert.throws(
      () => db.db.prepare("UPDATE p27_player_shop_purchases SET paid_price=1 WHERE account_id=?").run(accountId),
      /SHOP_PURCHASE_IMMUTABLE/
    );
    assert.throws(
      () => db.db.prepare("UPDATE p27_player_shop_inventory SET paid_price=1 WHERE account_id=?").run(accountId),
      /SHOP_INVENTORY_IDENTITY_IMMUTABLE/
    );
    await shop.setEquipped(accountId,{itemId:"boots-standard",equipped:false});
    await shop.resale(accountId,{itemId:"boots-standard",resaleId:"resale-immutable"});
    assert.throws(
      () => db.db.prepare("UPDATE p27_player_shop_resales SET amount=1 WHERE account_id=?").run(accountId),
      /SHOP_RESALE_IMMUTABLE/
    );
    assert.throws(
      () => db.db.prepare("UPDATE p27_player_shop_inventory SET status='owned' WHERE account_id=?").run(accountId),
      /SHOP_INVENTORY_RESOLD/
    );
  } finally { db.close(); }
});
