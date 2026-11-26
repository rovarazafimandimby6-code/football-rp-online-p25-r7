import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { server, accountStore, playerIdentityStore } from '../server/index.js';

async function createPlayerSession() {
  const identity = playerIdentityStore.reserve({
    localProfileKey: randomUUID(),
    localProofSecret: randomBytes(32).toString('hex')
  });
  const session = accountStore.issuePasswordlessSession(identity.accountId, { playerId: identity.playerId });
  return { identity, token: session.token };
}

test('P27 API Club RP : création, annuaire public, demande, validation et départ', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const founder = await createPlayerSession();
    const member = await createPlayerSession();\n    const invitee = await createPlayerSession();
    const create = await fetch(`${base}/api/rp-clubs`, {
      method: 'POST',
      headers: { authorization: `Bearer ${founder.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: `Les Étoiles ${founder.identity.playerId.slice(-2)}`, tag: `E${founder.identity.playerId.slice(-2)}`, description: 'Collectif de joueurs RP' })
    });
    assert.equal(create.status, 201);
    const created = await create.json();
    assert.equal(created.club.memberCount, 1);
    assert.equal(created.club.members[0].role, 'founder');
    assert.equal(Object.hasOwn(created.club.members[0], 'accountId'), false);

    const directory = await fetch(`${base}/api/rp-clubs?q=etoiles`);
    assert.equal(directory.status, 200);
    assert.ok((await directory.json()).clubs.some(club => club.id === created.club.id));

    const join = await fetch(`${base}/api/rp-clubs/${created.club.id}/join-requests`, {
      method: 'POST', headers: { authorization: `Bearer ${member.token}` }
    });
    assert.equal(join.status, 201);
    const request = await join.json();

    const founderView = await fetch(`${base}/api/rp-clubs/me`, { headers: { authorization: `Bearer ${founder.token}` } });
    assert.equal(founderView.status, 200);
    const founderMembership = (await founderView.json()).membership;
    assert.equal(founderMembership.pendingRequests[0].id, request.request.id);

    const accepted = await fetch(`${base}/api/rp-clubs/${created.club.id}/join-requests/${request.request.id}/decision`, {
      method: 'POST',
      headers: { authorization: `Bearer ${founder.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'accept' })
    });
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).memberCount, 2);

    const memberView = await fetch(`${base}/api/rp-clubs/me`, { headers: { authorization: `Bearer ${member.token}` } });
    assert.equal((await memberView.json()).membership.membership.role, 'member');

    const invitationResponse = await fetch(`${base}/api/rp-clubs/${created.club.id}/invitations`, {
      method:'POST',
      headers:{ authorization:`Bearer ${founder.token}`, 'content-type':'application/json' },
      body:JSON.stringify({ playerId:invitee.identity.playerId })
    });
    assert.equal(invitationResponse.status, 201);
    const invitation = await invitationResponse.json();
    const inviteeView = await fetch(`${base}/api/rp-clubs/me`, { headers:{ authorization:`Bearer ${invitee.token}` } });
    assert.equal((await inviteeView.json()).invitations[0].id, invitation.invitation.id);
    const invitationDecision = await fetch(`${base}/api/rp-clubs/${created.club.id}/invitations/${invitation.invitation.id}/decision`, {
      method:'POST',
      headers:{ authorization:`Bearer ${invitee.token}`, 'content-type':'application/json' },
      body:JSON.stringify({ decision:'accept' })
    });
    assert.equal(invitationDecision.status, 200);
    assert.equal((await invitationDecision.json()).memberCount, 3);
    const assignRole = await fetch(`${base}/api/rp-clubs/${created.club.id}/members/${invitee.identity.playerId}/role`, {
      method:'POST',
      headers:{ authorization:`Bearer ${founder.token}`, 'content-type':'application/json' },
      body:JSON.stringify({ role:'recruiter' })
    });
    assert.equal(assignRole.status, 200);
    assert.equal((await assignRole.json()).role, 'recruiter');

    const leave = await fetch(`${base}/api/rp-clubs/${created.club.id}/leave`, {
      method: 'POST', headers: { authorization: `Bearer ${member.token}` }
    });
    assert.equal(leave.status, 200);
    const founderLeave = await fetch(`${base}/api/rp-clubs/${created.club.id}/leave`, {
      method: 'POST', headers: { authorization: `Bearer ${founder.token}` }
    });
    assert.equal(founderLeave.status, 409);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
