import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

test('Google OIDC transactions survive a server restart and remain single-use', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'fpro-oidc-transactions-'));
  try {
    const first = new GoogleOidcTransactionStore({ directory });
    const tx = first.create({ sessionBinding: binding });
    const disk = readFileSync(path.join(directory, 'google-oidc-transactions.json'), 'utf8');
    assert.equal(disk.includes(tx.state), false);
    assert.equal(disk.includes(binding), false);
    const restarted = new GoogleOidcTransactionStore({ directory });
    assert.equal(restarted.consume({ state: tx.state, sessionBinding: binding }).nonce, tx.nonce);
    const secondRestart = new GoogleOidcTransactionStore({ directory });
    assert.equal(secondRestart.consume({ state: tx.state, sessionBinding: binding }), null);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Google OIDC transaction persistence rejects corrupt files without resetting pending state', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'fpro-oidc-corrupt-'));
  try {
    const store = new GoogleOidcTransactionStore({ directory });
    const tx = store.create({ sessionBinding: binding });
    const file = path.join(directory, 'google-oidc-transactions.json');
    const valid = readFileSync(file, 'utf8');
    assert.ok(valid.includes(tx.nonce));
    writeFileSync(file, '{broken');
    assert.throws(() => new GoogleOidcTransactionStore({ directory }), /STORE_CORRUPT/);
    assert.equal(store.consume({ state: tx.state, sessionBinding: binding }).nonce, tx.nonce);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
