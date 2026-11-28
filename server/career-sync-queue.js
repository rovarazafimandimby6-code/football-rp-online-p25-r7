import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAYER_ID_RE = /^FRP-[0-9]{6}$/;
const MATCH_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const clean = value => [...String(value ?? '').trim()].filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127 && char !== '<' && char !== '>').join('').slice(0, 64);

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
      const pending = value.pending.map(item => ({ ...item, attempts: Number.isSafeInteger(item?.attempts) && item.attempts >= 0 ? item.attempts : 0, nextAttemptAt: Number.isSafeInteger(item?.nextAttemptAt) && item.nextAttemptAt >= 0 ? item.nextAttemptAt : 0 })).filter(item => this.valid(item));
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
      typeof item.matchId === 'string' && MATCH_ID_RE.test(item.matchId) &&
      Number.isSafeInteger(item.queuedAt) && item.queuedAt >= 0 &&
      Number.isSafeInteger(item.attempts ?? 0) && (item.attempts ?? 0) >= 0 &&
      Number.isSafeInteger(item.nextAttemptAt ?? 0) && (item.nextAttemptAt ?? 0) >= 0 &&
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
    const item = { accountId, playerId, matchId, queuedAt: this.now(), attempts: 0, nextAttemptAt: 0, payload: structuredClone(payload) };
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


  listDue({ limit = 25, now = this.now() } = {}) {
    const safeLimit = Number.isSafeInteger(limit) ? Math.max(1, Math.min(100, limit)) : 25;
    const timestamp = Number.isSafeInteger(now) ? now : this.now();
    return this.state.pending.filter(item => (item.nextAttemptAt ?? 0) <= timestamp)
      .slice(0, safeLimit).map(item => structuredClone(item));
  }

  markAttempt(accountId, matchId) {
    const key = this.key(accountId, matchId);
    const index = this.state.pending.findIndex(item => this.key(item.accountId, item.matchId) === key);
    if (index < 0) return { updated: false, retryAt: null };
    const previous = this.state;
    const item = previous.pending[index];
    const attempts = (item.attempts ?? 0) + 1;
    const delay = Math.min(6 * 60 * 60_000, 15_000 * (2 ** Math.min(attempts, 10)));
    const retryAt = this.now() + delay;
    const pending = previous.pending.map((entry, i) => i === index
      ? { ...entry, attempts, lastAttemptAt: this.now(), nextAttemptAt: retryAt }
      : entry);
    this.state = { version: 1, pending };
    try { this.persist(); }
    catch (error) { this.state = previous; throw error; }
    return { updated: true, attempts, retryAt };
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


/** New events share the career store transaction; this adapter also drains the legacy outbox. */
export class CareerStoreSyncQueue {
  constructor(careerStore, { legacyQueue = null, now = () => Date.now() } = {}) {
    if (!careerStore || typeof careerStore.listDueCloudMatches !== 'function') throw new Error('CAREER_STORE_SYNC_QUEUE_REQUIRED');
    this.careerStore = careerStore;
    this.legacyQueue = legacyQueue;
    this.now = now;
  }
  listPending({ limit = 100 } = {}) {
    const integrated = this.careerStore.listPendingCloudMatches({ limit });
    const keys = new Set(integrated.map(item => item.accountId + ':' + item.matchId));
    const legacy = this.legacyQueue?.listPending({ limit }) || [];
    return [...integrated, ...legacy.filter(item => !keys.has(item.accountId + ':' + item.matchId))].slice(0, limit);
  }
  listDue({ limit = 25, now = this.now() } = {}) {
    const integrated = this.careerStore.listDueCloudMatches({ limit, now });
    const keys = new Set(integrated.map(item => item.accountId + ':' + item.matchId));
    const legacy = this.legacyQueue?.listDue({ limit, now }) || [];
    return [...integrated, ...legacy.filter(item => !keys.has(item.accountId + ':' + item.matchId))].slice(0, limit);
  }
  markAttempt(accountId, matchId) {
    const integrated = this.careerStore.listPendingCloudMatches({ limit:10_000 }).some(item => item.accountId === accountId && item.matchId === matchId);
    return integrated ? this.careerStore.markCloudMatchAttempt(accountId, matchId, this.now()) : this.legacyQueue?.markAttempt(accountId, matchId);
  }
  acknowledge(accountId, matchId) {
    const integrated = this.careerStore.listPendingCloudMatches({ limit:10_000 }).some(item => item.accountId === accountId && item.matchId === matchId);
    return integrated ? this.careerStore.acknowledgeCloudMatch(accountId, matchId) : this.legacyQueue?.acknowledge(accountId, matchId);
  }
  get pendingCount() { return this.careerStore.pendingCloudMatchCount + (this.legacyQueue?.pendingCount || 0); }
}
