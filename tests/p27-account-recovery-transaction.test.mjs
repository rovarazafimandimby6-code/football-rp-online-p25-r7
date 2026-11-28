import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreAccountSnapshot } from '../src/account-recovery.js';

const revision = 'a'.repeat(64);
const preview = () => ({
  ready: true,
  reason: 'EXPLICIT_RESTORE_CONFIRMATION_REQUIRED',
  revision,
  snapshot: {
    schemaVersion: 1,
    profile: { identity: { displayName: 'Rova' } },
    progression: {}, career: {}, playerCareer: {}, seasonStats: {}, contract: {}
  }
});
const adapter = (id, covered, events, overrides = {}) => ({
  id, sections: covered,
  prepare: async snapshot => { events.push(`prepare:${id}`); return { name: snapshot.profile.identity.displayName }; },
  capture: async () => { events.push(`capture:${id}`); return { previous: id }; },
  apply: async value => { events.push(`apply:${id}:${value.name}`); },
  rollback: async backup => { events.push(`rollback:${id}:${backup.previous}`); },
  ...overrides
});
const adapters = (events, overrides = {}) => [
  adapter('profile-progression', ['profile', 'progression'], events, overrides.profile),
  adapter('career', ['career'], events, overrides.career),
  adapter('player-career', ['playerCareer'], events, overrides.playerCareer),
  adapter('season-stats', ['seasonStats'], events, overrides.seasonStats),
  adapter('contract', ['contract'], events, overrides.contract)
];

test('P27 restauration : exige une confirmation explicite avant toute écriture', async () => {
  const events = [];
  const result = await restoreAccountSnapshot({ preview: preview(), currentRevision: revision, adapters: adapters(events) });
  assert.deepEqual(result, { ok: false, reason: 'RESTORE_CONFIRMATION_REQUIRED' });
  assert.deepEqual(events, []);
});

test('P27 restauration : refuse une révision qui a changé depuis la prévisualisation', async () => {
  const events = [];
  const result = await restoreAccountSnapshot({ preview: preview(), currentRevision: 'b'.repeat(64), confirmed: true, adapters: adapters(events) });
  assert.deepEqual(result, { ok: false, reason: 'SNAPSHOT_REVISION_CHANGED' });
  assert.deepEqual(events, []);
});

test('P27 restauration : prépare et sauvegarde tous les stores avant la première écriture', async () => {
  const events = [];
  const result = await restoreAccountSnapshot({ preview: preview(), currentRevision: revision, confirmed: true, adapters: adapters(events) });
  assert.equal(result.ok, true);
  assert.deepEqual(events, [
    'prepare:profile-progression', 'prepare:career', 'prepare:player-career', 'prepare:season-stats', 'prepare:contract',
    'capture:profile-progression', 'capture:career', 'capture:player-career', 'capture:season-stats', 'capture:contract',
    'apply:profile-progression:Rova', 'apply:career:Rova', 'apply:player-career:Rova', 'apply:season-stats:Rova', 'apply:contract:Rova'
  ]);
});

test('P27 restauration : restaure en ordre inverse si un store échoue pendant son écriture', async () => {
  const events = [];
  const result = await restoreAccountSnapshot({
    preview: preview(), currentRevision: revision, confirmed: true,
    adapters: adapters(events, { career: { apply: async () => { events.push('apply:career:partial'); throw new Error('write failed'); } } })
  });
  assert.deepEqual(result, { ok: false, reason: 'RESTORE_APPLY_FAILED', rolledBack: true, rollbackFailedAdapters: [] });
  assert.deepEqual(events, [
    'prepare:profile-progression', 'prepare:career', 'prepare:player-career', 'prepare:season-stats', 'prepare:contract',
    'capture:profile-progression', 'capture:career', 'capture:player-career', 'capture:season-stats', 'capture:contract',
    'apply:profile-progression:Rova', 'apply:career:partial',
    'rollback:career:career', 'rollback:profile-progression:profile-progression'
  ]);
});

test('P27 restauration : ne commence aucune écriture si la capture de sauvegarde échoue', async () => {
  const events = [];
  const result = await restoreAccountSnapshot({
    preview: preview(), currentRevision: revision, confirmed: true,
    adapters: adapters(events, { career: { capture: async () => { events.push('capture:career:failed'); throw new Error('backup failed'); } } })
  });
  assert.deepEqual(result, { ok: false, reason: 'RESTORE_BACKUP_FAILED' });
  assert.deepEqual(events, [
    'prepare:profile-progression', 'prepare:career', 'prepare:player-career', 'prepare:season-stats', 'prepare:contract',
    'capture:profile-progression', 'capture:career:failed'
  ]);
});

test('P27 restauration : signale explicitement un rollback incomplet', async () => {
  const events = [];
  const result = await restoreAccountSnapshot({
    preview: preview(), currentRevision: revision, confirmed: true,
    adapters: adapters(events, {
      profile: { rollback: async () => { events.push('rollback:profile-progression:failed'); throw new Error('rollback failed'); } },
      career: { apply: async () => { events.push('apply:career:failed'); throw new Error('write failed'); } }
    })
  });
  assert.equal(result.reason, 'RESTORE_ROLLBACK_FAILED');
  assert.deepEqual(result.rollbackFailedAdapters, ['profile-progression']);
});

test('P27 restauration : refuse les adaptateurs incomplets, dupliqués ou couvrant partiellement les sections', async () => {
  const events = [];
  const full = adapters(events);
  const duplicateId = [...full, { ...full[0] }];
  const missingSection = full.slice(0, -1);
  const incompleteAdapter = [{ id: 'profile-progression', sections: ['profile', 'progression'] }];
  const duplicateResult = await restoreAccountSnapshot({ preview: preview(), currentRevision: revision, confirmed: true, adapters: duplicateId });
  const missingResult = await restoreAccountSnapshot({ preview: preview(), currentRevision: revision, confirmed: true, adapters: missingSection });
  const incompleteResult = await restoreAccountSnapshot({ preview: preview(), currentRevision: revision, confirmed: true, adapters: incompleteAdapter });
  assert.deepEqual(duplicateResult, { ok: false, reason: 'RESTORE_ADAPTERS_DUPLICATED' });
  assert.deepEqual(missingResult, { ok: false, reason: 'RESTORE_ADAPTER_COVERAGE_INVALID' });
  assert.deepEqual(incompleteResult, { ok: false, reason: 'RESTORE_ADAPTERS_INVALID' });
  assert.deepEqual(events, []);
});
