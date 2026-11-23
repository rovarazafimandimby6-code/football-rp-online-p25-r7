import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JsonAccountStore } from '../server/account-store.js';
import { OnlineAccountClient } from '../src/online-account-client.js';

function tempStore(options = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'fpro-accounts-'));
  return { directory, store: new JsonAccountStore(directory, options), cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

test('P27 compte : crée une identité persistante et ne stocke ni mot de passe ni jeton en clair', () => {
  const temp = tempStore();
  try {
    const session = temp.store.register({ username: 'Player_01', password: 'a-strong-passphrase', displayName: 'Player One' });
    assert.equal(session.account.username, 'player_01');
    assert.equal(session.account.displayName, 'Player One');
    assert.equal(temp.store.resolve(session.token).id, session.account.id);
    const disk = readFileSync(path.join(temp.directory, 'accounts.json'), 'utf8');
    assert.equal(disk.includes('a-strong-passphrase'), false);
    assert.equal(disk.includes(session.token), false);
    assert.match(disk, /passwordHash/);
    assert.match(disk, /tokenHash/);
  } finally { temp.cleanup(); }
});

test('P27 compte : refuse les identifiants invalides et les noms déjà utilisés', () => {
  const temp = tempStore();
  try {
    assert.throws(() => temp.store.register({ username: 'ab', password: 'a-strong-passphrase' }), /INVALID_USERNAME/);
    assert.throws(() => temp.store.register({ username: 'valid_name', password: 'short' }), /INVALID_PASSWORD/);
    temp.store.register({ username: 'valid_name', password: 'a-strong-passphrase' });
    assert.throws(() => temp.store.register({ username: 'VALID_NAME', password: 'another-strong-pass' }), /USERNAME_TAKEN/);
    assert.equal(temp.store.login({ username: 'valid_name', password: 'wrong-password-here' }), null);
  } finally { temp.cleanup(); }
});

test('P27 compte : la session survit au redémarrage serveur et expire selon son échéance', () => {
  let now = Date.parse('2030-01-01T00:00:00.000Z');
  const directory = mkdtempSync(path.join(tmpdir(), 'fpro-accounts-restart-'));
  try {
    const first = new JsonAccountStore(directory, { now: () => now, sessionTtlMs: 60_000 });
    const session = first.register({ username: 'career_user', password: 'another-strong-passphrase' });
    const restarted = new JsonAccountStore(directory, { now: () => now, sessionTtlMs: 60_000 });
    assert.equal(restarted.resolve(session.token).id, session.account.id);
    now += 60_001;
    assert.equal(restarted.resolve(session.token), null);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('P27 compte : la révocation invalide immédiatement le jeton', () => {
  const temp = tempStore();
  try {
    const session = temp.store.register({ username: 'revoked_user', password: 'a-strong-passphrase' });
    assert.equal(temp.store.revoke(session.token), true);
    assert.equal(temp.store.resolve(session.token), null);
    assert.equal(temp.store.revoke(session.token), false);
  } finally { temp.cleanup(); }
});

test('P27 compte client : inscription, restauration locale, actualisation et déconnexion', async () => {
  const values = new Map();
  const storage = { setItem: (k,v) => values.set(k,v), getItem: k => values.get(k) ?? null, removeItem: k => values.delete(k) };
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    const body = options.body ? JSON.parse(options.body) : {};
    const data = url.endsWith('/register')
      ? { token: 'x'.repeat(43), account: { id: 'account-1', username: body.username } }
      : url.endsWith('/me') ? { account: { id: 'account-1', username: 'career_user' } } : { loggedOut: true };
    return { ok: true, status: 200, json: async () => data };
  };
  const client = new OnlineAccountClient({ baseUrl: 'https://game.example', fetchImpl, storage });
  await client.register({ username: 'career_user', password: 'a-strong-passphrase' });
  const restored = new OnlineAccountClient({ baseUrl: 'https://game.example', fetchImpl, storage });
  assert.equal(restored.restoreSession(), true);
  assert.equal((await restored.refresh()).id, 'account-1');
  assert.equal(calls[1].options.headers.authorization, `Bearer ${'x'.repeat(43)}`);
  assert.equal(await restored.logout(), true);
  assert.equal(restored.token, null);
  assert.equal(values.has('fpro.account.session'), false);
});
