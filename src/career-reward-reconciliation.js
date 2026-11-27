/** Apply match rewards only after the career ledger has durably recorded them. */
export function applyCareerMatchReward({ careerReward, profileStore, matchId } = {}) {
  if (!careerReward || careerReward.ok === false) {
    return { ok:false, reason:'career-reward-not-persisted' };
  }
  const id = typeof matchId === 'string' ? matchId.trim().slice(0,64) : '';
  if (!id) return { ok:false, reason:'invalid-match-id' };
  return profileStore.grantMatchRewards({ ...careerReward, matchId:id });
}

/** Recover career-ledger rewards that were not yet committed to the local player profile. */
export function reconcileCareerProfileRewards({ career, profileStore } = {}) {
  const appliedIds = new Set(profileStore?.profile?.appliedMatchIds || []);
  let recovered = 0;
  for (const reward of Array.isArray(career?.matchRewards) ? career.matchRewards : []) {
    if (!reward?.matchId || appliedIds.has(reward.matchId)) continue;
    const result = profileStore.grantMatchRewards(reward);
    if (!result?.ok) return { ok:false, reason:result?.reason || 'profile-reward-persistence-failed', recovered };
    appliedIds.add(reward.matchId);
    recovered++;
  }
  return { ok:true, recovered };
}
