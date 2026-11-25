import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JsonGoogleIdentityStore } from '../server/google-identity-store.js';

function temporary() {
  const directory = mkdtempSync(path.join(tmpdir(), 'fpro-google-identities-'));
  return { directory, store: new JsonGoogleIdentityStore(directory), cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

test('P27 Google identity: one Google subject maps to only one P27 account', () => {
  const temp = temporary();
  try {
    temp.store.linkInitial({ accountId: 'player-a', googleSubject: 'google-subject-0001', googleIdentityVerified: true });
    assert.equal(temp.store.getByGoogleSubject('google-subject-0001').accountId, 'player-a');
    assert.throws(() => temp.store.linkInitial({ accountId: 'player-b', googleSubject: 'google-subject-0001', googleIdentityVerified: true }), /GOOGLE_ALREADY_LINKED/);
    assert.throws(() => temp.store.linkInitial({ accountId: 'player-a', googleSubject: 'google-subject-0002', googleIdentityVerified: true }), /ACCOUNT_ALREADY_LINKED/);
    assert.equal(temp.store.state.links.length, 1);
  } finally { temp.cleanup(); }
});

test('P27 Google identity: refuses unverified client identity claims', () => {
  const temp = temporary();
  try {
    assert.throws(() => temp.store.linkInitial({ accountId: 'player-a', googleSubject: 'google-subject-0001' }), /GOOGLE_IDENTITY_NOT_VERIFIED/);
    assert.throws(() => temp.store.linkInitial({ accountId: 'player-a', googleSubject: 'bad' , googleIdentityVerified: true }), /INVALID_GOOGLE_SUBJECT/);
    assert.equal(temp.store.state.links.length, 0);
  } finally { temp.cleanup(); }
});

test('P27 Google identity: transfer preserves the P27 account and releases the previous Google identity', () => {
  const temp = temporary();
  try {
    temp.store.linkInitial({ accountId: 'player-a', googleSubject: 'google-subject-0001', googleIdentityVerified: true });
    temp.store.linkInitial({ accountId: 'player-b', googleSubject: 'google-subject-0002', googleIdentityVerified: true });
    assert.throws(() => temp.store.transfer({
      accountId: 'player-a', currentGoogleSubject: 'google-subject-0001', newGoogleSubject: 'google-subject-0002',
      currentIdentityVerified: true, newIdentityVerified: true, confirmed: true
    }), /GOOGLE_ALREADY_LINKED/);
    assert.throws(() => temp.store.transfer({
      accountId: 'player-a', currentGoogleSubject: 'google-subject-0001', newGoogleSubject: 'google-subject-0003',
      currentIdentityVerified: true, newIdentityVerified: true
    }), /GOOGLE_TRANSFER_NOT_CONFIRMED/);
    const moved = temp.store.transfer({
      accountId: 'player-a', currentGoogleSubject: 'google-subject-0001', newGoogleSubject: 'google-subject-0003',
      currentIdentityVerified: true, newIdentityVerified: true, confirmed: true
    });
    assert.equal(moved.accountId, 'player-a');
    assert.equal(temp.store.getByGoogleSubject('google-subject-0001'), null);
    assert.equal(temp.store.getByGoogleSubject('google-subject-0003').accountId, 'player-a');
    assert.equal(temp.store.getByAccountId('player-a').googleSubject, 'google-subject-0003');
    assert.equal(temp.store.getByGoogleSubject('google-subject-0002').accountId, 'player-b');
    assert.equal(temp.store.state.audit.at(-1).type, 'google_transferred');
  } finally { temp.cleanup(); }
});

test('P27 Google identity: transfer rolls back when the current Google owner does not match', () => {
  const temp = temporary();
  try {
    temp.store.linkInitial({ accountId: 'player-a', googleSubject: 'google-subject-0001', googleIdentityVerified: true });
    assert.throws(() => temp.store.transfer({
      accountId: 'player-a', currentGoogleSubject: 'google-subject-wrong', newGoogleSubject: 'google-subject-0003',
      currentIdentityVerified: true, newIdentityVerified: true, confirmed: true
    }), /CURRENT_GOOGLE_MISMATCH/);
    assert.equal(temp.store.getByAccountId('player-a').googleSubject, 'google-subject-0001');
    assert.equal(temp.store.getByGoogleSubject('google-subject-0003'), null);
  } finally { temp.cleanup(); }
});

test('P27 Google identity: mapping survives store restart without storing Google tokens', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'fpro-google-identities-restart-'));
  try {
    const first = new JsonGoogleIdentityStore(directory);
    first.linkInitial({ accountId: 'player-a', googleSubject: 'google-subject-0001', googleIdentityVerified: true });
    const disk = readFileSync(path.join(directory, 'google-identities.json'), 'utf8');
    assert.equal(disk.includes('access_token'), false);
    assert.equal(disk.includes('id_token'), false);
    const restarted = new JsonGoogleIdentityStore(directory);
    assert.equal(restarted.getByGoogleSubject('google-subject-0001').accountId, 'player-a');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
