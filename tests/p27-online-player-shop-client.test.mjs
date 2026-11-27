import test from "node:test";
import assert from "node:assert/strict";
import { OnlineAccountClient } from "../src/online-account-client.js";

const catalogItem = {
  id:"boots-standard", shop:"player", name:"Crampons standard", price:500, basePrice:500,
  discountPercent:0, rarity:"standard", currency:"player-coins",
};
const inventoryItem = {
  itemId:"boots-standard", purchaseId:"purchase-1", status:"owned",
  equipped:false, resellable:true,
};

function clientFor(responses) {
  const calls = [];
  const client = new OnlineAccountClient({
    storage:null,
    fetchImpl:async (url,options) => {
      calls.push({url,options});
      const payload = responses.shift() ?? {};
      return { ok:true, status:200, json:async()=>payload };
    },
  });
  client.token = "p27-test-token-with-enough-length";
  client.account = { id:"123e4567-e89b-42d3-a456-426614174000", playerId:"FRP-123456" };
  return {client,calls};
}

test("player shop client reads and validates catalog and inventory", async () => {
  const {client,calls} = clientFor([{catalog:[catalogItem]},{inventory:[inventoryItem]}]);
  assert.deepEqual(await client.getPlayerShopCatalog(),[catalogItem]);
  assert.deepEqual(await client.getPlayerShopInventory(),[inventoryItem]);
  assert.equal(calls[0].url,"/api/shop/player/catalog");
  assert.equal(calls[1].url,"/api/shop/player/inventory");
  assert.equal(calls.every(call=>call.options.headers.authorization === "Bearer p27-test-token-with-enough-length"),true);
});

test("player shop client sends authenticated purchase, resale, and equipment commands", async () => {
  const {client,calls} = clientFor([{ok:true},{ok:true},{ok:true}]);
  await client.purchasePlayerShopItem("boots-standard","purchase-1");
  await client.resellPlayerShopItem("boots-standard","resale-1");
  await client.equipPlayerShopItem("boots-standard",true);
  assert.deepEqual(calls.map(call=>[call.url,call.options.method,JSON.parse(call.options.body)]),[
    ["/api/shop/player/purchase","POST",{itemId:"boots-standard",purchaseId:"purchase-1"}],
    ["/api/shop/player/resale","POST",{itemId:"boots-standard",resaleId:"resale-1"}],
    ["/api/shop/player/equip","POST",{itemId:"boots-standard",equipped:true}],
  ]);
});

test("player shop client blocks unauthenticated and malformed commands", async () => {
  const {client,calls} = clientFor([]);
  client.token = null;
  await assert.rejects(client.getPlayerShopCatalog(),/NOT_AUTHENTICATED/);
  client.token = "p27-test-token-with-enough-length";
  await assert.rejects(client.purchasePlayerShopItem("", "purchase-1"),/INVALID_SHOP_PURCHASE/);
  await assert.rejects(client.resellPlayerShopItem("boots-standard",""),/INVALID_SHOP_RESALE/);
  await assert.rejects(client.equipPlayerShopItem("boots-standard","yes"),/INVALID_SHOP_EQUIPMENT/);
  assert.equal(calls.length,0);
});

test("player shop client rejects malformed catalog payloads", async () => {
  const {client} = clientFor([{catalog:[{...catalogItem,price:"500"}]}]);
  await assert.rejects(client.getPlayerShopCatalog(),/INVALID_PLAYER_SHOP_CATALOG/);
});
