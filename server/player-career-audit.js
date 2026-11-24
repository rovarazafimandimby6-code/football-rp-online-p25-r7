const COUNT_FIELDS = ['matches','minutesPlayedMs','wins','draws','losses','goals','assists','shots','passes','completedPasses','tackles','interceptions','saves','cleanSheets','playerOfMatch'];
const EVENT_TYPES = new Set(['signing','transfer','renewal','contract-expired','contract-termination','loan','loan-return']);

const validCount = value => Number.isSafeInteger(value) && value >= 0;

/**
 * Read-only audit for a public player career plus the movement events supplied
 * by the transfer store. It never derives match statistics from transfer data.
 */
export function auditPlayerCareerHistory({ career, transferHistory = [], currentClubId = null } = {}) {
  const errors = [];
  const warnings = [];
  const matches = Array.isArray(career?.matches) ? career.matches : [];
  const totals = career?.totals && typeof career.totals === 'object' ? career.totals : {};
  if (!career || !career.player) errors.push({ code: 'PLAYER_CAREER_MISSING' });

  const matchIds = new Set();
  const retained = Object.fromEntries(COUNT_FIELDS.map(field => [field, 0]));
  const clubAppearances = new Map();
  for (const match of matches) {
    if (!match || typeof match !== 'object' || typeof match.matchId !== 'string' || !match.matchId.trim()) {
      errors.push({ code: 'PLAYER_MATCH_ID_INVALID' });
      continue;
    }
    if (matchIds.has(match.matchId)) errors.push({ code: 'PLAYER_MATCH_DUPLICATE', matchId: match.matchId });
    matchIds.add(match.matchId);
    if (!['win','draw','loss'].includes(match.result)) errors.push({ code: 'PLAYER_MATCH_RESULT_INVALID', matchId: match.matchId });
    retained.matches++;
    retained[match.result === 'win' ? 'wins' : match.result === 'draw' ? 'draws' : 'losses']++;
    for (const field of ['minutesPlayedMs','goals','assists','shots','passes','completedPasses','tackles','interceptions','saves']) {
      const value = field === 'minutesPlayedMs' ? match.minutesPlayedMs : match.stats?.[field];
      if (!validCount(value)) errors.push({ code: 'PLAYER_MATCH_STAT_INVALID', matchId: match.matchId, field });
      else retained[field] += value;
    }
    if (match.stats?.completedPasses > match.stats?.passes) errors.push({ code: 'PLAYER_MATCH_PASS_TOTAL_INVALID', matchId: match.matchId });
    if (match.cleanSheet === true) retained.cleanSheets++;
    if (match.playerOfMatch === true) retained.playerOfMatch++;
    const clubName = String(match.teamName || '').trim();
    if (clubName) clubAppearances.set(clubName, (clubAppearances.get(clubName) || 0) + 1);
  }

  for (const field of COUNT_FIELDS) {
    if (!validCount(totals[field])) errors.push({ code: 'PLAYER_CAREER_TOTAL_INVALID', field });
    else if (totals[field] < retained[field]) errors.push({ code: 'PLAYER_CAREER_TOTAL_BELOW_RETAINED_MATCHES', field });
  }
  if (totals.matches !== totals.wins + totals.draws + totals.losses) errors.push({ code: 'PLAYER_CAREER_RESULTS_TOTAL_MISMATCH' });

  const history = Array.isArray(transferHistory) ? transferHistory : [];
  let previousAt = -Infinity;
  let expectedClub = null;
  for (const event of history) {
    if (!event || !EVENT_TYPES.has(event.type)) {
      errors.push({ code: 'PLAYER_TRANSFER_EVENT_INVALID' });
      continue;
    }
    const at = Date.parse(event.at || event.startedAt || event.createdAt || '');
    if (!Number.isFinite(at)) errors.push({ code: 'PLAYER_TRANSFER_EVENT_DATE_INVALID', eventId: event.id || null });
    else if (at < previousAt) errors.push({ code: 'PLAYER_TRANSFER_EVENT_ORDER_INVALID', eventId: event.id || null });
    else previousAt = at;
    if (event.type === 'transfer' && event.fromClubId && event.toClubId) {
      if (expectedClub && event.fromClubId !== expectedClub) errors.push({ code: 'PLAYER_TRANSFER_CHAIN_BROKEN', eventId: event.id || null });
      expectedClub = event.toClubId;
    }
  }
  if (expectedClub && currentClubId && expectedClub !== currentClubId) {
    warnings.push({ code: 'PLAYER_TRANSFER_CURRENT_CLUB_MISMATCH', expectedClubId: expectedClub, currentClubId });
  }
  const derivedClubHistory = [...clubAppearances].map(([clubName, appearances]) => ({ clubName, appearances }));
  const suppliedClubHistory = Array.isArray(career?.clubHistory) ? career.clubHistory : [];
  if (suppliedClubHistory.length && JSON.stringify(suppliedClubHistory.map(row => [row.clubName, row.appearances])) !== JSON.stringify(derivedClubHistory.map(row => [row.clubName, row.appearances]))) {
    errors.push({ code: 'PLAYER_CLUB_HISTORY_MISMATCH' });
  }
  return { ok: errors.length === 0, errors, warnings, retainedMatches: matches.length, transferEvents: history.length };
}
