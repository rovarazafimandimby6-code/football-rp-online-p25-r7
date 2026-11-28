const DIVISION_ORDER = Object.freeze({ D1:1, D2:2, D3:3, D4:4, D5:5 });

/** Check that archived awards and club movements agree with their source competitions. */
export function auditSeasonArchives(state) {
  const seasons = Array.isArray(state?.seasons) ? state.seasons : [];
  const fail = (reason, details = {}) => ({ ok:false, reason, ...details });
  for (const season of seasons) {
    if (season.status !== 'completed') continue;
    const competitions = Array.isArray(season.competitions) ? season.competitions : [];
    const byId = new Map();
    const participantById = new Map();
    for (const competition of competitions) {
      if (!competition?.id || byId.has(competition.id))
        return fail('archive-competition-id-invalid-or-duplicate', { seasonId:season.id, competitionId:competition?.id || null });
      byId.set(competition.id, competition);
      const members = Array.isArray(competition.members) ? competition.members : [];
      const memberIds = new Set();
      for (const member of members) {
        if (!member?.id || memberIds.has(member.id))
          return fail('archive-competition-member-duplicate', { seasonId:season.id, competitionId:competition.id, clubId:member?.id || null });
        memberIds.add(member.id);
        if (!participantById.has(member.id)) participantById.set(member.id, member);
      }
      if (competition.type === 'league') {
        const rows = Array.isArray(competition.standings) ? competition.standings : [];
        const rowIds = new Set();
        for (const row of rows) {
          if (!row?.id || rowIds.has(row.id) || (memberIds.size && !memberIds.has(row.id)))
            return fail('archive-league-standing-membership-invalid', { seasonId:season.id, competitionId:competition.id, clubId:row?.id || null });
          rowIds.add(row.id);
          for (const field of ['played','wins','draws','losses','goalsFor','goalsAgainst','points']) {
            if (!Number.isSafeInteger(row[field]) || row[field] < 0)
              return fail('archive-league-stat-invalid', { seasonId:season.id, competitionId:competition.id, clubId:row.id, field });
          }
          if (row.wins + row.draws + row.losses !== row.played || row.points !== row.wins * 3 + row.draws)
            return fail('archive-league-table-arithmetic-invalid', { seasonId:season.id, competitionId:competition.id, clubId:row.id });
        }
        if (members.length && (rowIds.size !== memberIds.size || [...memberIds].some(id => !rowIds.has(id))))
          return fail('archive-league-standing-incomplete', { seasonId:season.id, competitionId:competition.id });
      }
      const fixtureIds = new Set();
      for (const fixture of competition.fixtures || []) {
        if (!fixture?.id || fixtureIds.has(fixture.id))
          return fail('archive-fixture-id-invalid-or-duplicate', { seasonId:season.id, competitionId:competition.id, fixtureId:fixture?.id || null });
        fixtureIds.add(fixture.id);
        if (fixture.status === 'completed') {
          const result = fixture.result;
          if (!Number.isSafeInteger(result?.home) || result.home < 0 || !Number.isSafeInteger(result?.away) || result.away < 0)
            return fail('archive-fixture-result-invalid', { seasonId:season.id, competitionId:competition.id, fixtureId:fixture.id });
          if (!fixture.homeClubId || !fixture.awayClubId || (memberIds.size && (!memberIds.has(fixture.homeClubId) || !memberIds.has(fixture.awayClubId))))
            return fail('archive-fixture-participant-invalid', { seasonId:season.id, competitionId:competition.id, fixtureId:fixture.id });
        }
      }
    }
    const trophies = Array.isArray(season.trophies) ? season.trophies : [];
    const awarded = new Set();
    for (const trophy of trophies) {
      const competition = byId.get(trophy?.competitionId);
      if (!competition || !['league','cup'].includes(competition.type))
        return fail('archive-trophy-competition-missing', { seasonId:season.id, trophyId:trophy?.id || null });
      if (awarded.has(competition.id))
        return fail('archive-trophy-duplicate', { seasonId:season.id, competitionId:competition.id });
      awarded.add(competition.id);
      const participants = new Set((competition.members || []).map(item => item.id));
      if (competition.type === 'league') {
        for (const row of competition.standings || []) participants.add(row.id);
      }
      if (competition.status !== 'completed' || !competition.championClubId ||
          trophy.clubId !== competition.championClubId || !participants.has(trophy.clubId))
        return fail('archive-trophy-champion-mismatch', { seasonId:season.id, competitionId:competition.id });
      if (!Number.isSafeInteger(trophy.awardedAt) || trophy.awardedAt < 0)
        return fail('archive-trophy-timestamp-invalid', { seasonId:season.id, competitionId:competition.id });
    }
    for (const competition of competitions) {
      if (!['league','cup'].includes(competition.type) || competition.status !== 'completed') continue;
      if (competition.championClubId && !awarded.has(competition.id))
        return fail('archive-trophy-missing', { seasonId:season.id, competitionId:competition.id });
    }
    const movements = Array.isArray(season.movements) ? season.movements : [];
    if (movements.length !== 40)
      return fail('archive-movement-count-invalid', { seasonId:season.id, count:movements.length });
    const moved = new Set();
    let promotions = 0, relegations = 0;
    for (const movement of movements) {
      const from = DIVISION_ORDER[movement?.fromDivision];
      const to = DIVISION_ORDER[movement?.toDivision];
      if (!movement?.clubId || moved.has(movement.clubId) || !from || !to || Math.abs(from-to) !== 1)
        return fail('archive-movement-record-invalid', { seasonId:season.id, clubId:movement?.clubId || null });
      moved.add(movement.clubId);
      const sourceClub = participantById.get(movement.clubId);
      if (!sourceClub || sourceClub.division !== movement.fromDivision ||
          (movement.fromDivision === 'D4' || movement.fromDivision === 'D5'
            ? (sourceClub.conference || null) !== (movement.fromConference || null)
            : movement.fromConference != null) ||
          (movement.clubName && sourceClub.name !== movement.clubName))
        return fail('archive-movement-source-identity-mismatch', { seasonId:season.id, clubId:movement.clubId });
      const expectedType = to < from ? 'promotion' : 'relegation';
      if (movement.type !== expectedType)
        return fail('archive-movement-type-mismatch', { seasonId:season.id, clubId:movement.clubId });
      if (expectedType === 'promotion') promotions++; else relegations++;
    }
    if (promotions !== 20 || relegations !== 20)
      return fail('archive-movement-quota-invalid', { seasonId:season.id, promotions, relegations });
  }
  return { ok:true, completedSeasons:seasons.filter(item => item.status === 'completed').length, auditedCompetitions:seasons.filter(item => item.status === 'completed').reduce((sum,item) => sum + (item.competitions?.length || 0),0) };
}
