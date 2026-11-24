import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { JsonResultStore } from './result-store.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RoomManager } from './room-manager.js';
import { JsonAccountStore } from './account-store.js';
import { JsonCareerStore } from './career-store.js';

const resultDirectory = process.env.RESULTS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'results');
const careerDirectory = process.env.CAREERS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'careers');
const careerStore = new JsonCareerStore(careerDirectory);
const manager = new RoomManager({ resultStore: new JsonResultStore(resultDirectory), careerStore });
const accountDirectory = process.env.ACCOUNTS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'accounts');
const accountStore = new JsonAccountStore(accountDirectory);
const accountAttempts = new Map();
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, service: 'football-rp-online-match-server', protocol: 1 });
  try {
    if (req.method === 'GET' && url.pathname === '/api/rooms') return json(res, 200, { rooms: manager.list() });
    if (req.method === 'POST' && (url.pathname === '/api/accounts/register' || url.pathname === '/api/accounts/login')) {
      if (!allowAccountAttempt(req.socket.remoteAddress)) return json(res, 429, { error: 'RATE_LIMIT' });
      const body = await readBody(req);
      if (url.pathname.endsWith('/register')) return json(res, 201, accountStore.register(body));
      const session = accountStore.login(body);
      return session ? json(res, 200, session) : json(res, 401, { error: 'INVALID_CREDENTIALS' });
    }
    if (req.method === 'GET' && url.pathname === '/api/career') {
      const account = accountStore.resolve(bearer(req));
      if (!account) return json(res, 401, { error: 'SESSION_EXPIRED' });
      return json(res, 200, { career: careerStore.get(account.id) });
    }
    if (req.method === 'GET' && url.pathname === '/api/accounts/me') {
      const account = accountStore.resolve(bearer(req));
      return account ? json(res, 200, { account }) : json(res, 401, { error: 'SESSION_EXPIRED' });
    }
    if (req.method === 'POST' && url.pathname === '/api/accounts/logout') {
      accountStore.revoke(bearer(req));
      return json(res, 200, { loggedOut: true });
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
      return json(res, 201, manager.create({ name: body.name, durationMinutes: body.durationMinutes, blueClubId: body.blueClubId, redClubId: body.redClubId }));
    }
    const joinMatch = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{12})\/join$/);
    if (req.method === 'POST' && joinMatch) {
      const body = await readBody(req);
      const accountToken = bearer(req);
      const account = accountToken ? accountStore.resolve(accountToken) : null;
      if (accountToken && !account) return json(res, 401, { error: 'SESSION_EXPIRED' });
      return json(res, 200, manager.join(joinMatch[1], { ...body, accountId: account?.id || null }));
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
      const since = Number(url.searchParams.get('sinceSequence'));
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
      const target = path.resolve(APP_ROOT, relative);
      if (target !== APP_ROOT && !target.startsWith(APP_ROOT + path.sep)) return json(res, 403, { error: 'FORBIDDEN' });
      try {
        const content = await readFile(target);
        res.writeHead(200, { 'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cache-control': path.extname(target) === '.html' ? 'no-cache' : 'public, max-age=3600' });
        return res.end(content);
      } catch { return json(res, 404, { error: 'NOT_FOUND' }); }
    }
    return json(res, 404, { error: 'NOT_FOUND' });
  } catch (error) {
    const code = error.message || 'INTERNAL_ERROR';
    const status = code === 'ROOM_NOT_FOUND' ? 404 : (code === 'UNAUTHORIZED' || code === 'SESSION_EXPIRED' || code === 'INVALID_CREDENTIALS') ? 401 : code === 'RATE_LIMIT' ? 429 : code === 'USERNAME_TAKEN' ? 409 : code === 'BODY_TOO_LARGE' ? 413 : code === 'INVALID_JSON' || code.startsWith('INVALID_') || code === 'STALE_INPUT' ? 400 : 409;
    return json(res, status, { error: code });
  }
});

const tick = setInterval(() => manager.tick(0.05), 50);
tick.unref();
const port = Math.max(1, Math.min(65535, Number(process.env.PORT) || 8080));
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  server.listen(port, '0.0.0.0', () => process.stdout.write(`Football RP Online match server listening on ${port}\n`));
}
export { server, manager };
