import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonRpClubStore } from '../server/rp-club-store.js';

function fixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'p27-rp-clubs-'));
  let now = Date.UTC(2026, 10, 26);
  const store = new JsonRpClubStore(directory, { now: () => now });
  return { directory, store, advance: ms => { now += ms; } };
}

test('Club RP : crée un groupement communautaire distinct du club sportif', () => {
  const { directory, store } = fixture();
  try {
    const result = store.create({
      accountId: 'account-founder', playerId: 'FRP-100001',
      displayName: 'Rova', name: 'Les Étoiles', tag: 'ETO', description: 'Club RP de test'
    });
    assert.equal(result.ok, true);
    assert.equal(result.club.memberCount, 1);
    assert.equal(result.club.members[0].role, 'founder');
    assert.equal(result.club.members[0].playerId, 'FRP-100001');
    assert.equal(Object.hasOwn(result.club.members[0], 'accountId'), false);
    assert.equal(store.getForAccount('account-founder').membership.role, 'founder');
    assert.equal(store.create({
      accountId: 'account-other', playerId: 'FRP-100002',
      displayName: 'Mika', name: 'Les Etoiles', tag: 'AUT'
    }).reason, 'RP_CLUB_NAME_OR_TAG_TAKEN');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Club RP : demande, acceptation par responsable, sauvegarde et restauration', () => {
  const { directory, store } = fixture();
  try {
    const created = store.create({
      accountId: 'founder', playerId: 'FRP-100001',
      displayName: 'Rova', name: 'Kintana United', tag: 'KIN'
    });
    const clubId = created.club.id;
    const request = store.requestJoin(clubId, {
      accountId: 'member', playerId: 'FRP-100002', displayName: 'Mika'
    });
    assert.equal(request.ok, true);
    assert.equal(store.requestJoin(clubId, {
      accountId: 'member', playerId: 'FRP-100002', displayName: 'Mika'
    }).reason, 'JOIN_REQUEST_ALREADY_PENDING');
    assert.equal(store.decideJoinRequest(clubId, request.request.id, {
      actorAccountId: 'stranger', decision: 'accept'
    }).reason, 'RP_CLUB_PERMISSION_DENIED');
    const accepted = store.decideJoinRequest(clubId, request.request.id, {
      actorAccountId: 'founder', decision: 'accept'
    });
    assert.deepEqual(accepted, { ok: true, decision: 'accept', memberCount: 2 });
    assert.equal(store.getForAccount('member').membership.role, 'member');
    assert.equal(store.getForAccount('founder').pendingRequests.length, 0);
    const restored = new JsonRpClubStore(directory);
    assert.equal(restored.get(clubId).memberCount, 2);
    assert.equal(restored.getForAccount('member').club.name, 'Kintana United');
    assert.equal(restored.requestJoin(clubId, {
      accountId: 'member', playerId: 'FRP-100002', displayName: 'Mika'
    }).reason, 'ALREADY_IN_RP_CLUB');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Club RP : fondateur protégé, membre peut partir, demandes refusées nettoyées', () => {
  const { directory, store } = fixture();
  try {
    const club = store.create({
      accountId: 'founder', playerId: 'FRP-100011',
      displayName: 'Rova', name: 'Ravinala FC', tag: 'RAV'
    }).club;
    const req = store.requestJoin(club.id, {
      accountId: 'member', playerId: 'FRP-100012', displayName: 'Tovo'
    });
    assert.equal(store.decideJoinRequest(club.id, req.request.id, {
      actorAccountId: 'founder', decision: 'reject'
    }).decision, 'reject');
    assert.equal(store.get(club.id).memberCount, 1);
    assert.equal(store.leave(club.id, 'founder').reason, 'FOUNDER_MUST_TRANSFER_PRESIDENCY');
    const req2 = store.requestJoin(club.id, {
      accountId: 'member', playerId: 'FRP-100012', displayName: 'Tovo'
    });
    store.decideJoinRequest(club.id, req2.request.id, { actorAccountId: 'founder', decision: 'accept' });
    assert.equal(store.leave(club.id, 'member').memberCount, 1);
    assert.equal(store.getForAccount('member'), null);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Club RP : transfert réel de présidence, permissions et journal persistants', () => {
  const { directory, store } = fixture();
  try {
    const club = store.create({
      accountId:'founder', playerId:'FRP-210001', displayName:'Rova',
      name:'Présidence RP', tag:'PRP'
    }).club;
    const request = store.requestJoin(club.id, {
      accountId:'member', playerId:'FRP-210002', displayName:'Mika'
    });
    store.decideJoinRequest(club.id, request.request.id, { actorAccountId:'founder', decision:'accept' });
    assert.equal(store.canLead(club.id, 'founder'), true);
    assert.equal(store.transferPresidency(club.id, 'FRP-210002', 'founder').ok, true);
    assert.equal(store.getForAccount('founder').membership.isPresident, false);
    assert.equal(store.getForAccount('member').membership.isPresident, true);
    assert.equal(store.canLead(club.id, 'founder'), false);
    assert.equal(store.canLead(club.id, 'member'), true);
    assert.equal(store.assignRole(club.id, 'FRP-210001', {
      actorAccountId:'founder', role:'recruiter'
    }).reason, 'RP_CLUB_PERMISSION_DENIED');
    assert.equal(store.removeMember(club.id, 'FRP-210001', 'member').reason, 'RP_CLUB_MEMBER_PROTECTED');
    assert.equal(store.leave(club.id, 'member').reason, 'PRESIDENT_MUST_TRANSFER_PRESIDENCY');
    assert.equal(store.leave(club.id, 'founder').memberCount, 1);
    assert.equal(store.getForAccount('founder'), null);
    const restored = new JsonRpClubStore(directory);
    assert.equal(restored.getForAccount('member').membership.isPresident, true);
    assert.equal(restored.get(club.id).memberCount, 1);
    assert.equal(restored.getForAccount('member').governanceLog.some(event => event.action === 'founder_left'), true);
    assert.equal(restored.getForAccount('founder').membership.isPresident, false);
    assert.ok(restored.getForAccount('member').governanceLog.some(event => event.action === 'presidency_transferred'));
    assert.equal(restored.getForAccount('member').governanceLog.some(event => Object.hasOwn(event, 'accountId')), false);
  } finally { rmSync(directory, { recursive:true, force:true }); }
});

test('Club RP : valide identité, nom, tag et limites de rôle', () => {
  const { directory, store } = fixture();
  try {
    assert.equal(store.create({ accountId: 'a', playerId: 'bad', displayName: 'A', name: 'AB', tag: 'A' }).reason, 'PLAYER_IDENTITY_REQUIRED');
    assert.equal(store.create({ accountId: 'a', playerId: 'FRP-100021', displayName: 'A', name: 'AB', tag: 'A' }).reason, 'INVALID_CLUB_NAME');
    assert.equal(store.create({ accountId: 'a', playerId: 'FRP-100021', displayName: 'A', name: 'Valid Club', tag: 'A' }).reason, 'INVALID_CLUB_TAG');
    const club = store.create({ accountId: 'a', playerId: 'FRP-100021', displayName: 'A', name: 'Valid Club', tag: 'VC' });
    assert.equal(club.ok, true);
    assert.equal(store.create({ accountId: 'a', playerId: 'FRP-100021', displayName: 'A', name: 'Second Club', tag: 'SC' }).reason, 'ALREADY_IN_RP_CLUB');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Club RP : invitations privées, acceptation par le destinataire et rôles de membres', () => {
  const { directory, store } = fixture();
  try {
    const club = store.create({
      accountId:'founder', playerId:'FRP-200001', displayName:'Rova',
      name:'Les Invincibles', tag:'INV'
    }).club;
    assert.equal(store.invite(club.id, {
      actorAccountId:'stranger', accountId:'invitee', playerId:'FRP-200002', displayName:'Tiana'
    }).reason, 'RP_CLUB_PERMISSION_DENIED');
    const invitation = store.invite(club.id, {
      actorAccountId:'founder', accountId:'invitee', playerId:'FRP-200002', displayName:'Tiana'
    });
    assert.equal(invitation.ok, true);
    assert.equal(store.getInvitationsForAccount('invitee')[0].club.id, club.id);
    assert.equal(store.respondInvitation(club.id, invitation.invitation.id, {
      accountId:'stranger', decision:'accept'
    }).reason, 'RP_CLUB_INVITATION_NOT_FOUND');
    assert.equal(store.respondInvitation(club.id, invitation.invitation.id, {
      accountId:'invitee', decision:'accept'
    }).memberCount, 2);
    assert.equal(store.getInvitationsForAccount('invitee').length, 0);
    assert.equal(store.assignRole(club.id, 'FRP-200002', {
      actorAccountId:'founder', role:'recruiter'
    }).role, 'recruiter');
    assert.equal(store.assignRole(club.id, 'FRP-200002', {
      actorAccountId:'invitee', role:'vice_president'
    }).reason, 'RP_CLUB_PERMISSION_DENIED');
    assert.equal(store.assignRole(club.id, 'FRP-200002', {
      actorAccountId:'founder', role:'president'
    }).reason, 'INVALID_RP_CLUB_ROLE');
    const restored = new JsonRpClubStore(directory);
    assert.equal(restored.getForAccount('invitee').club.members.find(member=>member.playerId==='FRP-200002').role, 'recruiter');
  } finally { rmSync(directory, { recursive:true, force:true }); }
});
