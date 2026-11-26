import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const clean = (value, max = 80) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const slugText = value => clean(value, 48).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const clone = value => structuredClone(value);
const MEMBER_ROLES = new Set(['founder', 'president', 'vice_president', 'recruiter', 'member']);
const MANAGER_ROLES = new Set(['founder', 'president', 'recruiter']);
const MAX_MEMBERS = 30;
const MAX_PENDING_REQUESTS = 100;

function normalizeClub(row) {
  if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id
    || typeof row.name !== 'string' || typeof row.tag !== 'string'
    || !Array.isArray(row.members) || !Array.isArray(row.joinRequests)) return null;
  const members = row.members.filter(member => member
    && typeof member.accountId === 'string' && member.accountId
    && typeof member.playerId === 'string' && /^FRP-\d{6}$/.test(member.playerId)
    && MEMBER_ROLES.has(member.role)
    && typeof member.displayName === 'string');
  if (members.length !== row.members.length || members.length > MAX_MEMBERS
    || new Set(members.map(member => member.accountId)).size !== members.length
    || new Set(members.map(member => member.playerId)).size !== members.length) return null;
  const founder = members.find(member => member.role === 'founder');
  if (!founder) return null;
  const requests = row.joinRequests.filter(request => request
    && typeof request.id === 'string' && typeof request.accountId === 'string'
    && typeof request.playerId === 'string' && /^FRP-\d{6}$/.test(request.playerId)
    && typeof request.displayName === 'string' && typeof request.createdAt === 'string');
  if (requests.length !== row.joinRequests.length || requests.length > MAX_PENDING_REQUESTS
    || new Set(requests.map(request => request.accountId)).size !== requests.length) return null;
  const invitations = (Array.isArray(row.invitations) ? row.invitations : []).filter(invite => invite
    && typeof invite.id === 'string' && typeof invite.accountId === 'string'
    && typeof invite.playerId === 'string' && /^FRP-\d{6}$/.test(invite.playerId)
    && typeof invite.displayName === 'string' && typeof invite.createdAt === 'string'
    && typeof invite.invitedByAccountId === 'string');
  if (invitations.length !== (Array.isArray(row.invitations) ? row.invitations.length : 0)
    || invitations.length > MAX_PENDING_REQUESTS
    || new Set(invitations.map(invite => invite.accountId)).size !== invitations.length) return null;
  return {
    id: row.id,
    name: clean(row.name, 24),
    normalizedName: slugText(row.name),
    tag: clean(row.tag, 5).toUpperCase(),
    description: clean(row.description, 120),
    level: Number.isSafeInteger(row.level) && row.level >= 1 && row.level <= 99 ? row.level : 1,
    experience: Number.isSafeInteger(row.experience) && row.experience >= 0 ? row.experience : 0,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date(0).toISOString(),
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : new Date(0).toISOString(),
    members: members.map(member => ({
      accountId: member.accountId, playerId: member.playerId,
      displayName: clean(member.displayName, 20), role: member.role,
      joinedAt: member.joinedAt
    })),
    joinRequests: requests.map(request => ({
      id: request.id, accountId: request.accountId, playerId: request.playerId,
      displayName: clean(request.displayName, 20), createdAt: request.createdAt
    })),
    invitations: invitations.map(invite => ({
      id: invite.id, accountId: invite.accountId, playerId: invite.playerId,
      displayName: clean(invite.displayName, 20), invitedByAccountId: invite.invitedByAccountId,
      createdAt: invite.createdAt
    }))
  };
}

export class JsonRpClubStore {
  constructor(directory, { now = () => Date.now(), idFactory = randomUUID } = {}) {
    this.directory = path.resolve(directory);
    this.file = path.join(this.directory, 'rp-clubs.json');
    this.now = now;
    this.idFactory = idFactory;
    mkdirSync(this.directory, { recursive: true });
    this.state = this.read();
  }

  read() {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.clubs)) throw new Error('bad schema');
      const clubs = parsed.clubs.map(normalizeClub);
      if (clubs.some(club => !club)
        || new Set(clubs.map(club => club.id)).size !== clubs.length
        || new Set(clubs.map(club => club.normalizedName)).size !== clubs.length) throw new Error('invalid clubs');
      const memberships = clubs.flatMap(club => club.members.map(member => member.accountId));
      if (new Set(memberships).size !== memberships.length) throw new Error('duplicate membership');
      return { version: 1, clubs };
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, clubs: [] };
      throw new Error('RP_CLUB_STORE_CORRUPT');
    }
  }

  persist() {
    const temporary = `${this.file}.${process.pid}.${this.idFactory()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(this.state), { mode: 0o600 });
      renameSync(temporary, this.file);
    } catch (error) {
      try { unlinkSync(temporary); } catch {}
      throw error;
    }
  }

  transact(mutator) {
    const previous = this.state;
    this.state = clone(previous);
    try {
      const result = mutator();
      if (result?.ok === false) { this.state = previous; return result; }
      this.persist();
      return result;
    } catch (error) {
      this.state = previous;
      throw error;
    }
  }

  findMembership(accountId) {
    for (const club of this.state.clubs) {
      const member = club.members.find(item => item.accountId === accountId);
      if (member) return { club, member };
    }
    return null;
  }

  publicClub(club) {
    return {
      id: club.id, name: club.name, tag: club.tag, description: club.description,
      level: club.level, experience: club.experience, memberCount: club.members.length,
      capacity: MAX_MEMBERS, createdAt: club.createdAt,
      members: club.members.map(({ playerId, displayName, role, joinedAt }) => ({ playerId, displayName, role, joinedAt }))
    };
  }

  list({ search = '', limit = 24, offset = 0 } = {}) {
    const query = slugText(search);
    const safeLimit = Number.isSafeInteger(limit) ? Math.max(1, Math.min(50, limit)) : 24;
    const safeOffset = Number.isSafeInteger(offset) ? Math.max(0, Math.min(100000, offset)) : 0;
    const rows = this.state.clubs
      .filter(club => !query || slugText(club.name).includes(query) || slugText(club.tag).includes(query))
      .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
    return { total: rows.length, limit: safeLimit, offset: safeOffset, clubs: rows.slice(safeOffset, safeOffset + safeLimit).map(club => this.publicClub(club)) };
  }

  get(clubId) {
    const club = this.state.clubs.find(item => item.id === clubId);
    return club ? this.publicClub(club) : null;
  }

  getInvitationsForAccount(accountId) {
    return this.state.clubs.flatMap(club => club.invitations
      .filter(invite => invite.accountId === accountId)
      .map(invite => ({ id:invite.id, club:this.publicClub(club), invitedAt:invite.createdAt })));
  }

  getMemberAccounts(clubId, requesterAccountId) {
    const club = this.state.clubs.find(item => item.id === clubId);
    if (!club || !club.members.some(member => member.accountId === requesterAccountId)) return null;
    return club.members.map(({ accountId, playerId, displayName, role }) => ({ accountId, playerId, displayName, role }));
  }

  getForAccount(accountId) {
    const membership = this.findMembership(accountId);
    if (!membership) return null;
    const club = this.publicClub(membership.club);
    return { club, membership: { playerId: membership.member.playerId, role: membership.member.role, joinedAt: membership.member.joinedAt }, pendingRequests: MANAGER_ROLES.has(membership.member.role) ? membership.club.joinRequests.map(item => ({ id: item.id, playerId: item.playerId, displayName: item.displayName, createdAt: item.createdAt })) : [] };
  }

  create({ accountId, playerId, displayName, name, tag, description = '' } = {}) {
    const safeName = clean(name, 24);
    const safeTag = clean(tag, 5).toUpperCase();
    const safeDescription = clean(description, 120);
    if (!accountId || !/^FRP-\d{6}$/.test(String(playerId || '')) || !clean(displayName, 20)) return { ok: false, reason: 'PLAYER_IDENTITY_REQUIRED' };
    if (safeName.length < 3 || !/^[a-zA-Z0-9À-ÿ][a-zA-Z0-9À-ÿ .'-]{1,22}[a-zA-Z0-9À-ÿ]$/.test(safeName)) return { ok: false, reason: 'INVALID_CLUB_NAME' };
    if (!/^[A-Z0-9]{2,5}$/.test(safeTag)) return { ok: false, reason: 'INVALID_CLUB_TAG' };
    if (this.findMembership(accountId)) return { ok: false, reason: 'ALREADY_IN_RP_CLUB' };
    if (this.state.clubs.some(club => club.normalizedName === slugText(safeName) || club.tag === safeTag)) return { ok: false, reason: 'RP_CLUB_NAME_OR_TAG_TAKEN' };
    const now = new Date(this.now()).toISOString();
    return this.transact(() => {
      const club = normalizeClub({
        id: this.idFactory(), name: safeName, tag: safeTag, description: safeDescription,
        level: 1, experience: 0, createdAt: now, updatedAt: now,
        members: [{ accountId, playerId, displayName: clean(displayName, 20), role: 'founder', joinedAt: now }],
        joinRequests: []
      });
      this.state.clubs.push(club);
      return { ok: true, club: this.publicClub(club) };
    });
  }

  requestJoin(clubId, { accountId, playerId, displayName } = {}) {
    if (!accountId || !/^FRP-\d{6}$/.test(String(playerId || '')) || !clean(displayName, 20)) return { ok: false, reason: 'PLAYER_IDENTITY_REQUIRED' };
    return this.transact(() => {
      const club = this.state.clubs.find(item => item.id === clubId);
      if (!club) return { ok: false, reason: 'RP_CLUB_NOT_FOUND' };
      if (this.findMembership(accountId)) return { ok: false, reason: 'ALREADY_IN_RP_CLUB' };
      if (club.members.length >= MAX_MEMBERS) return { ok: false, reason: 'RP_CLUB_FULL' };
      if (club.joinRequests.some(item => item.accountId === accountId)) return { ok: false, reason: 'JOIN_REQUEST_ALREADY_PENDING' };
      if (club.joinRequests.length >= MAX_PENDING_REQUESTS) return { ok: false, reason: 'JOIN_REQUESTS_FULL' };
      const request = { id: this.idFactory(), accountId, playerId, displayName: clean(displayName, 20), createdAt: new Date(this.now()).toISOString() };
      club.joinRequests.push(request);
      club.updatedAt = request.createdAt;
      return { ok: true, request: { id: request.id, playerId: request.playerId, displayName: request.displayName, createdAt: request.createdAt } };
    });
  }

  decideJoinRequest(clubId, requestId, { actorAccountId, decision } = {}) {
    if (!['accept', 'reject'].includes(decision)) return { ok: false, reason: 'INVALID_JOIN_DECISION' };
    return this.transact(() => {
      const club = this.state.clubs.find(item => item.id === clubId);
      if (!club) return { ok: false, reason: 'RP_CLUB_NOT_FOUND' };
      const actor = club.members.find(item => item.accountId === actorAccountId);
      if (!actor || !MANAGER_ROLES.has(actor.role)) return { ok: false, reason: 'RP_CLUB_PERMISSION_DENIED' };
      const pending = club.joinRequests.find(item => item.id === requestId);
      if (!pending) return { ok: false, reason: 'JOIN_REQUEST_NOT_FOUND' };
      if (decision === 'accept' && this.findMembership(pending.accountId)) return { ok: false, reason: 'APPLICANT_ALREADY_IN_RP_CLUB' };
      if (decision === 'accept' && club.members.length >= MAX_MEMBERS) return { ok: false, reason: 'RP_CLUB_FULL' };
      club.joinRequests = club.joinRequests.filter(item => item.id !== requestId);
      if (decision === 'accept') club.members.push({
        accountId: pending.accountId, playerId: pending.playerId, displayName: pending.displayName,
        role: 'member', joinedAt: new Date(this.now()).toISOString()
      });
      club.updatedAt = new Date(this.now()).toISOString();
      return { ok: true, decision, memberCount: club.members.length };
    });
  }

  invite(clubId, { actorAccountId, accountId, playerId, displayName } = {}) {
    if (!accountId || !/^FRP-\d{6}$/.test(String(playerId || '')) || !clean(displayName, 20)) return { ok:false, reason:'PLAYER_IDENTITY_REQUIRED' };
    return this.transact(() => {
      const club = this.state.clubs.find(item => item.id === clubId);
      if (!club) return { ok:false, reason:'RP_CLUB_NOT_FOUND' };
      const actor = club.members.find(item => item.accountId === actorAccountId);
      if (!actor || !MANAGER_ROLES.has(actor.role)) return { ok:false, reason:'RP_CLUB_PERMISSION_DENIED' };
      if (this.findMembership(accountId)) return { ok:false, reason:'INVITEE_ALREADY_IN_RP_CLUB' };
      if (club.members.length >= MAX_MEMBERS) return { ok:false, reason:'RP_CLUB_FULL' };
      if (club.invitations.some(item => item.accountId === accountId)) return { ok:false, reason:'RP_CLUB_INVITATION_ALREADY_PENDING' };
      if (club.invitations.length >= MAX_PENDING_REQUESTS) return { ok:false, reason:'RP_CLUB_INVITATIONS_FULL' };
      const invitation = { id:this.idFactory(), accountId, playerId, displayName:clean(displayName,20), invitedByAccountId:actorAccountId, createdAt:new Date(this.now()).toISOString() };
      club.invitations.push(invitation);
      club.updatedAt = invitation.createdAt;
      return { ok:true, invitation:{ id:invitation.id, playerId:invitation.playerId, displayName:invitation.displayName, createdAt:invitation.createdAt } };
    });
  }

  respondInvitation(clubId, invitationId, { accountId, decision } = {}) {
    if (!['accept','reject'].includes(decision)) return { ok:false, reason:'INVALID_INVITATION_DECISION' };
    return this.transact(() => {
      const club = this.state.clubs.find(item => item.id === clubId);
      if (!club) return { ok:false, reason:'RP_CLUB_NOT_FOUND' };
      const invitation = club.invitations.find(item => item.id === invitationId && item.accountId === accountId);
      if (!invitation) return { ok:false, reason:'RP_CLUB_INVITATION_NOT_FOUND' };
      if (decision === 'accept' && this.findMembership(accountId)) return { ok:false, reason:'ALREADY_IN_RP_CLUB' };
      if (decision === 'accept' && club.members.length >= MAX_MEMBERS) return { ok:false, reason:'RP_CLUB_FULL' };
      club.invitations = club.invitations.filter(item => item.id !== invitationId);
      if (decision === 'accept') club.members.push({
        accountId:invitation.accountId, playerId:invitation.playerId, displayName:invitation.displayName,
        role:'member', joinedAt:new Date(this.now()).toISOString()
      });
      club.updatedAt = new Date(this.now()).toISOString();
      return { ok:true, decision, memberCount:club.members.length };
    });
  }

  assignRole(clubId, targetPlayerId, { actorAccountId, role } = {}) {
    if (!['vice_president','recruiter','member'].includes(role)) return { ok:false, reason:'INVALID_RP_CLUB_ROLE' };
    return this.transact(() => {
      const club = this.state.clubs.find(item => item.id === clubId);
      if (!club) return { ok:false, reason:'RP_CLUB_NOT_FOUND' };
      const actor = club.members.find(item => item.accountId === actorAccountId);
      if (!actor || !['founder','president'].includes(actor.role)) return { ok:false, reason:'RP_CLUB_PERMISSION_DENIED' };
      const target = club.members.find(item => item.playerId === targetPlayerId);
      if (!target) return { ok:false, reason:'RP_CLUB_MEMBER_NOT_FOUND' };
      if (target.role === 'founder' || target.role === 'president') return { ok:false, reason:'RP_CLUB_ROLE_PROTECTED' };
      target.role = role;
      club.updatedAt = new Date(this.now()).toISOString();
      return { ok:true, playerId:target.playerId, role:target.role };
    });
  }

  leave(clubId, accountId) {
    return this.transact(() => {
      const club = this.state.clubs.find(item => item.id === clubId);
      if (!club) return { ok: false, reason: 'RP_CLUB_NOT_FOUND' };
      const member = club.members.find(item => item.accountId === accountId);
      if (!member) return { ok: false, reason: 'RP_CLUB_MEMBERSHIP_NOT_FOUND' };
      if (member.role === 'founder') return { ok: false, reason: 'FOUNDER_MUST_TRANSFER_PRESIDENCY' };
      club.members = club.members.filter(item => item.accountId !== accountId);
      club.updatedAt = new Date(this.now()).toISOString();
      return { ok: true, memberCount: club.members.length };
    });
  }
}