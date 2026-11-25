const STORAGE_KEY = 'fpro.local-player-profile.v1';
function createPlayerNumber() {
  const bytes = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else throw new Error('SECURE_RANDOM_UNAVAILABLE');
  const limit = Math.floor(0x1_0000_0000 / 900000) * 900000;
  let value = bytes[0];
  while (value >= limit) { globalThis.crypto.getRandomValues(bytes); value = bytes[0]; }
  return String(100000 + (value % 900000));
}
function createLocalProfileKey() { if (!globalThis.crypto?.randomUUID) throw new Error('SECURE_RANDOM_UNAVAILABLE'); return globalThis.crypto.randomUUID(); }
function createLocalProofSecret() { if (!globalThis.crypto?.getRandomValues) throw new Error('SECURE_RANDOM_UNAVAILABLE'); const bytes = new Uint8Array(32); globalThis.crypto.getRandomValues(bytes); return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''); }
function cleanDisplayName(value) { return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 32) : ''; }
export class LocalPlayerProfile {
  constructor({ storage = globalThis.localStorage, now = () => new Date().toISOString(), idFactory = createPlayerNumber } = {}) { this.storage = storage || null; this.now = now; this.idFactory = idFactory; }
  load() {
    if (!this.storage) return null;
    try { const parsed = JSON.parse(this.storage.getItem(STORAGE_KEY) || 'null'); if (!parsed || parsed.version !== 1 || !parsed.profile || typeof parsed.profile.id !== 'string' || typeof parsed.profile.displayName !== 'string') return null; const profile = parsed.profile; if (!/^[a-f0-9]{64}$/i.test(profile.localProofSecret || '')) { profile.localProofSecret = createLocalProofSecret(); this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, profile })); } return structuredClone(profile); } catch { return null; }
  }
  create({ displayName } = {}) {
    if (!this.storage) throw new Error('LOCAL_PROFILE_STORAGE_UNAVAILABLE');
    if (this.load()) throw new Error('LOCAL_PROFILE_ALREADY_EXISTS');
    const name = cleanDisplayName(displayName); if (!name) throw new Error('INVALID_PLAYER_DISPLAY_NAME');
    const timestamp = this.now();
    const playerNumber = String(this.idFactory());
    if (!/^\d{6}$/.test(playerNumber)) throw new Error('INVALID_PLAYER_ID');
    const profile = { id: `FRP-${playerNumber}`, localProfileKey: createLocalProfileKey(), localProofSecret: createLocalProofSecret(), identityStatus: 'local-pending', displayName: name, createdAt: timestamp, updatedAt: timestamp, cloudSync: { status: 'not-linked', googleLinked: false } };
    this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, profile })); return structuredClone(profile);
  }
  update(patch = {}) {
    if (!this.storage) throw new Error('LOCAL_PROFILE_STORAGE_UNAVAILABLE');
    const current = this.load(); if (!current) throw new Error('LOCAL_PROFILE_NOT_FOUND');
    const next = { ...current };
    if (Object.hasOwn(patch, 'displayName')) { const name = cleanDisplayName(patch.displayName); if (!name) throw new Error('INVALID_PLAYER_DISPLAY_NAME'); next.displayName = name; }
    next.updatedAt = this.now(); this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, profile: next })); return structuredClone(next);
  }
  adoptFromServer({ accountId, playerId, localProfileKey, localProofSecret, createdAt, displayName } = {}) {
    if (!this.storage) throw new Error('LOCAL_PROFILE_STORAGE_UNAVAILABLE');
    if (this.load()) throw new Error('LOCAL_PROFILE_ALREADY_EXISTS');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid.test(accountId || '') || !uuid.test(localProfileKey || '')
      || !/^FRP-\d{6}$/.test(playerId || '') || !/^[a-f0-9]{64}$/i.test(localProofSecret || '')) {
      throw new Error('INVALID_LOCAL_PROFILE_REPLICA');
    }
    const timestamp = typeof createdAt === 'string' && Number.isFinite(Date.parse(createdAt)) ? createdAt : this.now();
    const profile = {
      id: playerId, localProfileKey, localProofSecret, accountId,
      identityStatus: 'reserved', displayName: cleanDisplayName(displayName) || playerId,
      createdAt: timestamp, updatedAt: this.now(),
      cloudSync: { status: 'linked', googleLinked: true }
    };
    this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, profile }));
    return structuredClone(profile);
  }
  async reserveWithServer({ fetchImpl = globalThis.fetch, endpoint = '/api/player-identities/reserve' } = {}) {
    const current = this.load();
    if (!current) throw new Error('LOCAL_PROFILE_NOT_FOUND');
    if (typeof fetchImpl !== 'function') throw new Error('PLAYER_ID_SERVER_UNAVAILABLE');
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ localProfileKey: current.localProfileKey, localProofSecret: current.localProofSecret })
    });
    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok || typeof payload.playerId !== 'string' || !/^FRP-\d{6}$/.test(payload.playerId) || typeof payload.accountId !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.accountId) || payload.reserved !== true) throw new Error(payload.error || 'PLAYER_ID_RESERVATION_FAILED');
    const next = { ...current, id: payload.playerId, accountId: payload.accountId, identityStatus: 'reserved', updatedAt: this.now() };
    this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, profile: next }));
    return structuredClone(next);
  }
  clear() { if (!this.storage) return false; this.storage.removeItem(STORAGE_KEY); return true; }
}
export { STORAGE_KEY as LOCAL_PLAYER_PROFILE_STORAGE_KEY };
