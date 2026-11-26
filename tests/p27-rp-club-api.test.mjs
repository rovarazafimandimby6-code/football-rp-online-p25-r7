import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { server, accountStore, playerIdentityStore, careerStore } from '../server/index.js';

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
    const member = await createPlayerSession();
    const invitee = await createPlayerSession();
    const outsider = await createPlayerSession();
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

    careerStore.recordMatch(member.identity.accountId, {
      matchId:randomUUID(), result:'win', finalizedAt:Date.now(),
      stats:{ goals:2, assists:1, shots:3 }
    });
    careerStore.recordMatch(founder.identity.accountId, {
      matchId:randomUUID(), result:'draw', finalizedAt:Date.now(),
      stats:{ goals:1, assists:0, shots:2 }
    });
    const outsiderMessage = await fetch(base + '/api/rp-clubs/' + created.club.id + '/messages', {
      method:'POST', headers:{ authorization:'Bearer ' + outsider.token, 'content-type':'application/json' },
      body:JSON.stringify({ text:'Message interdit' })
    });
    assert.equal(outsiderMessage.status, 403);
    const memberMessage = await fetch(base + '/api/rp-clubs/' + created.club.id + '/messages', {
      method:'POST', headers:{ authorization:'Bearer ' + member.token, 'content-type':'application/json' },
      body:JSON.stringify({ text:'Salut le club !' })
    });
    assert.equal(memberMessage.status, 201);
    assert.equal((await memberMessage.json()).message.text, 'Salut le club !');
    const founderChat = await fetch(base + '/api/rp-clubs/me', { headers:{ authorization:'Bearer ' + founder.token } });
    assert.equal((await founderChat.json()).membership.messages[0].text, 'Salut le club !');
    const memberSpam = await fetch(base + '/api/rp-clubs/' + created.club.id + '/messages', {
      method:'POST', headers:{ authorization:'Bearer ' + member.token, 'content-type':'application/json' },
      body:JSON.stringify({ text:'Spam immédiat' })
    });
    assert.equal(memberSpam.status, 429);

    const activityResponse = await fetch(`${base}/api/rp-clubs/${created.club.id}/activity`, {
      headers:{ authorization:`Bearer ${founder.token}` }
    });
    assert.equal(activityResponse.status, 200);
    const activity = await activityResponse.json();
    assert.equal(activity.totals.matches, 2);
    assert.equal(activity.totals.wins, 1);
    assert.equal(activity.totals.goals, 3);
    assert.equal(activity.totals.assists, 1);
    assert.equal(activity.members.find(row=>row.playerId===member.identity.playerId).goals, 2);
    assert.equal(activity.members[0].playerId, member.identity.playerId);
    assert.equal(activity.members[0].assists, 1);
    assert.equal(activity.members[1].playerId, founder.identity.playerId);
    assert.deepEqual(activity.objectives.map(item => item.id), ['matches','wins','goals','assists']);
    assert.equal(activity.objectives.find(item=>item.id==='matches').value, 2);
    assert.equal(activity.objectives.find(item=>item.id==='matches').target, 10);
    assert.equal(activity.objectives.find(item=>item.id==='matches').progressPercent, 20);
    assert.equal(activity.objectives.find(item=>item.id==='wins').value, 1);
    assert.equal(activity.objectives.find(item=>item.id==='goals').value, 3);
    assert.equal(activity.objectives.find(item=>item.id==='assists').value, 1);
    assert.equal(activity.objectives.every(item => item.completed === false), true);
    assert.equal(Object.hasOwn(activity.objectives[0], 'reward'), false);
    assert.equal(activity.periodEnd - activity.periodStart, 7 * 24 * 60 * 60 * 1000);
    const forbiddenActivity = await fetch(`${base}/api/rp-clubs/${created.club.id}/activity`, {
      headers:{ authorization:`Bearer ${outsider.token}` }
    });
    assert.equal(forbiddenActivity.status, 403);

    const leave = await fetch(`${base}/api/rp-clubs/${created.club.id}/leave`, {
      method: 'POST', headers: { authorization: `Bearer ${member.token}` }
    });
    assert.equal(leave.status, 200);
    const formerMemberView = await fetch(base + '/api/rp-clubs/me', { headers:{ authorization:'Bearer ' + member.token } });
    assert.equal((await formerMemberView.json()).membership, null);
    const targetFounder = await createPlayerSession();
    const targetCreate = await fetch(`${base}/api/rp-clubs`, {
      method:'POST', headers:{ authorization:`Bearer ${targetFounder.token}`, 'content-type':'application/json' },
      body:JSON.stringify({ name:`Rivals ${targetFounder.identity.playerId.slice(-2)}`, tag:`R${targetFounder.identity.playerId.slice(-2)}` })
    });
    assert.equal(targetCreate.status, 201);
    const targetClub = (await targetCreate.json()).club;
    const nonMemberChallenge = await fetch(`${base}/api/rp-clubs/${targetClub.id}/challenges`, {
      method:'POST', headers:{ authorization:`Bearer ${outsider.token}` }
    });
    assert.equal(nonMemberChallenge.status, 409);
    const memberChallenge = await fetch(`${base}/api/rp-clubs/${targetClub.id}/challenges`, {
      method:'POST', headers:{ authorization:`Bearer ${member.token}` }
    });
    assert.equal(memberChallenge.status, 403);
    const selfChallenge = await fetch(`${base}/api/rp-clubs/${created.club.id}/challenges`, {
      method:'POST', headers:{ authorization:`Bearer ${founder.token}` }
    });
    assert.equal(selfChallenge.status, 409);
    const challengeCreate = await fetch(`${base}/api/rp-clubs/${targetClub.id}/challenges`, {
      method:'POST', headers:{ authorization:`Bearer ${founder.token}` }
    });
    assert.equal(challengeCreate.status, 201);
    const challenge = (await challengeCreate.json()).challenge;
    assert.equal(challenge.status, 'pending');
    const memberChallengeInbox = await fetch(`${base}/api/rp-clubs/challenges/me`, {
      headers:{ authorization:`Bearer ${member.token}` }
    });
    assert.equal((await memberChallengeInbox.json()).challenges[0].id, challenge.id);

    const targetInbox = await fetch(`${base}/api/rp-clubs/challenges/me`, {
      headers:{ authorization:`Bearer ${targetFounder.token}` }
    });
    assert.equal((await targetInbox.json()).challenges[0].id, challenge.id);

    const unauthorizedDecision = await fetch(`${base}/api/rp-clubs/challenges/${challenge.id}/decision`, {
      method:'POST', headers:{ authorization:`Bearer ${outsider.token}`, 'content-type':'application/json' },
      body:JSON.stringify({ decision:'accept', scheduledAt:new Date(Date.now()+2*60*60*1000).toISOString() })
    });
    assert.equal(unauthorizedDecision.status, 403);

    const invalidSchedule = await fetch(`${base}/api/rp-clubs/challenges/${challenge.id}/decision`, {
      method:'POST', headers:{ authorization:`Bearer ${targetFounder.token}`, 'content-type':'application/json' },
      body:JSON.stringify({ decision:'accept', scheduledAt:new Date(Date.now()+5*60*1000).toISOString() })
    });
    assert.equal(invalidSchedule.status, 409);

    const acceptedChallenge = await fetch(`${base}/api/rp-clubs/challenges/${challenge.id}/decision`, {
      method:'POST', headers:{ authorization:`Bearer ${targetFounder.token}`, 'content-type':'application/json' },
      body:JSON.stringify({ decision:'accept', scheduledAt:new Date(Date.now()+2*60*60*1000).toISOString() })
    });
    assert.equal(acceptedChallenge.status, 200);
    const scheduled = (await acceptedChallenge.json()).challenge;
    assert.equal(scheduled.status, 'accepted');
    assert.ok(Date.parse(scheduled.scheduledAt) > Date.now());

    const duplicateChallenge = await fetch(`${base}/api/rp-clubs/${targetClub.id}/challenges`, {
      method:'POST', headers:{ authorization:`Bearer ${founder.token}` }
    });
    assert.equal(duplicateChallenge.status, 409);

    const transfer = await fetch(`${base}/api/rp-clubs/${created.club.id}/presidency/transfer`, {
      method:'POST', headers:{ authorization:`Bearer ${founder.token}`, 'content-type':'application/json' },
      body:JSON.stringify({ playerId:invitee.identity.playerId })
    });
    assert.equal(transfer.status, 200);
    assert.equal((await transfer.json()).presidentPlayerId, invitee.identity.playerId);
    const formerFounderView = await fetch(base + '/api/rp-clubs/me', { headers:{ authorization:'Bearer ' + founder.token } });
    const formerFounderMembership = (await formerFounderView.json()).membership;
    assert.equal(formerFounderMembership.membership.isPresident, false);
    assert.equal(formerFounderMembership.club.presidentPlayerId, invitee.identity.playerId);

    const unauthorizedFounderRoleChange = await fetch(`${base}/api/rp-clubs/${created.club.id}/members/${member.identity.playerId}/role`, {
      method:'POST', headers:{ authorization:`Bearer ${founder.token}`, 'content-type':'application/json' },
      body:JSON.stringify({ role:'recruiter' })
    });
    assert.equal(unauthorizedFounderRoleChange.status, 403);

    const newMember = await createPlayerSession();
    const newJoin = await fetch(`${base}/api/rp-clubs/${created.club.id}/join-requests`, {
      method:'POST', headers:{ authorization:`Bearer ${newMember.token}` }
    });
    assert.equal(newJoin.status, 201);
    const newJoinRequest = (await newJoin.json()).request;
    const presidentAccept = await fetch(`${base}/api/rp-clubs/${created.club.id}/join-requests/${newJoinRequest.id}/decision`, {
      method:'POST', headers:{ authorization:`Bearer ${invitee.token}`, 'content-type':'application/json' },
      body:JSON.stringify({ decision:'accept' })
    });
    assert.equal(presidentAccept.status, 200);
    const removal = await fetch(`${base}/api/rp-clubs/${created.club.id}/members/${newMember.identity.playerId}/remove`, {
      method:'POST', headers:{ authorization:`Bearer ${invitee.token}` }
    });
    assert.equal(removal.status, 200);
    const removedMemberView = await fetch(base + '/api/rp-clubs/me', { headers:{ authorization:'Bearer ' + newMember.token } });
    assert.equal((await removedMemberView.json()).membership, null);

    const governanceView = await fetch(base + '/api/rp-clubs/me', { headers:{ authorization:'Bearer ' + invitee.token } });
    const governanceLog = (await governanceView.json()).membership.governanceLog;
    assert.ok(governanceLog.some(event => event.action === 'presidency_transferred'));
    assert.ok(governanceLog.some(event => event.action === 'join_accepted'));
    const inviteeMember = governanceViewData.membership.club.members.find(member => member.playerId === invitee.identity.playerId);
    assert.ok(governanceLog.some(event => event.action === 'invitation_accepted' && event.actorDisplayName === inviteeMember.displayName));
    assert.ok(governanceLog.some(event => event.action === 'member_removed'));
    assert.equal(governanceLog.some(event => Object.hasOwn(event, 'accountId')), false);

    const founderLeave = await fetch(`${base}/api/rp-clubs/${created.club.id}/leave`, {
      method: 'POST', headers: { authorization: `Bearer ${founder.token}` }
    });
    assert.equal(founderLeave.status, 409);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
