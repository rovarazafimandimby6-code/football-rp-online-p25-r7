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

    const progressionResponse = await fetch(`${base}/api/progression`, { headers: { authorization: `Bearer ${created.token}` } });
    assert.equal(progressionResponse.status, 200);
    const progression = (await progressionResponse.json()).progression;
    assert.ok(progression.processedMatchIds.length >= 1);
    assert.equal(progression.processedMatchIds[0], room.id);
    const practiceResponse = await fetch(`${base}/api/progression`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${created.token}` },
      body: JSON.stringify({ action: 'practice', attribute: 'control', amount: 1 })
    });
    assert.equal(practiceResponse.status, 200);
    assert.equal((await practiceResponse.json()).progression.attributes.control, 51);
    const forbiddenProgression = await fetch(`${base}/api/progression`);
    assert.equal(forbiddenProgression.status, 401);
    const forgedProgression = await fetch(`${base}/api/progression`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${created.token}` },
      body: JSON.stringify({ action: 'set', progression: { level: 99, coins: 999999999 } })
    });
    assert.equal(forgedProgression.status, 400);



    const me = await fetch(`${base}/api/accounts/me`, { headers: { authorization: `Bearer ${created.token}` } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).account.id, created.account.id);

    const cookieMe = await fetch(`${base}/api/accounts/me`, { headers: { cookie: `p27_session=${created.token}` } });
    assert.equal(cookieMe.status, 200);
    assert.equal((await cookieMe.json()).account.id, created.account.id);
    const csrfBlocked = await fetch(`${base}/api/accounts/logout`, {
      method: 'POST', headers: { cookie: `p27_session=${created.token}` }
    });
    assert.equal(csrfBlocked.status, 200);
    const cookieStillValid = await fetch(`${base}/api/accounts/me`, { headers: { cookie: `p27_session=${created.token}` } });
    assert.equal(cookieStillValid.status, 200);
    const cookieLogout = await fetch(`${base}/api/accounts/logout`, {
      method: 'POST', headers: { cookie: `p27_session=${created.token}`, origin: base }
    });
    assert.equal(cookieLogout.status, 200);
    assert.match(cookieLogout.headers.get('set-cookie') || '', /p27_session=; HttpOnly/);
    const cookieRevoked = await fetch(`${base}/api/accounts/me`, { headers: { cookie: `p27_session=${created.token}` } });
    assert.equal(cookieRevoked.status, 401);

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

    const secondLogin = await fetch(`${base}/api/accounts/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    assert.equal(secondLogin.status, 200);
    const secondSession = await secondLogin.json();
    const revokeAll = await fetch(`${base}/api/accounts/sessions/revoke-all`, {
      method: 'POST',
      headers: { cookie: `p27_session=${secondSession.token}`, origin: base }
    });
    assert.equal(revokeAll.status, 200);
    assert.equal((await revokeAll.json()).revoked, true);
    assert.equal((await fetch(`${base}/api/accounts/me`, { headers: { authorization: `Bearer ${secondSession.token}` } })).status, 401);

    const invalidPayload = await fetch(`${base}/api/accounts/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null'
    });
    assert.equal(invalidPayload.status, 400);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
