export class RpClubMatchService {
  constructor({ clubStore, challengeStore, roomManager, now = () => Date.now() } = {}) {
    this.clubStore = clubStore;
    this.challengeStore = challengeStore;
    this.roomManager = roomManager;
    this.now = now;
  }

  createRoom(challengeId, accountId) {
    const challenge = this.challengeStore.state.challenges.find(item => item.id === challengeId);
    if (!challenge) return { ok:false, reason:'RP_CLUB_CHALLENGE_NOT_FOUND' };
    if (challenge.status !== 'accepted') return { ok:false, reason:'RP_CLUB_CHALLENGE_NOT_ACCEPTED' };
    const actorMembership = this.clubStore.getForAccount(accountId);
    if (!actorMembership || actorMembership.club.id !== challenge.challengerClubId
      || !['founder','president','vice_president','recruiter'].includes(actorMembership.membership.role))
      return { ok:false, reason:'RP_CLUB_PERMISSION_DENIED' };
    if (challenge.roomId) {
      const existing = this.roomManager.rooms.get(challenge.roomId);
      if (existing && existing.phase !== 'fulltime') return { ok:true, room:this.roomManager.publicState(existing), reused:true };
      return { ok:false, reason:'RP_CLUB_CHALLENGE_ROOM_ALREADY_USED' };
    }
    const scheduled = Date.parse(challenge.scheduledAt);
    const now = this.now();
    if (!Number.isFinite(scheduled) || now < scheduled - 15 * 60_000 || now > scheduled + 2 * 60 * 60_000)
      return { ok:false, reason:'RP_CLUB_CHALLENGE_NOT_IN_TIME_WINDOW' };
    const roomState = this.roomManager.create({
      name:`Défi ${challenge.challengerTag} vs ${challenge.targetTag}`,
      durationMinutes:5
    });
    const room = this.roomManager.rooms.get(roomState.id);
    room.rpClubChallenge = {
      challengeId:challenge.id,
      challengerClubId:challenge.challengerClubId,
      challengerName:challenge.challengerName,
      challengerTag:challenge.challengerTag,
      targetClubId:challenge.targetClubId,
      targetName:challenge.targetName,
      targetTag:challenge.targetTag,
      blueAccountIds:[...challenge.challengerMemberAccountIds],
      redAccountIds:[...challenge.targetMemberAccountIds]
    };
    this.roomManager.persistRoom(room);
    const saved = this.challengeStore.transact(() => {
      const current = this.challengeStore.state.challenges.find(item => item.id === challengeId);
      if (!current || current.status !== 'accepted' || current.roomId) return { ok:false, reason:'RP_CLUB_CHALLENGE_ROOM_ALREADY_USED' };
      current.roomId = room.id;
      return { ok:true };
    });
    if (!saved.ok) {
      this.roomManager.rooms.delete(room.id);
      this.roomManager.roomStore?.delete(room.id);
      return saved;
    }
    return { ok:true, room:this.roomManager.publicState(room), reused:false };
  }

  recordFinalizedResult(result, room) {
    const metadata = result?.rpClubChallenge || room?.rpClubChallenge;
    if (!metadata || !result || result.phase !== 'fulltime') return { ok:false, reason:'NOT_RP_CLUB_CHALLENGE' };
    return this.challengeStore.completeFromMatch({
      challengeId:metadata.challengeId, roomId:result.roomId || room?.id,
      score:result.score, finalizedAt:result.finalizedAt
    });
  }

  reconcileChallenge(challengeId) {
    const challenge = this.challengeStore.state.challenges.find(item => item.id === challengeId);
    if (!challenge || challenge.status !== 'accepted' || !challenge.roomId) return { ok:false, reason:'RP_CLUB_CHALLENGE_NOT_READY' };
    const result = this.roomManager.resultStore?.get(challenge.roomId);
    if (!result || result.phase !== 'fulltime' || result.rpClubChallenge?.challengeId !== challengeId)
      return { ok:false, reason:'RP_CLUB_CHALLENGE_RESULT_NOT_ARCHIVED' };
    return this.recordFinalizedResult(result, null);
  }

  reconcileForAccount(accountId) {
    const rows = this.challengeStore.listForAccount(accountId);
    for (const challenge of rows) if (challenge.status === 'accepted' && challenge.roomId)
      this.reconcileChallenge(challenge.id);
    return this.challengeStore.listForAccount(accountId);
  }

  leaderboard() {
    return this.challengeStore.leaderboard();
  }

  resolveJoin(roomId, accountId) {
    const room = this.roomManager.rooms.get(roomId);
    if (!room) return { ok:false, reason:'ROOM_NOT_FOUND' };
    const challenge = room.rpClubChallenge;
    if (!challenge) return { ok:false, reason:'NOT_RP_CLUB_CHALLENGE' };
    if (typeof accountId !== 'string' || !accountId) return { ok:false, reason:'SESSION_REQUIRED' };
    const membership = this.clubStore.getForAccount(accountId);
    if (!membership) return { ok:false, reason:'RP_CLUB_CHALLENGE_MEMBERSHIP_REQUIRED' };
    if (challenge.blueAccountIds.includes(accountId) && membership.club.id === challenge.challengerClubId)
      return { ok:true, team:'blue', challengeId:challenge.challengeId };
    if (challenge.redAccountIds.includes(accountId) && membership.club.id === challenge.targetClubId)
      return { ok:true, team:'red', challengeId:challenge.challengeId };
    return { ok:false, reason:'RP_CLUB_CHALLENGE_MEMBERSHIP_REQUIRED' };
  }
}
