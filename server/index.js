import http from 'node:http';
import { createHash } from 'node:crypto';
import { createGoogleAuthorizationUrl, createGoogleLoginAuthorizationUrl, completeGoogleAuthorization, createGoogleBrowserBinding } from './google-oidc-service.js';
import { JsonGoogleIdentityStore } from './google-identity-store.js';
import { readFile, realpath } from 'node:fs/promises';
import { JsonResultStore } from './result-store.js';
import { JsonRoomStore } from './room-store.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RoomManager } from './room-manager.js';
import { JsonAccountStore } from './account-store.js';
import { JsonRpClubStore } from './rp-club-store.js';
import { JsonRpClubChallengeStore } from './rp-club-challenge-store.js';
import { JsonRpClubSeasonStore } from './rp-club-season-store.js';
import { RpClubMatchService } from './rp-club-match-service.js';
import { readGoogleOidcConfig } from './google-oidc-config.js';
import { GoogleOidcTransactionStore } from './google-oidc-transactions.js';
import { JsonPlayerIdentityStore } from './player-identity-store.js';
import { JsonCareerStore } from './career-store.js';
import { JsonCareerSyncQueue, CareerStoreSyncQueue } from './career-sync-queue.js';
import { CareerSyncService } from './career-sync-service.js';
import { JsonPlayerProfileStore } from './player-profile-store.js';
import { JsonProgressionStore } from './progression-store.js';
import { JsonShopService } from './shop-service.js';
import { JsonCompetitionStore } from './competition-store.js';
import { JsonTransferStore } from './transfer-store.js';
import { JsonClubFinanceService } from './club-finance-service.js';
import { P27SystemTransferService } from './system-transfer-service.js';
import { JsonClubRosterStorage } from './club-roster-storage.js';
import { processPendingRosterSync } from './roster-sync-service.js';
import { P27ClubWorldService } from './club-world-service.js';
import { syncClubAssignments } from './club-assignment-sync.js';
import { auditP27World } from './world-integrity-audit.js';
import { ClubManager, DEFAULT_CLUBS } from '../src/club-manager.js';
import { LEAGUE_DIVISIONS, CONFERENCE_NAMES, TOTAL_LEAGUE_CLUBS } from '../src/league-structure.js';
import { listPublicClubs, resolvePublicClub } from './club-catalog.js';
import { listP27Players } from '../src/p27-player-library.js';
import { isAdminTokenConfigured, isValidAdminToken } from './admin-auth.js';
import { runP27DeploymentPreflight } from './deployment-preflight.js';
import { createPlayerBackupScheduler, resolvePlayerBackupConfig } from './player-backup-scheduler.js';

const resultDirectory = process.env.RESULTS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'results');
const careerDirectory = process.env.CAREERS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'careers');
const careerStore = new JsonCareerStore(careerDirectory);
const careerSyncDirectory = process.env.CAREER_SYNC_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'career-sync');
const legacyCareerSyncQueue = new JsonCareerSyncQueue(careerSyncDirectory);
const careerSyncQueue = new CareerStoreSyncQueue(careerStore, { legacyQueue: legacyCareerSyncQueue });
const careerSyncService = new CareerSyncService(careerSyncQueue);
const progressionDirectory = process.env.PLAYER_PROGRESSION_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'progression');
const progressionStore = new JsonProgressionStore(progressionDirectory);
const playerProfileDirectory = process.env.PLAYER_PROFILES_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'player-profiles');
const playerProfileStore = new JsonPlayerProfileStore(playerProfileDirectory);
const competitionDirectory = process.env.COMPETITIONS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'competitions');
const competitionStore = new JsonCompetitionStore(competitionDirectory);
const transferDirectory = process.env.TRANSFERS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'transfers');
const transferStore = new JsonTransferStore(transferDirectory);
const financeDirectory = process.env.FINANCES_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'finances');
const rosterDirectory = process.env.CLUB_ROSTERS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'club-rosters');
const serverClubManager = new ClubManager(DEFAULT_CLUBS, new JsonClubRosterStorage(rosterDirectory), 'p27-server-club-rosters');
// Competition assignments are authoritative after a season rollover; restore them
// into the roster/finance world before any service reads club divisions.
let assignmentSyncPending = false;
const startupAssignmentSync = syncClubAssignments({ clubManager:serverClubManager, competitionStore });
if (!startupAssignmentSync.ok) {
  if (startupAssignmentSync.reason !== 'club-assignment-persistence-pending')
    throw new Error(`P27_CLUB_ASSIGNMENT_SYNC_FAILED:${startupAssignmentSync.reason}`);
  assignmentSyncPending = true;
  process.stderr.write('P27 club assignment persistence pending; automatic retry scheduled\\n');
}
function syncPendingHumanRosters() {
  const result = processPendingRosterSync({ transferStore, clubManager:serverClubManager });
  if (!result.ok) process.stderr.write(`P27 human roster sync pending: ${result.pending} operation(s) awaiting retry\\n`);
  return result;
}
const startupRosterSync = syncPendingHumanRosters();
if (startupRosterSync.processed.length) process.stdout.write(`P27 human roster sync recovered: ${startupRosterSync.processed.length} operation(s)\\n`);
const clubFinance = new JsonClubFinanceService(financeDirectory, { clubs:[...serverClubManager.clubs.values()], transferStore });
const shopDirectory = process.env.SHOP_INVENTORY_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'shop');
const shopService = new JsonShopService(shopDirectory, {
  progressionStore, clubFinanceService:clubFinance,
  resolveClubOwner:clubId => serverClubManager.getClub(clubId)?.managerId || null
});
const systemTransferDirectory = process.env.SYSTEM_TRANSFERS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'system-transfers');
const systemTransfers = new P27SystemTransferService(systemTransferDirectory, { clubManager:serverClubManager, financeService:clubFinance });
const recoveredSystemTransfers = systemTransfers.processPending();
if (recoveredSystemTransfers.processed) process.stdout.write(`P27 AI transfer recovery: ${recoveredSystemTransfers.processed} operation(s) processed\\n`);
function configuredSystemWageBudgets() {
  try {
    const parsed = JSON.parse(process.env.P27_SYSTEM_WEEKLY_WAGE_BUDGETS || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([id, amount]) =>
      /^[a-z0-9-]{1,48}$/i.test(id) && Number.isSafeInteger(amount) && amount >= 0
    ));
  } catch { return {}; }
}
const clubWorld = new P27ClubWorldService({
  clubManager:serverClubManager, financeService:clubFinance,
  weeklyWageBudgets:configuredSystemWageBudgets()
});
const resultStore = new JsonResultStore(resultDirectory);
const roomDirectory = process.env.ROOMS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'rooms');
const roomStore = new JsonRoomStore(roomDirectory);
const manager = new RoomManager({ resultStore, roomStore, careerStore, careerSyncQueue, progressionStore, competitionStore });
const accountDirectory = process.env.ACCOUNTS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'accounts');
const accountStore = new JsonAccountStore(accountDirectory);
const rpClubDirectory = process.env.RP_CLUBS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'rp-clubs');
const rpClubStore = new JsonRpClubStore(rpClubDirectory);
const rpClubChallengeDirectory = process.env.RP_CLUB_CHALLENGES_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'rp-club-challenges');
const rpClubChallengeStore = new JsonRpClubChallengeStore(rpClubChallengeDirectory);
const rpClubSeasonDirectory = process.env.RP_CLUB_SEASONS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'rp-club-seasons');
const rpClubSeasonStore = new JsonRpClubSeasonStore(rpClubSeasonDirectory);
const rpClubMatchService = new RpClubMatchService({ clubStore:rpClubStore, challengeStore:rpClubChallengeStore, seasonStore:rpClubSeasonStore, roomManager:manager });
manager.onResultFinalized = (result, room) => rpClubMatchService.recordFinalizedResult(result, room);
const googleOidcConfig = readGoogleOidcConfig(process.env);
const googleOidcTransactionDirectory = process.env.GOOGLE_OIDC_TRANSACTIONS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'google-oidc-transactions');
const googleOidcTransactionStore = new GoogleOidcTransactionStore({ directory: googleOidcTransactionDirectory });
const googleIdentityDirectory = process.env.GOOGLE_IDENTITIES_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'google-identities');
const googleIdentityStore = new JsonGoogleIdentityStore(googleIdentityDirectory);
const playerIdentityDirectory = process.env.PLAYER_IDENTITIES_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'player-identities');
const playerIdentityStore = new JsonPlayerIdentityStore(playerIdentityDirectory);
const accountAttempts = new Map();
const playerBackupScheduler = createPlayerBackupScheduler({
  config: resolvePlayerBackupConfig({ root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') }),
  onResult: report => {
    if (report.ok) process.stdout.write(`P27 player backup completed: ${report.retained} generation(s) retained\\n`);
    else process.stderr.write(`P27 player backup failed: ${report.error}\\n`);
  }
});
function allowAccountAttempt(ip) {
  const now = Date.now();
  const key = String(ip || 'unknown').slice(0, 96);
  if (accountAttempts.size > 5_000) {
    for (const [address, attempt] of accountAttempts) if (now - attempt.startedAt >= 15 * 60_000) accountAttempts.delete(address);
  }
  const current = accountAttempts.get(key);
  if (!current || now - current.startedAt >= 15 * 60_000) { accountAttempts.set(key, { startedAt: now, count: 1 }); return true; }
  if (current.count >= 8) return false;
  current.count++;
  return true;
}
function bearer(req) { return req.headers.authorization?.replace(/^Bearer\s+/i, '') || ''; }
function cookieValue(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return null; }
    }
  }
  return null;
}
const googleBindingCookie = 'p27_google_binding';
const accountSessionCookie = 'p27_session';
function googleCookieOptions(maxAge) {
  return `${googleBindingCookie}=; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=${maxAge}${process.env.NODE_ENV !== 'development' ? '; Secure' : ''}`;
}
function accountSessionCookieOptions(token, maxAge) {
  return `${accountSessionCookie}=${token}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=${maxAge}${process.env.NODE_ENV !== 'development' ? '; Secure' : ''}`;
}
function clearAccountSessionCookie() {
  return `${accountSessionCookie}=; HttpOnly; SameSite=Lax; Path=/api; Max-Age=0${process.env.NODE_ENV !== 'development' ? '; Secure' : ''}`;
}
function trustedAppOrigin(req) {
  const configured = process.env.P27_APP_ORIGIN || (googleOidcConfig.configured ? new URL(googleOidcConfig.redirectUri).origin : `http://${req.headers.host || 'localhost'}`);
  try { return req.headers.origin === new URL(configured).origin; } catch { return false; }
}
function accountSessionToken(req) {
  const authorization = bearer(req);
  if (authorization) return authorization;
  const token = cookieValue(req, accountSessionCookie);
  if (!token) return '';
  if (req.method !== 'GET' && req.method !== 'HEAD' && !trustedAppOrigin(req)) return '';
  return token;
}

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json' };
const MAX_BODY = 8 * 1024;
const json = (res, status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); };

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY) throw new Error('BODY_TOO_LARGE');
    chunks.push(bytes);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('INVALID_JSON'); }
}

const server = http.createServer({ maxHeaderSize: 16 * 1024 }, async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, status: 'live', service: 'football-rp-online-match-server', protocol: 1 });
  if (req.method === 'GET' && url.pathname === '/readyz') {
    const preflight = await runP27DeploymentPreflight({ root: APP_ROOT });
    return json(res, preflight.ok ? 200 : 503, {
      ok: preflight.ok,
      status: preflight.ok ? 'ready' : 'not-ready',
      errors: preflight.errors,
      storage: preflight.checked,
      playerBackup: playerBackupScheduler.status(),
      googleIdentity: googleOidcConfig.publicStatus,
    });
  }
  try {
    if (req.method === 'GET' && url.pathname === '/api/admin/world-integrity') {
      if (!isAdminTokenConfigured()) return json(res, 503, { error:'ADMIN_TOKEN_NOT_CONFIGURED' });
      if (!isValidAdminToken(bearer(req))) return json(res, 401, { error:'ADMIN_UNAUTHORIZED' });
      const audit = auditP27World({
        clubs:[...serverClubManager.clubs.values()],
        competitionClubs:[...competitionStore.clubs.values()],
        transferState:transferStore.state,
        systemTransferState:systemTransfers.state,
        financeAccounts:clubFinance.store.listAccounts(),
        financeJournal:clubFinance.transferJournal,
        competitionState:competitionStore.state,
        resultArchive:resultStore.readAll(),
        playerCareerState:careerStore.state,
        accountState:accountStore.state,
        profileState:playerProfileStore.state,
        progressionState:progressionStore.state
      });
      return json(res, audit.ok ? 200 : 409, audit);
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/system-transfers/simulate') {
      if (!isAdminTokenConfigured()) return json(res, 503, { error:'ADMIN_TOKEN_NOT_CONFIGURED' });
      if (!isValidAdminToken(bearer(req))) return json(res, 401, { error:'ADMIN_UNAUTHORIZED' });
      const body = await readBody(req);
      const result = systemTransfers.simulateMarket({
        windowId:body.windowId, maxTransfers:body.maxTransfers, now:body.now
      });
      return json(res, result.ok ? 200 : 400, result);
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/system-transfers') {
      if (!isAdminTokenConfigured()) return json(res, 503, { error:'ADMIN_TOKEN_NOT_CONFIGURED' });
      if (!isValidAdminToken(bearer(req))) return json(res, 401, { error:'ADMIN_UNAUTHORIZED' });
      const body = await readBody(req);
      const result = systemTransfers.transfer({
        id:body.id, fromClubId:body.fromClubId, toClubId:body.toClubId,
        playerId:body.playerId, fee:body.fee
      });
      return json(res, result.ok ? 200 : (result.pending ? 202 : 409), result);
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/rp-club-seasons') {
      if (!isAdminTokenConfigured()) return json(res, 503, { error:'ADMIN_TOKEN_NOT_CONFIGURED' });
      if (!isValidAdminToken(bearer(req))) return json(res, 401, { error:'ADMIN_UNAUTHORIZED' });
      const body = await readBody(req);
      const result = rpClubSeasonStore.create({ id:body.id, name:body.name, startsAt:body.startsAt, endsAt:body.endsAt });
      return json(res, result.ok ? 201 : 409, result);
    }
    const rpClubSeasonActivate = url.pathname.match(/^\/api\/admin\/rp-club-seasons\/([a-z0-9_-]{3,48})\/activate$/i);
    if (req.method === 'POST' && rpClubSeasonActivate) {
      if (!isAdminTokenConfigured()) return json(res, 503, { error:'ADMIN_TOKEN_NOT_CONFIGURED' });
      if (!isValidAdminToken(bearer(req))) return json(res, 401, { error:'ADMIN_UNAUTHORIZED' });
      const result = rpClubSeasonStore.activate(rpClubSeasonActivate[1]);
      return json(res, result.ok ? 200 : 409, result);
    }
    const rpClubSeasonClose = url.pathname.match(/^\/api\/admin\/rp-club-seasons\/([a-z0-9_-]{3,48})\/close$/i);
    if (req.method === 'POST' && rpClubSeasonClose) {
      if (!isAdminTokenConfigured()) return json(res, 503, { error:'ADMIN_TOKEN_NOT_CONFIGURED' });
      if (!isValidAdminToken(bearer(req))) return json(res, 401, { error:'ADMIN_UNAUTHORIZED' });
      const result = rpClubSeasonStore.close(rpClubSeasonClose[1]);
      return json(res, result.ok ? 200 : 409, result);
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/google/start') {
      if (!googleOidcConfig.configured) return json(res, 503, { error: 'GOOGLE_OIDC_NOT_CONFIGURED' });
      if (!allowAccountAttempt(req.socket.remoteAddress)) return json(res, 429, { error: 'GOOGLE_OIDC_RATE_LIMITED' });
      if (!trustedAppOrigin(req)) return json(res, 403, { error: 'GOOGLE_OIDC_ORIGIN_INVALID' });
      const body = await readBody(req);
      const identity = playerIdentityStore.verifyLocalProof({
        localProfileKey: body.localProfileKey, localProofSecret: body.localProofSecret
      });
      if (!identity) return json(res, 401, { error: 'LOCAL_PROFILE_PROOF_INVALID' });
      const sessionBinding = createGoogleBrowserBinding();
      const authorization = createGoogleAuthorizationUrl({
        config: googleOidcConfig, transactionStore: googleOidcTransactionStore,
        accountId: identity.accountId, sessionBinding
      });
      res.setHeader('set-cookie', `${googleBindingCookie}=${sessionBinding}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=600${process.env.NODE_ENV !== 'development' ? '; Secure' : ''}`);
      return json(res, 200, authorization);
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/google/login/start') {
      if (!googleOidcConfig.configured) return json(res, 503, { error: 'GOOGLE_OIDC_NOT_CONFIGURED' });
      if (!allowAccountAttempt(req.socket.remoteAddress)) return json(res, 429, { error: 'GOOGLE_OIDC_RATE_LIMITED' });
      if (!trustedAppOrigin(req)) return json(res, 403, { error: 'GOOGLE_OIDC_ORIGIN_INVALID' });
      const sessionBinding = createGoogleBrowserBinding();
      const authorization = createGoogleLoginAuthorizationUrl({
        config: googleOidcConfig, transactionStore: googleOidcTransactionStore, sessionBinding
      });
      res.setHeader('set-cookie', `${googleBindingCookie}=${sessionBinding}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=600${process.env.NODE_ENV !== 'development' ? '; Secure' : ''}`);
      return json(res, 200, authorization);
    }
    if (req.method === 'GET' && url.pathname === '/api/auth/google/callback') {
      if (!allowAccountAttempt(req.socket.remoteAddress)) return json(res, 429, { error: 'GOOGLE_OIDC_RATE_LIMITED' });
      const sessionBinding = cookieValue(req, googleBindingCookie);
      try {
        const result = await completeGoogleAuthorization({
          config: googleOidcConfig, transactionStore: googleOidcTransactionStore,
          identityStore: googleIdentityStore, state: url.searchParams.get('state'),
          code: url.searchParams.get('code'), sessionBinding
        });
        const playerIdentity = playerIdentityStore.getByAccountId(result.accountId);
        if (!playerIdentity) throw new Error('P27_PLAYER_IDENTITY_NOT_FOUND');
        const session = accountStore.issuePasswordlessSession(result.accountId, { playerId: playerIdentity.playerId });
        const maxAge = Math.floor(accountStore.sessionTtlMs / 1000);
        res.setHeader('set-cookie', [
          googleCookieOptions(0),
          accountSessionCookieOptions(session.token, maxAge)
        ]);
        res.statusCode = 303;
        res.setHeader('location', '/');
        res.setHeader('cache-control', 'no-store');
        res.end();
        return;
      } catch (error) {
        res.setHeader('set-cookie', googleCookieOptions(0));
        throw error;
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/player-identities/replica') {
      if (!allowAccountAttempt(req.socket.remoteAddress)) return json(res, 429, { error: 'PLAYER_ID_REPLICA_RATE_LIMITED' });
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error: 'SESSION_EXPIRED' });
      if (!googleIdentityStore.getByAccountId(account.id)) return json(res, 403, { error: 'GOOGLE_IDENTITY_NOT_LINKED' });
      const identity = playerIdentityStore.getByAccountId(account.id);
      if (!identity || account.playerId !== identity.playerId) return json(res, 409, { error: 'PLAYER_IDENTITY_NOT_FOUND' });
      try {
        const replica = playerIdentityStore.createReplica(account.id);
        return json(res, 201, { ...replica, displayName: playerProfileStore.get(account.id)?.identity?.displayName || replica.playerId, reserved: true });
      } catch (error) {
        return json(res, 409, { error: String(error?.message || 'PLAYER_ID_REPLICA_FAILED') });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/player-identities/reserve') {
      if (!allowAccountAttempt(req.socket.remoteAddress)) return json(res, 429, { error: 'PLAYER_ID_RESERVATION_RATE_LIMITED' });
      const body = await readBody(req);
      const reservation = playerIdentityStore.reserve({ localProfileKey: body.localProfileKey, localProofSecret: body.localProofSecret });
      return json(res, 200, { accountId: reservation.accountId, playerId: reservation.playerId, reserved: true, alreadyReserved: reservation.alreadyReserved });
    }
    if (req.method === 'POST' && url.pathname === '/api/player-identities/verify-local-proof') {
      if (!allowAccountAttempt(req.socket.remoteAddress)) return json(res, 429, { error: 'PLAYER_IDENTITY_RATE_LIMITED' });
      const body = await readBody(req);
      const identity = playerIdentityStore.verifyLocalProof({ localProfileKey: body.localProfileKey, localProofSecret: body.localProofSecret });
      if (!identity) return json(res, 401, { error: 'LOCAL_PROFILE_PROOF_INVALID' });
      return json(res, 200, { verified: true, accountId: identity.accountId, playerId: identity.playerId });
    }
    if (req.method === 'GET' && url.pathname === '/api/rooms') return json(res, 200, { rooms: manager.list() });
    if (req.method === 'GET' && url.pathname === '/api/players/library') {
      const number = key => url.searchParams.has(key) ? Number(url.searchParams.get(key)) : undefined;
      const result = listP27Players({
        clubs:serverClubManager.listClubs(),
        filters:{
          search:url.searchParams.get('q') || '',
          clubId:url.searchParams.get('clubId') || '',
          division:url.searchParams.get('division') || '',
          role:url.searchParams.get('role') || '',
          type:url.searchParams.get('type') || '',
          status:url.searchParams.get('status') || '',
          sort:url.searchParams.get('sort') || 'rating',
          order:url.searchParams.get('order') || 'desc',
          minRating:number('minRating'), maxRating:number('maxRating'),
          minAge:number('minAge'), maxAge:number('maxAge'),
          limit:number('limit'), offset:number('offset')
        }
      });
      return json(res,200,result);
    }
    const clubTakeoverMatch = url.pathname.match(/^\/api\/clubs\/([a-z0-9-]{1,48})\/takeover$/i);
    if (req.method === 'POST' && clubTakeoverMatch) {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error:'SESSION_EXPIRED' });
      const result = serverClubManager.takeOver(clubTakeoverMatch[1], account.id);
      const status = result.ok ? 200 : result.reason === 'invalid-request' ? 404 : 409;
      return json(res, status, result);
    }
    if (req.method === 'GET' && url.pathname === '/api/clubs') {
      const rawLimit=url.searchParams.get('limit'), rawOffset=url.searchParams.get('offset');
      const limit=rawLimit===null?24:Number(rawLimit), offset=rawOffset===null?0:Number(rawOffset);
      return json(res,200,listPublicClubs({
        clubs:[...competitionStore.clubs.values()],
        division:url.searchParams.get('division') || undefined,
        conference:url.searchParams.get('conference') || undefined,
        search:url.searchParams.get('q') || '',
        limit,offset
      }));
    }
    const publicClubMatch=url.pathname.match(/^\/api\/clubs\/([a-z0-9-]{1,48})$/i);
    if (req.method === 'GET' && publicClubMatch) {
      const club=resolvePublicClub(publicClubMatch[1],[...competitionStore.clubs.values()]);
      return club ? json(res,200,{club}) : json(res,404,{error:'CLUB_NOT_FOUND'});
    }
    if (req.method === 'GET' && url.pathname === '/api/competitions') return json(res, 200, competitionStore.snapshot());
    if (req.method === 'POST' && url.pathname === '/api/admin/competitions/season/finalize') {
      if (!isAdminTokenConfigured()) return json(res, 503, { error: 'ADMIN_TOKEN_NOT_CONFIGURED' });
      if (!isValidAdminToken(bearer(req))) return json(res, 401, { error: 'ADMIN_UNAUTHORIZED' });
      const body = await readBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.nextSeasonId !== 'string') {
        return json(res, 400, { error: 'INVALID_SEASON_TRANSITION' });
      }
      const preview = competitionStore.previewSeasonMovements();
      if (!preview.ok) return json(res, 409, { error: 'SEASON_MOVEMENTS_NOT_READY', reason: preview.reason });
      const result = competitionStore.finalizeSeason({ nextSeasonId: body.nextSeasonId, movements: preview.movements });
      if (result.ok) {
        const sync = syncClubAssignments({ clubManager:serverClubManager, competitionStore });
        if (!sync.ok) return json(res, 503, { ...result, assignmentSync:sync, warning:'SEASON_SAVED_ASSIGNMENT_PERSISTENCE_PENDING' });
        result.assignmentSync = sync;
      }
      return json(res, result.ok ? 200 : 409, result);
    }
    if (req.method === 'POST' && (url.pathname === '/api/accounts/register' || url.pathname === '/api/accounts/login')) {
      if (!allowAccountAttempt(req.socket.remoteAddress)) return json(res, 429, { error: 'RATE_LIMIT' });
      const body = await readBody(req);
      if (url.pathname.endsWith('/register')) return json(res, 201, accountStore.register(body));
      const session = accountStore.login(body);
      return session ? json(res, 200, session) : json(res, 401, { error: 'INVALID_CREDENTIALS' });
    }
    const playerCareerMatch = url.pathname.match(/^\/api\/players\/([a-z0-9-]{8,96})\/career$/i);
    if (req.method === 'GET' && playerCareerMatch) {
      const career = careerStore.getPlayerCareer(playerCareerMatch[1]);
      if (career.player) career.transfers = transferStore.getPlayerHistory(playerCareerMatch[1]);
      return career.player ? json(res, 200, { career }) : json(res, 404, { error: 'PLAYER_NOT_FOUND' });
    }
    if (url.pathname.startsWith('/api/contract') || url.pathname.startsWith('/api/transfer/') || url.pathname.startsWith('/api/loan/')) {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error: 'SESSION_EXPIRED' });
      if (req.method === 'GET' && url.pathname === '/api/contract') {
        const career = transferStore.getCareer(account.id);
        return json(res, 200, { career, rosterSync:syncPendingHumanRosters() });
      }
      if (req.method === 'POST' && url.pathname === '/api/contract/sign') {
        const body = await readBody(req);
        const career = transferStore.getCareer(account.id);
        syncPendingHumanRosters();
        const admission = serverClubManager.canAcceptHuman(body.clubId, career?.playerId);
        if (!admission.ok) return json(res, 409, { ok:false, reason:admission.reason });
        const result = transferStore.signContract(account.id, body);
        return json(res, 200, { ...result, rosterSync:syncPendingHumanRosters() });
      }
      if (req.method === 'POST' && url.pathname === '/api/contract/renew') {
        const result = transferStore.renewContract(account.id, await readBody(req));
        return json(res, 200, { ...result, rosterSync:syncPendingHumanRosters() });
      }
      if (req.method === 'POST' && url.pathname === '/api/contract/terminate') {
        const result = transferStore.terminateContract(account.id);
        return json(res, 200, { ...result, rosterSync:syncPendingHumanRosters() });
      }
      if (req.method === 'POST' && url.pathname === '/api/loan/offers') {
        const body = await readBody(req);
        const career = transferStore.getCareer(account.id);
        syncPendingHumanRosters();
        const admission = serverClubManager.canAcceptHuman(body.toClubId, career?.playerId);
        if (!admission.ok) return json(res,409,{ok:false,reason:admission.reason});
        const result = transferStore.requestLoanOffer(account.id,body);
        return json(res,200,{...result,rosterSync:syncPendingHumanRosters()});
      }
      const loanAction = url.pathname.match(/^\/api\/loan\/offers\/([a-z0-9-]{8,96})\/(accept|reject)$/i);
      if (req.method === 'POST' && loanAction) {
        if (loanAction[2] === 'accept') {
          const career = transferStore.getCareer(account.id);
          syncPendingHumanRosters();
          const offer = career?.loanOffers?.find(item => item.id === loanAction[1] && item.status === 'pending');
          if (offer) {
            const admission = serverClubManager.canAcceptHuman(offer.toClubId,career.playerId);
            if (!admission.ok) return json(res,409,{ok:false,reason:admission.reason});
          }
        }
        const result = loanAction[2] === 'accept'
          ? transferStore.acceptLoanOffer(account.id,loanAction[1])
          : transferStore.rejectLoanOffer(account.id,loanAction[1]);
        return json(res,200,{...result,rosterSync:syncPendingHumanRosters()});
      }
      if (req.method === 'POST' && url.pathname === '/api/transfer/offers') {
        const body = await readBody(req);
        const career = transferStore.getCareer(account.id);
        syncPendingHumanRosters();
        const admission = serverClubManager.canAcceptHuman(body.toClubId, career?.playerId);
        if (!admission.ok) return json(res, 409, { ok:false, reason:admission.reason });
        const result = transferStore.requestOffer(account.id, body);
        return json(res, 200, { ...result, rosterSync:syncPendingHumanRosters() });
      }
      const offerAction = url.pathname.match(/^\/api\/transfer\/offers\/([a-z0-9-]{8,96})\/(accept|reject)$/i);
      if (req.method === 'POST' && offerAction) {
        if (offerAction[2] === 'accept') {
          const career = transferStore.getCareer(account.id);
          syncPendingHumanRosters();
          const offer = career?.offers?.find(item => item.id === offerAction[1] && item.status === 'pending');
          if (offer) {
            const admission = serverClubManager.canAcceptHuman(offer.fromClubId, career.playerId);
            if (!admission.ok) return json(res, 409, { ok:false, reason:admission.reason });
          }
        }
        const result = offerAction[2] === 'accept' ? transferStore.acceptOffer(account.id, offerAction[1]) : transferStore.rejectOffer(account.id, offerAction[1]);
        return json(res, 200, { ...result, rosterSync:syncPendingHumanRosters() });
      }
      return json(res, 404, { error: 'NOT_FOUND' });
    }
    if (url.pathname === '/api/progression') {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error: 'SESSION_EXPIRED' });
      if (req.method === 'GET') return json(res, 200, { progression: progressionStore.get(account.id) });
      if (req.method === 'POST') {
        const body = await readBody(req);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'INVALID_PROGRESSION_ACTION' });
        try {
          const result = body.action === 'train'
            ? progressionStore.train(account.id, body.attribute, body.amount)
            : body.action === 'practice'
              ? progressionStore.practice(account.id, body.attribute, body.amount)
              : null;
          if (!result) return json(res, 400, { error: 'INVALID_PROGRESSION_ACTION' });
          return json(res, result.ok ? 200 : 409, result);
        } catch (error) { return json(res, 400, { error: String(error?.message || 'INVALID_PROGRESSION_ACTION') }); }
      }
    }
    if (req.method === 'GET' && (url.pathname === '/api/shop' || url.pathname === '/api/shop/history')) {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error:'SESSION_EXPIRED' });
      const shop = url.searchParams.get('shop') || 'player';
      if (!['player','club'].includes(shop)) return json(res, 400, { error:'INVALID_SHOP' });
      const clubId = url.searchParams.get('clubId') || '';
      if (shop === 'club' && (!clubId || serverClubManager.getClub(clubId)?.managerId !== account.id))
        return json(res, 403, { error:'CLUB_OWNER_REQUIRED' });
      const ownerId = shop === 'player' ? account.id : clubId;
      if (url.pathname === '/api/shop/history') return json(res, 200, shopService.getHistory({shop,ownerId}));
      const balance = shop === 'player' ? progressionStore.get(account.id).coins : clubFinance.store.balance(clubId);
      return json(res, 200, {
        shop, currency:shop === 'player' ? 'player-coins' : 'club-coins', balance,
        catalog:shopService.catalog(shop), inventory:shopService.inventory(shop,ownerId)
      });
    }
    if (req.method === 'POST' && ['/api/shop/purchase','/api/shop/resale','/api/shop/equip'].includes(url.pathname)) {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error:'SESSION_EXPIRED' });
      const body = await readBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error:'INVALID_SHOP_ACTION' });
      const shop = body.shop;
      if (!['player','club'].includes(shop)) return json(res, 400, { error:'INVALID_SHOP' });
      const result = url.pathname === '/api/shop/purchase'
        ? shopService.purchase({shop,itemId:body.itemId,actorId:account.id,clubId:body.clubId,purchaseId:body.purchaseId})
        : url.pathname === '/api/shop/resale'
          ? shopService.resale({shop,itemId:body.itemId,actorId:account.id,clubId:body.clubId,resaleId:body.resaleId})
          : shopService.setEquipped({shop,itemId:body.itemId,actorId:account.id,clubId:body.clubId,equipped:body.equipped});
      const status = result.ok ? 200
        : result.reason === 'club-owner-required' ? 403
        : result.reason === 'item-not-found' || result.reason === 'item-not-owned' ? 404 : 409;
      return json(res, status, result);
    }
    if (url.pathname === '/api/profile') {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error: 'SESSION_EXPIRED' });
      if (req.method === 'GET') return json(res, 200, { profile: playerProfileStore.get(account.id) });
      if (req.method === 'PUT') {
        const body = await readBody(req);
        if (!body || typeof body !== 'object' || Array.isArray(body) || !body.profile || typeof body.profile !== 'object' || Array.isArray(body.profile)) return json(res, 400, { error: 'INVALID_PROFILE' });
        return json(res, 200, { profile: playerProfileStore.save(account.id, body.profile) });
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/account/snapshot') {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error: 'SESSION_EXPIRED' });
      const identity = playerIdentityStore.getByAccountId(account.id);
      const playerCareer = identity ? careerStore.getPlayerCareer(identity.playerId) : null;
      const seasonStats = playerCareer ? {
        totals: playerCareer.totals,
        matches: playerCareer.matches.map(match => ({
          ...match.stats,
          result: match.result,
          rating: match.rating,
          minutesPlayedMs: match.minutesPlayedMs,
          role: match.role,
          cleanSheet: match.cleanSheet === true,
          playerOfMatch: match.playerOfMatch === true,
          matchId: match.matchId,
          opponent: match.opponent,
          date: new Date(match.finalizedAt).toISOString()
        })),
        processedMatchIds: playerCareer.matches.map(match => match.matchId).filter(id => typeof id === 'string' && id)
      } : null;
      const snapshot = {
        schemaVersion: 1,
        player: identity ? { playerId: identity.playerId, createdAt: identity.createdAt } : null,
        profile: playerProfileStore.get(account.id),
        progression: progressionStore.get(account.id),
        career: careerStore.get(account.id),
        playerCareer,
        seasonStats,
        contract: transferStore.getCareer(account.id)
      };
      const revision = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
      return json(res, 200, {
        snapshot,
        revision,
        generatedAt: new Date().toISOString(),
        authority: 'server-confirmed',
        restorePolicy: 'server-snapshot-is-read-only; never-overwrite-newer-local-data'
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/career') {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error: 'SESSION_EXPIRED' });
      return json(res, 200, { career: careerStore.get(account.id) });
    }
    if (req.method === 'GET' && url.pathname === '/api/rp-clubs') {
      const rawLimit = url.searchParams.get('limit'), rawOffset = url.searchParams.get('offset');
      const limit = rawLimit === null ? 24 : Number(rawLimit), offset = rawOffset === null ? 0 : Number(rawOffset);
      if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(offset) || limit < 1 || offset < 0) return json(res, 400, { error: 'INVALID_PAGINATION' });
      return json(res, 200, rpClubStore.list({ search:url.searchParams.get('q') || '', limit, offset }));
    }
    if (req.method === 'GET' && url.pathname === '/api/rp-clubs/me') {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error: 'SESSION_EXPIRED' });
      return json(res, 200, { membership:rpClubStore.getForAccount(account.id), invitations:rpClubStore.getInvitationsForAccount(account.id) });
    }
    const rpClubActivityMatch = url.pathname.match(/^\/api\/rp-clubs\/([a-f0-9-]{36})\/activity$/i);
    if (req.method === 'GET' && rpClubActivityMatch) {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error:'SESSION_EXPIRED' });
      const members = rpClubStore.getMemberAccounts(rpClubActivityMatch[1], account.id);
      if (!members) return json(res, 403, { error:'RP_CLUB_MEMBERSHIP_REQUIRED' });
      const now = Date.now();
      const date = new Date(now);
      const daysSinceMonday = (date.getUTCDay() + 6) % 7;
      const periodStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysSinceMonday);
      const contributions = members.map(member => {
        const career = careerStore.get(member.accountId);
        const matches = career.matches.filter(match => Number(match.finalizedAt) >= periodStart && Number(match.finalizedAt) <= now);
        return {
          playerId:member.playerId, displayName:member.displayName, role:member.role,
          matches:matches.length, wins:matches.filter(match => match.result === 'win').length,
          goals:matches.reduce((sum, match) => sum + Number(match.stats?.goals || 0), 0),
          assists:matches.reduce((sum, match) => sum + Number(match.stats?.assists || 0), 0)
        };
      }).sort((a,b) => b.matches-a.matches || b.wins-a.wins || b.goals-a.goals || b.assists-a.assists || a.displayName.localeCompare(b.displayName));
      const totals = contributions.reduce((sum, member) => ({
        matches:sum.matches+member.matches, wins:sum.wins+member.wins,
        goals:sum.goals+member.goals, assists:sum.assists+member.assists
      }), { matches:0, wins:0, goals:0, assists:0 });
      const objectiveDefinitions = [
        { id:'matches', label:'Jouer des matchs', metric:'matches', target:10 },
        { id:'wins', label:'Remporter des matchs', metric:'wins', target:5 },
        { id:'goals', label:'Inscrire des buts', metric:'goals', target:20 },
        { id:'assists', label:'Délivrer des passes décisives', metric:'assists', target:10 }
      ];
      const objectives = objectiveDefinitions.map(objective => {
        const value = totals[objective.metric];
        return {
          id:objective.id, label:objective.label, metric:objective.metric,
          value, target:objective.target,
          progressPercent:Math.min(100, Math.floor(value / objective.target * 100)),
          completed:value >= objective.target
        };
      });
      return json(res, 200, { periodStart, periodEnd:periodStart + 7 * 24 * 60 * 60 * 1000, totals, members:contributions, objectives });
    }
    const rpClubChallengeMatchCreate = url.pathname.match(/^\/api\/rp-clubs\/challenges\/([a-f0-9-]{36})\/match$/i);
    if (req.method === 'POST' && rpClubChallengeMatchCreate) {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error:'SESSION_EXPIRED' });
      const result = rpClubMatchService.createRoom(rpClubChallengeMatchCreate[1], account.id);
      const status = result.ok ? 201 : result.reason === 'RP_CLUB_CHALLENGE_NOT_FOUND' ? 404 : result.reason === 'RP_CLUB_PERMISSION_DENIED' ? 403 : 409;
      return json(res, status, result);
    }
    if (req.method === 'GET' && url.pathname === '/api/rp-clubs/challenges/leaderboard') {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error:'SESSION_EXPIRED' });
      return json(res, 200, { standings:rpClubMatchService.leaderboard() });
    }
    if (req.method === 'GET' && url.pathname === '/api/rp-clubs/seasons') {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error:'SESSION_EXPIRED' });
      return json(res, 200, { seasons:rpClubSeasonStore.list() });
    }
    if (req.method === 'GET' && url.pathname === '/api/rp-clubs/seasons/current') {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error:'SESSION_EXPIRED' });
      return json(res, 200, { season:rpClubSeasonStore.current() });
    }
    const rpClubSeasonLeaderboard = url.pathname.match(/^\/api\/rp-clubs\/seasons\/([a-z0-9_-]{3,48})\/leaderboard$/i);
    if (req.method === 'GET' && rpClubSeasonLeaderboard) {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error:'SESSION_EXPIRED' });
      const standings = rpClubMatchService.seasonLeaderboard(rpClubSeasonLeaderboard[1]);
      return standings ? json(res, 200, { standings }) : json(res, 404, { error:'RP_CLUB_SEASON_NOT_FOUND' });
    }
    if (req.method === 'GET' && url.pathname === '/api/rp-clubs/challenges/me') {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error:'SESSION_EXPIRED' });
      return json(res, 200, { challenges:rpClubMatchService.reconcileForAccount(account.id) });
    }
    const rpClubChallengeCreateMatch = url.pathname.match(new RegExp('^/api/rp-clubs/([a-f0-9-]{36})/challenges$','i'));
    if (req.method === 'POST' && rpClubChallengeCreateMatch) {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error:'SESSION_EXPIRED' });
      const result = rpClubChallengeStore.create({ clubStore:rpClubStore, actorAccountId:account.id, targetClubId:rpClubChallengeCreateMatch[1] });
      const status = result.ok ? 201 : result.reason === 'RP_CLUB_NOT_FOUND' ? 404 : result.reason === 'RP_CLUB_PERMISSION_DENIED' ? 403 : 409;
      return json(res, status, result);
    }
    const rpClubChallengeDecisionMatch = url.pathname.match(new RegExp('^/api/rp-clubs/challenges/([a-f0-9-]{36})/decision$','i'));
    if (req.method === 'POST' && rpClubChallengeDecisionMatch) {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error:'SESSION_EXPIRED' });
      const body = await readBody(req);
      const result = rpClubChallengeStore.decide(rpClubChallengeDecisionMatch[1], {
        clubStore:rpClubStore, actorAccountId:account.id, decision:body.decision, scheduledAt:body.scheduledAt
      });
      const status = result.ok ? 200 : result.reason === 'RP_CLUB_CHALLENGE_NOT_FOUND' ? 404 : result.reason === 'RP_CLUB_PERMISSION_DENIED' ? 403 : 409;
      return json(res, status, result);
    }
    const rpClubMessageMatch = url.pathname.match(/^\/api\/rp-clubs\/([a-f0-9-]{36})\/messages$/i);
    if (req.method === 'POST' && rpClubMessageMatch) {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error:'SESSION_EXPIRED' });
      const identity = playerIdentityStore.getByAccountId(account.id);
      if (!identity || identity.playerId !== account.playerId) return json(res, 403, { error:'PLAYER_IDENTITY_REQUIRED' });
      const body = await readBody(req);
      const result = rpClubStore.sendMessage(rpClubMessageMatch[1], {
        accountId:account.id, playerId:identity.playerId,
        displayName:playerProfileStore.get(account.id)?.identity?.displayName || identity.playerId,
        text:body.text
      });
      const status = result.ok ? 201 : result.reason === 'RP_CLUB_NOT_FOUND' ? 404
        : result.reason === 'RP_CLUB_MEMBERSHIP_REQUIRED' ? 403
        : result.reason === 'PLAYER_IDENTITY_REQUIRED' || result.reason === 'EMPTY_RP_CLUB_MESSAGE' ? 400 : 429;
      return json(res, status, result);
    }
    const rpClubPublicMatch = url.pathname.match(/^\/api\/rp-clubs\/([a-f0-9-]{36})$/i);
    if (req.method === 'GET' && rpClubPublicMatch) {
      const club = rpClubStore.get(rpClubPublicMatch[1]);
      return club ? json(res, 200, { club }) : json(res, 404, { error: 'RP_CLUB_NOT_FOUND' });
    }
    if (req.method === 'POST' && url.pathname === '/api/rp-clubs') {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error: 'SESSION_EXPIRED' });
      const identity = playerIdentityStore.getByAccountId(account.id);
      if (!identity || identity.playerId !== account.playerId) return json(res, 403, { error: 'PLAYER_IDENTITY_REQUIRED' });
      const body = await readBody(req);
      const displayName = playerProfileStore.get(account.id)?.identity?.displayName || identity.playerId;
      const result = rpClubStore.create({ accountId:account.id, playerId:identity.playerId, displayName, name:body.name, tag:body.tag, description:body.description });
      return json(res, result.ok ? 201 : (result.reason === 'PLAYER_IDENTITY_REQUIRED' || result.reason.startsWith('INVALID_') ? 400 : 409), result);
    }
    const rpClubJoinMatch = url.pathname.match(/^\/api\/rp-clubs\/([a-f0-9-]{36})\/join-requests$/i);
    if (req.method === 'POST' && rpClubJoinMatch) {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error: 'SESSION_EXPIRED' });
      const identity = playerIdentityStore.getByAccountId(account.id);
      if (!identity || identity.playerId !== account.playerId) return json(res, 403, { error: 'PLAYER_IDENTITY_REQUIRED' });
      const result = rpClubStore.requestJoin(rpClubJoinMatch[1], {
        accountId:account.id, playerId:identity.playerId,
        displayName:playerProfileStore.get(account.id)?.identity?.displayName || identity.playerId
      });
      const status = result.ok ? 201 : result.reason === 'RP_CLUB_NOT_FOUND' ? 404
        : result.reason === 'PLAYER_IDENTITY_REQUIRED' ? 400 : 409;
      return json(res, status, result);
    }
    const rpClubDecisionMatch = url.pathname.match(/^\/api\/rp-clubs\/([a-f0-9-]{36})\/join-requests\/([a-f0-9-]{36})\/decision$/i);
    if (req.method === 'POST' && rpClubDecisionMatch) {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error: 'SESSION_EXPIRED' });
      const body = await readBody(req);
      const result = rpClubStore.decideJoinRequest(rpClubDecisionMatch[1], rpClubDecisionMatch[2], { actorAccountId:account.id, decision:body.decision });
      const status = result.ok ? 200 : result.reason === 'RP_CLUB_NOT_FOUND' || result.reason === 'JOIN_REQUEST_NOT_FOUND' ? 404
        : result.reason === 'RP_CLUB_PERMISSION_DENIED' ? 403 : 409;
      return json(res, status, result);
    }
    const rpClubInviteMatch = url.pathname.match(/^\/api\/rp-clubs\/([a-f0-9-]{36})\/invitations$/i);
    if (req.method === 'POST' && rpClubInviteMatch) {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error:'SESSION_EXPIRED' });
      const body = await readBody(req);
      const identity = playerIdentityStore.getByPlayerId(body.playerId);
      if (!identity) return json(res, 404, { error:'PLAYER_IDENTITY_NOT_FOUND' });
      const result = rpClubStore.invite(rpClubInviteMatch[1], {
        actorAccountId:account.id, accountId:identity.accountId, playerId:identity.playerId,
        displayName:playerProfileStore.get(identity.accountId)?.identity?.displayName || identity.playerId
      });
      const status = result.ok ? 201 : result.reason === 'RP_CLUB_NOT_FOUND' ? 404
        : result.reason === 'RP_CLUB_PERMISSION_DENIED' ? 403
        : result.reason === 'PLAYER_IDENTITY_REQUIRED' ? 400 : 409;
      return json(res, status, result);
    }
    const rpClubInviteDecisionMatch = url.pathname.match(/^\/api\/rp-clubs\/([a-f0-9-]{36})\/invitations\/([a-f0-9-]{36})\/decision$/i);
    if (req.method === 'POST' && rpClubInviteDecisionMatch) {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error:'SESSION_EXPIRED' });
      const body = await readBody(req);
      const result = rpClubStore.respondInvitation(rpClubInviteDecisionMatch[1], rpClubInviteDecisionMatch[2], { accountId:account.id, decision:body.decision });
      const status = result.ok ? 200 : result.reason === 'RP_CLUB_NOT_FOUND' || result.reason === 'RP_CLUB_INVITATION_NOT_FOUND' ? 404 : 409;
      return json(res, status, result);
    }
    const rpClubRoleMatch = url.pathname.match(/^\/api\/rp-clubs\/([a-f0-9-]{36})\/members\/(FRP-\d{6})\/role$/i);
    if (req.method === 'POST' && rpClubRoleMatch) {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error:'SESSION_EXPIRED' });
      const body = await readBody(req);
      const result = rpClubStore.assignRole(rpClubRoleMatch[1], rpClubRoleMatch[2], { actorAccountId:account.id, role:body.role });
      const status = result.ok ? 200 : result.reason === 'RP_CLUB_NOT_FOUND' || result.reason === 'RP_CLUB_MEMBER_NOT_FOUND' ? 404
        : result.reason === 'RP_CLUB_PERMISSION_DENIED' ? 403 : 409;
      return json(res, status, result);
    }
    const rpClubPresidencyTransferMatch = url.pathname.match(/^\/api\/rp-clubs\/([a-f0-9-]{36})\/presidency\/transfer$/i);
    if (req.method === 'POST' && rpClubPresidencyTransferMatch) {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error:'SESSION_EXPIRED' });
      const body = await readBody(req);
      const result = rpClubStore.transferPresidency(rpClubPresidencyTransferMatch[1], body.playerId, account.id);
      const status = result.ok ? 200 : result.reason === 'RP_CLUB_NOT_FOUND' || result.reason === 'RP_CLUB_MEMBER_NOT_FOUND' ? 404
        : result.reason === 'RP_CLUB_PERMISSION_DENIED' ? 403 : 409;
      return json(res, status, result);
    }
    const rpClubRemoveMemberMatch = url.pathname.match(/^\/api\/rp-clubs\/([a-f0-9-]{36})\/members\/(FRP-\d{6})\/remove$/i);
    if (req.method === 'POST' && rpClubRemoveMemberMatch) {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error:'SESSION_EXPIRED' });
      const result = rpClubStore.removeMember(rpClubRemoveMemberMatch[1], rpClubRemoveMemberMatch[2], account.id);
      const status = result.ok ? 200 : result.reason === 'RP_CLUB_NOT_FOUND' || result.reason === 'RP_CLUB_MEMBER_NOT_FOUND' ? 404
        : result.reason === 'RP_CLUB_PERMISSION_DENIED' ? 403 : 409;
      return json(res, status, result);
    }
    const rpClubLeaveMatch = url.pathname.match(/^\/api\/rp-clubs\/([a-f0-9-]{36})\/leave$/i);
    if (req.method === 'POST' && rpClubLeaveMatch) {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error: 'SESSION_EXPIRED' });
      const result = rpClubStore.leave(rpClubLeaveMatch[1], account.id);
      const status = result.ok ? 200 : result.reason === 'RP_CLUB_NOT_FOUND' || result.reason === 'RP_CLUB_MEMBERSHIP_NOT_FOUND' ? 404 : 409;
      return json(res, status, result);
    }
    if (req.method === 'GET' && url.pathname === '/api/accounts/me') {
      const account = accountStore.resolve(accountSessionToken(req));
      return account ? json(res, 200, { account }) : json(res, 401, { error: 'SESSION_EXPIRED' });
    }
    if (req.method === 'POST' && url.pathname === '/api/accounts/logout') {
      accountStore.revoke(accountSessionToken(req));
      res.setHeader('set-cookie', clearAccountSessionCookie());
      return json(res, 200, { loggedOut: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/accounts/sessions/revoke-all') {
      const account = accountStore.resolve(accountSessionToken(req));
      if (!account) return json(res, 401, { error: 'SESSION_EXPIRED' });
      const revokedSessions = accountStore.revokeAll(account.id);
      res.setHeader('set-cookie', clearAccountSessionCookie());
      return json(res, 200, { revoked: true, revokedSessions });
    }
    if (req.method === 'GET' && url.pathname === '/api/league-structure') {
      const clubs=[...competitionStore.clubs.values()];
      const divisionCounts=Object.fromEntries(LEAGUE_DIVISIONS.map(item=>[item.id,clubs.filter(club=>club.division===item.id).length]));
      const conferenceCounts={
        D4:Object.fromEntries(CONFERENCE_NAMES.D4.map(name=>[name,clubs.filter(club=>club.division==='D4'&&club.conference===name).length])),
        D5:Object.fromEntries(CONFERENCE_NAMES.D5.map(name=>[name,clubs.filter(club=>club.division==='D5'&&club.conference===name).length]))
      };
      const complete=clubs.length===TOTAL_LEAGUE_CLUBS &&
        LEAGUE_DIVISIONS.every(item=>divisionCounts[item.id]===item.targetClubs) &&
        [...Object.values(conferenceCounts.D4),...Object.values(conferenceCounts.D5)].every(count=>count===16);
      return json(res,200,{
        divisions:LEAGUE_DIVISIONS,conferences:CONFERENCE_NAMES,totalClubs:TOTAL_LEAGUE_CLUBS,
        currentClubCount:clubs.length,divisionCounts,conferenceCounts,complete
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/competitions') {
      return json(res, 200, competitionStore.snapshot());
    }
    if (req.method === 'GET' && url.pathname === '/api/results') {
      const rawLimit = url.searchParams.get('limit');
      const rawOffset = url.searchParams.get('offset');
      const limit = rawLimit === null ? 20 : Number(rawLimit);
      const offset = rawOffset === null ? 0 : Number(rawOffset);
      if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(offset) || limit < 1 || offset < 0) return json(res, 400, { error: 'INVALID_PAGINATION' });
      return json(res, 200, manager.pageResults({ limit, offset }));
    }
    if (req.method === 'POST' && url.pathname === '/api/rooms') {
      const body = await readBody(req);
      return json(res, 201, manager.create({ name: body.name, durationMinutes: body.durationMinutes, blueClubId: body.blueClubId, redClubId: body.redClubId, competitionFixtureId: body.competitionFixtureId }));
    }
    const joinMatch = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{12})\/join$/);
    if (req.method === 'POST' && joinMatch) {
      const body = await readBody(req);
      const accountToken = accountSessionToken(req);
      const account = accountToken ? accountStore.resolve(accountToken) : null;
      if (accountToken && !account) return json(res, 401, { error: 'SESSION_EXPIRED' });
      const playerIdentity = account ? playerIdentityStore.getByAccountId(account.id) : null;
      const room = manager.rooms.get(joinMatch[1]);
      if (room?.rpClubChallenge) {
        if (!account) return json(res, 401, { error:'SESSION_REQUIRED' });
        const admission = rpClubMatchService.resolveJoin(joinMatch[1], account.id);
        if (!admission.ok) return json(res, admission.reason === 'ROOM_NOT_FOUND' ? 404 : 403, admission);
        if (!playerIdentity || playerIdentity.playerId !== account.playerId) return json(res, 403, { error:'PLAYER_IDENTITY_REQUIRED' });
        const occupied = [...room.players.values()].filter(player => !player.isBot && player.connected && player.team === admission.team).length;
        if (occupied >= 5) return json(res, 409, { error:'RP_CLUB_CHALLENGE_TEAM_FULL' });
        body.preferredTeam = admission.team;
      }
      return json(res, 200, manager.join(joinMatch[1], {
        ...body,
        accountId: account?.id || null,
        careerPlayerId: playerIdentity?.playerId || null
      }));
    }
    const entryRequestMatch = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{12})\/entry-request$/);
    if (req.method === 'POST' && entryRequestMatch) {
      return json(res, 200, manager.requestEntry(entryRequestMatch[1], bearer(req)));
    }
    const rotationMatch = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{12})\/rotation$/);
    if (req.method === 'POST' && rotationMatch) {
      const body = await readBody(req);
      return json(res, 200, manager.rotate(rotationMatch[1], bearer(req), body));
    }
    const inputMatch = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{12})\/input$/);
    if (req.method === 'POST' && inputMatch) {
      const body = await readBody(req);
      return json(res, 200, manager.submitInput(inputMatch[1], req.headers.authorization?.replace(/^Bearer\s+/i, ''), body));
    }
    const reconnectMatch = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{12})\/reconnect$/);
    if (req.method === 'POST' && reconnectMatch) {
      const result = manager.reconnect(reconnectMatch[1], req.headers.authorization?.replace(/^Bearer\s+/i, ''));
      return json(res, 200, result);
    }
    const heartbeatMatch = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{12})\/heartbeat$/);
    if (req.method === 'POST' && heartbeatMatch) {
      const heartbeat = manager.heartbeat(heartbeatMatch[1], req.headers.authorization?.replace(/^Bearer\s+/i, ''));
      return json(res, 200, heartbeat);
    }
    const leaveMatch = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{12})\/leave$/);
    if (req.method === 'POST' && leaveMatch) {
      manager.leave(leaveMatch[1], req.headers.authorization?.replace(/^Bearer\s+/i, ''));
      return json(res, 200, { left: true });
    }
    const resultMatch = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{12})\/result$/);
    if (req.method === 'GET' && resultMatch) return json(res, 200, manager.getResult(resultMatch[1]));
    const stateMatch = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{12})$/);
    if (req.method === 'GET' && stateMatch) {
      const rawSince = url.searchParams.get('sinceSequence');
      const since = rawSince === null ? NaN : Number(rawSince);
      const afterEventId = Number(url.searchParams.get('afterEventId') || 0);
      if (Number.isSafeInteger(since) && since >= -1) {
        const delta = manager.getDelta(stateMatch[1], { afterSequence: since, afterEventId: Number.isSafeInteger(afterEventId) ? afterEventId : 0 });
        if (!delta.changed) { res.writeHead(204, { 'cache-control': 'no-store', 'x-room-sequence': String(delta.state.sequence) }); return res.end(); }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-room-sequence': String(delta.state.sequence) });
        return res.end(JSON.stringify(delta));
      }
      return json(res, 200, manager.get(stateMatch[1]));
    }
    if (req.method === 'GET') {
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { return json(res, 400, { error: 'INVALID_PATH' }); }
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const segments = relative.split(/[\/]+/).filter(Boolean);
      const privateSegments = new Set(['data','server','tests','node_modules']);
      if (segments.some(segment => segment.startsWith('.') || privateSegments.has(segment.toLowerCase())))
        return json(res, 403, { error:'FORBIDDEN' });
      const target = path.resolve(APP_ROOT, relative);
      if (target !== APP_ROOT && !target.startsWith(APP_ROOT + path.sep)) return json(res, 403, { error: 'FORBIDDEN' });
      try {
        // Lexical traversal checks do not stop a public symlink from pointing outside APP_ROOT.
        const resolvedTarget = await realpath(target);
        if (resolvedTarget !== APP_ROOT && !resolvedTarget.startsWith(APP_ROOT + path.sep))
          return json(res, 403, { error:'FORBIDDEN' });
        const content = await readFile(resolvedTarget);
        res.writeHead(200, { 'content-type': MIME[path.extname(resolvedTarget).toLowerCase()] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cache-control': path.extname(resolvedTarget) === '.html' ? 'no-cache' : 'public, max-age=3600' });
        return res.end(content);
      } catch { return json(res, 404, { error: 'NOT_FOUND' }); }
    }
    return json(res, 404, { error: 'NOT_FOUND' });
  } catch (error) {
    const code = error.message || 'INTERNAL_ERROR';
    const status = code === 'GOOGLE_OIDC_NOT_CONFIGURED' ? 503 : code === 'GOOGLE_OIDC_RATE_LIMITED' ? 429 : code === 'GOOGLE_OIDC_ORIGIN_INVALID' ? 403 : code === 'GOOGLE_OIDC_TRANSACTION_INVALID' || code === 'GOOGLE_OIDC_TOKEN_EXCHANGE_FAILED' || code === 'GOOGLE_OIDC_ID_TOKEN_MISSING' || code === 'GOOGLE_ID_TOKEN_SIGNATURE_INVALID' || code === 'GOOGLE_ID_TOKEN_NONCE_INVALID' || code === 'GOOGLE_ID_TOKEN_AUDIENCE_INVALID' || code.startsWith('GOOGLE_ID_TOKEN_') ? 401 : code === 'ROOM_NOT_FOUND' || code === 'COMPETITION_FIXTURE_NOT_FOUND' ? 404 : code === 'COMPETITION_FIXTURE_NOT_READY' || code === 'COMPETITION_FIXTURE_MISMATCH' ? 409 : (code === 'UNAUTHORIZED' || code === 'SESSION_EXPIRED' || code === 'INVALID_CREDENTIALS') ? 401 : code === 'RATE_LIMIT' ? 429 : code === 'USERNAME_TAKEN' ? 409 : code === 'BODY_TOO_LARGE' ? 413 : code === 'INVALID_JSON' || code === 'GOOGLE_OIDC_CODE_INVALID' || code.startsWith('INVALID_') || code === 'STALE_INPUT' ? 400 : 409;
    return json(res, status, { error: code });
  }
});
server.headersTimeout = 15_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 1_000;

const tick = setInterval(() => manager.tick(0.05), 50);
playerBackupScheduler.start();
const assignmentSyncTick = setInterval(() => {
  if (!assignmentSyncPending) return;
  try {
    const result = syncClubAssignments({ clubManager:serverClubManager, competitionStore });
    if (result.ok) {
      assignmentSyncPending = false;
      process.stdout.write('P27 club assignment persistence recovered\\n');
    } else if (result.reason !== 'club-assignment-persistence-pending') {
      process.stderr.write(`P27 club assignment retry blocked: ${result.reason}\\n`);
    }
  } catch (error) { process.stderr.write(`P27 club assignment retry failed: ${error.message}\\n`); }
}, 60 * 1000);
assignmentSyncTick.unref();
const humanRosterSyncTick = setInterval(() => {
  try { syncPendingHumanRosters(); }
  catch (error) { process.stderr.write(`P27 human roster sync retry failed: ${error.message}\\n`); }
}, 15 * 1000);
humanRosterSyncTick.unref();
const clubWorldTick = setInterval(() => {
  try {
    const result = clubWorld.tick();
    if (!result.ok) process.stderr.write(`P27 club world tick incomplete: ${result.reason || 'unknown'}\n`);
  } catch (error) { process.stderr.write(`P27 club world tick failed: ${error.message}\n`); }
}, 60 * 60 * 1000);
clubWorldTick.unref();
try {
  const result = clubWorld.tick();
  if (!result.ok) process.stderr.write(`P27 club world startup tick incomplete: ${result.reason || 'unknown'}\n`);
} catch (error) { process.stderr.write(`P27 club world startup tick failed: ${error.message}\n`); }
tick.unref();
let shutdownPromise = null;
function shutdownP27Server() {
  if (shutdownPromise) return shutdownPromise;
  clearInterval(tick);
  clearInterval(assignmentSyncTick);
  clearInterval(humanRosterSyncTick);
  clearInterval(clubWorldTick);
  playerBackupScheduler.stop();
  careerSyncService.stop();
  shutdownPromise = new Promise((resolve, reject) => {
    const flush = () => {
      const report = manager.persistAllRooms();
      if (report.failed.length) {
        const error = new Error('P27_SHUTDOWN_CHECKPOINT_FAILED');
        error.details = report.failed;
        reject(error);
      } else {
        process.stdout.write(`P27 shutdown checkpoints saved: ${report.saved}\n`);
        resolve(report);
      }
    };
    if (!server.listening) { flush(); return; }
    server.close(error => {
      if (error) { reject(error); return; }
      flush();
    });
  });
  return shutdownPromise;
}

const port = Math.max(1, Math.min(65535, Number(process.env.PORT) || 8080));
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  server.listen(port, '0.0.0.0', () => {
    process.stdout.write(`Football RP Online match server listening on ${port}\n`);
    careerSyncService.start();
  });
  const handleSignal = signal => {
    process.stdout.write(`P27 graceful shutdown requested: ${signal}\n`);
    shutdownP27Server().catch(error => {
      process.stderr.write(`P27 graceful shutdown failed: ${error.message}\n`);
      process.exitCode = 1;
    });
  };
  process.once('SIGTERM', () => handleSignal('SIGTERM'));
  process.once('SIGINT', () => handleSignal('SIGINT'));
}
export { server, manager, clubFinance, serverClubManager, clubWorld, rpClubStore, accountStore, playerIdentityStore, playerBackupScheduler, careerSyncQueue, careerSyncService, careerStore, rpClubSeasonStore, shutdownP27Server };
