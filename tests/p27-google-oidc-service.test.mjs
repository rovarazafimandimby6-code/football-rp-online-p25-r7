import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleAuthorizationUrl, completeGoogleAuthorization, createGoogleBrowserBinding } from '../server/google-oidc-service.js';

const accountId = '123e4567-e89b-42d3-a456-426614174000';
const config = {
  configured: true, clientId: 'p27-test.apps.googleusercontent.com',
  clientSecret: 'test-secret-never-returned', redirectUri: 'https://game.example/api/auth/google/callback',
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token'
};

test('Google authorization start binds existing account and uses OIDC nonce and PKCE', () => {
  const calls = [];
  const transactionStore = { create: args => { calls.push(args); return {
    state: 's'.repeat(43), nonce: 'n'.repeat(43), codeChallenge: 'c'.repeat(43),
    codeChallengeMethod: 'S256', expiresAt: new Date(1_900_000_000_000).toISOString()
  }; } };
  const result = createGoogleAuthorizationUrl({ config, transactionStore, accountId, sessionBinding: 'b'.repeat(43) });
  const url = new URL(result.authorizationUrl);
  assert.equal(url.searchParams.get('client_id'), config.clientId);
  assert.equal(url.searchParams.get('nonce'), 'n'.repeat(43));
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(calls[0].accountId, accountId);
  assert.equal(calls[0].sessionBinding, 'b'.repeat(43));
  assert.equal(result.authorizationUrl.includes(config.clientSecret), false);
});

test('Google callback fails closed for missing transaction and malformed authorization code', async () => {
  const transactionStore = { consume: () => null };
  await assert.rejects(() => completeGoogleAuthorization({
    config, transactionStore, identityStore: {}, state: 's'.repeat(43),
    code: 'authorization-code-123', sessionBinding: 'b'.repeat(43)
  }), /GOOGLE_OIDC_TRANSACTION_INVALID/);
  await assert.rejects(() => completeGoogleAuthorization({
    config, transactionStore, identityStore: {}, state: 's'.repeat(43),
    code: 'bad code', sessionBinding: 'b'.repeat(43)
  }), /GOOGLE_OIDC_CODE_INVALID/);
});

test('Google callback exchanges code with PKCE and links only the account stored in the transaction', async () => {
  const calls = [];
  const transactionStore = { consume: args => {
    calls.push(['consume', args]);
    return { accountId, nonce: 'n'.repeat(43), codeVerifier: 'v'.repeat(43) };
  } };
  const identityStore = { linkInitial: args => {
    calls.push(['link', args]);
    return { accountId, linkedAt: '2026-11-25T00:00:00.000Z' };
  } };
  const fetchImpl = async (url, options) => {
    calls.push(['fetch', url, options]);
    return { ok: true, json: async () => ({ id_token: 'signed.id-token' }) };
  };
  const verifyToken = async (token, context) => {
    calls.push(['verify', token, context]);
    return { googleSubject: 'google-subject-0001' };
  };
  const result = await completeGoogleAuthorization({
    config, transactionStore, identityStore, state: 's'.repeat(43),
    code: 'authorization-code-123', sessionBinding: 'b'.repeat(43),
    fetchImpl, verifyToken
  });
  assert.equal(result.linked, true);
  assert.equal(result.accountId, accountId);
  const exchange = calls.find(call => call[0] === 'fetch')[2];
  const params = new URLSearchParams(exchange.body);
  assert.equal(params.get('code_verifier'), 'v'.repeat(43));
  assert.equal(params.get('client_secret'), config.clientSecret);
  assert.deepEqual(calls.find(call => call[0] === 'link')[1], {
    accountId, googleSubject: 'google-subject-0001', googleIdentityVerified: true
  });
});

test('Google browser binding is high entropy and URL-safe', () => {
  const binding = createGoogleBrowserBinding();
  assert.match(binding, /^[A-Za-z0-9_-]{43}$/);
});
