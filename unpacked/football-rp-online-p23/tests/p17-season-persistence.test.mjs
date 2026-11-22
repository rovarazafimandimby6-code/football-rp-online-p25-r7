import test from 'node:test';
import assert from 'node:assert/strict';
import { ClubManager } from '../src/club-manager.js';
import { readFile } from 'node:fs/promises';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('P17 : calendrier, résultats et classement survivent au rechargement', () => {
  const storage = memoryStorage();
  const first = new ClubManager(undefined, storage, 'season-test');
  assert.equal(first.createFixture({ id: 'fixture-1', homeClubId: 'antananarivo-fc', awayClubId: 'toamasina-united', scheduledAt: '2026-11-23T12:00:00Z' }).ok, true);
  assert.equal(first.resolveAttendance('fixture-1', 5, 5).result.format, '5v5');
  assert.equal(first.recordResult('fixture-1', 2, 1).ok, true);
  const restored = new ClubManager(undefined, storage, 'season-test');
  assert.equal(restored.fixtures.length, 1);
  assert.equal(restored.fixtures[0].status, 'completed');
  assert.equal(restored.getClub('antananarivo-fc').points, 3);
  assert.equal(restored.getClub('antananarivo-fc').goalsFor, 2);
  assert.equal(restored.getClub('toamasina-united').losses, 1);
});

test('P17 : état local corrompu ou fixtures invalides ne bloquent pas le gestionnaire', () => {
  const storage = { getItem: () => '{bad json', setItem: () => {} };
  const manager = new ClubManager(undefined, storage, 'broken-season');
  assert.equal(manager.listClubs().length, 16);
  assert.equal(manager.fixtures.length, 0);
});

test('P17 : seules les passes du joueur contrôlé confirmées par réception sont comptées', async () => {
  const game = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
  assert.match(game, /pendingControlledPass = target \? \{ passer, target, remaining: 4\.5 \} : null/);
  assert.match(game, /this\.ball\.owner === this\.pendingControlledPass\.target/);
  assert.match(game, /this\.playerMatchStats\.completedPasses\+\+/);
  assert.match(game, /this\.pendingControlledPass\.remaining <= 0/);
});
