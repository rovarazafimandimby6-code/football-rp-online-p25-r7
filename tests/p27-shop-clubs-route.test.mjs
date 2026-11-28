import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { server, accountStore, playerIdentityStore, serverClubManager } from '../server/index.js';

async function createSession() {
  const identity = playerIdentityStore.reserve({
    localProfileKey: randomUUID(),
    localProofSecret: randomBytes(32).toString('hex')
  });
  const session = accountStore.issuePasswordlessSession(identity.accountId, { playerId:identity.playerId });
  return { identity, token:session.token };
}

test('P27 boutique club : liste uniquement les clubs réellement dirigés par le compte et protège leur trésorerie', async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const club = serverClubManager.clubs.values().next().value;
  const previousManagerId = club.managerId;
  try {
    const owner = await createSession();
    const outsider = await createSession();
    const empty = await fetch(base+'/api/shop/clubs',{headers:{authorization:`Bearer ${owner.token}`}});
    assert.equal(empty.status,200);
    assert.deepEqual((await empty.json()).clubs,[]);

    club.managerId = owner.identity.accountId;
    const owned = await fetch(base+'/api/shop/clubs',{headers:{authorization:`Bearer ${owner.token}`}});
    assert.equal(owned.status,200);
    const ownedPayload = await owned.json();
    assert.equal(ownedPayload.clubs.length,1);
    assert.equal(ownedPayload.clubs[0].id,club.id);
    assert.equal(Number.isSafeInteger(ownedPayload.clubs[0].balance),true);

    const denied = await fetch(base+`/api/shop?shop=club&clubId=${encodeURIComponent(club.id)}`,{
      headers:{authorization:`Bearer ${outsider.token}`}
    });
    assert.equal(denied.status,403);

    const snapshot = await fetch(base+`/api/shop?shop=club&clubId=${encodeURIComponent(club.id)}`,{
      headers:{authorization:`Bearer ${owner.token}`}
    });
    assert.equal(snapshot.status,200);
    const shop = await snapshot.json();
    assert.equal(shop.shop,'club');
    assert.equal(shop.currency,'club-coins');
    assert.equal(shop.catalog.length,17);

    const deniedPurchase = await fetch(base+'/api/shop/purchase',{
      method:'POST',headers:{authorization:`Bearer ${outsider.token}`,'content-type':'application/json'},
      body:JSON.stringify({shop:'club',clubId:club.id,itemId:'club-supporter-tifo',purchaseId:'outsider-club-purchase'})
    });
    assert.equal(deniedPurchase.status,403);
    assert.equal((await deniedPurchase.json()).reason,'club-owner-required');

    const deniedResale = await fetch(base+'/api/shop/resale',{
      method:'POST',headers:{authorization:`Bearer ${outsider.token}`,'content-type':'application/json'},
      body:JSON.stringify({shop:'club',clubId:club.id,itemId:'club-supporter-tifo',resaleId:'outsider-club-resale'})
    });
    assert.equal(deniedResale.status,403);
    assert.equal((await deniedResale.json()).reason,'club-owner-required');

    const deniedEquip = await fetch(base+'/api/shop/equip',{
      method:'POST',headers:{authorization:`Bearer ${outsider.token}`,'content-type':'application/json'},
      body:JSON.stringify({shop:'club',clubId:club.id,itemId:'club-supporter-tifo',equipped:true})
    });
    assert.equal(deniedEquip.status,403);
    assert.equal((await deniedEquip.json()).reason,'club-owner-required');


    // Exercise the complete financial lifecycle through authenticated HTTP routes.
    const balanceBeforePurchase = ownedPayload.clubs[0].balance;
    const personalBeforeResponse = await fetch(base+'/api/account/snapshot',{headers:{authorization:`Bearer ${owner.token}`}});
    assert.equal(personalBeforeResponse.status,200);
    const personalCoinsBefore = (await personalBeforeResponse.json()).snapshot.progression.coins;
    const purchaseId = randomUUID();
    const purchase = await fetch(base+'/api/shop/purchase',{
      method:'POST',headers:{authorization:`Bearer ${owner.token}`,'content-type':'application/json'},
      body:JSON.stringify({shop:'club',clubId:club.id,itemId:'club-kit-home',purchaseId})
    });
    assert.equal(purchase.status,200);
    assert.equal((await purchase.json()).ok,true);
    const afterPurchase = await fetch(base+`/api/shop?shop=club&clubId=${encodeURIComponent(club.id)}`,{
      headers:{authorization:`Bearer ${owner.token}`}
    });
    const purchasedShop = await afterPurchase.json();
    assert.equal(purchasedShop.balance,balanceBeforePurchase-8000);
    const personalAfterResponse = await fetch(base+'/api/account/snapshot',{headers:{authorization:`Bearer ${owner.token}`}});
    assert.equal((await personalAfterResponse.json()).snapshot.progression.coins,personalCoinsBefore);
    assert.ok(purchasedShop.inventory.some(item=>item.itemId==='club-kit-home'&&item.status==='owned'));

    // Ownership moves, but the club inventory and treasury do not.
    club.managerId = outsider.identity.accountId;
    const formerOwnerResale = await fetch(base+'/api/shop/resale',{
      method:'POST',headers:{authorization:`Bearer ${owner.token}`,'content-type':'application/json'},
      body:JSON.stringify({shop:'club',clubId:club.id,itemId:'club-kit-home',resaleId:randomUUID()})
    });
    assert.equal(formerOwnerResale.status,403);
    const newOwnerSnapshot = await fetch(base+`/api/shop?shop=club&clubId=${encodeURIComponent(club.id)}`,{
      headers:{authorization:`Bearer ${outsider.token}`}
    });
    assert.equal(newOwnerSnapshot.status,200);
    const inheritedShop = await newOwnerSnapshot.json();
    assert.equal(inheritedShop.balance,balanceBeforePurchase-8000);
    assert.ok(inheritedShop.inventory.some(item=>item.itemId==='club-kit-home'&&item.status==='owned'));

    const resale = await fetch(base+'/api/shop/resale',{
      method:'POST',headers:{authorization:`Bearer ${outsider.token}`,'content-type':'application/json'},
      body:JSON.stringify({shop:'club',clubId:club.id,itemId:'club-kit-home',resaleId:randomUUID()})
    });
    assert.equal(resale.status,200);
    assert.equal((await resale.json()).resale.amount,4000);
    const afterResale = await fetch(base+`/api/shop?shop=club&clubId=${encodeURIComponent(club.id)}`,{
      headers:{authorization:`Bearer ${outsider.token}`}
    });
    const resoldShop = await afterResale.json();
    assert.equal(resoldShop.balance,balanceBeforePurchase-4000);
    assert.ok(resoldShop.inventory.some(item=>item.itemId==='club-kit-home'&&item.status==='resold'));

    // When club ownership changes, the former owner loses shop access immediately.
    club.managerId = outsider.identity.accountId;
    const formerOwnerSnapshot = await fetch(base+`/api/shop?shop=club&clubId=${encodeURIComponent(club.id)}`,{
      headers:{authorization:`Bearer ${owner.token}`}
    });
    assert.equal(formerOwnerSnapshot.status,403);
    const finalOwnerSnapshot = await fetch(base+`/api/shop?shop=club&clubId=${encodeURIComponent(club.id)}`,{
      headers:{authorization:`Bearer ${outsider.token}`}
    });
    assert.equal(finalOwnerSnapshot.status,200);
  } finally {
    club.managerId = previousManagerId;
    await new Promise(resolve => server.close(resolve));
  }
});
