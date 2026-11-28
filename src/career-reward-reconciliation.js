/** Apply match rewards only after the career ledger has durably recorded them. */
const MATCH_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export function applyCareerMatchReward({ careerReward, profileStore, matchId } = {}) {
  if (!careerReward || careerReward.ok === false) {
    return { ok:false, reason:'career-reward-not-persisted' };
  }
  if (typeof matchId !== 'string' || !MATCH_ID_RE.test(matchId)) return { ok:false, reason:'invalid-match-id' };
  const id = matchId;
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
