import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonPlayerProfileStore } from '../server/player-profile-store.js';

test('P27 profil cloud : conserve identité et apparence par compte après redémarrage', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'fpro-profile-'));
  try {
    const store = new JsonPlayerProfileStore(directory);
    store.save('account-a', {
      identity: { displayName: 'Rova', number: 17, preferredFoot: 'left', role: 'FWD' },
      appearance: { kit: 'crimson', skinTone: 'dark', hairStyle: 'fade', hairColor: 'brown', bodyBuild: 'lean' },
      progression: { level: 99, coins: 999999, attributes: { pace: 99 } }
    });
    const restored = new JsonPlayerProfileStore(directory);
    const profile = restored.get('account-a');
    assert.equal(profile.identity.displayName, 'Rova');
    assert.equal(profile.identity.number, 17);
    assert.equal(profile.appearance.kit, 'crimson');
    assert.equal(profile.appearance.hairStyle, 'fade');
    assert.equal(Object.hasOwn(profile, 'progression'), false);
    assert.equal(restored.get('account-b'), null);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('P27 profil cloud : filtre les valeurs inconnues et écrit un fichier privé sans données de progression', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'fpro-profile-'));
  try {
    const store = new JsonPlayerProfileStore(directory);
    const profile = store.save('account-safe', {
      identity: { displayName: '<script>Rova</script>', number: 500, preferredFoot: 'other', role: 'ADMIN' },
      appearance: { kit: 'unknown', skinTone: 'alien', hairStyle: 'fade', hairColor: 'purple', bodyBuild: 'huge' },
      progression: { coins: 1000000000, level: 99 }
    });
    assert.equal(profile.identity.displayName.includes('<'), false);
    assert.equal(profile.identity.number, 99);
    assert.equal(profile.identity.preferredFoot, 'right');
    assert.equal(profile.identity.role, 'MID');
    assert.equal(profile.appearance.kit, 'emerald');
    assert.equal(profile.appearance.skinTone, 'medium');
    const raw = readFileSync(path.join(directory, 'player-profiles.json'), 'utf8');
    assert.equal(raw.includes('progression'), false);
    assert.equal(raw.includes('1000000000'), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
