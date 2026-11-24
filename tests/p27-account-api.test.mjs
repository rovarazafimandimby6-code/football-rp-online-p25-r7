import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { server, manager } from '../server/index.js';

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


    const roomResponse = await fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Carrière liée' }) });
    const room = await roomResponse.json();
    const joinedResponse = await fetch(`${base}/api/rooms/${room.id}/join`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${created.token}` }, body: JSON.stringify({ displayName: 'Carrière test' }) });
    assert.equal(joinedResponse.status, 200);
    const joined = await joinedResponse.json();
    const internal = manager.rooms.get(room.id);
    const participant = internal.players.get(joined.playerId);
    participant.matchTimePlayedMs = 45000; participant.stats.goals = 1; participant.stats.passes = 5; participant.stats.completedPasses = 4;
    internal.phase = 'fulltime'; internal.elapsedMs = internal.durationMinutes * 60000; internal.score = { blue: participant.team === 'blue' ? 1 : 0, red: participant.team === 'red' ? 1 : 0 };
    manager.finalizeResult(internal);
    const careerResponse = await fetch(`${base}/api/career`, { headers: { authorization: `Bearer ${created.token}` } });
    assert.equal(careerResponse.status, 200);
    const career = (await careerResponse.json()).career;
    assert.equal(career.totals.matches, 1);
    assert.equal(career.totals.goals, 1);
    assert.equal(career.totals.completedPasses, 4);
    const forbiddenCareer = await fetch(`${base}/api/career`);
    assert.equal(forbiddenCareer.status, 401);

    const savedProfile = await fetch(`${base}/api/profile`, {
      method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${created.token}` },
      body: JSON.stringify({ profile: { identity: { displayName: 'Compte test', role: 'FWD', number: 9 }, appearance: { kit: 'violet', hairStyle: 'fade' }, progression: { coins: 999999 } } })
    });
    assert.equal(savedProfile.status, 200);
    const cloudProfile = (await savedProfile.json()).profile;
    assert.equal(cloudProfile.identity.role, 'FWD');
    assert.equal(cloudProfile.appearance.kit, 'violet');
    assert.equal(Object.hasOwn(cloudProfile, 'progression'), false);
    const loadedProfile = await fetch(`${base}/api/profile`, { headers: { authorization: `Bearer ${created.token}` } });
    assert.equal(loadedProfile.status, 200);
    assert.equal((await loadedProfile.json()).profile.identity.displayName, 'Compte test');
    const forbiddenProfile = await fetch(`${base}/api/profile`);
    assert.equal(forbiddenProfile.status, 401);


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
