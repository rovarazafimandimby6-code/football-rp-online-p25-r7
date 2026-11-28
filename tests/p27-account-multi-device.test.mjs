import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { server } from '../server/index.js';

test('P27 compte multi-appareils : une seconde connexion retrouve le même profil et la progression serveur', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const username = `device_${randomBytes(5).toString('hex')}`;
  const password = 'multi-device-strong-passphrase-2026';
  const request = async (path, token, options = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
    return { status: response.status, data: await response.json() };
  };

  try {
    const first = await request('/api/accounts/register', null, {
      method: 'POST',
      body: JSON.stringify({ username, password, displayName: 'Joueur multi-appareils' })
    });
    assert.equal(first.status, 201);
    const firstToken = first.data.token;
    const accountId = first.data.account.id;

    const saved = await request('/api/profile', firstToken, {
      method: 'PUT',
      body: JSON.stringify({ profile: {
        identity: { displayName: 'Carrière conservée', role: 'FWD', number: 11 },
        appearance: { kit: 'violet', hairStyle: 'fade' }
      } })
    });
    assert.equal(saved.status, 200);

    const trained = await request('/api/progression', firstToken, {
      method: 'POST',
      body: JSON.stringify({ action: 'practice', attribute: 'control', amount: 1 })
    });
    assert.equal(trained.status, 200);
    assert.equal(trained.data.progression.attributes.control, 51);

    const second = await request('/api/accounts/login', null, {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    assert.equal(second.status, 200);
    assert.equal(second.data.account.id, accountId);
    assert.notEqual(second.data.token, firstToken);

    const [profile, progression, career, firstSession] = await Promise.all([
      request('/api/profile', second.data.token),
      request('/api/progression', second.data.token),
      request('/api/career', second.data.token),
      request('/api/accounts/me', firstToken)
    ]);
    assert.equal(profile.status, 200);
    assert.equal(profile.data.profile.identity.displayName, 'Carrière conservée');
    assert.equal(profile.data.profile.identity.role, 'FWD');
    assert.equal(profile.data.profile.appearance.kit, 'violet');
    assert.equal(progression.status, 200);
    assert.equal(progression.data.progression.attributes.control, 51);
    assert.equal(career.status, 200);
    assert.equal(firstSession.status, 200, 'la première session reste active sur le premier appareil');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
