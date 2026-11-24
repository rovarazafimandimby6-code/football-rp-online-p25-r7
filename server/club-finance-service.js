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
      if (this.clubs.has(clubId) && Number.isSafeInteger(at) && at >= 0) valid[clubId] = at;
    }
    let changed = false;
    for (const clubId of this.clubs.keys()) {
      if (!Number.isSafeInteger(valid[clubId])) { valid[clubId] = this.now(); changed = true; }
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
    const grouped = new Map();
    for (const event of events) {
      if (event?.type !== 'salary-payment' || !event.id || !this.clubs.has(event.clubId)) continue;
      const amount = safeAmount(event.amount);
      if (amount === null || amount === 0) continue;
      if (!grouped.has(event.clubId)) grouped.set(event.clubId, []);
      grouped.get(event.clubId).push({
        id: `player-wage-${event.id}`, category: 'wages', amount, direction: 'expense',
        description: 'Salaire joueur sous contrat', createdAt: Number.isSafeInteger(event.at) ? event.at : this.now(),
        referenceId: event.id
      });
    }
    let posted = 0, unpaid = 0;
    const clubs = [];
    for (const [clubId, entries] of grouped) {
      const result = this.store.postBatch(clubId, entries);
      if (result.ok) posted += result.posted || 0;
      else unpaid += entries.length;
      clubs.push({ clubId, ok: result.ok, reason: result.reason || null, entries: entries.length });
    }
    return { ok: unpaid === 0, posted, unpaid, clubs };
  }

  settleScheduledItems(now = this.now()) {
    if (!Number.isSafeInteger(now) || now < 0) return { ok: false, reason: 'invalid-time' };
    const systemWages = this.settleSystemPayroll(now);
    const wages = this.syncRecordedPlayerWages();
    const sponsors = [], loans = [], failures = [];
    if (!systemWages.ok || systemWages.unpaid) failures.push({ category: 'system-wages', unpaid: systemWages.unpaid, reason: systemWages.reason || 'payment-failed' });
    if (!wages.ok || wages.unpaid) failures.push({ category: 'player-wages', unpaid: wages.unpaid, reason: 'payment-failed' });
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
    return { ok: failures.length === 0, at: now, systemWages, wages, sponsors, loans, failures };
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
