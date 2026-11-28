const TYPES = new Set(['profile_snapshot', 'career_snapshot', 'progression_snapshot', 'season_stats_snapshot']);
const MAX_PAYLOAD_BYTES = 128 * 1024;
const cleanVersion = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const emptyState = () => ({ version: 1, nextSequence: 1, serverVersion: 0, operations: [] });

function corruptState() {
  return new Error('SYNC_OUTBOX_STATE_CORRUPT');
}

function validateState(parsed, maxEntries) {
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.operations)
    || !Number.isSafeInteger(parsed.nextSequence) || parsed.nextSequence < 1
    || cleanVersion(parsed.serverVersion) === null
    || parsed.operations.length > maxEntries) throw corruptState();

  const ids = new Set();
  const sequences = new Set();
  let maxSequence = 0;
  for (const row of parsed.operations) {
    if (!row || typeof row.operationId !== 'string' || row.operationId.length < 16
      || !TYPES.has(row.type) || !Number.isSafeInteger(row.sequence) || row.sequence < 1
      || !row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)
      || typeof row.createdAt !== 'string' || !Number.isSafeInteger(row.attempts) || row.attempts < 0
      || ids.has(row.operationId) || sequences.has(row.sequence)) throw corruptState();
    ids.add(row.operationId);
    sequences.add(row.sequence);
    maxSequence = Math.max(maxSequence, row.sequence);
  }
  if (parsed.nextSequence <= maxSequence) throw corruptState();
  const operations = [...parsed.operations].sort((a, b) => a.sequence - b.sequence);
  return { version: 1, nextSequence: parsed.nextSequence, serverVersion: parsed.serverVersion, operations };
}

export class PlayerSyncOutbox {
  constructor({ storage = globalThis.localStorage, key = 'fpro.player-sync-outbox.v1', now = () => new Date().toISOString(), operationIdFactory, maxEntries = 500 } = {}) {
    this.storage = storage || null;
    this.key = key;
    this.now = now;
    this.operationIdFactory = operationIdFactory || (() => globalThis.crypto.randomUUID());
    this.maxEntries = Math.max(10, Math.min(2000, Number(maxEntries) || 500));
  }

  read() {
    if (!this.storage) return emptyState();
    const raw = this.storage.getItem(this.key);
    if (raw === null) return emptyState();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw corruptState();
    }
    return validateState(parsed, this.maxEntries);
  }

  write(state) {
    if (!this.storage) throw Error('SYNC_OUTBOX_STORAGE_UNAVAILABLE');
    this.storage.setItem(this.key, JSON.stringify(state));
    return state;
  }

  enqueue(type, payload) {
    if (!TYPES.has(type)) throw Error('SYNC_OUTBOX_TYPE_INVALID');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Error('SYNC_OUTBOX_PAYLOAD_INVALID');
    const serialized = JSON.stringify(payload);
    if (!serialized || BufferSafeLength(serialized) > MAX_PAYLOAD_BYTES) throw Error('SYNC_OUTBOX_PAYLOAD_TOO_LARGE');
    const state = this.read();
    if (state.operations.length >= this.maxEntries) throw Error('SYNC_OUTBOX_FULL');
    const operationId = this.operationIdFactory();
    if (typeof operationId !== 'string' || operationId.length < 16 || state.operations.some(x => x.operationId === operationId)) {
      throw Error('SYNC_OUTBOX_OPERATION_ID_INVALID');
    }
    const operation = { operationId, type, sequence: state.nextSequence, payload: JSON.parse(serialized), createdAt: this.now(), attempts: 0 };
    state.operations.push(operation);
    state.nextSequence++;
    this.write(state);
    return structuredClone(operation);
  }

  pending(limit = 50) {
    const state = this.read();
    return structuredClone(state.operations.slice(0, Math.max(1, Math.min(200, Number(limit) || 50))));
  }

  markAttempt(operationId) {
    const state = this.read();
    const row = state.operations.find(x => x.operationId === operationId);
    if (!row) return false;
    row.attempts = Math.min(1_000_000, row.attempts + 1);
    this.write(state);
    return true;
  }

  acknowledge({ operationId, serverVersion } = {}) {
    const version = cleanVersion(serverVersion);
    if (typeof operationId !== 'string' || version === null) return false;
    const state = this.read();
    const index = state.operations.findIndex(x => x.operationId === operationId);
    // Server revisions are a single ordered stream: acknowledging a later
    // operation first would advance the revision past earlier pending work.
    if (index !== 0 || version < state.serverVersion) return false;
    state.operations.splice(index, 1);
    state.serverVersion = version;
    this.write(state);
    return true;
  }

  reconcileRemote({ serverVersion } = {}) {
    const version = cleanVersion(serverVersion);
    if (version === null) return { action: 'reject-invalid-version', serverVersion: this.read().serverVersion };
    const state = this.read();
    if (state.operations.length) return { action: 'keep-local-pending', serverVersion: state.serverVersion, pending: state.operations.length };
    if (version < state.serverVersion) return { action: 'reject-stale-remote', serverVersion: state.serverVersion };
    return { action: 'remote-may-be-applied', serverVersion: version };
  }

  status() {
    const state = this.read();
    return { state: state.operations.length ? 'pending' : 'synced', pending: state.operations.length, serverVersion: state.serverVersion, nextSequence: state.nextSequence };
  }
}

function BufferSafeLength(value) {
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(value).length : value.length * 2;
}
