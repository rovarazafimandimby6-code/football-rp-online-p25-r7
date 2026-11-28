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

test('Google association stays optional and the linked recovery actions are wired', () => {
  assert.match(source, /data-action="google-link"/);
  assert.match(source, /data-action="google-login"/);
  assert.match(source, /LOCAL_IDENTITY_NOT_SERVER_RESERVED/);
  assert.ok(source.includes("/api/auth/google/link/start"));
  assert.ok(source.includes("accountClient.resumeCookieSession().catch"));
  assert.match(source, /Google OAuth doit encore être configuré sur le serveur/);
  assert.match(source, /Le parcours Google est intégré au code/);
  assert.match(source, /synchronisation complète de la carrière est en cours/);
  assert.match(accountPage, /L'association est un choix, pas une condition d'accès au jeu/);
  assert.match(accountPage, /Tant que Google n'est pas associé, les données restent sur cet appareil/);
});
test('Google protection stays on the player/account path while Settings remains a simple entry point', () => {
  assert.match(source, /renderGoogleProtectionCard\(\{ compact: true \}\)/);
  assert.match(source, /page === 'settings'/);
  assert.match(source, /Les options détaillées seront ajoutées après la finalisation des écrans principaux/);
  assert.match(source, /page === 'account'/);
});

test('first launch creates a password-free player profile before opening the dashboard', () => {
  assert.match(source, /page === 'onboarding'/);
  assert.match(source, /id="player-onboarding-form"/);
  assert.match(source, /renderPage\(hasSavedPlayerProfile \? 'home' : 'onboarding'\)/);
  assert.match(source, /localPlayerProfileStore\?\.create\(\{ displayName \}\)/);
  assert.match(source, /FRP-\[0-9\]\{6\}/);
});
