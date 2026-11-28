import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JsonRpClubSeasonStore } from '../server/rp-club-season-store.js';

test('Club RP seasons require explicit lifecycle and reject overlapping periods', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'p27-rp-seasons-'));
  let now = Date.parse('2026-11-26T12:00:00.000Z');
  try {
    const store = new JsonRpClubSeasonStore(directory, { now:() => now });
    assert.equal(store.create({ id:'season-1', name:'Saison 1', startsAt:'2026-11-26T11:00:00Z', endsAt:'2026-12-26T11:00:00Z' }).ok, true);
    assert.deepEqual(store.create({ id:'season-2', name:'Saison 2', startsAt:'2026-12-01T00:00:00Z', endsAt:'2027-01-01T00:00:00Z' }),
      { ok:false, reason:'RP_CLUB_SEASON_OVERLAP' });
    assert.equal(store.activate('season-1').ok, true);
    assert.equal(store.create({ id:'season-3', name:'Saison 3', startsAt:'2027-01-01T00:00:00Z', endsAt:'2027-02-01T00:00:00Z' }).ok, true);
    assert.deepEqual(store.activate('season-3'), { ok:false, reason:'RP_CLUB_SEASON_ALREADY_ACTIVE' });
  } finally { rmSync(directory, { recursive:true, force:true }); }
});

test('Club RP season standings count only finalized season results once', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'p27-rp-season-results-'));
  try {
    const store = new JsonRpClubSeasonStore(directory, { now:() => Date.parse('2026-11-26T12:00:00Z') });
    store.create({ id:'season-1', name:'Saison 1', startsAt:'2026-11-01T00:00:00Z', endsAt:'2026-12-01T00:00:00Z' });
    store.activate('season-1');
    const input = { seasonId:'season-1', challengeId:'challenge-1', roomId:'room-1',
      challenger:{ id:'club-a', name:'Alpha', tag:'ALP' }, target:{ id:'club-b', name:'Bravo', tag:'BRV' },
      score:{ blue:2, red:1 }, finalizedAt:Date.parse('2026-11-26T11:00:00Z') };
    assert.equal(store.recordResult(input).ok, true);
    assert.equal(store.recordResult(input).duplicate, true);
    assert.deepEqual(store.recordResult({ ...input, roomId:'room-other' }),
      { ok:false, reason:'RP_CLUB_SEASON_RESULT_CONFLICT' });
    const standings = store.leaderboard('season-1');
    assert.equal(standings[0].clubId, 'club-a');
    assert.equal(standings[0].points, 3);
    assert.equal(standings[0].goalsFor, 2);
    assert.equal(standings[1].losses, 1);
    assert.equal(store.close('season-1').ok, true);
    assert.deepEqual(store.recordResult(input), { ok:false, reason:'RP_CLUB_SEASON_NOT_ACTIVE' });
  } finally { rmSync(directory, { recursive:true, force:true }); }
});
