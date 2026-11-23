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

const normalizeCareerState = state => {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const contract = state.contract && typeof state.contract === 'object' && idOf(state.contract.clubId)
    && timestamp(state.contract.expiresAt) !== null && ['active','expired','terminated'].includes(state.contract.status)
    ? { ...state.contract, clubId: idOf(state.contract.clubId), salary: nonNegativeInt(state.contract.salary), status: state.contract.status } : null;
  const offers = Array.isArray(state.offers) ? state.offers.filter(item => item && typeof item === 'object' && idOf(item.id) && idOf(item.fromClubId) && ['pending','accepted','rejected','expired','cancelled'].includes(item.status)).map(item => ({ ...item, id: idOf(item.id), fromClubId: idOf(item.fromClubId), salary: nonNegativeInt(item.salary), fee: nonNegativeInt(item.fee) })) : [];
  return { wallet: nonNegativeInt(state.wallet, 500), clubId: state.clubId ? idOf(state.clubId) : null, contract, offers, history: Array.isArray(state.history) ? state.history.filter(item => item && typeof item === 'object').slice(-200) : [], processedMatchIds: Array.isArray(state.processedMatchIds) ? [...new Set(state.processedMatchIds.filter(id => typeof id === 'string' && id.trim()).map(id => id.slice(0, 64)))].slice(-2000) : [], nextOfferNumber: Math.max(1, nonNegativeInt(state.nextOfferNumber, 1)) };
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
    this.processedMatchIds = [];
    this.nextOfferNumber = 1;
    this.load();
  }

  snapshot() {
    return { wallet: this.wallet, clubId: this.clubId, contract: this.contract, offers: [...this.offers.values()], history: this.history, processedMatchIds: this.processedMatchIds, nextOfferNumber: this.nextOfferNumber };
  }

  persist() { return writeJsonWithBackup(this.storage, this.storageKey, this.snapshot(), normalizeCareerState); }

  load() {
    const state = readJsonWithBackup(this.storage, this.storageKey, normalizeCareerState);
    if (!state) return this.snapshot();
    this.wallet = state.wallet; this.clubId = state.clubId; this.contract = state.contract;
    this.offers = new Map(state.offers.map(item => [item.id, item]));
    this.history = state.history; this.processedMatchIds = state.processedMatchIds; this.nextOfferNumber = state.nextOfferNumber;
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

  refreshContractStatus(at = Date.now()) {
    const state = this.getContractStatus(at);
    if (!state || !state.expired || this.contract.status !== 'active') return state;
    const now = timestamp(at);
    if (now === null) return state;
    const date = new Date(now).toISOString();
    this.contract = { ...this.contract, status: 'expired', expiredAt: date };
    this.clubId = null;
    for (const offer of this.offers.values()) if (offer.status === 'pending') offer.status = 'cancelled';
    this.history.push({ type: 'contract-expired', clubId: this.contract.clubId, date });
    this.persist();
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
    const days = Math.max(1, Math.min(3650, nonNegativeInt(durationDays, 180) || 180));
    const wage = salary === undefined ? this.contract.salary : nonNegativeInt(salary);
    this.contract = {
      ...this.contract,
      salary: wage,
      renewedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + days * 86400000).toISOString(),
      status: 'active'
    };
    this.history.push({ type: 'renewal', clubId: this.clubId, date: new Date(now).toISOString(), salary: wage, durationDays: days });
    this.persist();
    return { ok: true, contract: { ...this.contract } };
  }

  terminateContract(at = new Date().toISOString()) {
    const now = timestamp(at);
    if (now === null) return { ok: false, reason: 'invalid-date' };
    if (!this.contract || this.getContractStatus(now).expired) {
      if (this.contract) this.refreshContractStatus(now);
      return { ok: false, reason: 'contract-expired' };
    }
    const previousClub = this.clubId;
    this.contract = { ...this.contract, status: 'terminated', terminatedAt: new Date(now).toISOString() };
    this.clubId = null;
    for (const offer of this.offers.values()) if (offer.status === 'pending') offer.status = 'cancelled';
    this.history.push({ type: 'termination', clubId: previousClub, date: new Date(now).toISOString() });
    this.persist();
    return { ok: true, previousClub, contract: { ...this.contract } };
  }

  signContract({ clubId, salary = 0, durationDays = 30, signedAt = new Date().toISOString() } = {}) {
    const club = idOf(clubId);
    const wage = nonNegativeInt(salary);
    const days = Math.max(1, Math.min(3650, nonNegativeInt(durationDays, 30) || 30));
    const startMs = timestamp(signedAt);
    if (!club) return { ok: false, reason: 'invalid-club' };
    if (startMs === null) return { ok: false, reason: 'invalid-date' };
    const current = this.getContractStatus(startMs);
    if (current && !current.expired) return { ok: false, reason: 'active-contract' };
    const start = new Date(startMs);
    const expires = new Date(startMs + days * 86400000);
    this.clubId = club;
    this.contract = { clubId: club, salary: wage, signedAt: start.toISOString(), expiresAt: expires.toISOString(), status: 'active' };
    this.history.push({ type: 'signing', clubId: club, date: start.toISOString(), salary: wage });
    this.persist();
    return { ok: true, contract: { ...this.contract } };
  }

  makeOffer({ fromClubId, salary = 0, fee = 0, expiresAt = null } = {}) {
    const from = idOf(fromClubId);
    if (!from || !this.contract || this.getContractStatus().expired) return { ok: false, reason: 'no-current-contract' };
    if (from === this.clubId) return { ok: false, reason: 'same-club' };
    const expiry = expiresAt == null ? null : timestamp(expiresAt);
    if (expiresAt != null && expiry === null) return { ok: false, reason: 'invalid-expiry' };
    if (expiry !== null && expiry <= Date.now()) return { ok: false, reason: 'offer-expired' };
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
    this.persist();
    return { ok: true, offer: { ...offer } };
  }

  negotiate(offerId, { salary, fee } = {}, at = Date.now()) {
    const offer = this.offers.get(idOf(offerId));
    if (!offer || offer.status !== 'pending') return { ok: false, reason: 'offer-unavailable' };
    const now = timestamp(at);
    if (now === null) return { ok: false, reason: 'invalid-date' };
    if (offer.expiresAt && timestamp(offer.expiresAt) <= now) {
      offer.status = 'expired';
      this.persist();
      return { ok: false, reason: 'offer-expired' };
    }
    if (salary !== undefined && !Number.isFinite(Number(salary))) return { ok: false, reason: 'invalid-salary' };
    if (fee !== undefined && !Number.isFinite(Number(fee))) return { ok: false, reason: 'invalid-fee' };
    if (salary !== undefined) offer.salary = nonNegativeInt(salary);
    if (fee !== undefined) offer.fee = nonNegativeInt(fee);
    this.persist();
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
      offer.status = 'expired';
      this.persist();
      return { ok: false, reason: 'offer-expired' };
    }
    if (offer.fromClubId === this.clubId) return { ok: false, reason: 'same-club' };
    if (this.wallet < offer.fee) return { ok: false, reason: 'insufficient-funds' };
    const previousClub = this.clubId;
    const signedAt = new Date(now).toISOString();
    this.wallet -= offer.fee;
    this.clubId = offer.fromClubId;
    this.contract = {
      clubId: offer.fromClubId,
      salary: offer.salary,
      signedAt,
      expiresAt: new Date(now + 180 * 86400000).toISOString(),
      status: 'active'
    };
    offer.status = 'accepted';
    this.history.push({ type: 'transfer', from: previousClub, to: this.clubId, fee: offer.fee, date: signedAt });
    this.persist();
    return { ok: true, clubId: this.clubId, wallet: this.wallet, contract: { ...this.contract } };
  }

  rejectOffer(offerId) {
    const offer = this.offers.get(idOf(offerId));
    if (!offer || offer.status !== 'pending') return false;
    offer.status = 'rejected';
    this.persist();
    return true;
  }

  recordMatch({ result, goals = 0, assists = 0, cleanSheet = false, matchId = null } = {}) {
    if (!['win', 'draw', 'loss'].includes(result)) return { ok: false, reason: 'invalid-result' };
    const id = typeof matchId === 'string' ? matchId.trim().slice(0, 64) : '';
    if (id && this.processedMatchIds.includes(id)) return { experience: 0, coins: 0, duplicate: true };
    const scored = nonNegativeInt(goals, 0, 99);
    const assisted = nonNegativeInt(assists, 0, 99);
    const points = (result === 'win' ? 30 : result === 'draw' ? 15 : 5) + scored * 12 + assisted * 8 + (cleanSheet ? 8 : 0);
    const reward = Math.floor(points / 5);
    this.wallet = Math.min(1_000_000_000, this.wallet + reward);
    this.history.push({ type: 'match', ...(id ? { matchId: id } : {}), result, goals: scored, assists: assisted, cleanSheet: !!cleanSheet, reward, date: new Date().toISOString() });
    if (id) { this.processedMatchIds.push(id); this.processedMatchIds = this.processedMatchIds.slice(-2000); }
    this.persist();
    return { experience: points, coins: reward };
  }
}
