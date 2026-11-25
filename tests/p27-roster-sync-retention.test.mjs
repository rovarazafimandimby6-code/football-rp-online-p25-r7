import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonTransferStore } from '../server/transfer-store.js';

function setup() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'p27-roster-outbox-'));
  let now = Date.parse('2027-01-15T12:00:00.000Z');
  const store = new JsonTransferStore(directory, { now: () => now });
  return { directory, store, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

test('P27 outbox roster: conserve les opérations en attente en compactant les anciennes opérations terminées', () => {
  const f = setup();
  try {
    const pending = {
      id: 'roster-old-pending', eventId: 'event-old-pending', playerId: 'human-pending',
      action: 'release', clubId: null, previousClubId: 'antananarivo-fc',
      status: 'pending', attempts: 3
    };
    const completed = Array.from({ length: 9_999 }, (_, index) => ({
      id: `roster-completed-${index}`, eventId: `event-completed-${index}`,
      playerId: `human-completed-${index}`, action: 'release', status: 'completed'
    }));
    f.store.state.rosterSync = [pending, ...completed];
    f.store.persist();

    const signed = f.store.signContract('outbox-new-player', {
      clubId: 'toamasina-united', salary: 1_000, durationDays: 90
    });
    assert.equal(signed.ok, true);
    assert.equal(f.store.state.rosterSync.length, 10_000);
    assert.ok(f.store.state.rosterSync.some(item => item.id === pending.id));
    assert.equal(f.store.pendingRosterSync().length, 2);

    const restored = new JsonTransferStore(f.directory);
    assert.ok(restored.pendingRosterSync().some(item => item.id === pending.id));
    assert.ok(restored.pendingRosterSync().some(item => item.playerId === signed.career.playerId));
  } finally {
    f.cleanup();
  }
});

test('P27 outbox roster: refuse sans mutation quand les 10 000 opérations sont en attente', () => {
  const f = setup();
  try {
    f.store.state.rosterSync = Array.from({ length: 10_000 }, (_, index) => ({
      id: `roster-pending-${index}`, eventId: `event-pending-${index}`,
      playerId: `human-pending-${index}`, action: 'release', status: 'pending'
    }));
    f.store.persist();

    assert.throws(() => f.store.signContract('outbox-overflow', {
      clubId: 'toamasina-united', salary: 1_000, durationDays: 90
    }), /ROSTER_SYNC_QUEUE_FULL/);
    const career = f.store.getCareer('outbox-overflow');
    assert.equal(career.clubId, null);
    assert.equal(career.contract, null);
    assert.equal(f.store.pendingRosterSync().length, 10_000);
  } finally {
    f.cleanup();
  }
});
