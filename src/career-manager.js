const MATCH_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const validMatchId = value => typeof value === 'string' && MATCH_ID_RE.test(value);
const idOf = value => String(value ?? '').trim().slice(0, 48);
const nonNegativeInt = (value, fallback = 0, max = 1_000_000_000) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : fallback;
};
import { readJsonWithBackup, writeJsonWithBackup } from './persistent-json.js';

const timestamp = value => {
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : null;
};

const MAX_PENDING_OFFERS = 5;
const calculateSalaryAccrual = (contract, wallet, at) => {
  const now = timestamp(at);
  if (now === null) return { ok:false, reason:'invalid-date', paid:0, periods:0 };
  if (!contract || contract.status !== 'active') return { ok:true, paid:0, periods:0, paidThrough:null };
  const signed = timestamp(contract.signedAt);
  const expiry = timestamp(contract.expiresAt);
  const lastPaid = timestamp(contract.lastSalaryPaidAt) ?? signed;
  if (signed === null || expiry === null || lastPaid === null) return { ok:false, reason:'invalid-contract', paid:0, periods:0 };
  const payableUntil = Math.min(now, expiry);
  const periods = Math.max(0, Math.floor((payableUntil - lastPaid) / (7 * 86400000)));
  const paid = Math.min(1_000_000_000 - nonNegativeInt(wallet), nonNegativeInt(contract.salary) * periods);
  return { ok:true, paid, periods, paidThrough:lastPaid + periods * 7 * 86400000 };
};

const normalizeCareerState = state => {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const contract = state.contract && typeof state.contract === 'object' && idOf(state.contract.clubId)
    && timestamp(state.contract.expiresAt) !== null && ['active','expired','terminated'].includes(state.contract.status)
    ? { ...state.contract, clubId: idOf(state.contract.clubId), salary: nonNegativeInt(state.contract.salary), status: state.contract.status, lastSalaryPaidAt: timestamp(state.contract.lastSalaryPaidAt) !== null ? new Date(timestamp(state.contract.lastSalaryPaidAt)).toISOString() : (typeof state.contract.signedAt === 'string' ? state.contract.signedAt : null) } : null;
  const offers = Array.isArray(state.offers) ? state.offers.filter(item => item && typeof item === 'object' && idOf(item.id) && idOf(item.fromClubId) && ['pending','accepted','rejected','expired','cancelled'].includes(item.status)).map(item => ({ ...item, id: idOf(item.id), fromClubId: idOf(item.fromClubId), salary: nonNegativeInt(item.salary), fee: nonNegativeInt(item.fee) })) : [];
  return { wallet: nonNegativeInt(state.wallet, 500), clubId: contract?.status === 'active' ? contract.clubId : null, contract, offers, history: Array.isArray(state.history) ? state.history.filter(item => item && typeof item === 'object').slice(-200) : [], matchRewards: Array.isArray(state.matchRewards) ? state.matchRewards.filter(item => item && validMatchId(item.matchId)).slice(-2000).map(item => ({ matchId: item.matchId, experience: nonNegativeInt(item.experience), coins: nonNegativeInt(item.coins) })) : [], processedMatchIds: Array.isArray(state.processedMatchIds) ? [...new Set(state.processedMatchIds.filter(validMatchId))].slice(-2000) : [], nextOfferNumber: Math.max(1, nonNegativeInt(state.nextOfferNumber, 1)) };
};

export class CareerManager {
  constructor({ initialCoins = 500, transferWindows = [], storage, storageKey = 'football-rp-online.career.v1' } = {}) {
    if (storage === undefined) { try { storage = globalThis.localStorage; } catch (_) { storage = null; } }
    this.storage = storage;
    this.storageKey = storageKey;
    this.wallet = nonNegativeInt(initialCoins);
    this.clubId = null;
    this.contract = null;
    this.transferWindows = (Array.isArray(transferWindows) ? transferWindows : [])
      .map(window => ({ start: timestamp(window?.start), end: timestamp(window?.end) }))
      .filter(window => window.start !== null && window.end !== null && window.end >= window.start);
    this.offers = new Map();
    this.history = [];
    this.matchRewards = [];
    this.processedMatchIds = [];
    this.nextOfferNumber = 1;
    this.load();
  }

  snapshot() {
    return { wallet: this.wallet, clubId: this.clubId, contract: this.contract, offers: [...this.offers.values()], history: this.history, matchRewards: this.matchRewards, processedMatchIds: this.processedMatchIds, nextOfferNumber: this.nextOfferNumber };
  }

  persist() { return writeJsonWithBackup(this.storage, this.storageKey, this.snapshot(), normalizeCareerState); }

  saveState() { return !this.storage?.setItem || this.persist(); }

  captureState() { return JSON.parse(JSON.stringify(this.snapshot())); }

  restoreState(state) {
    this.wallet = state.wallet;
    this.clubId = state.clubId;
    this.contract = state.contract;
    this.offers = new Map(state.offers.map(item => [item.id, item]));
    this.history = state.history;
    this.matchRewards = state.matchRewards;
    this.processedMatchIds = state.processedMatchIds;
    this.nextOfferNumber = state.nextOfferNumber;
  }

  load() {
    const state = readJsonWithBackup(this.storage, this.storageKey, normalizeCareerState);
    if (!state) return this.snapshot();
    this.wallet = state.wallet; this.clubId = state.clubId; this.contract = state.contract;
    this.offers = new Map(state.offers.map(item => [item.id, item]));
    this.history = state.history; this.matchRewards = state.matchRewards || []; this.processedMatchIds = state.processedMatchIds; this.nextOfferNumber = state.nextOfferNumber;
    return this.snapshot();
  }

  isTransferWindowOpen(at = Date.now()) {
    const time = timestamp(at);
    return time !== null && this.transferWindows.some(window => time >= window.start && time <= window.end);
  }

  getContractStatus(at = Date.now()) {
    if (!this.contract) return null;
    const now = timestamp(at);
    const expiry = timestamp(this.contract.expiresAt);
    if (now === null || expiry === null) return { status: 'invalid', daysRemaining: 0, expired: true };
    const inactive = ['expired', 'terminated'].includes(this.contract.status);
    const expired = expiry <= now || inactive;
    return {
      status: inactive ? this.contract.status : expired ? 'expired' : 'active',
      daysRemaining: expired ? 0 : Math.max(0, Math.ceil((expiry - now) / 86400000)),
      expired
    };
  }

  processSalary(at = Date.now()) {
    const accrual = calculateSalaryAccrual(this.contract, this.wallet, at);
    if (!accrual.ok) return { ...accrual, paid:0, periods:0 };
    if (!accrual.periods) return { ok:true, paid:0, periods:0 };
    const now = timestamp(at);
    const before = this.captureState();
    this.wallet += accrual.paid;
    this.contract = { ...this.contract, lastSalaryPaidAt:new Date(accrual.paidThrough).toISOString() };
    if (accrual.paid > 0) this.history.push({ type:'salary', salary:this.contract.salary, periods:accrual.periods, amount:accrual.paid, date:new Date(accrual.paidThrough).toISOString(), paidAt:new Date(now).toISOString() });
    if (!this.saveState()) {
      this.restoreState(before);
      return { ok:false, reason:'persistence-failed', paid:0, periods:0 };
    }
    return { ok:true, paid:accrual.paid, periods:accrual.periods, nextPaymentAt:new Date(accrual.paidThrough + 7 * 86400000).toISOString() };
  }

  getSalaryStatus(at = Date.now()) {
    const now = timestamp(at);
    const contract = this.contract;
    if (now === null || !contract || contract.status !== 'active') return null;
    const signed = timestamp(contract.signedAt);
    const expiry = timestamp(contract.expiresAt);
    const lastPaid = timestamp(contract.lastSalaryPaidAt) ?? signed;
    if (signed === null || expiry === null || lastPaid === null || expiry <= now) return null;
    const nextPayment = lastPaid + 7 * 86400000;
    if (nextPayment > expiry) return { salary: nonNegativeInt(contract.salary), nextPaymentAt: null, daysUntilPayment: null, expiresAt: new Date(expiry).toISOString(), paymentBeforeExpiry: false };
    return { salary: nonNegativeInt(contract.salary), nextPaymentAt: new Date(nextPayment).toISOString(), daysUntilPayment: Math.max(0, Math.ceil((nextPayment - now) / 86400000)), expiresAt: new Date(expiry).toISOString(), paymentBeforeExpiry: true };
  }

  refreshOfferStatuses(at = Date.now()) {
    const now = timestamp(at);
    if (now === null) return { ok: false, reason: 'invalid-date', updated: 0 };
    const before = this.captureState();
    let updated = 0;
    for (const offer of this.offers.values()) {
      if (offer.status !== 'pending' || !offer.expiresAt) continue;
      const expiry = timestamp(offer.expiresAt);
      if (expiry !== null && expiry <= now) {
        offer.status = 'expired';
        this.history.push({ type:'offer-expired', offerId:offer.id, clubId:offer.fromClubId, date:new Date(now).toISOString() });
        updated++;
      }
    }
    if (updated && !this.saveState()) {
      this.restoreState(before);
      return { ok:false, reason:'persistence-failed', updated:0 };
    }
    return { ok: true, updated };
  }

  refreshContractStatus(at = Date.now()) {
    const salary = this.processSalary(at);
    const state = this.getContractStatus(at);
    if (!salary.ok) return state ? { ...state, persistenceFailed:true } : state;
    if (!state || !state.expired || this.contract.status !== 'active') return state;
    const now = timestamp(at);
    if (now === null) return state;
    const before = this.captureState();
    const date = new Date(now).toISOString();
    const previousClub = this.contract.clubId;
    this.contract = { ...this.contract, status: 'expired', expiredAt: date };
    this.clubId = null;
    for (const offer of this.offers.values()) if (offer.status === 'pending') {
      offer.status = 'cancelled';
      this.history.push({ type:'offer-cancelled', offerId:offer.id, clubId:offer.fromClubId, reason:'contract-expired', date });
    }
    this.history.push({ type: 'contract-expired', clubId: previousClub, date });
    if (!this.saveState()) {
      this.restoreState(before);
      return { ...state, persistenceFailed:true };
    }
    return this.getContractStatus(at);
  }

  renewContract({ salary, durationDays = 180, renewedAt = new Date().toISOString() } = {}) {
    const now = timestamp(renewedAt);
    if (now === null) return { ok: false, reason: 'invalid-date' };
    if (!this.contract || this.getContractStatus(now).expired) {
      if (this.contract) this.refreshContractStatus(now);
      return { ok: false, reason: 'contract-expired' };
    }
    if (salary !== undefined && !Number.isFinite(Number(salary))) return { ok: false, reason: 'invalid-salary' };
    const before = this.captureState();
    const accrual = calculateSalaryAccrual(this.contract, this.wallet, now);
    if (!accrual.ok) return { ok:false, reason:accrual.reason };
    this.wallet += accrual.paid;
    if (accrual.periods > 0 && accrual.paid > 0) this.history.push({ type:'salary', salary:this.contract.salary, periods:accrual.periods, amount:accrual.paid, date:new Date(accrual.paidThrough).toISOString(), paidAt:new Date(now).toISOString() });
    const days = Math.max(1, Math.min(3650, nonNegativeInt(durationDays, 180) || 180));
    const wage = salary === undefined ? this.contract.salary : nonNegativeInt(salary);
    this.contract = {
      ...this.contract,
      salary: wage,
      renewedAt: new Date(now).toISOString(),
      lastSalaryPaidAt: new Date(now).toISOString(),
      expiresAt: new Date(now + days * 86400000).toISOString(),
      status: 'active'
    };
    this.history.push({ type: 'renewal', clubId: this.contract.clubId, date: new Date(now).toISOString(), salary: wage, durationDays: days });
    if (!this.saveState()) {
      this.restoreState(before);
      return { ok:false, reason:'persistence-failed' };
    }
    return { ok: true, contract: { ...this.contract } };
  }

  terminateContract(at = new Date().toISOString()) {
    const now = timestamp(at);
    if (now === null) return { ok: false, reason: 'invalid-date' };
    if (!this.contract || this.getContractStatus(now).expired) {
      if (this.contract) this.refreshContractStatus(now);
      return { ok: false, reason: 'contract-expired' };
    }
    const before = this.captureState();
    const accrual = calculateSalaryAccrual(this.contract, this.wallet, now);
    if (!accrual.ok) return { ok:false, reason:accrual.reason };
    this.wallet += accrual.paid;
    if (accrual.periods > 0 && accrual.paid > 0) this.history.push({ type:'salary', salary:this.contract.salary, periods:accrual.periods, amount:accrual.paid, date:new Date(accrual.paidThrough).toISOString(), paidAt:new Date(now).toISOString() });
    const previousClub = this.contract.clubId;
    this.contract = { ...this.contract, status: 'terminated', terminatedAt: new Date(now).toISOString() };
    this.clubId = null;
    for (const offer of this.offers.values()) if (offer.status === 'pending') {
      offer.status = 'cancelled';
      this.history.push({ type:'offer-cancelled', offerId:offer.id, clubId:offer.fromClubId, reason:'contract-terminated', date:new Date(now).toISOString() });
    }
    this.history.push({ type: 'termination', clubId: previousClub, date: new Date(now).toISOString() });
    if (!this.saveState()) {
      this.restoreState(before);
      return { ok:false, reason:'persistence-failed' };
    }
    return { ok: true, previousClub, contract: { ...this.contract } };
  }

  signContract({ clubId, salary = 0, durationDays = 30, signedAt = new Date().toISOString() } = {}) {
    const club = idOf(clubId);
    if (!Number.isFinite(Number(salary))) return { ok:false, reason:'invalid-salary' };
    const wage = nonNegativeInt(salary);
    const days = Math.max(1, Math.min(3650, nonNegativeInt(durationDays, 30) || 30));
    const startMs = timestamp(signedAt);
    if (!club) return { ok: false, reason: 'invalid-club' };
    if (startMs === null) return { ok: false, reason: 'invalid-date' };
    const current = this.getContractStatus(startMs);
    if (current && !current.expired) return { ok: false, reason: 'active-contract' };
    const start = new Date(startMs);
    const expires = new Date(startMs + days * 86400000);
    const before = this.captureState();
    this.clubId = club;
    this.contract = { clubId: club, salary: wage, signedAt: start.toISOString(), lastSalaryPaidAt: start.toISOString(), expiresAt: expires.toISOString(), status: 'active' };
    this.history.push({ type: 'signing', clubId: club, date: start.toISOString(), salary: wage });
    if (!this.saveState()) {
      this.restoreState(before);
      return { ok:false, reason:'persistence-failed' };
    }
    return { ok: true, contract: { ...this.contract } };
  }

  makeOffer({ fromClubId, salary = 0, fee = 0, expiresAt = null, at = Date.now() } = {}) {
    const from = idOf(fromClubId);
    const now = timestamp(at);
    if (now === null) return { ok:false, reason:'invalid-date' };
    if (!from || !this.contract || this.getContractStatus(now).expired) return { ok: false, reason: 'no-current-contract' };
    if (!Number.isFinite(Number(salary))) return { ok:false, reason:'invalid-salary' };
    if (!Number.isFinite(Number(fee))) return { ok:false, reason:'invalid-fee' };
    if (from === this.contract.clubId) return { ok: false, reason: 'same-club' };
    const expiry = expiresAt == null ? null : timestamp(expiresAt);
    if (expiresAt != null && expiry === null) return { ok: false, reason: 'invalid-expiry' };
    if (expiry !== null && expiry <= now) return { ok: false, reason: 'offer-expired' };
    const refreshed = this.refreshOfferStatuses(now);
    if (!refreshed.ok) return { ok:false, reason:'persistence-failed' };
    if ([...this.offers.values()].some(offer => offer.status === 'pending' && offer.fromClubId === from)) return { ok:false, reason:'duplicate-pending-offer' };
    if ([...this.offers.values()].filter(offer => offer.status === 'pending').length >= MAX_PENDING_OFFERS) return { ok:false, reason:'pending-offer-limit' };
    const before = this.captureState();
    const offerId = `offer-${this.nextOfferNumber++}`;
    const offer = {
      id: offerId,
      fromClubId: from,
      salary: nonNegativeInt(salary),
      fee: nonNegativeInt(fee),
      expiresAt: expiry === null ? null : new Date(expiry).toISOString(),
      status: 'pending'
    };
    this.offers.set(offerId, offer);
    this.history.push({ type:'offer-received', offerId, clubId:from, salary:offer.salary, fee:offer.fee, date:new Date(now).toISOString(), expiresAt:offer.expiresAt });
    if (!this.saveState()) {
      this.restoreState(before);
      return { ok:false, reason:'persistence-failed' };
    }
    return { ok: true, offer: { ...offer } };
  }

  negotiate(offerId, { salary, fee } = {}, at = Date.now()) {
    const offer = this.offers.get(idOf(offerId));
    if (!offer || offer.status !== 'pending') return { ok: false, reason: 'offer-unavailable' };
    const now = timestamp(at);
    if (now === null) return { ok: false, reason: 'invalid-date' };
    if (!this.contract || this.getContractStatus(now).expired) return { ok:false, reason:'contract-expired' };
    if (offer.expiresAt && timestamp(offer.expiresAt) <= now) {
      const before = this.captureState();
      offer.status = 'expired';
      this.history.push({ type:'offer-expired', offerId:offer.id, clubId:offer.fromClubId, date:new Date(now).toISOString() });
      if (!this.saveState()) {
        this.restoreState(before);
        return { ok:false, reason:'persistence-failed' };
      }
      return { ok: false, reason: 'offer-expired' };
    }
    if (salary !== undefined && !Number.isFinite(Number(salary))) return { ok: false, reason: 'invalid-salary' };
    if (fee !== undefined && !Number.isFinite(Number(fee))) return { ok: false, reason: 'invalid-fee' };
    const before = this.captureState();
    if (salary !== undefined) offer.salary = nonNegativeInt(salary);
    if (fee !== undefined) offer.fee = nonNegativeInt(fee);
    this.history.push({ type:'offer-negotiated', offerId:offer.id, clubId:offer.fromClubId, salary:offer.salary, fee:offer.fee, date:new Date(now).toISOString() });
    if (!this.saveState()) {
      this.restoreState(before);
      return { ok:false, reason:'persistence-failed' };
    }
    return { ok: true, offer: { ...offer } };
  }

  acceptOffer(offerId, at = Date.now()) {
    const offer = this.offers.get(idOf(offerId));
    if (!offer || offer.status !== 'pending') return { ok: false, reason: 'offer-unavailable' };
    const now = timestamp(at);
    if (now === null) return { ok: false, reason: 'invalid-date' };
    if (!this.contract || this.getContractStatus(now).expired) return { ok: false, reason: 'contract-expired' };
    if (!this.isTransferWindowOpen(now)) return { ok: false, reason: 'window-closed' };
    if (offer.expiresAt && timestamp(offer.expiresAt) <= now) {
      const beforeExpiry = this.captureState();
      offer.status = 'expired';
      this.history.push({ type:'offer-expired', offerId:offer.id, clubId:offer.fromClubId, date:new Date(now).toISOString() });
      if (!this.saveState()) {
        this.restoreState(beforeExpiry);
        return { ok:false, reason:'persistence-failed' };
      }
      return { ok: false, reason: 'offer-expired' };
    }
    if (offer.fromClubId === this.contract.clubId) return { ok: false, reason: 'same-club' };
    const accrual = calculateSalaryAccrual(this.contract, this.wallet, now);
    if (!accrual.ok) return { ok:false, reason:accrual.reason };
    if (this.wallet + accrual.paid < offer.fee) return { ok: false, reason: 'insufficient-funds' };

    const before = this.captureState();
    const previousClub = this.contract.clubId;
    const signedAt = new Date(now).toISOString();
    this.wallet += accrual.paid;
    if (accrual.periods > 0 && accrual.paid > 0) this.history.push({ type:'salary', salary:this.contract.salary, periods:accrual.periods, amount:accrual.paid, date:new Date(accrual.paidThrough).toISOString(), paidAt:signedAt });
    this.wallet -= offer.fee;
    this.clubId = offer.fromClubId;
    this.contract = {
      clubId: offer.fromClubId,
      salary: offer.salary,
      signedAt,
      lastSalaryPaidAt: signedAt,
      expiresAt: new Date(now + 180 * 86400000).toISOString(),
      status: 'active'
    };
    offer.status = 'accepted';
    for (const other of this.offers.values()) {
      if (other.id !== offer.id && other.status === 'pending') {
        other.status = 'cancelled';
        this.history.push({ type:'offer-cancelled', offerId:other.id, clubId:other.fromClubId, reason:'transferred', date:signedAt });
      }
    }
    this.history.push({ type: 'transfer', from: previousClub, to: this.clubId, fee: offer.fee, date: signedAt });
    if (!this.saveState()) {
      this.restoreState(before);
      return { ok:false, reason:'persistence-failed' };
    }
    return { ok: true, clubId: this.clubId, wallet: this.wallet, contract: { ...this.contract } };
  }

  rejectOffer(offerId, at = Date.now()) {
    const offer = this.offers.get(idOf(offerId));
    const now = timestamp(at);
    if (!offer || offer.status !== 'pending' || now === null) return false;
    const before = this.captureState();
    if (offer.expiresAt && timestamp(offer.expiresAt) <= now) {
      offer.status = 'expired';
      this.history.push({ type:'offer-expired', offerId:offer.id, clubId:offer.fromClubId, date:new Date(now).toISOString() });
    } else {
      offer.status = 'rejected';
      this.history.push({ type:'offer-rejected', offerId:offer.id, clubId:offer.fromClubId, date:new Date(now).toISOString() });
    }
    if (!this.saveState()) {
      this.restoreState(before);
      return false;
    }
    return offer.status === 'rejected';
  }

  recordMatch({ result, goals = 0, assists = 0, cleanSheet = false, matchId = null } = {}) {
    if (!['win', 'draw', 'loss'].includes(result)) return { ok: false, reason: 'invalid-result' };
    if (matchId !== null && matchId !== undefined && !validMatchId(matchId)) return { ok:false, reason:'invalid-match-id' };
    const id = matchId ?? '';
    if (id && this.processedMatchIds.includes(id)) {
      const savedReward = this.matchRewards.find(item => item.matchId === id);
      return { experience: savedReward?.experience || 0, coins: savedReward?.coins || 0, duplicate: true, recoverable: Boolean(savedReward) };
    }
    const before = this.captureState();
    const scored = nonNegativeInt(goals, 0, 99);
    const assisted = nonNegativeInt(assists, 0, 99);
    const points = (result === 'win' ? 30 : result === 'draw' ? 15 : 5) + scored * 12 + assisted * 8 + (cleanSheet ? 8 : 0);
    const reward = Math.floor(points / 5);
    this.wallet = Math.min(1_000_000_000, this.wallet + reward);
    this.history.push({ type: 'match', ...(id ? { matchId: id } : {}), result, goals: scored, assists: assisted, cleanSheet: !!cleanSheet, reward, date: new Date().toISOString() });
    if (id) {
      this.processedMatchIds.push(id); this.processedMatchIds = this.processedMatchIds.slice(-2000);
      this.matchRewards.push({ matchId: id, experience: points, coins: reward });
      this.matchRewards = this.matchRewards.slice(-2000);
    }
    if (!this.saveState()) {
      this.restoreState(before);
      return { ok:false, reason:'persistence-failed' };
    }
    return { experience: points, coins: reward };
  }
}
