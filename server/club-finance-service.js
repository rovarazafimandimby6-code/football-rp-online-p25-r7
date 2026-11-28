import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ClubFinanceStore } from '../src/p27-club-finance.js';

const WEEK = 7 * 86400000;
const safeAmount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

/** Server-side finance orchestration. Only explicit club budgets and recorded salary events are booked. */
export class JsonClubFinanceService {
  constructor(directory, { clubs = [], transferStore = null, now = () => Date.now() } = {}) {
    this.directory = path.resolve(directory);
    this.file = path.join(this.directory, 'club-finance.json');
    this.payrollFile = path.join(this.directory, 'system-payroll-schedule.json');
    this.now = now;
    this.transferStore = transferStore;
    mkdirSync(this.directory, { recursive: true });
    this.transferJournalFile = path.join(this.directory, 'transfer-finance-journal.json');
    this.transferJournal = this.loadTransferJournal();
    const storage = {
      getItem: key => {
        if (key !== 'p27-club-finance') return null;
        try { return readFileSync(this.file, 'utf8'); }
        catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      },
      setItem: (key, value) => {
        if (key !== 'p27-club-finance') throw new Error('FINANCE_STORAGE_KEY_INVALID');
        const temp = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
        try { writeFileSync(temp, value, { mode: 0o600 }); renameSync(temp, this.file); }
        catch (error) { try { unlinkSync(temp); } catch {} throw error; }
      }
    };
    this.store = new ClubFinanceStore(storage, 'p27-club-finance');
    this.clubs = new Map(clubs.filter(club => club?.id).map(club => [club.id, club]));
    this.bootstrap();
    this.payrollSchedule = this.loadPayrollSchedule();
  }

  bootstrap() {
    let created = 0;
    for (const club of this.clubs.values()) {
      const opening = safeAmount(club.budget);
      if (opening === null) continue;
      const result = this.store.openAccount(club.id, opening);
      if (result.ok && result.created) created++;
    }
    return { clubs: this.clubs.size, accounts: this.store.listAccounts().length, created };
  }


  loadPayrollSchedule() {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(this.payrollFile, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('PAYROLL_SCHEDULE_CORRUPT');
      const initial = Object.fromEntries([...this.clubs.keys()].map(id => [id, this.now()]));
      if (!this.persistPayrollSchedule(initial)) throw new Error('PAYROLL_SCHEDULE_INITIALIZATION_FAILED');
      return initial;
    }
    if (parsed?.version !== 1 || !parsed.clubs || typeof parsed.clubs !== 'object' || Array.isArray(parsed.clubs)) {
      throw new Error('PAYROLL_SCHEDULE_CORRUPT');
    }
    const valid = {};
    for (const [clubId, at] of Object.entries(parsed.clubs)) {
      // Never replace a malformed known-club checkpoint with "now": doing so
      // would silently erase payroll arrears from the schedule.
      if (this.clubs.has(clubId) && (!Number.isSafeInteger(at) || at < 0)) {
        throw new Error('PAYROLL_SCHEDULE_CORRUPT');
      }
      if (this.clubs.has(clubId)) valid[clubId] = at;
    }
    let changed = false;
    for (const clubId of this.clubs.keys()) {
      if (!Object.hasOwn(valid, clubId)) { valid[clubId] = this.now(); changed = true; }
    }
    if (changed && !this.persistPayrollSchedule(valid)) throw new Error('PAYROLL_SCHEDULE_MIGRATION_FAILED');
    return valid;
  }

  advancePayrollSchedule(clubId, nextAt) {
    const next = { ...this.payrollSchedule, [clubId]: nextAt };
    if (!this.persistPayrollSchedule(next)) return false;
    this.payrollSchedule = next;
    return true;
  }

  persistPayrollSchedule(schedule = this.payrollSchedule) {
    const temp = `${this.payrollFile}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify({ version: 1, clubs: schedule }), { mode: 0o600 });
      renameSync(temp, this.payrollFile);
      return true;
    } catch (error) {
      try { unlinkSync(temp); } catch {}
      return false;
    }
  }

  settleSystemPayroll(now = this.now()) {
    if (!Number.isSafeInteger(now) || now < 0) return { ok: false, reason: 'invalid-time', posted: 0, unpaid: 0, clubs: [] };
    let posted = 0, unpaid = 0;
    const clubs = [];
    for (const club of this.clubs.values()) {
      const account = this.store.getAccount(club.id);
      if (!account) { unpaid++; clubs.push({ clubId: club.id, ok: false, reason: 'account-not-found' }); continue; }
      const last = this.payrollSchedule[club.id];
      const periods = Math.max(0, Math.floor((now - last) / WEEK));
      if (!periods) continue;
      // Released system players remain eligible only for payroll periods that fell
      // on or before their departure/contract expiry. This preserves arrears without
      // creating wages for time spent outside the club.
      const rosterPlayers = (club.roster || []).map(player => ({ player, releasedAt: null }));
      const releasedPlayers = (club.releasedPlayers || []).map(item => ({
        player: item?.player, releasedAt: Date.parse(item?.releasedAt)
      }));
      const contracts = [...rosterPlayers, ...releasedPlayers]
        .filter(({ player }) => player?.playerType === 'system' &&
          ['active', 'expired'].includes(player.contract?.status) &&
          player.contract.clubId === club.id && player.contract.playerId === player.id)
        .map(({ player, releasedAt }) => {
          const signedAt = Date.parse(player.contract.signedAt);
          const expiresAt = Date.parse(player.contract.expiresAt);
          const endAt = Number.isFinite(releasedAt)
            ? (Number.isFinite(expiresAt) ? Math.min(releasedAt, expiresAt) : releasedAt)
            : (Number.isFinite(expiresAt) ? expiresAt : Number.POSITIVE_INFINITY);
          return { player, signedAt: Number.isFinite(signedAt) ? signedAt : Number.NEGATIVE_INFINITY, endAt };
        });
      const entries = [];
      const uniqueEntries = new Set();
      for (let period = 1; period <= periods; period++) {
        const dueAt = last + period * WEEK;
        for (const { player, signedAt, endAt } of contracts) {
          // A contract signed on a payroll boundary has not yet completed a paid week.
          if (dueAt <= signedAt || dueAt > endAt) continue;
          const contract = player.contract;
          const wage = safeAmount(contract.weeklyWage ?? contract.salary);
          if (wage === null || wage === 0) continue;
          const id = `system-wage-${contract.id}-${dueAt}`;
          if (uniqueEntries.has(id)) continue;
          uniqueEntries.add(id);
          entries.push({
            id, category: 'wages', amount: wage, direction: 'expense',
            description: `Salaire hebdomadaire : ${player.name || player.id}`,
            createdAt: dueAt, referenceId: contract.id
          });
        }
      }
      if (!entries.length) {
        if (!this.advancePayrollSchedule(club.id, last + periods * WEEK)) return { ok: false, reason: 'schedule-persistence-failed', posted, unpaid, clubs };
        continue;
      }
      const result = this.store.postBatch(club.id, entries);
      if (!result.ok) {
        unpaid += entries.length;
        clubs.push({ clubId: club.id, ok: false, reason: result.reason, dueEntries: entries.length, periods });
        continue;
      }
      // The ledger uses deterministic entry IDs. If the schedule write fails,
      // a retry safely deduplicates the already-posted wages before advancing it.
      if (!this.advancePayrollSchedule(club.id, last + periods * WEEK)) return { ok: false, reason: 'schedule-persistence-failed', posted, unpaid, clubs };
      posted += result.posted || 0;
      clubs.push({ clubId: club.id, ok: true, posted: result.posted || 0, periods });
    }
    return { ok: unpaid === 0, posted, unpaid, clubs };
  }

  syncRecordedPlayerWages() {
    const events = this.transferStore?.state?.events;
    if (!Array.isArray(events)) return { ok: true, posted: 0, unpaid: 0, clubs: [] };
    let posted = 0, unpaid = 0;
    const clubs = [];
    for (const event of events) {
      if (event?.type !== 'salary-payment' || !event.id || !this.clubs.has(event.clubId)) continue;
      const amount = safeAmount(event.amount);
      if (amount === null || amount === 0) continue;
      const id = String(event.id);
      let record = this.transferJournal.playerWages.find(item => item.id === id);
      if (record && (record.clubId !== event.clubId || record.amount !== amount)) {
        unpaid++;
        clubs.push({ clubId:event.clubId, ok:false, reason:'player-wage-journal-conflict', eventId:id });
        continue;
      }
      if (!record) {
        const next = structuredClone(this.transferJournal);
        next.playerWages ||= [];
        next.playerWages.push({ id, clubId:event.clubId, amount,
          createdAt:Number.isSafeInteger(event.at) ? event.at : this.now(), posted:false });
        if (!this.persistTransferJournal(next)) {
          unpaid++;
          clubs.push({ clubId:event.clubId, ok:false, reason:'journal-persistence-failed', stage:'prepare', eventId:id });
          continue;
        }
        record = this.transferJournal.playerWages.find(item => item.id === id);
      }
      const entry = this.store.post(record.clubId, {
        id:`player-wage-${record.id}`, category:'wages', amount:record.amount, direction:'expense',
        description:'Salaire joueur sous contrat', createdAt:record.createdAt, referenceId:record.id
      });
      if (!entry.ok) {
        unpaid++;
        clubs.push({ clubId:event.clubId, ok:false, reason:entry.reason, eventId:id });
        continue;
      }
      if (!record.posted) {
        const next = structuredClone(this.transferJournal);
        next.playerWages.find(item => item.id === id).posted = true;
        if (!this.persistTransferJournal(next)) {
          unpaid++;
          clubs.push({ clubId:event.clubId, ok:false, reason:'journal-persistence-failed', stage:'checkpoint', eventId:id });
          continue;
        }
      }
      posted += entry.posted || 0;
      clubs.push({ clubId:event.clubId, ok:true, posted:entry.posted || 0, eventId:id });
    }
    return { ok:unpaid === 0, posted, unpaid, clubs };
  }

  loadTransferJournal() {
    try {
      const parsed = JSON.parse(readFileSync(this.transferJournalFile, 'utf8'));
      if (parsed?.version !== 1 || !Array.isArray(parsed.transfers) ||
          (parsed.playerWages !== undefined && !Array.isArray(parsed.playerWages)) ||
          (parsed.playerWages || []).some(item => !item?.id || !item.clubId || !Number.isSafeInteger(item.amount) || item.amount <= 0 || typeof item.posted !== 'boolean') ||
          parsed.transfers.some(item => !item?.id || !item.fromClubId || !item.toClubId ||
            !Number.isSafeInteger(item.fee) || item.fee <= 0 ||
            typeof item.debitPosted !== 'boolean' || typeof item.creditPosted !== 'boolean')) {
        throw new Error('TRANSFER_FINANCE_JOURNAL_CORRUPT');
      }
      return parsed;
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('TRANSFER_FINANCE_JOURNAL_CORRUPT');
      const initial = { version: 1, transfers: [], playerWages: [] };
      if (!this.persistTransferJournal(initial)) throw new Error('TRANSFER_FINANCE_JOURNAL_INITIALIZATION_FAILED');
      return initial;
    }
  }

  persistTransferJournal(next) {
    const temp = `${this.transferJournalFile}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(next), { mode: 0o600 });
      renameSync(temp, this.transferJournalFile);
      this.transferJournal = next;
      return true;
    } catch (error) {
      try { unlinkSync(temp); } catch {}
      return false;
    }
  }

  journalTransferFee(event) {
    const id = String(event.id);
    const fee = safeAmount(event.fee);
    if (!id || fee === null || fee <= 0 ||
        !this.clubs.has(event.fromClubId) || !this.clubs.has(event.toClubId) ||
        event.fromClubId === event.toClubId) {
      return { ok: false, reason: 'invalid-transfer-event' };
    }
    let record = this.transferJournal.transfers.find(item => item.id === id);
    if (record && (record.fromClubId !== event.fromClubId ||
        record.toClubId !== event.toClubId || record.fee !== fee)) {
      return { ok: false, reason: 'transfer-journal-conflict' };
    }
    if (!record) {
      const next = structuredClone(this.transferJournal);
      record = {
        id, fromClubId: event.fromClubId, toClubId: event.toClubId, fee,
        createdAt: Number.isSafeInteger(event.at) ? event.at : this.now(),
        debitPosted: false, creditPosted: false, status: 'pending'
      };
      next.transfers.push(record);
      if (!this.persistTransferJournal(next)) return { ok: false, reason: 'journal-persistence-failed', stage: 'prepare' };
      record = this.transferJournal.transfers.find(item => item.id === id);
    }
    // Ledger entry IDs are deterministic. Replaying a step after a crash between
    // ledger persistence and journal persistence is therefore safe and idempotent.
    const debit = this.store.post(record.fromClubId, {
      id: `transfer-fee-out-${record.id}`, category: 'transfer-expense', amount: record.fee,
      direction: 'expense', description: 'Indemnité de transfert versée',
      createdAt: record.createdAt, referenceId: record.id
    });
    if (!debit.ok) return { ok: false, reason: debit.reason, stage: 'debit' };
    if (!record.debitPosted) {
      const next = structuredClone(this.transferJournal);
      next.transfers.find(item => item.id === id).debitPosted = true;
      if (!this.persistTransferJournal(next)) return { ok: false, reason: 'journal-persistence-failed', stage: 'debit-checkpoint' };
      record = this.transferJournal.transfers.find(item => item.id === id);
    }
    const credit = this.store.post(record.toClubId, {
      id: `transfer-fee-in-${record.id}`, category: 'transfer-income', amount: record.fee,
      direction: 'income', description: 'Indemnité de transfert reçue',
      createdAt: record.createdAt, referenceId: record.id
    });
    if (!credit.ok) return { ok: false, reason: credit.reason, stage: 'credit' };
    const next = structuredClone(this.transferJournal);
    const completed = next.transfers.find(item => item.id === id);
    completed.debitPosted = true;
    completed.creditPosted = true;
    completed.status = 'completed';
    if (!this.persistTransferJournal(next)) return { ok: false, reason: 'journal-persistence-failed', stage: 'complete-checkpoint' };
    return { ok: true, posted: (debit.posted || 0) + (credit.posted || 0), record: this.transferJournal.transfers.find(item => item.id === id) };
  }

  syncRecordedTransferFees() {
    const events = this.transferStore?.state?.events;
    if (!Array.isArray(events)) return { ok: true, posted: 0, unpaid: 0, transfers: [] };
    let posted = 0, unpaid = 0;
    const transfers = [];
    for (const event of events) {
      if (event?.type !== 'transfer' || !event.id) continue;
      const fee = safeAmount(event.fee);
      if (fee === null || fee === 0 || !this.clubs.has(event.fromClubId) ||
          !this.clubs.has(event.toClubId) || event.fromClubId === event.toClubId) continue;
      const result = this.journalTransferFee(event);
      if (!result.ok) {
        unpaid++;
        transfers.push({ eventId: event.id, ok: false, reason: result.reason, stage: result.stage || null,
          fromClubId: event.fromClubId, toClubId: event.toClubId, fee });
        continue;
      }
      posted += result.posted || 0;
      transfers.push({ eventId: event.id, ok: true, fromClubId: event.fromClubId,
        toClubId: event.toClubId, fee, journalStatus: result.record.status });
    }
    return { ok: unpaid === 0, posted, unpaid, transfers };
  }

  settleScheduledItems(now = this.now()) {
    if (!Number.isSafeInteger(now) || now < 0) return { ok: false, reason: 'invalid-time' };
    const systemWages = this.settleSystemPayroll(now);
    const wages = this.syncRecordedPlayerWages();
    const transferFees = this.syncRecordedTransferFees();
    const sponsors = [], loans = [], failures = [];
    if (!systemWages.ok || systemWages.unpaid) failures.push({ category: 'system-wages', unpaid: systemWages.unpaid, reason: systemWages.reason || 'payment-failed' });
    if (!wages.ok || wages.unpaid) failures.push({ category: 'player-wages', unpaid: wages.unpaid, reason: 'payment-failed' });
    if (!transferFees.ok || transferFees.unpaid) failures.push({ category: 'transfer-fees', unpaid: transferFees.unpaid, reason: 'payment-failed' });
    for (const account of this.store.listAccounts()) {
      const sponsor = this.store.settleSponsorPayments(account.clubId, now);
      if (sponsor.ok && sponsor.paid) sponsors.push({ clubId: account.clubId, paid: sponsor.paid, amount: sponsor.amount });
      else if (!sponsor.ok) {
        const failure = { clubId: account.clubId, category: 'sponsorship', reason: sponsor.reason || 'payment-failed' };
        sponsors.push({ ...failure, unpaid: true });
        failures.push(failure);
      }
      const loan = this.store.settleLoanRepayments(account.clubId, now);
      if (loan.ok && loan.paid) loans.push({ clubId: account.clubId, paid: loan.paid, amount: loan.amount });
      else if (!loan.ok) {
        const failure = { clubId: account.clubId, category: 'loan-repayment', reason: loan.reason || 'payment-failed', paid: loan.paid || 0, unpaid: loan.unpaid ?? 1, amount: loan.amount || 0 };
        loans.push({ ...failure, unpaid: true });
        failures.push(failure);
      }
    }
    return { ok: failures.length === 0, at: now, systemWages, wages, transferFees, sponsors, loans, failures };
  }


  /**
   * Read-only reconciliation across club accounts, ledgers and recovery journals.
   * It deliberately reports discrepancies instead of repairing financial history.
   */
  auditReconciliation() {
    const issues = [];
    const sourceEvents = this.transferStore?.state?.events;
    if (Array.isArray(sourceEvents)) {
      const eventIds = new Set();
      for (const event of sourceEvents) {
        if (!event || !['transfer', 'salary-payment'].includes(event.type)) continue;
        const eventId = String(event.id ?? '').trim();
        if (!eventId || eventIds.has(`${event.type}:${eventId}`)) {
          issues.push({ type: 'source-finance-event-duplicate-or-missing-id', eventType: event.type, eventId: eventId || null });
        }
        if (eventId) eventIds.add(`${event.type}:${eventId}`);
        if (event.type === 'transfer') {
          const fee = safeAmount(event.fee);
          if (fee === null || fee === 0 || !this.clubs.has(event.fromClubId) ||
              !this.clubs.has(event.toClubId) || event.fromClubId === event.toClubId) {
            issues.push({ type: 'source-transfer-event-invalid', eventId: eventId || null });
          }
        } else if (!this.clubs.has(event.clubId) || safeAmount(event.amount) === null ||
            event.amount === 0) {
          issues.push({ type: 'source-player-wage-event-invalid', eventId: eventId || null });
        }
      }
    }
    const clubIds = new Set(this.clubs.keys());
    const accountIds = new Set(this.store.accounts.keys());
    const missingAccounts = [...clubIds].filter(id => !accountIds.has(id)).sort();
    const orphanAccounts = [...accountIds].filter(id => !clubIds.has(id)).sort();
    for (const clubId of missingAccounts) issues.push({ type: 'missing-account', clubId });
    for (const clubId of orphanAccounts) issues.push({ type: 'orphan-account', clubId });

    let openingBalance = 0, totalIncome = 0, totalExpenses = 0, totalBalance = 0;
    for (const [clubId, raw] of this.store.accounts) {
      let ledgerBalance = raw.openingBalance;
      for (const entry of raw.entries) {
        ledgerBalance += entry.direction === 'income' ? entry.amount : -entry.amount;
        if (!Number.isSafeInteger(ledgerBalance) || ledgerBalance < 0 || ledgerBalance > 1_000_000_000_000) {
          issues.push({ type: 'invalid-ledger-balance', clubId, entryId: entry.id });
          break;
        }
      }
      const account = this.store.getAccount(clubId);
      if (!account || account.balance !== ledgerBalance) {
        issues.push({ type: 'balance-ledger-mismatch', clubId });
      }
      openingBalance += raw.openingBalance;
      totalIncome += account?.totalIncome || 0;
      totalExpenses += account?.totalExpenses || 0;
      totalBalance += account?.balance || 0;
      for (const sponsor of raw.sponsors || []) {
        const prefix = `sponsor-${sponsor.id}-`;
        const sponsorEntries = raw.entries.filter(entry => entry.id.startsWith(prefix));
        if (sponsorEntries.length !== sponsor.paidWeeks) issues.push({ type: 'sponsor-checkpoint-mismatch', clubId, sponsorId: sponsor.id, checkpoint: sponsor.paidWeeks, ledgerPayments: sponsorEntries.length });
        const expectedIds = new Set();
        for (let installment = 1; installment <= sponsor.paidWeeks; installment++) {
          const entryId = prefix + installment;
          expectedIds.add(entryId);
          const entry = sponsorEntries.find(item => item.id === entryId);
          const expectedAt = sponsor.signedAt + installment * 7 * 86400000;
          if (!entry) issues.push({ type: 'sponsor-installment-missing', clubId, sponsorId: sponsor.id, installment, entryId });
          else if (entry.category !== 'sponsorship' || entry.direction !== 'income' ||
              entry.amount !== sponsor.weeklyPayment || entry.referenceId !== sponsor.id ||
              entry.createdAt !== expectedAt) {
            issues.push({ type: 'sponsor-installment-invalid', clubId, sponsorId: sponsor.id, installment, entryId });
          }
        }
        for (const entry of sponsorEntries) if (!expectedIds.has(entry.id)) {
          issues.push({ type: 'sponsor-installment-unexpected', clubId, sponsorId: sponsor.id, entryId: entry.id });
        }
      }
      for (const loan of raw.loans || []) {
        const prefix = `loan-payment-${loan.id}-`;
        const loanEntries = raw.entries.filter(entry => entry.id.startsWith(prefix));
        if (loanEntries.length !== loan.paidInstallments) issues.push({ type: 'loan-checkpoint-mismatch', clubId, loanId: loan.id, checkpoint: loan.paidInstallments, ledgerPayments: loanEntries.length });
        const expectedIds = new Set();
        const installmentAmount = Math.ceil(loan.totalRepayment / loan.durationWeeks);
        for (let installment = 1; installment <= loan.paidInstallments; installment++) {
          const entryId = prefix + installment;
          expectedIds.add(entryId);
          const entry = loanEntries.find(item => item.id === entryId);
          const expectedAmount = installment === loan.durationWeeks
            ? loan.totalRepayment - installmentAmount * (loan.durationWeeks - 1)
            : installmentAmount;
          const expectedAt = loan.issuedAt + installment * 7 * 86400000;
          if (!entry) issues.push({ type: 'loan-installment-missing', clubId, loanId: loan.id, installment, entryId });
          else if (entry.category !== 'loan' || entry.direction !== 'expense' ||
              entry.amount !== expectedAmount || entry.referenceId !== loan.id ||
              entry.createdAt !== expectedAt) {
            issues.push({ type: 'loan-installment-invalid', clubId, loanId: loan.id, installment, entryId });
          }
        }
        for (const entry of loanEntries) if (!expectedIds.has(entry.id)) {
          issues.push({ type: 'loan-installment-unexpected', clubId, loanId: loan.id, entryId: entry.id });
        }
      }
    }

    const checkJournalEntry = (clubId, entryId, expected, checkpoint, kind) => {
      const account = this.store.getAccount(clubId);
      const actual = account?.entries.find(entry => entry.id === entryId);
      if (checkpoint && !actual) issues.push({ type: `${kind}-checkpoint-without-entry`, clubId, entryId });
      if (!checkpoint && actual) issues.push({ type: `${kind}-entry-without-checkpoint`, clubId, entryId });
      if (actual && (actual.amount !== expected.amount || actual.direction !== expected.direction ||
          actual.category !== expected.category || actual.referenceId !== expected.referenceId)) {
        issues.push({ type: `${kind}-entry-conflict`, clubId, entryId });
      }
    };
    const transferIds = new Set();
    for (const transfer of this.transferJournal.transfers || []) {
      if (!transfer?.id || transferIds.has(transfer.id)) {
        issues.push({ type: 'transfer-journal-duplicate-or-missing-id', transferId: transfer?.id || null });
      }
      if (transfer?.id) transferIds.add(transfer.id);
      if (!this.clubs.has(transfer?.fromClubId) || !this.clubs.has(transfer?.toClubId) ||
          transfer?.fromClubId === transfer?.toClubId) {
        issues.push({ type: 'transfer-journal-invalid-club-reference', transferId: transfer?.id || null });
      }
      if (!Number.isSafeInteger(transfer?.fee) || transfer.fee <= 0 ||
          typeof transfer?.debitPosted !== 'boolean' || typeof transfer?.creditPosted !== 'boolean' ||
          !['pending', 'completed'].includes(transfer?.status)) {
        issues.push({ type: 'transfer-journal-invalid-state', transferId: transfer?.id || null });
      }
      if (transfer?.status === 'completed' && (!transfer.debitPosted || !transfer.creditPosted) ||
          transfer?.status === 'pending' && transfer.debitPosted && transfer.creditPosted) {
        issues.push({ type: 'transfer-journal-status-checkpoint-mismatch', transferId: transfer?.id || null });
      }
    }
    const wageIds = new Set();
    for (const wage of this.transferJournal.playerWages || []) {
      if (!wage?.id || wageIds.has(wage.id)) {
        issues.push({ type: 'player-wage-journal-duplicate-or-missing-id', wageId: wage?.id || null });
      }
      if (wage?.id) wageIds.add(wage.id);
      if (!this.clubs.has(wage?.clubId) || !Number.isSafeInteger(wage?.amount) ||
          wage.amount <= 0 || typeof wage?.posted !== 'boolean') {
        issues.push({ type: 'player-wage-journal-invalid-state', wageId: wage?.id || null });
      }
    }
    for (const transfer of this.transferJournal.transfers || []) {
      const outId = `transfer-fee-out-${transfer.id}`, inId = `transfer-fee-in-${transfer.id}`;
      checkJournalEntry(transfer.fromClubId, outId, { amount: transfer.fee, direction: 'expense', category: 'transfer-expense', referenceId: transfer.id }, transfer.debitPosted, 'transfer-debit');
      checkJournalEntry(transfer.toClubId, inId, { amount: transfer.fee, direction: 'income', category: 'transfer-income', referenceId: transfer.id }, transfer.creditPosted, 'transfer-credit');
      if (transfer.status === 'completed' && (!transfer.debitPosted || !transfer.creditPosted)) {
        issues.push({ type: 'transfer-completion-checkpoint-mismatch', transferId: transfer.id });
      }
    }
    for (const wage of this.transferJournal.playerWages || []) {
      checkJournalEntry(wage.clubId, `player-wage-${wage.id}`,
        { amount: wage.amount, direction: 'expense', category: 'wages', referenceId: wage.id }, wage.posted, 'player-wage');
    }

    // Validate every system-player payroll ledger entry against the club's retained contract history.
    for (const [clubId, club] of this.clubs) {
      const contracts = new Map();
      const roster = (club.roster || []).map(player => ({ player, releasedAt: null }));
      const released = (club.releasedPlayers || []).map(item => ({
        player: item?.player, releasedAt: Date.parse(item?.releasedAt)
      }));
      for (const { player, releasedAt } of [...roster, ...released]) {
        const contract = player?.contract;
        if (player?.playerType !== 'system' || !contract?.id ||
            contract.clubId !== clubId || contract.playerId !== player.id) continue;
        const wage = safeAmount(contract.weeklyWage ?? contract.salary);
        if (wage === null || wage === 0) continue;
        const signedAt = Date.parse(contract.signedAt);
        const expiresAt = Date.parse(contract.expiresAt);
        const endAt = Number.isFinite(releasedAt)
          ? (Number.isFinite(expiresAt) ? Math.min(releasedAt, expiresAt) : releasedAt)
          : (Number.isFinite(expiresAt) ? expiresAt : Number.POSITIVE_INFINITY);
        contracts.set(String(contract.id), {
          wage, signedAt: Number.isFinite(signedAt) ? signedAt : Number.NEGATIVE_INFINITY, endAt
        });
      }
      const account = this.store.accounts.get(clubId);
      for (const entry of account?.entries || []) {
        if (!entry.id.startsWith('system-wage-')) continue;
        const match = entry.id.match(/^system-wage-(.+)-(\\d{13})$/);
        const contract = match ? contracts.get(match[1]) : null;
        const dueAt = match ? Number(match[2]) : NaN;
        if (!contract || !Number.isSafeInteger(dueAt) || entry.category !== 'wages' ||
            entry.direction !== 'expense' || entry.amount !== contract.wage ||
            entry.referenceId !== match[1] || entry.createdAt !== dueAt ||
            dueAt <= contract.signedAt || dueAt > contract.endAt) {
          issues.push({ type: 'system-wage-entry-invalid', clubId, entryId: entry.id });
        }
      }
    }

    const totalsSafe = [openingBalance, totalIncome, totalExpenses, totalBalance].every(Number.isSafeInteger);
    if (!totalsSafe) issues.push({ type: 'aggregate-overflow' });
    return {
      ok: issues.length === 0,
      clubs: this.clubs.size,
      accounts: accountIds.size,
      openingBalance, totalIncome, totalExpenses, totalBalance,
      missingAccounts, orphanAccounts, issueCount: issues.length, issues
    };
  }

  getClubFinance(clubId, { weeklyMaintenance = 0 } = {}) {
    const account = this.store.getAccount(clubId);
    if (!account) return null;
    const maintenance = safeAmount(weeklyMaintenance);
    if (maintenance === null) return { ok: false, reason: 'invalid-maintenance' };
    const club = this.clubs.get(clubId);
    const systemContracts = (club?.roster || [])
      .filter(player => player?.playerType === 'system' && player.contract?.status === 'active')
      .map(player => ({ weeklyWage: player.contract.weeklyWage ?? player.contract.salary }));
    const humanContracts = (this.transferStore?.state?.careers || [])
      .filter(row => row?.clubId === clubId && row.contract?.status === 'active')
      .map(row => ({ weeklyWage: row.contract.salary }));
    const systemPayroll = ClubFinanceStore.calculatePayroll(systemContracts);
    const humanPayroll = ClubFinanceStore.calculatePayroll(humanContracts);
    if (!systemPayroll.ok) return systemPayroll;
    if (!humanPayroll.ok) return humanPayroll;
    const payroll = ClubFinanceStore.calculatePayroll([...systemContracts, ...humanContracts]);
    if (!payroll.ok) return payroll;
    const weeklySponsorIncome = account.sponsors
      .filter(item => item.status === 'active')
      .reduce((sum, item) => sum + item.weeklyPayment, 0);
    const budget = ClubFinanceStore.assessWeeklyBudget({
      balance: account.balance, weeklyPayroll: payroll.weeklyPayroll,
      weeklyMaintenance: maintenance, weeklySponsorIncome
    });
    return { account, payroll, systemPayroll, humanPayroll, systemPlayersUnderContract: systemContracts.length, humanPlayersUnderContract: humanContracts.length, weeklyMaintenance: maintenance, budget };
  }
}
