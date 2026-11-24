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

  syncRecordedPlayerWages() {
    const events = this.transferStore?.state?.events;
    if (!Array.isArray(events)) return { posted: 0, unpaid: 0, clubs: [] };
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
    return { posted, unpaid, clubs };
  }

  settleScheduledItems() {
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0) return { ok: false, reason: 'invalid-time' };
    const wages = this.syncRecordedPlayerWages();
    const sponsors = [], loans = [];
    for (const account of this.store.listAccounts()) {
      const sponsor = this.store.settleSponsorPayments(account.clubId, now);
      if (sponsor.ok && sponsor.paid) sponsors.push({ clubId: account.clubId, paid: sponsor.paid, amount: sponsor.amount });
      const loan = this.store.settleLoanRepayments(account.clubId, now);
      if (loan.ok && loan.paid) loans.push({ clubId: account.clubId, paid: loan.paid, amount: loan.amount });
      else if (!loan.ok && loan.reason === 'insufficient-funds') loans.push({ clubId: account.clubId, unpaid: true });
    }
    return { ok: true, at: now, wages, sponsors, loans };
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
