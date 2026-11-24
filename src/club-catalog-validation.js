import { LEAGUE_DIVISIONS, TOTAL_LEAGUE_CLUBS, conferenceForClub } from './league-structure.js';

const DIVISION_AVERAGES = Object.freeze({ D1:75, D2:68, D3:61.5, D4:55.5, D5:49 });
const addIssue = (issues, severity, code, details = {}) => issues.push({ severity, code, ...details });

/**
 * Audits a proposed persistent-world club catalogue without inventing missing
 * clubs. It is intentionally strict: an incomplete catalogue cannot be
 * reported as ready for P27 launch.
 */
export function auditClubCatalog(clubs = []) {
  const list = Array.isArray(clubs) ? clubs : [];
  const issues = [];
  const ids = new Set();
  const divisionCounts = Object.fromEntries(LEAGUE_DIVISIONS.map(item => [item.id, 0]));
  const conferenceCounts = { D4:{ Nord:0, Sud:0 }, D5:{ Nord:0, Sud:0, Est:0, Ouest:0 } };
  const systemOnlyCounts = Object.fromEntries(LEAGUE_DIVISIONS.map(item => [item.id, 0]));

  for (const club of list) {
    const id = String(club?.id || '').trim();
    const division = club?.division;
    if (!id) {
      addIssue(issues, 'error', 'club-id-missing');
      continue;
    }
    if (ids.has(id)) addIssue(issues, 'error', 'duplicate-club-id', { clubId:id });
    ids.add(id);

    if (!(division in divisionCounts)) {
      addIssue(issues, 'error', 'invalid-division', { clubId:id, division });
      continue;
    }
    divisionCounts[division]++;
    if (division === 'D4' || division === 'D5') {
      const conference = conferenceForClub(club);
      if (!conference) addIssue(issues, 'error', 'conference-missing', { clubId:id, division });
      else conferenceCounts[division][conference]++;
    }

    const capacity = Number(club.capacity);
    const roster = Array.isArray(club.roster) ? club.roster : [];
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 12) {
      addIssue(issues, 'error', 'invalid-roster-capacity', { clubId:id, capacity });
    }
    if (roster.length > capacity || roster.length > 12) {
      addIssue(issues, 'error', 'roster-over-capacity', { clubId:id, rosterSize:roster.length, capacity });
    }
    if (roster.length) {
      const baseline = DIVISION_AVERAGES[division];
      if (!roster.some(player => Number(player?.rating) > baseline)) {
        addIssue(issues, 'error', 'above-average-player-missing', { clubId:id, division, baseline });
      }
    }

    if (club.humanAdmission === 'system-only') {
      systemOnlyCounts[division]++;
      if (club.control === 'open' || club.managerId) {
        addIssue(issues, 'error', 'system-only-control-conflict', { clubId:id });
      }
      const profile = club.recruitmentProfile || {};
      if (profile.mode === 'country' || profile.mode === 'continent') {
        const allowed = new Set(profile.nationalityCodes || []);
        for (const player of roster) {
          if (!allowed.has(player.nationality)) {
            addIssue(issues, 'error', 'recruitment-nationality-mismatch', { clubId:id, playerId:player.id, nationality:player.nationality });
          }
        }
      }
    }
  }

  for (const division of LEAGUE_DIVISIONS) {
    const actual = divisionCounts[division.id];
    if (actual !== division.targetClubs) {
      addIssue(issues, 'warning', 'division-count-incomplete', { division:division.id, expected:division.targetClubs, actual });
    }
    if (systemOnlyCounts[division.id] < 1) {
      addIssue(issues, 'warning', 'system-only-club-missing', { division:division.id });
    }
  }

  for (const division of ['D4','D5']) {
    for (const [conference, actual] of Object.entries(conferenceCounts[division])) {
      if (actual !== 16) {
        addIssue(issues, 'warning', 'conference-count-incomplete', { division, conference, expected:16, actual });
      }
    }
  }

  const errors = issues.filter(item => item.severity === 'error');
  const warnings = issues.filter(item => item.severity === 'warning');
  return Object.freeze({
    complete: list.length === TOTAL_LEAGUE_CLUBS && errors.length === 0 && warnings.length === 0,
    totalClubs: list.length,
    expectedTotal: TOTAL_LEAGUE_CLUBS,
    divisionCounts: Object.freeze(divisionCounts),
    conferenceCounts: Object.freeze({
      D4:Object.freeze({ ...conferenceCounts.D4 }),
      D5:Object.freeze({ ...conferenceCounts.D5 })
    }),
    systemOnlyCounts: Object.freeze(systemOnlyCounts),
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    issues: Object.freeze(issues)
  });
}
