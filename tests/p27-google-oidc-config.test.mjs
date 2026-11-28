import test from 'node:test';
import assert from 'node:assert/strict';
import { readGoogleOidcConfig } from '../server/google-oidc-config.js';

const valid = {
  GOOGLE_CLIENT_ID: 'p27-test.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'test-secret-never-return-this',
  GOOGLE_REDIRECT_URI: 'https://game.example.com/auth/google/callback'
};

test('Google OIDC config stays optional and reports missing values without failing the game', () => {
  const config = readGoogleOidcConfig({});
  assert.equal(config.configured, false);
  assert.deepEqual(config.publicStatus.missing, ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI']);
  assert.equal(config.publicStatus.status, 'not-configured');
  assert.equal(JSON.stringify(config.publicStatus).includes('test-secret'), false);
});

test('Google OIDC config accepts a complete HTTPS provider configuration', () => {
  const config = readGoogleOidcConfig(valid);
  assert.equal(config.configured, true);
  assert.equal(config.clientId, valid.GOOGLE_CLIENT_ID);
  assert.equal(config.clientSecret, valid.GOOGLE_CLIENT_SECRET);
  assert.equal(config.redirectUri, valid.GOOGLE_REDIRECT_URI);
  assert.equal(config.issuer, 'https://accounts.google.com');
  assert.equal(config.publicStatus.status, 'configured-awaiting-oidc-integration');
});

test('Google OIDC config rejects insecure non-local redirect URIs and malformed client IDs', () => {
  const config = readGoogleOidcConfig({
    ...valid,
    GOOGLE_CLIENT_ID: 'not-a-google-client',
    GOOGLE_REDIRECT_URI: 'http://game.example.com/auth/google/callback'
  });
  assert.equal(config.configured, false);
  assert.deepEqual(config.publicStatus.invalid.sort(), ['GOOGLE_CLIENT_ID', 'GOOGLE_REDIRECT_URI']);
});

test('Google OIDC config allows localhost HTTP for development only', () => {
  const config = readGoogleOidcConfig({ ...valid, GOOGLE_REDIRECT_URI: 'http://localhost:4173/auth/google/callback' });
  assert.equal(config.configured, true);
});
