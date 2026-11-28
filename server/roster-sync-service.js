/** Replays durable transfer-store outbox entries into the club roster store. */
export function processPendingRosterSync({ transferStore, clubManager, limit = 100 } = {}) {
  if (!transferStore || !clubManager) return { ok:false, reason:'missing-store', processed:[], pending:0 };
  const entries = transferStore.pendingRosterSync().slice(0, Math.max(1, Math.min(1000, Number(limit) || 100)));
  const processed = [];
  const failed = [];
  for (const entry of entries) {
    try {
      const result = clubManager.syncHumanCareer({
        playerId:entry.playerId,
        clubId:entry.action === 'release' ? null : entry.clubId,
        previousClubId:entry.previousClubId,
        contract:entry.contract,
        name:entry.playerName,
        reason:entry.reason
      });
      if (!result.ok) {
        transferStore.failRosterSync(entry.id, result.reason);
        failed.push({ id:entry.id, reason:result.reason });
        continue;
      }
      const checkpoint = transferStore.completeRosterSync(entry.id);
      if (!checkpoint?.ok) {
        transferStore.failRosterSync(entry.id, checkpoint?.reason || 'ROSTER_SYNC_CHECKPOINT_MISSING');
        failed.push({ id:entry.id, reason:checkpoint?.reason || 'ROSTER_SYNC_CHECKPOINT_MISSING' });
        continue;
      }
      processed.push({ id:entry.id, playerId:entry.playerId, action:result.action, clubId:result.clubId || null });
    } catch (error) {
      try { transferStore.failRosterSync(entry.id, error); } catch {}
      failed.push({ id:entry.id, reason:String(error?.message || 'ROSTER_SYNC_FAILED') });
    }
  }
  return { ok:failed.length === 0, processed, failed, pending:transferStore.pendingRosterSync().length };
}
