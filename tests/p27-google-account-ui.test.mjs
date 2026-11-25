import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const accountStart = source.indexOf("} else if (page === 'account') {");
const accountEnd = source.indexOf("} else if (page === 'mercato') {", accountStart);
const accountPage = source.slice(accountStart, accountEnd);

test('account page does not request a username, email or password', () => {
  assert.ok(accountStart >= 0 && accountEnd > accountStart);
  assert.doesNotMatch(accountPage, /account-password|account-username|account-login|account-register|type="password"/);
  assert.match(accountPage, /PROFIL LOCAL ACTIF/);
});

test('Google association is optional and not falsely presented as active', () => {
  assert.match(source, /CONNECTER AVEC GOOGLE · BIENTÔT DISPONIBLE/);
  assert.match(source, /data-action="google-link"/);\n  assert.match(source, /data-action="google-login"/);\n  assert.match(source, /LOCAL_IDENTITY_NOT_SERVER_RESERVED/);
  assert.match(accountPage, /L'association est un choix, pas une condition d'accès au jeu/);
  assert.match(accountPage, /Tant que Google n'est pas associé, les données restent sur cet appareil/);
});

test('Google protection entry points are present on player page and settings', () => {
  assert.match(source, /renderGoogleProtectionCard\(\{ compact: true \}\)/);
  assert.match(source, /Compte et synchronisation/);
  assert.match(source, /data-page="account"/);
});

test('first launch creates a password-free player profile before opening the dashboard', () => {
  assert.match(source, /page === 'onboarding'/);
  assert.match(source, /id="player-onboarding-form"/);
  assert.match(source, /renderPage\(hasSavedPlayerProfile \? 'home' : 'onboarding'\)/);
  assert.match(source, /localPlayerProfileStore\?\.create\(\{ displayName \}\)/);
  assert.match(source, /FRP-000000/);
});
