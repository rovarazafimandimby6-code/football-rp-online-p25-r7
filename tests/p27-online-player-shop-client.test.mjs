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

test("player shop client reads the authoritative server snapshot", async () => {
  const snapshot = {shop:"player",currency:"player-coins",balance:5000,catalog:[catalogItem],inventory:[inventoryItem]};
  const {client,calls} = clientFor([snapshot,snapshot]);
  assert.deepEqual(await client.getPlayerShopCatalog(),[catalogItem]);
  assert.deepEqual(await client.getPlayerShopInventory(),[inventoryItem]);
  assert.equal(calls[0].url,"/api/shop?shop=player");
  assert.equal(calls[1].url,"/api/shop?shop=player");
  assert.equal(calls.every(call=>call.options.headers.authorization === "Bearer p27-test-token-with-enough-length"),true);
});

test("player shop client sends authenticated purchase, resale, and equipment commands", async () => {
  const {client,calls} = clientFor([{ok:true},{ok:true},{ok:true}]);
  await client.purchasePlayerShopItem("boots-standard","purchase-1");
  await client.resellPlayerShopItem("boots-standard","resale-1");
  await client.equipPlayerShopItem("boots-standard",true);
  assert.deepEqual(calls.map(call=>[call.url,call.options.method,JSON.parse(call.options.body)]),[
    ["/api/shop/purchase","POST",{shop:"player",itemId:"boots-standard",purchaseId:"purchase-1"}],
    ["/api/shop/resale","POST",{shop:"player",itemId:"boots-standard",resaleId:"resale-1"}],
    ["/api/shop/equip","POST",{shop:"player",itemId:"boots-standard",equipped:true}],
  ]);
});


test("club shop client verifies owned clubs and uses club-only treasury commands", async () => {
  const clubItem = {...catalogItem,id:"club-kit-home",shop:"club",currency:"club-coins"};
  const snapshot = {shop:"club",currency:"club-coins",balance:42000,catalog:[clubItem],inventory:[]};
  const {client,calls} = clientFor([
    {clubs:[{id:"club-one",name:"Club One",balance:42000}]},snapshot,{ok:true},{ok:true},{ok:true}
  ]);
  assert.deepEqual(await client.getOwnedShopClubs(),[{id:"club-one",name:"Club One",balance:42000}]);
  assert.deepEqual(await client.getShopSnapshot("club","club-one"),snapshot);
  await client.purchaseShopItem("club","club-kit-home","club-buy-1","club-one");
  await client.resellShopItem("club","club-kit-home","club-sale-1","club-one");
  await client.equipShopItem("club","club-kit-home",true,"club-one");
  assert.deepEqual(calls.map(call=>call.url),[
    "/api/shop/clubs","/api/shop?shop=club&clubId=club-one",
    "/api/shop/purchase","/api/shop/resale","/api/shop/equip"
  ]);
  assert.deepEqual(calls.slice(2).map(call=>JSON.parse(call.options.body)),[
    {shop:"club",itemId:"club-kit-home",purchaseId:"club-buy-1",clubId:"club-one"},
    {shop:"club",itemId:"club-kit-home",resaleId:"club-sale-1",clubId:"club-one"},
    {shop:"club",itemId:"club-kit-home",equipped:true,clubId:"club-one"}
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
  const {client} = clientFor([{
    shop:"player",currency:"player-coins",balance:5000,
    catalog:[{...catalogItem,price:"500"}],inventory:[]
  }]);
  await assert.rejects(client.getPlayerShopCatalog(),/INVALID_SHOP_RESPONSE/);
});
