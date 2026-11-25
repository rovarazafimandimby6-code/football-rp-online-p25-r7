/** HTTP client for persistent player accounts; separate from short-lived match-room tokens. */
export class OnlineAccountClient {
  constructor({ baseUrl = '', fetchImpl = globalThis.fetch, storage = globalThis.localStorage } = {}) {
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
    this.storage = storage || null;
    this.token = null;
    this.account = null;
  }

  async request(path, { method = 'GET', body, auth = false } = {}) {
    if (typeof this.fetchImpl !== 'function') throw new Error('FETCH_UNAVAILABLE');
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(auth && this.token ? { authorization: `Bearer ${this.token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP_${response.status}`);
    return data;
  }

  persist() {
    if (!this.storage || !this.token || !this.account) return false;
    try { this.storage.setItem('fpro.account.session', JSON.stringify({ token: this.token, account: this.account })); return true; }
    catch { return false; }
  }

  restoreSession() {
    if (!this.storage) return false;
    try {
      const saved = JSON.parse(this.storage.getItem('fpro.account.session') || 'null');
      if (!saved || typeof saved.token !== 'string' || saved.token.length < 32 || !saved.account || typeof saved.account.id !== 'string') return false;
      this.token = saved.token;
      this.account = saved.account;
      return true;
    } catch { return false; }
  }

  async acceptSession(result) {
    if (!result || typeof result.token !== 'string' || !result.account?.id) throw new Error('INVALID_ACCOUNT_SESSION');
    this.token = result.token;
    this.account = result.account;
    this.persist();
    return this.account;
  }

  async register({ username, password, displayName } = {}) {
    return this.acceptSession(await this.request('/api/accounts/register', { method: 'POST', body: { username, password, displayName } }));
  }

  async login({ username, password } = {}) {
    return this.acceptSession(await this.request('/api/accounts/login', { method: 'POST', body: { username, password } }));
  }

  async refresh() {
    if (!this.token) throw new Error('NOT_AUTHENTICATED');
    const result = await this.request('/api/accounts/me', { auth: true });
    this.account = result.account;
    this.persist();
    return this.account;
  }

  async getProfile() {
    if (!this.token) throw new Error('NOT_AUTHENTICATED');
    return this.request('/api/profile', { auth: true });
  }

  async getAccountSnapshot() {
    if (!this.token) throw new Error('NOT_AUTHENTICATED');
    const result = await this.request('/api/account/snapshot', { auth: true });
    if (!result?.snapshot || result.snapshot.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(result.revision || '') || result.authority !== 'server-confirmed') throw new Error('INVALID_ACCOUNT_SNAPSHOT');
    return result;
  }

  async saveProfile(profile) {
    if (!this.token) throw new Error('NOT_AUTHENTICATED');
    return this.request('/api/profile', { method: 'PUT', auth: true, body: { profile } });
  }

  async getProgression() {
    if (!this.token) throw new Error('NOT_AUTHENTICATED');
    return this.request('/api/progression', { auth: true });
  }

  async trainAttribute(attribute, amount = 1) {
    if (!this.token) throw new Error('NOT_AUTHENTICATED');
    return this.request('/api/progression', { method: 'POST', auth: true, body: { action: 'train', attribute, amount } });
  }

  async practiceAttribute(attribute, amount = 1) {
    if (!this.token) throw new Error('NOT_AUTHENTICATED');
    return this.request('/api/progression', { method: 'POST', auth: true, body: { action: 'practice', attribute, amount } });
  }

  async logout() {
    if (!this.token) return false;
    try { await this.request('/api/accounts/logout', { method: 'POST', auth: true }); }
    finally {
      this.token = null;
      this.account = null;
      try { this.storage?.removeItem('fpro.account.session'); } catch {}
    }
    return true;
  }
}
