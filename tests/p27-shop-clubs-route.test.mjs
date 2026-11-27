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
  } finally {
    club.managerId = previousManagerId;
  }
});
