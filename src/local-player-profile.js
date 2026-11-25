const STORAGE_KEY = 'fpro.local-player-profile.v1';
function createPlayerNumber() {
  const bytes = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else throw new Error('SECURE_RANDOM_UNAVAILABLE');
  const limit = Math.floor(0x1_0000_0000 / 900000) * 900000;\n  let value = bytes[0];\n  while (value >= limit) { globalThis.crypto.getRandomValues(bytes); value = bytes[0]; }\n  return String(100000 + (value % 900000));
}
function createLocalProfileKey() { if (!globalThis.crypto?.randomUUID) throw new Error('SECURE_RANDOM_UNAVAILABLE'); return globalThis.crypto.randomUUID(); }\nfunction cleanDisplayName(value) { return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 32) : ''; }
export class LocalPlayerProfile {
  constructor({ storage = globalThis.localStorage, now = () => new Date().toISOString(), idFactory = createPlayerNumber } = {}) { this.storage = storage || null; this.now = now; this.idFactory = idFactory; }
  load() {
    if (!this.storage) return null;
    try { const parsed = JSON.parse(this.storage.getItem(STORAGE_KEY) || 'null'); if (!parsed || parsed.version !== 1 || !parsed.profile || typeof parsed.profile.id !== 'string' || typeof parsed.profile.displayName !== 'string') return null; return structuredClone(parsed.profile); } catch { return null; }
  }
  create({ displayName } = {}) {
    if (!this.storage) throw new Error('LOCAL_PROFILE_STORAGE_UNAVAILABLE');
    if (this.load()) throw new Error('LOCAL_PROFILE_ALREADY_EXISTS');
    const name = cleanDisplayName(displayName); if (!name) throw new Error('INVALID_PLAYER_DISPLAY_NAME');
    const timestamp = this.now();
    const playerNumber = String(this.idFactory());
    if (!/^\d{6}$/.test(playerNumber)) throw new Error('INVALID_PLAYER_ID');
    const profile = { id: `FRP-${playerNumber}`, localProfileKey: createLocalProfileKey(), identityStatus: 'local-pending', displayName: name, createdAt: timestamp, updatedAt: timestamp, cloudSync: { status: 'not-linked', googleLinked: false } };
    this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, profile })); return structuredClone(profile);
  }
  update(patch = {}) {
    if (!this.storage) throw new Error('LOCAL_PROFILE_STORAGE_UNAVAILABLE');
    const current = this.load(); if (!current) throw new Error('LOCAL_PROFILE_NOT_FOUND');
    const next = { ...current };
    if (Object.hasOwn(patch, 'displayName')) { const name = cleanDisplayName(patch.displayName); if (!name) throw new Error('INVALID_PLAYER_DISPLAY_NAME'); next.displayName = name; }
    next.updatedAt = this.now(); this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, profile: next })); return structuredClone(next);
  }
  async reserveWithServer({ fetchImpl = globalThis.fetch, endpoint = '/api/player-identities/reserve' } = {}) {
    const current = this.load();
    if (!current) throw new Error('LOCAL_PROFILE_NOT_FOUND');
    if (current.identityStatus === 'reserved') return current;
    if (typeof fetchImpl !== 'function') throw new Error('PLAYER_ID_SERVER_UNAVAILABLE');
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ localProfileKey: current.localProfileKey })
    });
    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok || typeof payload.playerId !== 'string' || !/^FRP-\\d{6}$/.test(payload.playerId) || payload.reserved !== true) throw new Error(payload.error || 'PLAYER_ID_RESERVATION_FAILED');
    const next = { ...current, id: payload.playerId, identityStatus: 'reserved', updatedAt: this.now() };
    this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, profile: next }));
    return structuredClone(next);
  }
  clear() { if (!this.storage) return false; this.storage.removeItem(STORAGE_KEY); return true; }
}
export { STORAGE_KEY as LOCAL_PLAYER_PROFILE_STORAGE_KEY };
