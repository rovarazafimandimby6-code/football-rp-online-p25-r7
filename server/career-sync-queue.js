import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAYER_ID_RE = /^FRP-[0-9]{6}$/;
const clean = value => String(value ?? '').replace(/[<>\x00-\x1f]/g, '').trim().slice(0, 64);

/**
 * Durable local outbox for server-finalized career events.
 * Entries are immutable until explicitly acknowledged after a successful remote insert.
 */
export class JsonCareerSyncQueue {
  constructor(directory, { maxPending = 10_000, now = () => Date.now() } = {}) {
    this.directory = path.resolve(directory);
    this.file = path.join(this.directory, 'pending-career-sync.json');
    this.maxPending = Math.max(100, Math.min(100_000, Math.floor(maxPending) || 10_000));
    this.now = now;
    mkdirSync(this.directory, { recursive: true });
    this.state = this.read();
  }

  read() {
    try {
      const value = JSON.parse(readFileSync(this.file, 'utf8'));
      if (!value || value.version !== 1 || !Array.isArray(value.pending)) throw new Error('bad schema');
      const pending = value.pending.filter(item => this.valid(item));
      if (pending.length !== value.pending.length) throw new Error('invalid queue entry');
      const keys = new Set();
      for (const item of pending) {
        const key = this.key(item.accountId, item.matchId);
        if (keys.has(key)) throw new Error('duplicate queue entry');
        keys.add(key);
      }
      return { version: 1, pending };
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, pending: [] };
      throw new Error('CAREER_SYNC_QUEUE_CORRUPT');
    }
  }

  valid(item) {
    return Boolean(item && UUID_RE.test(item.accountId || '') && PLAYER_ID_RE.test(item.playerId || '') &&
      typeof item.matchId === 'string' && item.matchId.length > 0 && item.matchId.length <= 64 &&
      Number.isSafeInteger(item.queuedAt) && item.queuedAt >= 0 &&
      item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload) &&
      item.payload.matchId === item.matchId && ['win', 'draw', 'loss'].includes(item.payload.result));
  }

  key(accountId, matchId) { return accountId + ':' + matchId; }

  persist() {
    const temporary = this.file + '.' + process.pid + '.' + randomUUID() + '.tmp';
    try {
      writeFileSync(temporary, JSON.stringify(this.state), { mode: 0o600 });
      renameSync(temporary, this.file);
    } catch (error) {
      try { unlinkSync(temporary); } catch {}
      throw error;
    }
  }

  enqueue({ accountId, playerId, matchId, payload } = {}) {
    const item = { accountId, playerId, matchId: clean(matchId), queuedAt: this.now(), payload: structuredClone(payload) };
    if (!this.valid(item)) throw new Error('INVALID_CAREER_SYNC_EVENT');
    const key = this.key(item.accountId, item.matchId);
    const existing = this.state.pending.find(entry => this.key(entry.accountId, entry.matchId) === key);
    if (existing) {
      if (existing.playerId !== item.playerId) throw new Error('CAREER_SYNC_IDENTITY_CONFLICT');
      return { queued: false, duplicate: true, pending: this.state.pending.length };
    }
    if (this.state.pending.length >= this.maxPending) throw new Error('CAREER_SYNC_QUEUE_FULL');
    const previous = this.state;
    this.state = { version: 1, pending: [...previous.pending, item] };
    try { this.persist(); }
    catch (error) { this.state = previous; throw error; }
    return { queued: true, duplicate: false, pending: this.state.pending.length };
  }

  listPending({ limit = 100 } = {}) {
    const safeLimit = Number.isSafeInteger(limit) ? Math.max(1, Math.min(500, limit)) : 100;
    return this.state.pending.slice(0, safeLimit).map(item => structuredClone(item));
  }

  acknowledge(accountId, matchId) {
    const key = this.key(accountId, matchId);
    const index = this.state.pending.findIndex(item => this.key(item.accountId, item.matchId) === key);
    if (index < 0) return { acknowledged: false, pending: this.state.pending.length };
    const previous = this.state;
    this.state = { version: 1, pending: previous.pending.filter((_, i) => i !== index) };
    try { this.persist(); }
    catch (error) { this.state = previous; throw error; }
    return { acknowledged: true, pending: this.state.pending.length };
  }

  get pendingCount() { return this.state.pending.length; }
}
