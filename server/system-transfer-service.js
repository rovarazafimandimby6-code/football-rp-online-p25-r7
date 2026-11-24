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

  inspect({ fromClubId, toClubId, playerId, fee }) {
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
        !Number.isFinite(expiresAt) || expiresAt <= this.now()) return { ok:false, reason:'inactive-contract' };
    if (to.roster.length >= to.capacity) return { ok:false, reason:'roster-full' };
    if (!validFee(fee)) return { ok:false, reason:'invalid-fee' };
    return { ok:true, from, to, player };
  }

  transfer({ id, fromClubId, toClubId, playerId, fee }) {
    const transferId = String(id || '').trim();
    const fromId = safeId(fromClubId), toId = safeId(toClubId), player = safeId(playerId);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,95}$/.test(transferId) ||
        !fromId || !toId || !player || !validFee(fee)) return { ok:false, reason:'invalid-request' };
    const existing = this.state.transfers.find(item => item.id === transferId);
    if (existing) {
      if (existing.fromClubId !== fromId || existing.toClubId !== toId ||
          existing.playerId !== player || existing.fee !== fee) return { ok:false, reason:'idempotency-conflict' };
      return this.process(existing.id);
    }
    const check = this.inspect({ fromClubId:fromId, toClubId:toId, playerId:player, fee });
    if (!check.ok) return check;
    const next = structuredClone(this.state);
    next.transfers.push({
      id:transferId, playerId:player, fromClubId:fromId, toClubId:toId, fee,
      createdAt:this.now(), status:'pending', attempts:0, lastError:null
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

  processPending() {
    const pending = this.state.transfers.filter(item => item.status === 'pending').map(item => item.id);
    const results = pending.map(id => this.process(id));
    return { ok:results.every(item => item.ok), processed:results.length, results };
  }
}
