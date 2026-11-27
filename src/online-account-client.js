/** HTTP client for persistent player accounts; separate from short-lived match-room tokens. */
function recoverySnapshotMissingSections(snapshot) {
  const missing = [];
  const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const isCount = value => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000;
  const isMatch = match => isObject(match) && typeof match.matchId === 'string'
    && match.matchId.length > 0 && match.matchId.length <= 64
    && ['win','draw','loss'].includes(match.result);
  const totals = value => isObject(value) && isCount(value.matches);

  const profile = snapshot?.profile;
  const identity = profile?.identity;
  const appearance = profile?.appearance;
  if (!isObject(identity) || !isObject(appearance)
    || typeof identity.displayName !== 'string' || !identity.displayName.trim() || identity.displayName.length > 20
    || !Number.isSafeInteger(identity.number) || identity.number < 1 || identity.number > 99
    || !['left','right','both'].includes(identity.preferredFoot)
    || !['GK','DEF','MID','FWD'].includes(identity.role)
    || !['emerald','crimson','gold','violet','monochrome'].includes(appearance.kit)
    || !['light','medium','dark'].includes(appearance.skinTone)
    || !['short','curly','shaved','fade','afro'].includes(appearance.hairStyle)
    || !['dark','brown','blond'].includes(appearance.hairColor)
    || !['lean','athletic','strong'].includes(appearance.bodyBuild)
    || !['oval','round','angular','long','square'].includes(appearance.faceShape)
    || !['almond','round','hooded'].includes(appearance.eyeShape)) missing.push('profile');

  const progression = snapshot?.progression;
  const attributes = progression?.attributes;
  if (!isObject(progression) || !Number.isSafeInteger(progression.level) || progression.level < 1 || progression.level > 99
    || !isCount(progression.experience) || !isCount(progression.coins) || !Number.isSafeInteger(progression.trainingPoints)
    || progression.trainingPoints < 0 || progression.trainingPoints > 100_000
    || !isObject(attributes) || !['pace','shooting','passing','defense','stamina','control'].every(key =>
      Number.isSafeInteger(attributes[key]) && attributes[key] >= 1 && attributes[key] <= 99)
    || !Array.isArray(progression.processedMatchIds)
    || !progression.processedMatchIds.every(id => typeof id === 'string' && id.length > 0 && id.length <= 64)) missing.push('progression');

  if (!totals(snapshot?.career?.totals) || !Array.isArray(snapshot.career.matches)
    || !snapshot.career.matches.every(isMatch)) missing.push('career');
  if (!isObject(snapshot?.playerCareer) || !totals(snapshot.playerCareer.totals)
    || !Array.isArray(snapshot.playerCareer.matches) || !snapshot.playerCareer.matches.every(isMatch)
    || !(snapshot.playerCareer.player === null || isObject(snapshot.playerCareer.player))) missing.push('playerCareer');

  if (!totals(snapshot?.seasonStats?.totals) || !Array.isArray(snapshot.seasonStats.matches)
    || !snapshot.seasonStats.matches.every(match => isObject(match) && ['win','draw','loss'].includes(match.result))
    || !Array.isArray(snapshot.seasonStats.processedMatchIds)
    || !snapshot.seasonStats.processedMatchIds.every(id => typeof id === 'string' && id.length > 0 && id.length <= 64)) missing.push('seasonStats');

  const contract = snapshot?.contract;
  if (!isObject(contract) || !isCount(contract.wallet)
    || !(contract.clubId === null || typeof contract.clubId === 'string')
    || !(contract.contract === null || isObject(contract.contract))
    || !['offers','history','loanOffers','loanHistory'].every(key =>
      Array.isArray(contract[key]) && contract[key].every(isObject))) missing.push('contract');

  return missing;
}

function validProgressionResponse(result) {
  const progression = result?.progression;
  const attributes = progression?.attributes;
  const count = value => Number.isSafeInteger(value) && value >= 0;
  return Boolean(progression && typeof progression === 'object' && !Array.isArray(progression)
    && count(progression.level) && progression.level >= 1 && progression.level <= 99
    && count(progression.experience) && progression.experience <= 1_000_000_000
    && count(progression.coins) && progression.coins <= 1_000_000_000
    && count(progression.trainingPoints) && progression.trainingPoints <= 100_000
    && attributes && typeof attributes === 'object' && !Array.isArray(attributes)
    && ['pace','shooting','passing','defense','stamina','control'].every(key =>
      Number.isSafeInteger(attributes[key]) && attributes[key] >= 1 && attributes[key] <= 99)
    && Array.isArray(progression.processedMatchIds)
    && progression.processedMatchIds.every(id => typeof id === 'string' && id.length > 0 && id.length <= 64));
}

export class OnlineAccountClient {
  constructor({ baseUrl = '', fetchImpl = globalThis.fetch, storage = globalThis.localStorage } = {}) {
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
    this.storage = storage || null;
    this.token = null;
    this.account = null;
    this.cookieSession = false;
  }

  async request(path, { method = 'GET', body, auth = false } = {}) {
    if (typeof this.fetchImpl !== 'function') throw new Error('FETCH_UNAVAILABLE');
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(auth && this.token ? { authorization: `Bearer ${this.token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      credentials: 'same-origin'
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || data.reason || `HTTP_${response.status}`);
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
      this.cookieSession = false;
      return true;
    } catch { return false; }
  }

  async acceptSession(result) {
    if (!result || typeof result.token !== 'string' || !result.account?.id) throw new Error('INVALID_ACCOUNT_SESSION');
    this.token = result.token;
    this.account = result.account;
    this.cookieSession = false;
    this.persist();
    return this.account;
  }

  async register({ username, password, displayName } = {}) {
    return this.acceptSession(await this.request('/api/accounts/register', { method: 'POST', body: { username, password, displayName } }));
  }

  async login({ username, password } = {}) {
    return this.acceptSession(await this.request('/api/accounts/login', { method: 'POST', body: { username, password } }));
  }

  get hasSession() {
    return Boolean(this.token || (this.cookieSession && this.account?.id));
  }

  async resumeCookieSession() {
    if (this.token) return this.refresh();
    const result = await this.request('/api/accounts/me');
    if (!result?.account || typeof result.account.id !== 'string') throw new Error('INVALID_ACCOUNT_SESSION');
    this.account = result.account;
    this.cookieSession = true;
    return this.account;
  }

  async refresh() {
    if (!this.hasSession) return this.resumeCookieSession();
    const result = await this.request('/api/accounts/me', { auth: true });
    this.account = result.account;
    this.persist();
    return this.account;
  }

  async createLocalReplica(localProfileStore) {
    if (!this.hasSession || !/^FRP-[0-9]{6}$/.test(this.account?.playerId || '')
      || !localProfileStore || typeof localProfileStore.adoptFromServer !== 'function') {
      throw new Error('LOCAL_PROFILE_REPLICA_NOT_AVAILABLE');
    }
    const current = localProfileStore.load?.();
    if (current) {
      if (current.accountId === this.account.id && current.id === this.account.playerId) return current;
      throw new Error('LOCAL_PROFILE_ALREADY_EXISTS');
    }
    const replica = await this.request('/api/player-identities/replica', { method: 'POST', auth: true });
    if (replica?.accountId !== this.account.id || replica?.playerId !== this.account.playerId || replica?.reserved !== true) {
      throw new Error('INVALID_LOCAL_PROFILE_REPLICA_RESPONSE');
    }
    return localProfileStore.adoptFromServer(replica);
  }

  async getProfile() {
    if (!this.hasSession) throw new Error('NOT_AUTHENTICATED');
    const result = await this.request('/api/player-profile/me', { auth: true });
    if (!Number.isSafeInteger(result?.revision) || result.revision < 0 || !(result.profile === null || (result.profile && typeof result.profile === 'object' && !Array.isArray(result.profile)))) throw new Error('INVALID_PLAYER_PROFILE_RESPONSE');
    return result;
  }

  async getCareer() {
    if (!this.hasSession) throw new Error('NOT_AUTHENTICATED');
    const result = await this.request('/api/career', { auth: true });
    if (!result?.career || !result.career.totals || !Array.isArray(result.career.matches)) throw new Error('INVALID_CAREER_RESPONSE');
    return result;
  }

  async getAccountSnapshot() {
    if (!this.hasSession) throw new Error('NOT_AUTHENTICATED');
    const result = await this.request('/api/account/snapshot', { auth: true });
    if (!result?.snapshot || result.snapshot.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(result.revision || '') || result.authority !== 'server-confirmed') throw new Error('INVALID_ACCOUNT_SNAPSHOT');
    const subtle = globalThis.crypto?.subtle;
    if (!subtle || typeof TextEncoder === 'undefined') throw new Error('SNAPSHOT_VERIFICATION_UNAVAILABLE');
    const bytes = new TextEncoder().encode(JSON.stringify(result.snapshot));
    const digest = await subtle.digest('SHA-256', bytes);
    const revision = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    if (revision !== result.revision) throw new Error('INVALID_ACCOUNT_SNAPSHOT_REVISION');
    return result;
  }

  async previewAccountRecovery({ outbox, localIdentity = null, localState } = {}) {
    const result = await this.getAccountSnapshot();
    const playerId = result.snapshot.player?.playerId;
    if (!/^FRP-[0-9]{6}$/.test(playerId || '') || this.account?.playerId !== playerId) {
      return { ready: false, reason: 'ACCOUNT_PLAYER_ID_MISMATCH', revision: result.revision };
    }
    if (!localIdentity) {
      return { ready: false, reason: 'LOCAL_IDENTITY_MISSING', revision: result.revision };
    }
    if (localIdentity.id !== playerId || localIdentity.accountId !== this.account?.id) {
      return { ready: false, reason: 'LOCAL_IDENTITY_MISMATCH', revision: result.revision };
    }
    const missingSections = recoverySnapshotMissingSections(result.snapshot);
    if (missingSections.length) {
      return { ready: false, reason: 'SNAPSHOT_INCOMPLETE', missingSections, revision: result.revision };
    }
    if (!outbox || typeof outbox.status !== 'function') {
      return { ready: false, reason: 'LOCAL_OUTBOX_NOT_ASSESSED', revision: result.revision };
    }
    const pending = outbox.status().pending;
    if (!Number.isSafeInteger(pending) || pending < 0) {
      return { ready: false, reason: 'LOCAL_OUTBOX_INVALID', revision: result.revision };
    }
    if (pending > 0) return { ready: false, reason: 'LOCAL_CHANGES_PENDING', pending, revision: result.revision };
    const stateKeys = ['profile', 'career', 'progression', 'seasonStats', 'archives'];
    if (!localState || stateKeys.some(key => typeof localState[key] !== 'boolean')) {
      return { ready: false, reason: 'LOCAL_STATE_NOT_ASSESSED', revision: result.revision };
    }
    if (stateKeys.some(key => localState[key])) {
      return { ready: false, reason: 'LOCAL_DATA_PRESENT', revision: result.revision };
    }
    return {
      ready: true,
      reason: 'EXPLICIT_RESTORE_CONFIRMATION_REQUIRED',
      playerId,
      revision: result.revision,
      generatedAt: result.generatedAt || null,
      snapshot: result.snapshot
    };
  }

  async saveProfile(profile) {
    if (!this.hasSession) throw new Error('NOT_AUTHENTICATED');
    const current = await this.getProfile();
    const safeProfile = {
      identity: profile?.identity && typeof profile.identity === 'object' ? {
        displayName: profile.identity.displayName, number: profile.identity.number,
        preferredFoot: profile.identity.preferredFoot, role: profile.identity.role
      } : {},
      appearance: profile?.appearance && typeof profile.appearance === 'object' ? {
        kit: profile.appearance.kit, skinTone: profile.appearance.skinTone,
        hairStyle: profile.appearance.hairStyle, hairColor: profile.appearance.hairColor,
        bodyBuild: profile.appearance.bodyBuild,
        faceShape: profile.appearance.faceShape, eyeShape: profile.appearance.eyeShape
      } : {}
    };
    const saved = await this.request('/api/player-profile/me', { method: 'PUT', auth: true, body: { profile: safeProfile, expectedRevision: current.revision } });
    if (!Number.isSafeInteger(saved?.revision) || saved.revision <= current.revision) throw new Error('INVALID_PLAYER_PROFILE_RESPONSE');
    return saved;
  }

  enqueueProfileSnapshot(profile, outbox) {
    if (!outbox || typeof outbox.enqueue !== 'function') throw new Error('SYNC_OUTBOX_UNAVAILABLE');
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('INVALID_PROFILE');
    const snapshot = {
      identity: profile.identity && typeof profile.identity === 'object' ? {
        displayName: profile.identity.displayName, number: profile.identity.number,
        preferredFoot: profile.identity.preferredFoot, role: profile.identity.role
      } : {},
      appearance: profile.appearance && typeof profile.appearance === 'object' ? {
        kit: profile.appearance.kit, skinTone: profile.appearance.skinTone,
        hairStyle: profile.appearance.hairStyle, hairColor: profile.appearance.hairColor,
        bodyBuild: profile.appearance.bodyBuild,
        faceShape: profile.appearance.faceShape, eyeShape: profile.appearance.eyeShape
      } : {}
    };
    return outbox.enqueue('profile_snapshot', snapshot);
  }

  assertLocalIdentity(identity) {
    if (!this.hasSession) throw new Error('NOT_AUTHENTICATED');
    if (!identity || typeof identity.accountId !== 'string' || !/^FRP-[0-9]{6}$/.test(identity.id || '')
      || this.account?.id !== identity.accountId || this.account?.playerId !== identity.id) throw new Error('ACCOUNT_LOCAL_IDENTITY_MISMATCH');
    return true;
  }

  async syncPendingProfileSnapshots(outbox, { limit = 50, localIdentity } = {}) {
    this.assertLocalIdentity(localIdentity);
    if (!outbox || typeof outbox.pending !== 'function' || typeof outbox.acknowledge !== 'function'
      || typeof outbox.markAttempt !== 'function' || typeof outbox.status !== 'function') throw new Error('SYNC_OUTBOX_UNAVAILABLE');
    const pending = outbox.pending(limit);
    const result = { uploaded: 0, remaining: pending.length, blocked: 0 };
    for (const operation of pending) {
      if (operation.type !== 'profile_snapshot') { result.blocked++; break; }
      outbox.markAttempt(operation.operationId);
      const saved = await this.saveProfile(operation.payload);
      const nextVersion = saved.revision;
      if (!outbox.acknowledge({ operationId: operation.operationId, serverVersion: nextVersion })) throw new Error('SYNC_ACKNOWLEDGEMENT_FAILED');
      result.uploaded++;
    }
    result.remaining = outbox.status().pending;
    return result;
  }

  async getProgression() {
    if (!this.hasSession) throw new Error('NOT_AUTHENTICATED');
    const result = await this.request('/api/progression/me', { auth: true });
    if (!validProgressionResponse(result)) throw new Error('INVALID_PROGRESSION_RESPONSE');
    return result;
  }

  async trainAttribute(attribute, amount = 1) {
    if (!this.hasSession) throw new Error('NOT_AUTHENTICATED');
    return this.request('/api/progression/me', { method: 'POST', auth: true, body: { action: 'train', attribute, amount } });
  }

  async practiceAttribute(attribute, amount = 1) {
    if (!this.hasSession) throw new Error('NOT_AUTHENTICATED');
    return this.request('/api/progression/me', { method: 'POST', auth: true, body: { action: 'practice', attribute, amount } });
  }

  async getShopSnapshot(shop = 'player', clubId = null) {
    if (!this.hasSession) throw new Error('NOT_AUTHENTICATED');
    if (!['player','club'].includes(shop)) throw new Error('INVALID_SHOP');
    if (shop === 'club' && (typeof clubId !== 'string' || !clubId.trim())) throw new Error('INVALID_CLUB_ID');
    const query = new URLSearchParams({ shop, ...(shop === 'club' ? { clubId:clubId.trim() } : {}) });
    const result = await this.request('/api/shop?' + query.toString(), { auth:true });
    const currency = shop === 'player' ? 'player-coins' : 'club-coins';
    if (result?.shop !== shop || result.currency !== currency
      || !Number.isSafeInteger(result.balance) || result.balance < 0
      || !Array.isArray(result.catalog) || !result.catalog.every(item =>
        item && item.shop === shop && typeof item.id === 'string'
        && Number.isSafeInteger(item.price) && item.price > 0
        && Number.isSafeInteger(item.basePrice) && item.basePrice > 0
        && Number.isInteger(item.discountPercent) && item.discountPercent >= 0 && item.discountPercent <= 50
        && item.currency === currency)
      || !Array.isArray(result.inventory) || !result.inventory.every(item =>
        item && typeof item.itemId === 'string' && typeof item.purchaseId === 'string'
        && ['owned','resold'].includes(item.status) && typeof item.equipped === 'boolean'
        && typeof item.resellable === 'boolean')) throw new Error('INVALID_SHOP_RESPONSE');
    return result;
  }

  async getOwnedShopClubs() {
    if (!this.hasSession) throw new Error('NOT_AUTHENTICATED');
    const result = await this.request('/api/shop/clubs', { auth:true });
    if (!Array.isArray(result?.clubs) || !result.clubs.every(club =>
      club && typeof club.id === 'string' && typeof club.name === 'string'
      && Number.isSafeInteger(club.balance) && club.balance >= 0)) throw new Error('INVALID_OWNED_CLUBS_RESPONSE');
    return result.clubs;
  }

  async purchaseShopItem(shop, itemId, purchaseId, clubId = null) {
    if (!this.hasSession) throw new Error('NOT_AUTHENTICATED');
    if (!['player','club'].includes(shop) || typeof itemId !== 'string' || !itemId.trim()
      || typeof purchaseId !== 'string' || !purchaseId.trim() || purchaseId.length > 64
      || (shop === 'club' && (typeof clubId !== 'string' || !clubId.trim()))) throw new Error('INVALID_SHOP_PURCHASE');
    return this.request('/api/shop/purchase', { method:'POST', auth:true,
      body:{ shop, itemId:itemId.trim(), purchaseId:purchaseId.trim(), ...(shop === 'club' ? { clubId:clubId.trim() } : {}) } });
  }

  async resellShopItem(shop, itemId, resaleId, clubId = null) {
    if (!this.hasSession) throw new Error('NOT_AUTHENTICATED');
    if (!['player','club'].includes(shop) || typeof itemId !== 'string' || !itemId.trim()
      || typeof resaleId !== 'string' || !resaleId.trim() || resaleId.length > 64
      || (shop === 'club' && (typeof clubId !== 'string' || !clubId.trim()))) throw new Error('INVALID_SHOP_RESALE');
    return this.request('/api/shop/resale', { method:'POST', auth:true,
      body:{ shop, itemId:itemId.trim(), resaleId:resaleId.trim(), ...(shop === 'club' ? { clubId:clubId.trim() } : {}) } });
  }

  async equipShopItem(shop, itemId, equipped = true, clubId = null) {
    if (!this.hasSession) throw new Error('NOT_AUTHENTICATED');
    if (!['player','club'].includes(shop) || typeof itemId !== 'string' || !itemId.trim()
      || typeof equipped !== 'boolean'
      || (shop === 'club' && (typeof clubId !== 'string' || !clubId.trim()))) throw new Error('INVALID_SHOP_EQUIPMENT');
    return this.request('/api/shop/equip', { method:'POST', auth:true,
      body:{ shop, itemId:itemId.trim(), equipped, ...(shop === 'club' ? { clubId:clubId.trim() } : {}) } });
  }

  async getPlayerShopCatalog() {
    return (await this.getShopSnapshot('player')).catalog;
  }

  async getPlayerShopInventory() {
    return (await this.getShopSnapshot('player')).inventory;
  }

  async purchasePlayerShopItem(itemId, purchaseId) {
    return this.purchaseShopItem('player', itemId, purchaseId);
  }

  async resellPlayerShopItem(itemId, resaleId) {
    return this.resellShopItem('player', itemId, resaleId);
  }

  async equipPlayerShopItem(itemId, equipped = true) {
    return this.equipShopItem('player', itemId, equipped);
  }

  async logout() {
    if (!this.hasSession) return false;
    try { await this.request('/api/accounts/logout', { method: 'POST', auth: true }); }
    finally {
      this.token = null;
      this.account = null;
      this.cookieSession = false;
      try { this.storage?.removeItem('fpro.account.session'); } catch {}
    }
    return true;
  }
}
