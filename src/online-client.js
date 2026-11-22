/** Minimal HTTP client for the authoritative match-room API. */
export class OnlineMatchClient {
  constructor({ baseUrl = '', fetchImpl = globalThis.fetch, storage = globalThis.sessionStorage } = {}) {
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
    this.storage = storage || null;
    this.roomId = null;
    this.token = null;
    this.playerId = null;
    this.sequence = 0;
  }

  async request(path, { method = 'GET', body, auth = false } = {}) {
    if (typeof this.fetchImpl !== 'function') throw new Error('FETCH_UNAVAILABLE');
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(auth && this.token ? { authorization: `Bearer ${this.token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 204) return null;
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP_${response.status}`);
    return data;
  }

  async createRoom(options = {}) { return this.request('/api/rooms', { method: 'POST', body: options }); }

  persistSession() {
    if (!this.storage || !this.roomId || !this.token || !this.playerId) return false;
    try { this.storage.setItem('fpro.match.session', JSON.stringify({ roomId: this.roomId, token: this.token, playerId: this.playerId })); return true; }
    catch { return false; }
  }

  restoreSession() {
    if (!this.storage) return false;
    try {
      const saved = JSON.parse(this.storage.getItem('fpro.match.session') || 'null');
      if (!saved || !/^[a-f0-9]{12}$/.test(saved.roomId) || typeof saved.token !== 'string' || !saved.token || typeof saved.playerId !== 'string' || !saved.playerId) return false;
      this.roomId = saved.roomId; this.token = saved.token; this.playerId = saved.playerId;
      return true;
    } catch { return false; }
  }
  async joinRoom(roomId, options = {}) {
    const result = await this.request(`/api/rooms/${encodeURIComponent(roomId)}/join`, { method: 'POST', body: options });
    this.roomId = roomId; this.token = result.token; this.playerId = result.playerId; this.sequence = 0;
    this.persistSession();
    return result;
  }
  async sendInput({ x = 0, z = 0, sprint = false, action = null } = {}) {
    if (!this.roomId || !this.token) throw new Error('NOT_JOINED');
    return this.request(`/api/rooms/${this.roomId}/input`, { method: 'POST', auth: true, body: { x, z, sprint, ...(action ? { action } : {}), sequence: ++this.sequence } });
  }
  async heartbeat() {
    if (!this.roomId || !this.token) throw new Error('NOT_JOINED');
    return this.request(`/api/rooms/${this.roomId}/heartbeat`, { method: 'POST', auth: true });
  }
  async getState() {
    if (!this.roomId) throw new Error('NOT_JOINED');
    return this.request(`/api/rooms/${this.roomId}`);
  }

  async pollState({ afterSequence = -1, afterEventId = 0 } = {}) {
    if (!this.roomId) throw new Error('NOT_JOINED');
    const params = new URLSearchParams({ sinceSequence: String(Math.max(-1, Math.floor(afterSequence))), afterEventId: String(Math.max(0, Math.floor(afterEventId))) });
    const delta = await this.request(`/api/rooms/${this.roomId}?${params}`);
    if (!delta) return { state: null, events: [], eventCursor: afterEventId, changed: false };
    return { state: delta.state, events: delta.events || [], eventCursor: delta.eventCursor ?? afterEventId, changed: delta.changed === true };
  }
  async leave() {
    if (!this.roomId || !this.token) return false;
    await this.request(`/api/rooms/${this.roomId}/leave`, { method: 'POST', auth: true });
    this.roomId = null; this.token = null; this.playerId = null;
    try { this.storage?.removeItem('fpro.match.session'); } catch {}
    return true;
  }
}
