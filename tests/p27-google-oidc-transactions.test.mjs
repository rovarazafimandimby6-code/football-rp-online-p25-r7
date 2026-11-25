import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GoogleOidcTransactionStore } from '../server/google-oidc-transactions.js';

const binding = 'browser-session-binding-value-0001';

test('Google OIDC transaction issues state, nonce and S256 PKCE challenge', () => {
  const store = new GoogleOidcTransactionStore();
  const tx = store.create({ sessionBinding: binding });
  assert.ok(tx.state.length >= 40);
  assert.ok(tx.nonce.length >= 40);
  assert.equal(tx.codeChallengeMethod, 'S256');
  assert.equal(tx.codeChallenge, createHash('sha256').update(tx.codeVerifier).digest('base64url'));
  assert.equal(store.transactions.size, 1);
});

test('Google OIDC transaction is bound to the initiating browser session and single-use', () => {
  const store = new GoogleOidcTransactionStore();
  const tx = store.create({ sessionBinding: binding });
  assert.equal(store.consume({ state: tx.state, sessionBinding: 'different-browser-session-binding' }), null);
  const consumed = store.consume({ state: tx.state, sessionBinding: binding });
  assert.equal(consumed.nonce, tx.nonce);
  assert.equal(consumed.codeVerifier, tx.codeVerifier);
  assert.equal(store.consume({ state: tx.state, sessionBinding: binding }), null);
});

test('Google OIDC transaction expires and rejects malformed bindings', () => {
  let now = 1_000_000;
  const store = new GoogleOidcTransactionStore({ now: () => now, ttlMs: 60_000 });
  assert.throws(() => store.create({ sessionBinding: 'short' }), /INVALID_OIDC_SESSION_BINDING/);
  const tx = store.create({ sessionBinding: binding });
  now += 60_001;
  assert.equal(store.consume({ state: tx.state, sessionBinding: binding }), null);
  assert.equal(store.transactions.size, 0);
});
