import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreAccountSnapshot } from '../src/account-recovery.js';

const revision = 'a'.repeat(64);
const preview = () => ({
  ready: true,
  reason: 'EXPLICIT_RESTORE_CONFIRMATION_REQUIRED',
  revision,
  snapshot: { schemaVersion: 1, profile: { identity: { displayName: 'Rova' } } }
});
const adapter = (id, events, overrides = {}) => ({
  id,
  prepare: async snapshot => { events.push(`prepare:${id}`); return { name: snapshot.profile.identity.displayName }; },
  capture: async () => { events.push(`capture:${id}`); return { previous: id }; },
  apply: async value => { events.push(`apply:${id}:${value.name}`); },
  rollback: async backup => { events.push(`rollback:${id}:${backup.previous}`); },
  ...overrides
});

test('P27 restauration : exige une confirmation explicite avant toute écriture', async () => {
  const events = [];
  const result = await restoreAccountSnapshot({ preview: preview(), currentRevision: revision, adapters: [adapter('profile', events)] });
  assert.deepEqual(result, { ok: false, reason: 'RESTORE_CONFIRMATION_REQUIRED' });
  assert.deepEqual(events, []);
});

test('P27 restauration : refuse une révision qui a changé depuis la prévisualisation', async () => {
  const events = [];
  const result = await restoreAccountSnapshot({ preview: preview(), currentRevision: 'b'.repeat(64), confirmed: true, adapters: [adapter('profile', events)] });
  assert.deepEqual(result, { ok: false, reason: 'SNAPSHOT_REVISION_CHANGED' });
  assert.deepEqual(events, []);
});

test('P27 restauration : prépare et sauvegarde tous les stores avant la première écriture', async () => {
  const events = [];
  const result = await restoreAccountSnapshot({
    preview: preview(), currentRevision: revision, confirmed: true,
    adapters: [adapter('profile', events), adapter('career', events)]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(events, [
    'prepare:profile', 'prepare:career',
    'capture:profile', 'capture:career',
    'apply:profile:Rova', 'apply:career:Rova'
  ]);
});

test('P27 restauration : restaure en ordre inverse si un store échoue pendant son écriture', async () => {
  const events = [];
  const result = await restoreAccountSnapshot({
    preview: preview(), currentRevision: revision, confirmed: true,
    adapters: [
      adapter('profile', events),
      adapter('career', events, { apply: async () => { events.push('apply:career:partial'); throw new Error('write failed'); } })
    ]
  });
  assert.deepEqual(result, {
    ok: false, reason: 'RESTORE_APPLY_FAILED', rolledBack: true, rollbackFailedAdapters: []
  });
  assert.deepEqual(events, [
    'prepare:profile', 'prepare:career',
    'capture:profile', 'capture:career',
    'apply:profile:Rova', 'apply:career:partial',
    'rollback:career:career', 'rollback:profile:profile'
  ]);
});

test('P27 restauration : ne commence aucune écriture si la capture de sauvegarde échoue', async () => {
  const events = [];
  const result = await restoreAccountSnapshot({
    preview: preview(), currentRevision: revision, confirmed: true,
    adapters: [
      adapter('profile', events),
      adapter('career', events, { capture: async () => { events.push('capture:career:failed'); throw new Error('backup failed'); } })
    ]
  });
  assert.deepEqual(result, { ok: false, reason: 'RESTORE_BACKUP_FAILED' });
  assert.deepEqual(events, [
    'prepare:profile', 'prepare:career',
    'capture:profile', 'capture:career:failed'
  ]);
});

test('P27 restauration : signale explicitement un rollback incomplet', async () => {
  const events = [];
  const result = await restoreAccountSnapshot({
    preview: preview(), currentRevision: revision, confirmed: true,
    adapters: [
      adapter('profile', events, { rollback: async () => { events.push('rollback:profile:failed'); throw new Error('rollback failed'); } }),
      adapter('career', events, { apply: async () => { events.push('apply:career:failed'); throw new Error('write failed'); } })
    ]
  });
  assert.equal(result.reason, 'RESTORE_ROLLBACK_FAILED');
  assert.deepEqual(result.rollbackFailedAdapters, ['profile']);
});

test('P27 restauration : refuse les adaptateurs dupliqués ou incomplets', async () => {
  const events = [];
  const first = adapter('profile', events);
  const duplicate = adapter('profile', events);
  const duplicateResult = await restoreAccountSnapshot({ preview: preview(), currentRevision: revision, confirmed: true, adapters: [first, duplicate] });
  const incompleteResult = await restoreAccountSnapshot({ preview: preview(), currentRevision: revision, confirmed: true, adapters: [{ id: 'career' }] });
  assert.deepEqual(duplicateResult, { ok: false, reason: 'RESTORE_ADAPTERS_DUPLICATED' });
  assert.deepEqual(incompleteResult, { ok: false, reason: 'RESTORE_ADAPTERS_INVALID' });
  assert.deepEqual(events, []);
});
