const asList = value => value instanceof Map ? [...value.values()] : Array.isArray(value) ? value : [];
const safeText = value => typeof value === 'string' && value.length > 0;
const validScore = value => Number.isSafeInteger(value) && value >= 0 && value <= 99;

/** Read-only consistency audit across the persistent P27 world stores. */
export function auditP27World({
  clubs = [], competitionClubs = [], transferState = null, financeAccounts = [], financeJournal = null, competitionState = null, resultArchive = [],
  expectedClubCount = 156
} = {}) {
  const errors = [], warnings = [];
  const catalogue = asList(clubs);
  const clubById = new Map();
  const rosterIds = new Set();
  const rosterPlayersById = new Map();
  let rosterPlayers = 0, humanPlayers = 0, systemPlayers = 0;
  for (const club of catalogue) {
    if (!safeText(club?.id)) { errors.push({ code:'CLUB_ID_MISSING' }); continue; }
    if (clubById.has(club.id)) errors.push({ code:'CLUB_ID_DUPLICATE', clubId:club.id });
    clubById.set(club.id, club);
    const numbers = new Set();
    const roster = Array.isArray(club.roster) ? club.roster : [];
    if (roster.length > Number(club.capacity || 12)) errors.push({ code:'ROSTER_CAPACITY_EXCEEDED', clubId:club.id, count:roster.length, capacity:club.capacity });
    for (const player of roster) {
      rosterPlayers++;
      if (!safeText(player?.id)) errors.push({ code:'PLAYER_ID_MISSING', clubId:club.id });
      else if (rosterIds.has(player.id)) errors.push({ code:'PLAYER_REGISTERED_MULTIPLE_TIMES', playerId:player.id });
      else {
        rosterIds.add(player.id);
        if (!rosterPlayersById.has(player.id)) rosterPlayersById.set(player.id, []);
        rosterPlayersById.get(player.id).push({ clubId:club.id, player });
      }
      if (Number.isInteger(player?.number)) {
        if (numbers.has(player.number)) errors.push({ code:'SHIRT_NUMBER_DUPLICATE', clubId:club.id, number:player.number });
        numbers.add(player.number);
      }
      if (player?.playerType === 'human') humanPlayers++; else systemPlayers++;
      if (player?.contract?.status === 'active' && player.contract.clubId !== club.id) {
        errors.push({ code:'ROSTER_CONTRACT_CLUB_MISMATCH', clubId:club.id, playerId:player.id, contractClubId:player.contract.clubId });
      }
      if (player?.playerType === 'system' && player?.contract?.status === 'active' && player.contract.playerId !== player.id) {
        errors.push({ code:'SYSTEM_CONTRACT_PLAYER_MISMATCH', clubId:club.id, playerId:player.id });
      }
      if (player?.playerType === 'system' && player?.contract?.status === 'active') {
        const expiry = Date.parse(player.contract.expiresAt || '');
        if (player.contract.expiresAt && !Number.isFinite(expiry))
          errors.push({ code:'SYSTEM_CONTRACT_EXPIRY_INVALID', clubId:club.id, playerId:player.id });
        else if (Number.isFinite(expiry) && expiry <= Date.now())
          errors.push({ code:'SYSTEM_CONTRACT_EXPIRED_STILL_REGISTERED', clubId:club.id, playerId:player.id, expiresAt:player.contract.expiresAt });
      }
    }
    const humans = roster.filter(player => player?.playerType === 'human').length;
    if (humans > 7) errors.push({ code:'HUMAN_ROSTER_LIMIT_EXCEEDED', clubId:club.id, count:humans });
  }
  const freeAgentArchive = new Map();
  for (const club of catalogue) {
    for (const entry of Array.isArray(club.releasedPlayers) ? club.releasedPlayers : []) {
      const playerId = entry?.player?.id;
      if (!safeText(playerId)) continue;
      if (entry.player?.playerType === 'system' && entry.player?.contract?.status === 'active' &&
          ['contract-expired','contract-not-renewed'].includes(entry.reason))
        errors.push({ code:'EXPIRED_SYSTEM_PLAYER_ARCHIVE_HAS_ACTIVE_CONTRACT', clubId:club.id, playerId });
      if (entry.reason === 'transferred' || rosterIds.has(playerId)) continue;
      if (!freeAgentArchive.has(playerId)) freeAgentArchive.set(playerId, []);
      freeAgentArchive.get(playerId).push({ clubId:club.id, releasedAt:entry.releasedAt || null });
    }
  }
  let duplicateFreeAgentSnapshots = 0;
  for (const [playerId, records] of freeAgentArchive) {
    if (records.length > 1) {
      duplicateFreeAgentSnapshots += records.length - 1;
      warnings.push({ code:'FREE_AGENT_ARCHIVE_DUPLICATE_SNAPSHOTS', playerId, snapshots:records.length });
    }
  }

  if (Number.isInteger(expectedClubCount) && catalogue.length !== expectedClubCount) {
    warnings.push({ code:'CLUB_CATALOGUE_SIZE_MISMATCH', expected:expectedClubCount, actual:catalogue.length });
  }

  const officialCompetitionClubs = asList(competitionClubs);
  if (officialCompetitionClubs.length) {
    const seenCompetitionClubIds = new Set();
    for (const official of officialCompetitionClubs) {
      if (!safeText(official?.id) || seenCompetitionClubIds.has(official.id)) {
        errors.push({ code:'COMPETITION_CLUB_ID_INVALID_OR_DUPLICATE', clubId:official?.id || null });
        continue;
      }
      seenCompetitionClubIds.add(official.id);
      const rosterClub = clubById.get(official.id);
      if (!rosterClub) errors.push({ code:'COMPETITION_CLUB_UNKNOWN', clubId:official.id });
      else if (rosterClub.division !== official.division ||
          (rosterClub.conference || null) !== (official.conference || null))
        errors.push({ code:'CLUB_ASSIGNMENT_CATALOGUE_MISMATCH', clubId:official.id,
          rosterDivision:rosterClub.division, competitionDivision:official.division,
          rosterConference:rosterClub.conference || null, competitionConference:official.conference || null });
    }
    if (officialCompetitionClubs.length !== catalogue.length)
      errors.push({ code:'COMPETITION_CLUB_CATALOGUE_SIZE_MISMATCH', expected:catalogue.length, actual:officialCompetitionClubs.length });
    for (const club of catalogue) if (!seenCompetitionClubIds.has(club.id))
      errors.push({ code:'COMPETITION_CLUB_ASSIGNMENT_MISSING', clubId:club.id });
  }

  const transferClubs = Array.isArray(transferState?.clubs) ? transferState.clubs : [];
  const transferClubIds = new Set();
  for (const club of transferClubs) {
    if (!safeText(club?.id) || transferClubIds.has(club.id)) {
      errors.push({ code:'TRANSFER_CLUB_ID_INVALID_OR_DUPLICATE', clubId:club?.id || null });
      continue;
    }
    transferClubIds.add(club.id);
    if (!clubById.has(club.id)) errors.push({ code:'TRANSFER_CLUB_UNKNOWN', clubId:club.id });
    if (!Number.isSafeInteger(club.budget) || club.budget < 0 || club.budget > 1_000_000_000)
      errors.push({ code:'TRANSFER_CLUB_BUDGET_INVALID', clubId:club.id, budget:club.budget });
  }
  if (transferClubs.length) {
    if (transferClubs.length !== catalogue.length)
      errors.push({ code:'TRANSFER_CLUB_CATALOGUE_SIZE_MISMATCH', expected:catalogue.length, actual:transferClubs.length });
    for (const club of catalogue) if (!transferClubIds.has(club.id))
      errors.push({ code:'TRANSFER_CLUB_MISSING', clubId:club.id });
  }
  if (asList(financeAccounts).length && asList(financeAccounts).length !== catalogue.length)
    warnings.push({ code:'FINANCE_ACCOUNT_CATALOGUE_SIZE_MISMATCH', expected:catalogue.length, actual:asList(financeAccounts).length });

  const careers = Array.isArray(transferState?.careers) ? transferState.careers : [];
  const accountIds = new Set();
  const careerPlayerIds = new Set();
  for (const career of careers) {
    if (!safeText(career?.accountId)) { errors.push({ code:'CAREER_ACCOUNT_ID_MISSING' }); continue; }
    if (accountIds.has(career.accountId)) errors.push({ code:'CAREER_ACCOUNT_DUPLICATE', accountId:career.accountId });
    accountIds.add(career.accountId);
    if (career.playerId) {
      if (careerPlayerIds.has(career.playerId)) errors.push({ code:'CAREER_PLAYER_DUPLICATE', playerId:career.playerId });
      careerPlayerIds.add(career.playerId);
    }
    const active = career.contract?.status === 'active';
    if (career.playerId) {
      const memberships = rosterPlayersById.get(career.playerId) || [];
      if (active && memberships.length === 0) {
        const detail = { accountId:career.accountId, playerId:career.playerId, clubId:career.clubId || null };
        if (!safeText(career.contract?.playerId)) {
          warnings.push({ code:'CAREER_PLAYER_NOT_IN_ROSTER', ...detail });
        } else {
          const pendingUpsert = asList(transferState?.rosterSync).some(entry =>
            entry?.playerId === career.playerId && entry?.action === 'upsert' && entry?.status === 'pending' &&
            entry?.clubId === career.clubId && entry?.contract?.status === 'active');
          if (pendingUpsert) warnings.push({ code:'CAREER_PLAYER_ROSTER_SYNC_PENDING', ...detail });
          else errors.push({ code:'CAREER_ACTIVE_PLAYER_ORPHANED', ...detail });
        }
      } else if (active && memberships.length > 1) {
        errors.push({ code:'CAREER_PLAYER_ROSTER_DUPLICATE', accountId:career.accountId, playerId:career.playerId, count:memberships.length });
      } else if (active && memberships.length === 1) {
        const membership = memberships[0];
        if (membership.clubId !== career.clubId) errors.push({ code:'CAREER_ROSTER_CLUB_MISMATCH', accountId:career.accountId, playerId:career.playerId, careerClubId:career.clubId, rosterClubId:membership.clubId });
        if (membership.player?.playerType !== 'human') errors.push({ code:'CAREER_ROSTER_TYPE_MISMATCH', accountId:career.accountId, playerId:career.playerId, rosterPlayerType:membership.player?.playerType || null });
        const rosterContract = membership.player?.contract;
        if (rosterContract?.status === 'active') {
          if (rosterContract.clubId && rosterContract.clubId !== career.clubId)
            errors.push({ code:'CAREER_ROSTER_CONTRACT_CLUB_MISMATCH', accountId:career.accountId, playerId:career.playerId, careerClubId:career.clubId, rosterContractClubId:rosterContract.clubId });
          if (rosterContract.playerId && rosterContract.playerId !== career.playerId)
            errors.push({ code:'CAREER_ROSTER_CONTRACT_PLAYER_MISMATCH', accountId:career.accountId, playerId:career.playerId, rosterContractPlayerId:rosterContract.playerId });
          const rosterSalary = rosterContract.salary ?? rosterContract.weeklyWage;
          if (rosterSalary !== undefined && rosterSalary !== career.contract.salary)
            errors.push({ code:'CAREER_ROSTER_CONTRACT_SALARY_MISMATCH', accountId:career.accountId, playerId:career.playerId, careerSalary:career.contract.salary, rosterSalary });
          if (rosterContract.expiresAt && Date.parse(rosterContract.expiresAt) !== Date.parse(career.contract.expiresAt))
            errors.push({ code:'CAREER_ROSTER_CONTRACT_EXPIRY_MISMATCH', accountId:career.accountId, playerId:career.playerId });
        }
      } else if (!active && memberships.some(item => item.player?.playerType === 'human')) {
        warnings.push({ code:'INACTIVE_CAREER_PLAYER_STILL_REGISTERED', accountId:career.accountId, playerId:career.playerId, rosterClubIds:memberships.map(item => item.clubId) });
      }
    }
    if (active && (!career.clubId || career.clubId !== career.contract.clubId)) {
      errors.push({ code:'CAREER_CONTRACT_LINK_MISMATCH', accountId:career.accountId, clubId:career.clubId, contractClubId:career.contract.clubId });
    }
    if (active && !clubById.has(career.clubId)) errors.push({ code:'CAREER_REFERENCES_UNKNOWN_CLUB', accountId:career.accountId, clubId:career.clubId });
    if (active && career.contract.playerId && career.playerId && career.contract.playerId !== career.playerId) errors.push({ code:'CAREER_CONTRACT_PLAYER_MISMATCH', accountId:career.accountId, playerId:career.playerId, contractPlayerId:career.contract.playerId });
    if (active && career.contract.loan?.status === 'active') {
      const loan = career.contract.loan;
      const parent = loan.parentContract;
      if (!clubById.has(loan.parentClubId) || loan.parentClubId === career.clubId ||
          !parent || parent.status !== 'active' || parent.clubId !== loan.parentClubId ||
          !Number.isFinite(Date.parse(loan.startedAt)) || !Number.isFinite(Date.parse(loan.expiresAt)) || !Number.isFinite(Date.parse(parent.expiresAt)) ||
          Date.parse(loan.expiresAt) <= Date.parse(loan.startedAt) ||
          Date.parse(loan.expiresAt) > Date.parse(parent.expiresAt))
        errors.push({ code:'CAREER_LOAN_TERMS_INVALID', accountId:career.accountId, playerId:career.playerId });
      const membership = (rosterPlayersById.get(career.playerId) || [])[0];
      if (membership && (membership.clubId !== career.clubId ||
          membership.player?.contract?.loan?.status !== 'active' ||
          membership.player.contract.loan.parentClubId !== loan.parentClubId ||
          Date.parse(membership.player.contract.loan.expiresAt) !== Date.parse(loan.expiresAt)))
        errors.push({ code:'CAREER_LOAN_ROSTER_MISMATCH', accountId:career.accountId, playerId:career.playerId });
    }
    if (active && (!Number.isSafeInteger(career.contract.salary) || career.contract.salary < 0))
      errors.push({ code:'CAREER_CONTRACT_SALARY_INVALID', accountId:career.accountId });
    if (active && (!Number.isFinite(Date.parse(career.contract.signedAt)) ||
        !Number.isFinite(Date.parse(career.contract.expiresAt)) ||
        Date.parse(career.contract.expiresAt) <= Date.parse(career.contract.signedAt)))
      errors.push({ code:'CAREER_CONTRACT_DATES_INVALID', accountId:career.accountId });
  }

  const rosterSyncEntries = Array.isArray(transferState?.rosterSync) ? transferState.rosterSync : [];
  const rosterSyncIds = new Set();
  const rosterSyncEventIds = new Set();
  const careerByPlayerId = new Map(careers.filter(career => safeText(career?.playerId)).map(career => [career.playerId,career]));
  const transferEventIdsForRoster = new Set(asList(transferState?.events).map(event => event?.id).filter(safeText));
  let pendingRosterSync = 0, completedRosterSync = 0;
  for (const entry of rosterSyncEntries) {
    if (!safeText(entry?.id) || rosterSyncIds.has(entry.id))
      errors.push({ code:'ROSTER_SYNC_ID_INVALID_OR_DUPLICATE', syncId:entry?.id || null });
    rosterSyncIds.add(entry?.id);
    if (!safeText(entry?.playerId) || !entry.playerId.startsWith('human-') ||
        !['upsert','release'].includes(entry?.action) ||
        !['pending','completed'].includes(entry?.status) ||
        !Number.isSafeInteger(entry?.attempts) || entry.attempts < 0 ||
        !Number.isFinite(Date.parse(entry?.createdAt)))
      errors.push({ code:'ROSTER_SYNC_ENTRY_INVALID', syncId:entry?.id || null });
    if (!careerByPlayerId.has(entry?.playerId))
      errors.push({ code:'ROSTER_SYNC_CAREER_LINK_MISSING', syncId:entry?.id || null, playerId:entry?.playerId || null });
    if (entry?.eventId) {
      if (rosterSyncEventIds.has(entry.eventId))
        errors.push({ code:'ROSTER_SYNC_EVENT_DUPLICATE', eventId:entry.eventId });
      rosterSyncEventIds.add(entry.eventId);
      if (!entry.id.endsWith(entry.eventId))
        errors.push({ code:'ROSTER_SYNC_EVENT_LINK_INVALID', syncId:entry.id, eventId:entry.eventId });
      if (entry.status === 'pending' && !transferEventIdsForRoster.has(entry.eventId))
        errors.push({ code:'ROSTER_SYNC_EVENT_MISSING', syncId:entry.id, eventId:entry.eventId });
    }
    if (entry?.action === 'upsert' && (!safeText(entry.clubId) || entry.contract?.status !== 'active' ||
        entry.contract?.playerId !== entry.playerId || entry.contract?.clubId !== entry.clubId))
      errors.push({ code:'ROSTER_SYNC_UPSERT_LINK_INVALID', syncId:entry?.id || null });
    if (entry?.action === 'release' && entry.clubId !== null)
      errors.push({ code:'ROSTER_SYNC_RELEASE_LINK_INVALID', syncId:entry?.id || null });
    if (entry?.status === 'completed') {
      completedRosterSync++;
      if (!Number.isFinite(Date.parse(entry?.completedAt)))
        errors.push({ code:'ROSTER_SYNC_COMPLETION_DATE_INVALID', syncId:entry?.id || null });
    }
    if (entry?.status === 'pending') {
      pendingRosterSync++;
      warnings.push({ code:'ROSTER_SYNC_PENDING', syncId:entry.id, playerId:entry.playerId, action:entry.action, attempts:entry.attempts });
    }
  }

  let financeBalanceTotal = 0, financeEntries = 0;
  const financeClubIds = new Set();
  for (const account of asList(financeAccounts)) {
    if (financeClubIds.has(account?.clubId)) errors.push({ code:'FINANCE_ACCOUNT_DUPLICATE', clubId:account?.clubId });
    financeClubIds.add(account?.clubId);
    if (!clubById.has(account?.clubId)) errors.push({ code:'FINANCE_ACCOUNT_UNKNOWN_CLUB', clubId:account?.clubId });
    const ids = new Set();
    let balance = account?.openingBalance;
    if (!Number.isSafeInteger(balance) || balance < 0) {
      errors.push({ code:'FINANCE_OPENING_BALANCE_INVALID', clubId:account?.clubId });
      continue;
    }
    for (const entry of Array.isArray(account.entries) ? account.entries : []) {
      financeEntries++;
      if (!safeText(entry?.id) || ids.has(entry.id)) errors.push({ code:'FINANCE_ENTRY_ID_INVALID_OR_DUPLICATE', clubId:account.clubId, entryId:entry?.id || null });
      ids.add(entry?.id);
      const validCategories = new Set(['sponsorship','ticketing','matchday','merchandise','transfer-income','transfer-expense','wages','staff','stadium-maintenance','medical','training','travel','competition-prize','loan','other']);
      if (!Number.isSafeInteger(entry?.amount) || entry.amount <= 0 || entry.amount > 1_000_000_000_000 ||
          !['income','expense'].includes(entry.direction) || !validCategories.has(entry.category) ||
          !Number.isSafeInteger(entry.createdAt) || entry.createdAt < 0) {
        errors.push({ code:'FINANCE_ENTRY_INVALID', clubId:account.clubId, entryId:entry?.id || null });
        continue;
      }
      balance += entry.direction === 'income' ? entry.amount : -entry.amount;
    }
    if (!Number.isSafeInteger(balance) || balance < 0 || balance !== account.balance) {
      errors.push({ code:'FINANCE_BALANCE_MISMATCH', clubId:account.clubId, calculated:balance, stored:account.balance });
    } else financeBalanceTotal += balance;
  }

  const transferEvents = Array.isArray(transferState?.events) ? transferState.events : [];
  const transferEventIds = new Set();
  const transferEventById = new Map(transferEvents.filter(event => event?.type === 'transfer' && safeText(event.id)).map(event => [event.id,event]));
  const salaryEventById = new Map(transferEvents.filter(event => event?.type === 'salary-payment' && safeText(event.id)).map(event => [event.id,event]));
  const careerByPlayer = new Map(careers.filter(career => safeText(career?.playerId)).map(career => [career.playerId,career]));

  for (const event of transferEvents) {
    if (!safeText(event?.id) || transferEventIds.has(event.id)) errors.push({ code:'TRANSFER_EVENT_ID_INVALID_OR_DUPLICATE', eventId:event?.id || null });
    transferEventIds.add(event?.id);
    if (event?.type === 'transfer') {
      if (!clubById.has(event.fromClubId) || !clubById.has(event.toClubId) || event.fromClubId === event.toClubId)
        errors.push({ code:'TRANSFER_EVENT_CLUB_LINK_INVALID', eventId:event.id, fromClubId:event.fromClubId || null, toClubId:event.toClubId || null });
      if (!Number.isSafeInteger(event.fee) || event.fee < 0) errors.push({ code:'TRANSFER_EVENT_FEE_INVALID', eventId:event.id });
    }
    if (event?.type === 'salary-payment') {
      if (!safeText(event.playerId) || !careerByPlayer.has(event.playerId))
        errors.push({ code:'SALARY_EVENT_CAREER_LINK_INVALID', eventId:event.id, playerId:event.playerId || null });
      if (!clubById.has(event.clubId))
        errors.push({ code:'SALARY_EVENT_CLUB_LINK_INVALID', eventId:event.id, clubId:event.clubId || null });
      if (!Number.isSafeInteger(event.amount) || event.amount <= 0 ||
          !Number.isSafeInteger(event.periods) || event.periods <= 0 ||
          !Number.isFinite(Number(event.at)))
        errors.push({ code:'SALARY_EVENT_AMOUNT_OR_DATE_INVALID', eventId:event.id });
    }
  }
  const financeEntryById = new Map();
  for (const account of asList(financeAccounts)) {
    for (const entry of Array.isArray(account.entries) ? account.entries : []) {
      if (safeText(entry?.id)) financeEntryById.set(entry.id, { account, entry });
    }
  }
  const transferJournal = financeJournal && typeof financeJournal === 'object' ? financeJournal : null;
  const journalTransfers = Array.isArray(transferJournal?.transfers) ? transferJournal.transfers : [];
  const journalTransferIds = new Set();
  let pendingTransferSettlements = 0;
  for (const record of journalTransfers) {
    if (!safeText(record?.id) || journalTransferIds.has(record.id)) {
      errors.push({ code:'TRANSFER_FINANCE_JOURNAL_ID_INVALID_OR_DUPLICATE', eventId:record?.id || null });
      continue;
    }
    journalTransferIds.add(record.id);
    const event = transferEventById.get(record.id);
    if (event && (record.fromClubId !== event.fromClubId || record.toClubId !== event.toClubId || record.fee !== event.fee))
      errors.push({ code:'TRANSFER_FINANCE_JOURNAL_EVENT_MISMATCH', eventId:record.id });
    if (!Number.isSafeInteger(record.fee) || record.fee <= 0 ||
        !clubById.has(record.fromClubId) || !clubById.has(record.toClubId) ||
        record.fromClubId === record.toClubId ||
        typeof record.debitPosted !== 'boolean' || typeof record.creditPosted !== 'boolean' ||
        !['pending','completed'].includes(record.status)) {
      errors.push({ code:'TRANSFER_FINANCE_JOURNAL_RECORD_INVALID', eventId:record.id });
      continue;
    }
    const debit = financeEntryById.get(`transfer-fee-out-${record.id}`);
    const credit = financeEntryById.get(`transfer-fee-in-${record.id}`);
    if (record.debitPosted && (!debit || debit.account.clubId !== record.fromClubId ||
        debit.entry.direction !== 'expense' || debit.entry.category !== 'transfer-expense' || debit.entry.amount !== record.fee))
      errors.push({ code:'TRANSFER_FINANCE_DEBIT_CHECKPOINT_MISMATCH', eventId:record.id });
    if (record.creditPosted && (!credit || credit.account.clubId !== record.toClubId ||
        credit.entry.direction !== 'income' || credit.entry.category !== 'transfer-income' || credit.entry.amount !== record.fee))
      errors.push({ code:'TRANSFER_FINANCE_CREDIT_CHECKPOINT_MISMATCH', eventId:record.id });
    if (record.status === 'completed' && (!record.debitPosted || !record.creditPosted))
      errors.push({ code:'TRANSFER_FINANCE_COMPLETION_INVALID', eventId:record.id });
    if (record.status !== 'completed' || !record.debitPosted || !record.creditPosted) pendingTransferSettlements++;
  }
  if (transferJournal) for (const event of transferEvents) {
    if (event?.type !== 'transfer' || !Number.isSafeInteger(event.fee) || event.fee <= 0) continue;
    if (!journalTransferIds.has(event.id)) {
      pendingTransferSettlements++;
      warnings.push({ code:'TRANSFER_FINANCE_JOURNAL_MISSING', eventId:event.id });
    }
  }
  const journalPlayerWages = Array.isArray(transferJournal?.playerWages) ? transferJournal.playerWages : [];
  const journalWageIds = new Set();
  let pendingPlayerWages = 0;
  for (const record of journalPlayerWages) {
    if (!safeText(record?.id) || journalWageIds.has(record.id)) {
      errors.push({ code:'PLAYER_WAGE_JOURNAL_ID_INVALID_OR_DUPLICATE', eventId:record?.id || null });
      continue;
    }
    journalWageIds.add(record.id);
    const event = salaryEventById.get(record.id);
    if (event && (record.clubId !== event.clubId || record.amount !== event.amount))
      errors.push({ code:'PLAYER_WAGE_JOURNAL_EVENT_MISMATCH', eventId:record.id });
    if (!event) errors.push({ code:'PLAYER_WAGE_JOURNAL_EVENT_MISSING', eventId:record.id });
    if (!clubById.has(record.clubId) || !Number.isSafeInteger(record.amount) || record.amount <= 0 ||
        typeof record.posted !== 'boolean')
      errors.push({ code:'PLAYER_WAGE_JOURNAL_RECORD_INVALID', eventId:record.id });
    const expense = financeEntryById.get(`player-wage-${record.id}`);
    if (record.posted && (!expense || expense.account.clubId !== record.clubId ||
        expense.entry.direction !== 'expense' || expense.entry.category !== 'wages' || expense.entry.amount !== record.amount))
      errors.push({ code:'PLAYER_WAGE_CHECKPOINT_MISMATCH', eventId:record.id });
    if (!record.posted) pendingPlayerWages++;
  }
  if (transferJournal) for (const event of transferEvents) {
    if (event?.type !== 'salary-payment' || !Number.isSafeInteger(event.amount) || event.amount <= 0) continue;
    if (!journalWageIds.has(event.id)) {
      pendingPlayerWages++;
      warnings.push({ code:'PLAYER_WAGE_JOURNAL_MISSING', eventId:event.id });
    }
  }

  const seasons = Array.isArray(competitionState?.seasons) ? competitionState.seasons : [];
  const seasonIds = new Set();
  for (const season of seasons) {
    if (!safeText(season?.id) || seasonIds.has(season.id))
      errors.push({ code:'SEASON_ID_INVALID_OR_DUPLICATE', seasonId:season?.id || null });
    seasonIds.add(season?.id);
  }
  const activeSeasons = seasons.filter(season => season?.status === 'active');
  if (seasons.length && activeSeasons.length !== 1) errors.push({ code:'ACTIVE_SEASON_COUNT_INVALID', count:activeSeasons.length });
  let fixtures = 0, completedFixtures = 0;
  const allFixtureIds = new Set();
  for (const season of seasons) {
    const fixtureIds = new Set();
    let seasonLeagueCount = 0, seasonLeagueFixtures = 0;
    const competitionIds = new Set();
    for (const competition of Array.isArray(season.competitions) ? season.competitions : []) {
      if (!safeText(competition?.id) || competitionIds.has(competition.id))
        errors.push({ code:'COMPETITION_ID_INVALID_OR_DUPLICATE', seasonId:season.id, competitionId:competition?.id || null });
      competitionIds.add(competition?.id);
      if (competition?.type === 'league') seasonLeagueCount++;
      const memberIds = new Set();
      for (const member of Array.isArray(competition.members) ? competition.members : []) {
        if (!clubById.has(member?.id)) errors.push({ code:'COMPETITION_UNKNOWN_CLUB', seasonId:season.id, competitionId:competition.id, clubId:member?.id });
        if (memberIds.has(member?.id)) errors.push({ code:'COMPETITION_MEMBER_DUPLICATE', seasonId:season.id, competitionId:competition.id, clubId:member?.id });
        memberIds.add(member?.id);
      }
      for (const fixture of Array.isArray(competition.fixtures) ? competition.fixtures : []) {
        fixtures++;
        if (competition?.type === 'league') seasonLeagueFixtures++;
        if (!safeText(fixture?.id) || fixtureIds.has(fixture.id) || allFixtureIds.has(fixture.id))
          errors.push({ code:'FIXTURE_ID_INVALID_OR_DUPLICATE', seasonId:season.id, fixtureId:fixture?.id || null });
        fixtureIds.add(fixture?.id);
        allFixtureIds.add(fixture?.id);
        if (fixture.competitionId && fixture.competitionId !== competition.id) errors.push({ code:'FIXTURE_COMPETITION_LINK_MISMATCH', seasonId:season.id, competitionId:competition.id, fixtureId:fixture.id });
        if (fixture.homeClubId && fixture.homeClubId === fixture.awayClubId) errors.push({ code:'FIXTURE_SELF_PLAY_INVALID', seasonId:season.id, competitionId:competition.id, fixtureId:fixture.id });
        if (fixture.status === 'completed') {
          completedFixtures++;
          if (!validScore(fixture.result?.home) || !validScore(fixture.result?.away) ||
              !memberIds.has(fixture.homeClubId) || !memberIds.has(fixture.awayClubId)) {
            errors.push({ code:'COMPLETED_FIXTURE_INVALID', seasonId:season.id, competitionId:competition.id, fixtureId:fixture.id });
          }
        }
      }
    }
    if (seasonLeagueCount > 0 && (seasonLeagueCount !== 9 || seasonLeagueFixtures !== 1892))
      errors.push({ code:'LEAGUE_SEASON_STRUCTURE_INVALID', seasonId:season.id,
        expectedCompetitions:9, actualCompetitions:seasonLeagueCount, expectedFixtures:1892, actualFixtures:seasonLeagueFixtures });
  }

  const resultRoomIds = new Set();
  const resultFixtureIds = new Set();
  const fixtureById = new Map();
  for (const season of seasons) for (const competition of Array.isArray(season.competitions) ? season.competitions : [])
    for (const fixture of Array.isArray(competition.fixtures) ? competition.fixtures : []) fixtureById.set(fixture.id, fixture);
  for (const result of asList(resultArchive)) {
    if (!safeText(result?.roomId) || resultRoomIds.has(result.roomId))
      errors.push({ code:'RESULT_ROOM_ID_INVALID_OR_DUPLICATE', roomId:result?.roomId || null });
    resultRoomIds.add(result?.roomId);
    if (result?.phase !== 'fulltime' || !Number.isSafeInteger(result?.score?.blue) ||
        result.score.blue < 0 || !Number.isSafeInteger(result?.score?.red) || result.score.red < 0 ||
        !Number.isFinite(result?.finalizedAt))
      errors.push({ code:'RESULT_ARCHIVE_ENTRY_INVALID', roomId:result?.roomId || null });
    const fixtureId = result?.competition?.fixtureId;
    if (!fixtureId) continue;
    if (resultFixtureIds.has(fixtureId))
      errors.push({ code:'RESULT_FIXTURE_ARCHIVE_DUPLICATE', fixtureId });
    resultFixtureIds.add(fixtureId);
    const fixture = fixtureById.get(fixtureId);
    if (!fixture) {
      errors.push({ code:'RESULT_ARCHIVE_UNKNOWN_FIXTURE', roomId:result.roomId, fixtureId });
      continue;
    }
    if (fixture.status !== 'completed' || fixture.roomId !== result.roomId ||
        fixture.result?.home !== result.score?.blue || fixture.result?.away !== result.score?.red)
      errors.push({ code:'RESULT_ARCHIVE_FIXTURE_MISMATCH', roomId:result.roomId, fixtureId });
  }

  return {
    ok:errors.length === 0,
    errors,
    warnings,
    counts:{
      clubs:catalogue.length, rosterPlayers, humanPlayers, systemPlayers,
      freeAgents:freeAgentArchive.size, duplicateFreeAgentSnapshots,
      careers:careers.length, pendingRosterSync, completedRosterSync, financeAccounts:asList(financeAccounts).length,
      financeEntries, financeBalanceTotal, pendingTransferSettlements, pendingPlayerWages, seasons:seasons.length, fixtures, completedFixtures, archivedResults:asList(resultArchive).length
    }
  };
}
