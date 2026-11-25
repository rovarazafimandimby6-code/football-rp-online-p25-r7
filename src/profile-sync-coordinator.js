/** Queues cosmetic profile changes locally and uploads them only to their matching linked account. */
export class ProfileSyncCoordinator {
  constructor({ accountClient, outbox, getProfile, getLocalIdentity } = {}) {
    if (!accountClient || !outbox || typeof getProfile !== 'function' || typeof getLocalIdentity !== 'function') {
      throw new Error('PROFILE_SYNC_COORDINATOR_CONFIG_INVALID');
    }
    this.accountClient = accountClient;
    this.outbox = outbox;
    this.getProfile = getProfile;
    this.getLocalIdentity = getLocalIdentity;
  }

  enqueueProfile(profile) {
    return this.accountClient.enqueueProfileSnapshot(profile, this.outbox);
  }

  enqueueCurrentProfile() {
    return this.enqueueProfile(this.getProfile());
  }

  async flush() {
    const status = this.outbox.status();
    if (!status.pending || !this.accountClient.hasSession) {
      return { uploaded: 0, remaining: status.pending, blocked: 0, skipped: true };
    }
    const identity = this.getLocalIdentity();
    if (!identity?.accountId || !identity?.id) {
      return { uploaded: 0, remaining: status.pending, blocked: 0, skipped: true };
    }
    if (this.accountClient.account?.id !== identity.accountId || this.accountClient.account?.playerId !== identity.id) {
      return { uploaded: 0, remaining: status.pending, blocked: status.pending, skipped: true, reason: 'ACCOUNT_LOCAL_IDENTITY_MISMATCH' };
    }
    return this.accountClient.syncPendingProfileSnapshots(this.outbox, { localIdentity: identity });
  }
}
