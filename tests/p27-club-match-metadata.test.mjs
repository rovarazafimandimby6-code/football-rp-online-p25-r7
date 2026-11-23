import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { JsonResultStore } from '../server/result-store.js';
import { RoomManager } from '../server/room-manager.js';

test('P27: les salons associent uniquement des clubs fictifs connus du catalogue', () => {
  const manager = new RoomManager();
  const created = manager.create({ blueClubId: 'fianarantsoa-athletic', redClubId: 'antananarivo-fc' });
  assert.equal(created.teams.blue.name, 'Fianarantsoa Highland');
  assert.equal(created.teams.red.name, 'Antananarivo Crown FC');
  assert.deepEqual(created.teams.blue.colors, ['#7856b8','#34215e','#e6d8ff']);
  assert.throws(() => manager.create({ blueClubId: 'unknown-club', redClubId: 'antananarivo-fc' }), /INVALID_CLUB/);
  assert.throws(() => manager.create({ blueClubId: 'antananarivo-fc', redClubId: 'antananarivo-fc' }), /INVALID_CLUB_MATCHUP/);
  assert.throws(() => manager.create({ blueClubId: 'fianarantsoa-athletic' }), /INVALID_CLUB_MATCHUP/);
});

test('P27: les identités de clubs sont incluses dans les états publics et les résultats archivés', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'fpro-p27-clubs-'));
  try {
    const store = new JsonResultStore(directory);
    const manager = new RoomManager({ now: () => 123456, resultStore: store });
    const created = manager.create({ blueClubId: 'fianarantsoa-athletic', redClubId: 'antananarivo-fc' });
    const joined = manager.join(created.id, { displayName: 'Testeur' });
    const state = manager.get(created.id);
    assert.equal(state.teams.blue.id, 'fianarantsoa-athletic');
    assert.equal(state.teams.red.id, 'antananarivo-fc');
    assert.equal(Object.values(state.players[0]).includes(joined.token), false);
    const room = manager.rooms.get(created.id);
    room.phase = 'fulltime';
    room.elapsedMs = 300000;
    const result = manager.finalizeResult(room);
    assert.equal(result.teams.blue.name, 'Fianarantsoa Highland');
    assert.equal(result.teams.red.name, 'Antananarivo Crown FC');
    const restored = new JsonResultStore(directory).get(created.id);
    assert.equal(restored.teams.blue.name, 'Fianarantsoa Highland');
    assert.equal(restored.teams.red.name, 'Antananarivo Crown FC');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('P27: les feuilles de résultats restent rétrocompatibles sans identité de club', () => {
  const manager = new RoomManager();
  const created = manager.create();
  const room = manager.rooms.get(created.id);
  room.phase = 'fulltime';
  room.elapsedMs = 300000;
  const result = manager.finalizeResult(room);
  assert.deepEqual(result.teams, { blue: null, red: null });
});

test('P27: la création de match utilise le club de carrière et affiche les noms archivés', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /const homeClub = career\.clubId \? clubs\.getClub\(career\.clubId\) : null/);
  assert.match(main, /const clubMatch = homeClub && awayClub \? \{ blueClubId: homeClub\.id, redClubId: awayClub\.id \} : \{\}/);
  assert.match(main, /result\.teams\?\.\[key\]\?\.name/);
  assert.match(main, /result\.teams\?\.\[player\.team\]\?\.name/);
});

test('P27: un salon vide reste joignable jusqu’à expiration de son TTL', () => {
  let now = 1000;
  const manager = new RoomManager({ now: () => now, roomTtlMs: 60_000 });
  const created = manager.create();
  now += 50;
  manager.tick(0.05);
  assert.equal(manager.get(created.id).id, created.id);
  assert.doesNotThrow(() => manager.join(created.id, { displayName: 'Premier joueur' }));
});
