import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { server } from '../server/index.js';

test('P27 API compte : inscription, authentification, session protégée et révocation HTTP', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const username = `api_${randomBytes(5).toString('hex')}`;
  const password = 'api-strong-passphrase-2026';
  try {
    const registered = await fetch(`${base}/api/accounts/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password, displayName: 'Carrière test' })
    });
    assert.equal(registered.status, 201);
    const created = await registered.json();
    assert.equal(created.account.username, username);
    assert.ok(created.token.length >= 40);

    const me = await fetch(`${base}/api/accounts/me`, { headers: { authorization: `Bearer ${created.token}` } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).account.id, created.account.id);

    const login = await fetch(`${base}/api/accounts/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    assert.equal(login.status, 200);
    const loggedIn = await login.json();
    assert.equal(loggedIn.account.id, created.account.id);

    const wrongPassword = await fetch(`${base}/api/accounts/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: 'incorrect-password-123' })
    });
    assert.equal(wrongPassword.status, 401);

    const logout = await fetch(`${base}/api/accounts/logout`, {
      method: 'POST', headers: { authorization: `Bearer ${loggedIn.token}` }
    });
    assert.equal(logout.status, 200);
    const revoked = await fetch(`${base}/api/accounts/me`, { headers: { authorization: `Bearer ${loggedIn.token}` } });
    assert.equal(revoked.status, 401);

    const invalidPayload = await fetch(`${base}/api/accounts/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null'
    });
    assert.equal(invalidPayload.status, 400);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
