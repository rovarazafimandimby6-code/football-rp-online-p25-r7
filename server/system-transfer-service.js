import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const safeId = value => String(value ?? '').trim().slice(0, 48);
const validFee = value => Number.isSafeInteger(value) && value > 0 && value <= 1_000_000_000;

/**
 * Durable saga for system-player transfers.
 * The roster move is persisted first; the accounting journal is then replayed
 * with deterministic IDs. Club market budgets are deliberately not mutated here.
 */
export class P27SystemTransferService {
  constructor(directory, { clubManager, financeService, now = () => Date.now() } = {}) {
    if (!clubManager || typeof clubManager.transferPlayer !== 'function') throw new Error('CLUB_MANAGER_REQUIRED');
    if (!financeService || typeof financeService.journalTransferFee !== 'function') throw new Error('CLUB_FINANCE_SERVICE_REQUIRED');
    this.directory = path.resolve(directory);
    this.file = path.join(this.directory, 'system-transfer-outbox.json');
    this.clubManager = clubManager;
    this.financeService = financeService;
    this.now = now;
    mkdirSync(this.directory, { recursive: true });
    this.state = this.load();
  }

  load() {
    try {
      const value = JSON.parse(readFileSync(this.file, 'utf8'));
      if (value?.version !== 1 || !Array.isArray(value.transfers)) throw new Error('schema');
      const ids = new Set();
      for (const item of value.transfers) {
        if (!item || typeof item.id !== 'string' || ids.has(item.id) ||
            !['pending','completed','failed'].includes(item.status) ||
            !validFee(item.fee) || !Number.isSafeInteger(item.createdAt) ||
            !item.playerId || !item.fromClubId || !item.toClubId) throw new Error('entry');
        ids.add(item.id);
      }
      return value;
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, transfers: [] };
      throw new Error('SYSTEM_TRANSFER_OUTBOX_CORRUPT');
    }
  }

  persist(next) {
    const temp = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(next), { mode: 0o600 });
      renameSync(temp, this.file);
      this.state = next;
      return true;
    } catch {
      try { unlinkSync(temp); } catch {}
      return false;
    }
  }

  inspect({ fromClubId, toClubId, playerId, fee, now = this.now() }) {
    const from = this.clubManager.getClub(fromClubId);
    const to = this.clubManager.getClub(toClubId);
    if (!from || !to || fromClubId === toClubId) return { ok:false, reason:'invalid-clubs' };
    if (!['D1','D2','D3','D4','D5'].includes(from.division) ||
        !['D1','D2','D3','D4','D5'].includes(to.division)) return { ok:false, reason:'invalid-division' };
    const memberships = [from, to, ...this.clubManager.listClubs().filter(c => c.id !== from.id && c.id !== to.id)]
      .flatMap(club => club.roster.filter(player => player.id === playerId).map(player => ({ club, player })));
    if (memberships.length !== 1) return { ok:false, reason:memberships.length ? 'duplicate-player' : 'player-not-found' };
    const membership = memberships[0];
    if (membership.club.id !== from.id) return { ok:false, reason:'player-not-at-selling-club' };
    const player = membership.player;
    if (player.playerType !== 'system' || player.id.startsWith('human-')) return { ok:false, reason:'human-career-managed' };
    const expiresAt = Date.parse(player.contract?.expiresAt || '');
    if (player.contract?.status !== 'active' || player.contract?.clubId !== from.id ||
        !Number.isFinite(expiresAt) || expiresAt <= now) return { ok:false, reason:'inactive-contract' };
    if (to.roster.length >= to.capacity) return { ok:false, reason:'roster-full' };
    if (!validFee(fee)) return { ok:false, reason:'invalid-fee' };
    return { ok:true, from, to, player };
  }

  transfer({ id, fromClubId, toClubId, playerId, fee, now = this.now() }) {
    const transferId = String(id || '').trim();
    const fromId = safeId(fromClubId), toId = safeId(toClubId), player = safeId(playerId);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,95}$/.test(transferId) ||
        !fromId || !toId || !player || !validFee(fee) || !Number.isSafeInteger(now) || now < 0)
      return { ok:false, reason:'invalid-request' };
    const existing = this.state.transfers.find(item => item.id === transferId);
    if (existing) {
      if (existing.fromClubId !== fromId || existing.toClubId !== toId ||
          existing.playerId !== player || existing.fee !== fee) return { ok:false, reason:'idempotency-conflict' };
      return this.process(existing.id);
    }
    const check = this.inspect({ fromClubId:fromId, toClubId:toId, playerId:player, fee, now });
    if (!check.ok) return check;
    const next = structuredClone(this.state);
    next.transfers.push({
      id:transferId, playerId:player, fromClubId:fromId, toClubId:toId, fee,
      createdAt:now, status:'pending', attempts:0, lastError:null
    });
    if (!this.persist(next)) return { ok:false, reason:'outbox-persistence-failed' };
    return this.process(transferId);
  }

  process(id) {
    const record = this.state.transfers.find(item => item.id === id);
    if (!record) return { ok:false, reason:'transfer-not-found' };
    if (record.status === 'completed') return { ok:true, alreadyCompleted:true, transfer:{...record} };
    const from = this.clubManager.getClub(record.fromClubId);
    const to = this.clubManager.getClub(record.toClubId);
    if (!from || !to) return this.fail(record, 'club-not-found');
    const atSource = from.roster.some(item => item.id === record.playerId);
    const atTarget = to.roster.some(item => item.id === record.playerId);
    if (atSource && !atTarget) {
      const moved = this.clubManager.transferPlayer(from.id, to.id, record.playerId);
      if (!moved.ok) return this.fail(record, moved.reason || 'roster-transfer-failed');
    } else if (!(atTarget && !atSource)) {
      return this.fail(record, 'roster-state-conflict');
    }
    // Finance convention: fromClubId pays and toClubId receives.
    // The buying club pays; the selling club receives.
    const finance = this.financeService.journalTransferFee({
      id:record.id, fromClubId:record.toClubId, toClubId:record.fromClubId,
      fee:record.fee, at:record.createdAt
    });
    if (!finance.ok) return this.fail(record, finance.reason || 'finance-settlement-pending');
    const next = structuredClone(this.state);
    const completed = next.transfers.find(item => item.id === id);
    completed.status = 'completed';
    completed.completedAt = this.now();
    completed.lastError = null;
    if (!this.persist(next)) return { ok:false, reason:'outbox-checkpoint-pending', transfer:{...record} };
    return { ok:true, transfer:{...completed}, finance };
  }

  fail(record, reason) {
    const next = structuredClone(this.state);
    const item = next.transfers.find(entry => entry.id === record.id);
    item.status = 'pending';
    item.attempts = Math.min(1_000_000, (item.attempts || 0) + 1);
    item.lastError = String(reason || 'transfer-failed').slice(0, 120);
    item.lastAttemptAt = this.now();
    this.persist(next);
    return { ok:false, reason:item.lastError, pending:true, transfer:{...item} };
  }

  simulateMarket({ windowId, maxTransfers = 5, now = this.now() } = {}) {
    const window = String(windowId || '').trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,48}$/.test(window) ||
        !Number.isInteger(maxTransfers) || maxTransfers < 1 || maxTransfers > 30 ||
        !Number.isSafeInteger(now) || now < 0) return { ok:false, reason:'invalid-market-window', transfers:[] };

    const clubs = this.clubManager.listClubs().sort((a,b) => a.id.localeCompare(b.id));
    const divisionRank = new Map(['D1','D2','D3','D4','D5'].map((id,index) => [id,index]));
    const candidates = [];
    for (const seller of clubs) {
      if (!divisionRank.has(seller.division)) continue;
      const sellerCounts = new Map();
      for (const player of seller.roster) {
        if (player.playerType !== 'system') continue;
        sellerCounts.set(player.role || 'OTHER',(sellerCounts.get(player.role || 'OTHER') || 0)+1);
      }
      for (const player of seller.roster) {
        if (player.playerType !== 'system' || player.contract?.status !== 'active') continue;
        const expiresAt = Date.parse(player.contract.expiresAt || '');
        if (!Number.isFinite(expiresAt) || expiresAt <= now + 14*86400000) continue;
        const role = player.role || 'OTHER';
        if ((sellerCounts.get(role) || 0) < 3) continue;
        for (const buyer of clubs) {
          if (buyer.id === seller.id || !divisionRank.has(buyer.division) ||
              Math.abs(divisionRank.get(buyer.division)-divisionRank.get(seller.division)) > 1 ||
              buyer.roster.length >= buyer.capacity) continue;
          const buyerRoleCount = buyer.roster.filter(item => (item.role || 'OTHER') === role).length;
          if (buyerRoleCount >= 2) continue;
          const rating = Number.isFinite(player.rating) ? Math.max(1,Math.min(99,Math.round(player.rating))) : 1;
          const fee = Math.max(500,Math.round(rating*rating*1.5));
          const available = this.financeService.store?.balance?.(buyer.id);
          if (Number.isFinite(available) && available < fee) continue;
          const gap = Math.max(0, (Number(buyer.rating)||0)-(Number(seller.rating)||0));
          const score = (2-buyerRoleCount)*1000 + gap*10 + rating;
          const id = `ai-market-${window}-${player.id}-${buyer.id}`.slice(0,96);
          candidates.push({ id, playerId:player.id, fromClubId:seller.id, toClubId:buyer.id, fee, score, rating, role });
        }
      }
    }
    candidates.sort((a,b) => b.score-a.score || a.playerId.localeCompare(b.playerId) ||
      a.fromClubId.localeCompare(b.fromClubId) || a.toClubId.localeCompare(b.toClubId));
    const results = [];
    const usedPlayers = new Set();
    const usedBuyers = new Set();
    const sellerRoleSales = new Map();
    for (const candidate of candidates) {
      if (results.length >= maxTransfers) break;
      if (usedPlayers.has(candidate.playerId) || usedBuyers.has(candidate.toClubId)) continue;
      const sellerRoleKey = `${candidate.fromClubId}:${candidate.role}`;
      const initialDepth = this.clubManager.getClub(candidate.fromClubId)?.roster
        .filter(player => player.playerType === 'system' && (player.role || 'OTHER') === candidate.role).length || 0;
      const alreadySold = sellerRoleSales.get(sellerRoleKey) || 0;
      // Keep at least two system players in the seller's role after every accepted move.
      if (initialDepth - alreadySold <= 2) continue;
      const result = this.transfer({ ...candidate, now });
      if (!result.ok) continue;
      usedPlayers.add(candidate.playerId);
      usedBuyers.add(candidate.toClubId);
      sellerRoleSales.set(sellerRoleKey,alreadySold+1);
      results.push({ ...candidate, result });
    }
    return { ok:true, windowId:window, evaluated:candidates.length, processed:results.length, transfers:results };
  }

  processPending() {
    const pending = this.state.transfers.filter(item => item.status === 'pending').map(item => item.id);
    const results = pending.map(id => this.process(id));
    return { ok:results.every(item => item.ok), processed:results.length, results };
  }
}
