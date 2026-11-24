/** Keep the persistent club catalogue aligned with the competition system's authoritative division assignments. */
export function syncClubAssignments({ clubManager, competitionStore } = {}) {
  if (!clubManager?.clubs || typeof clubManager.saveSeason !== 'function' || !competitionStore?.clubs) {
    return { ok:false, reason:'assignment-sync-dependencies-missing', updated:0 };
  }
  const assignments = [...competitionStore.clubs.values()];
  if (!assignments.length || assignments.some(item => !item?.id || !clubManager.clubs.has(item.id))) {
    return { ok:false, reason:'assignment-catalogue-mismatch', updated:0 };
  }
  const previous = new Map();
  let updated = 0;
  for (const assignment of assignments) {
    const club = clubManager.clubs.get(assignment.id);
    previous.set(club.id, { division:club.division, conference:club.conference });
    if (club.division !== assignment.division || (club.conference || null) !== (assignment.conference || null)) {
      club.division = assignment.division;
      club.conference = assignment.conference || null;
      updated++;
    }
  }
  if (!updated) return { ok:true, updated:0 };
  if (!clubManager.saveSeason()) {
    // Keep the in-memory world aligned with the authoritative competition store.
    // The next server boot retries persistence from the competition assignment file.
    return { ok:false, reason:'club-assignment-persistence-pending', updated };
  }
  return { ok:true, updated };
}
