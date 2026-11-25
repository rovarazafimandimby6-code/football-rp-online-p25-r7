import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonGoogleIdentityStore } from '../server/google-identity-store.js';

const accountA = '123e4567-e89b-42d3-a456-426614174000';
const accountB = '123e4567-e89b-42d3-a456-426614174001';
const temp = () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'p27-google-identities-'));
  return { directory, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
};

test('Google identity links enforce verified one-to-one ownership and survive restart', () => {
  const t = temp();
  try {
    const store = new JsonGoogleIdentityStore(t.directory, { now: () => 1_800_000_000_000 });
    assert.throws(() => store.linkInitial({ accountId: accountA, googleSubject: 'google-subject-0001' }), /GOOGLE_IDENTITY_NOT_VERIFIED/);
    store.linkInitial({ accountId: accountA, googleSubject: 'google-subject-0001', googleIdentityVerified: true });
    assert.throws(() => store.linkInitial({ accountId: accountA, googleSubject: 'google-subject-0002', googleIdentityVerified: true }), /ACCOUNT_ALREADY_LINKED/);
    assert.throws(() => store.linkInitial({ accountId: accountB, googleSubject: 'google-subject-0001', googleIdentityVerified: true }), /GOOGLE_ALREADY_LINKED/);
    const restarted = new JsonGoogleIdentityStore(t.directory);
    assert.equal(restarted.getByAccountId(accountA).googleSubject, 'google-subject-0001');
    assert.equal(restarted.getByGoogleSubject('google-subject-0001').accountId, accountA);
  } finally { t.cleanup(); }
});

test('Google ownership transfer requires both verified identities and explicit confirmation', () => {
  const t = temp();
  try {
    const store = new JsonGoogleIdentityStore(t.directory);
    store.linkInitial({ accountId: accountA, googleSubject: 'google-subject-0001', googleIdentityVerified: true });
    assert.throws(() => store.transfer({
      accountId: accountA, currentGoogleSubject: 'google-subject-0001',
      newGoogleSubject: 'google-subject-0002', currentIdentityVerified: true,
      newIdentityVerified: true
    }), /GOOGLE_TRANSFER_NOT_CONFIRMED/);
    store.transfer({
      accountId: accountA, currentGoogleSubject: 'google-subject-0001',
      newGoogleSubject: 'google-subject-0002', currentIdentityVerified: true,
      newIdentityVerified: true, confirmed: true
    });
    assert.equal(store.getByGoogleSubject('google-subject-0001'), null);
    assert.equal(store.getByGoogleSubject('google-subject-0002').accountId, accountA);
    assert.equal(store.state.audit.at(-1).type, 'google_transferred');
  } finally { t.cleanup(); }
});

test('Google identity store fails closed instead of silently dropping malformed ownership rows', () => {
  const t = temp();
  try {
    writeFileSync(path.join(t.directory, 'google-identities.json'), JSON.stringify({
      version: 1,
      links: [{ accountId: 'not-an-account-id', googleSubject: 'google-subject-0001', linkedAt: new Date().toISOString() }],
      audit: []
    }));
    assert.throws(() => new JsonGoogleIdentityStore(t.directory), /GOOGLE_IDENTITY_STORE_CORRUPT/);
  } finally { t.cleanup(); }
});

test('Google identity store rejects malformed account IDs and does not persist unverified subjects', () => {
  const t = temp();
  try {
    const store = new JsonGoogleIdentityStore(t.directory);
    assert.throws(() => store.linkInitial({ accountId: 'account-1', googleSubject: 'google-subject-0001', googleIdentityVerified: true }), /INVALID_ACCOUNT_ID/);
    assert.equal(JSON.parse(readFileSync(path.join(t.directory, 'google-identities.json'), 'utf8')).links.length, 0);
  } finally { t.cleanup(); }
});
