import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const clone = value => structuredClone(value);
const MAX_CHALLENGES = 5000;
const MANAGER_ROLES = new Set(['founder','president','vice_president','recruiter']);

export class JsonRpClubChallengeStore {
  constructor(directory, { now = () => Date.now(), idFactory = randomUUID } = {}) {
    this.directory = path.resolve(directory);
    this.file = path.join(this.directory, 'rp-club-challenges.json');
    this.now = now;
    this.idFactory = idFactory;
    mkdirSync(this.directory, { recursive:true });
    this.state = this.read();
  }

  read() {
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8'));
      if (!data || data.version !== 1 || !Array.isArray(data.challenges) || data.challenges.length > MAX_CHALLENGES) throw new Error('bad schema');
      const valid = data.challenges.every(item => item && typeof item.id === 'string'
        && typeof item.challengerClubId === 'string' && typeof item.targetClubId === 'string'
        && item.challengerClubId !== item.targetClubId
        && typeof item.challengerName === 'string' && typeof item.challengerTag === 'string'
        && typeof item.targetName === 'string' && typeof item.targetTag === 'string'
        && typeof item.createdByAccountId === 'string' && Array.isArray(item.challengerMemberAccountIds)
        && item.challengerMemberAccountIds.every(id => typeof id === 'string') && Array.isArray(item.targetMemberAccountIds)
        && item.targetMemberAccountIds.every(id => typeof id === 'string')
        && ['pending','accepted','declined','cancelled','completed'].includes(item.status)
        && typeof item.createdAt === 'string'
        && (item.scheduledAt === null || typeof item.scheduledAt === 'string'));
      if (!valid || new Set(data.challenges.map(item => item.id)).size !== data.challenges.length) throw new Error('invalid challenges');
      return { version:1, challenges:data.challenges };
    } catch (error) {
      if (error.code === 'ENOENT') return { version:1, challenges:[] };
      throw new Error('RP_CLUB_CHALLENGE_STORE_CORRUPT');
    }
  }

  persist() {
    const temp = this.file + '.' + process.pid + '.' + this.idFactory() + '.tmp';
    try {
      writeFileSync(temp, JSON.stringify(this.state), { mode:0o600 });
      renameSync(temp, this.file);
    } catch (error) {
      try { unlinkSync(temp); } catch {}
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
    } catch (error) { this.state = previous; throw error; }
  }

  listForAccount(accountId) {
    return this.state.challenges
      .filter(item => item.challengerMemberAccountIds.includes(accountId) || item.targetMemberAccountIds.includes(accountId))
      .sort((a,b) => b.createdAt.localeCompare(a.createdAt))
      .map(item => ({
        id:item.id, challengerClubId:item.challengerClubId, challengerName:item.challengerName,
        challengerTag:item.challengerTag, targetClubId:item.targetClubId, targetName:item.targetName,
        targetTag:item.targetTag, status:item.status, createdAt:item.createdAt,
        scheduledAt:item.scheduledAt, decidedAt:item.decidedAt || null
      }));
  }

  create({ clubStore, actorAccountId, targetClubId } = {}) {
    const ownMembership = clubStore.getForAccount(actorAccountId);
    if (!ownMembership) return { ok:false, reason:'RP_CLUB_MEMBERSHIP_REQUIRED' };
    if (!MANAGER_ROLES.has(ownMembership.membership.role)) return { ok:false, reason:'RP_CLUB_PERMISSION_DENIED' };
    const challenger = ownMembership.club;
    const target = clubStore.get(targetClubId);
    if (!target) return { ok:false, reason:'RP_CLUB_NOT_FOUND' };
    if (challenger.id === target.id) return { ok:false, reason:'RP_CLUB_CHALLENGE_SELF' };
    if (target.memberCount < 1) return { ok:false, reason:'RP_CLUB_EMPTY' };
    const challengerMemberAccountIds = clubStore.listMemberAccountIds(challenger.id);
    const targetMemberAccountIds = clubStore.listMemberAccountIds(target.id);
    if (!challengerMemberAccountIds?.length || !targetMemberAccountIds?.length) return { ok:false, reason:'RP_CLUB_NOT_FOUND' };
    const active = this.state.challenges.find(item =>
      ['pending','accepted'].includes(item.status)
      && ((item.challengerClubId === challenger.id && item.targetClubId === target.id)
        || (item.challengerClubId === target.id && item.targetClubId === challenger.id)));
    if (active) return { ok:false, reason:'RP_CLUB_CHALLENGE_ALREADY_ACTIVE' };
    if (this.state.challenges.length >= MAX_CHALLENGES) return { ok:false, reason:'RP_CLUB_CHALLENGE_LIMIT' };
    const createdAt = new Date(this.now()).toISOString();
    const item = {
      id:this.idFactory(), challengerClubId:challenger.id, challengerName:challenger.name, challengerTag:challenger.tag,
      targetClubId:target.id, targetName:target.name, targetTag:target.tag,
      createdByAccountId:actorAccountId, challengerMemberAccountIds, targetMemberAccountIds,
      status:'pending', createdAt, scheduledAt:null, decidedAt:null, decidedByAccountId:null
    };
    return this.transact(() => { this.state.challenges.push(item); return { ok:true, challenge:this.listForAccount(actorAccountId).find(row=>row.id===item.id) }; });
  }

  decide(challengeId, { clubStore, actorAccountId, decision, scheduledAt } = {}) {
    if (!['accept','reject'].includes(decision)) return { ok:false, reason:'INVALID_RP_CLUB_CHALLENGE_DECISION' };
    const item = this.state.challenges.find(row=>row.id===challengeId);
    if (!item) return { ok:false, reason:'RP_CLUB_CHALLENGE_NOT_FOUND' };
    if (item.status !== 'pending') return { ok:false, reason:'RP_CLUB_CHALLENGE_NOT_PENDING' };
    const targetMembership = clubStore.getForAccount(actorAccountId);
    if (!targetMembership || targetMembership.club.id !== item.targetClubId) return { ok:false, reason:'RP_CLUB_PERMISSION_DENIED' };
    if (!MANAGER_ROLES.has(targetMembership.membership.role)) return { ok:false, reason:'RP_CLUB_PERMISSION_DENIED' };
    let parsedSchedule = null;
    if (decision === 'accept') {
      const timestamp = Date.parse(scheduledAt);
      const now = this.now();
      if (!Number.isFinite(timestamp) || timestamp < now + 30 * 60 * 1000 || timestamp > now + 30 * 24 * 60 * 60 * 1000)
        return { ok:false, reason:'INVALID_RP_CLUB_CHALLENGE_DATE' };
      parsedSchedule = new Date(timestamp).toISOString();
    }
    return this.transact(() => {
      const current = this.state.challenges.find(row=>row.id===challengeId);
      if (!current || current.status !== 'pending') return { ok:false, reason:'RP_CLUB_CHALLENGE_NOT_PENDING' };
      current.status = decision === 'accept' ? 'accepted' : 'declined';
      current.scheduledAt = parsedSchedule;
      current.decidedAt = new Date(this.now()).toISOString();
      current.decidedByAccountId = actorAccountId;
      return { ok:true, challenge:{
        id:current.id, challengerClubId:current.challengerClubId, challengerName:current.challengerName,
        challengerTag:current.challengerTag, targetClubId:current.targetClubId, targetName:current.targetName,
        targetTag:current.targetTag, status:current.status, createdAt:current.createdAt,
        scheduledAt:current.scheduledAt, decidedAt:current.decidedAt
      } };
    });
  }
}
