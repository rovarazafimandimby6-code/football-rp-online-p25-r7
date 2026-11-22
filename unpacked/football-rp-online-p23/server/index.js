import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RoomManager } from './room-manager.js';

const manager = new RoomManager();
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
    if (req.method === 'POST' && url.pathname === '/api/rooms') {
      const body = await readBody(req);
      return json(res, 201, manager.create({ name: body.name, durationMinutes: body.durationMinutes }));
    }
    const joinMatch = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{12})\/join$/);
    if (req.method === 'POST' && joinMatch) {
      const body = await readBody(req);
      return json(res, 200, manager.join(joinMatch[1], body));
    }
    const inputMatch = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{12})\/input$/);
    if (req.method === 'POST' && inputMatch) {
      const body = await readBody(req);
      return json(res, 200, manager.submitInput(inputMatch[1], req.headers.authorization?.replace(/^Bearer\s+/i, ''), body));
    }
    const heartbeatMatch = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{12})\/heartbeat$/);
    if (req.method === 'POST' && heartbeatMatch) {
      manager.heartbeat(heartbeatMatch[1], req.headers.authorization?.replace(/^Bearer\s+/i, ''));
      return json(res, 200, { alive: true });
    }
    const leaveMatch = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{12})\/leave$/);
    if (req.method === 'POST' && leaveMatch) {
      manager.leave(leaveMatch[1], req.headers.authorization?.replace(/^Bearer\s+/i, ''));
      return json(res, 200, { left: true });
    }
    const stateMatch = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{12})$/);
    if (req.method === 'GET' && stateMatch) {
      const since = Number(url.searchParams.get('sinceSequence'));
      const afterEventId = Number(url.searchParams.get('afterEventId') || 0);
      if (Number.isSafeInteger(since) && since >= 0) {
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
    const status = code === 'ROOM_NOT_FOUND' ? 404 : code === 'UNAUTHORIZED' ? 401 : code === 'BODY_TOO_LARGE' ? 413 : code === 'INVALID_JSON' || code.startsWith('INVALID_') || code === 'STALE_INPUT' || code === 'RATE_LIMIT' ? 400 : 409;
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
