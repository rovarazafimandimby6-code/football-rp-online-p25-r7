import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CLUBS, ClubManager } from '../src/club-manager.js';

const manager = new ClubManager(DEFAULT_CLUBS, { getItem(){return null;}, setItem(){return true;} }, 'kit-test');

test('P23: chaque club possède un motif de maillot distinct', () => {
  const clubs = manager.listClubs();
  const designs = clubs.map(club => club.roster[0]?.appearance?.kitDesign);
  assert.equal(clubs.length, 156);
  assert.ok(new Set(designs).size >= 10);
  assert.ok(designs.every(Boolean));
  const visualIdentities = clubs.map(club => [club.roster[0]?.appearance?.kitDesign, ...club.colors].join('|'));
  assert.equal(new Set(visualIdentities).size, 156);
});

test('P23: les tenues de gardien sont différenciées de celles des joueurs de champ', () => {
  for (const club of manager.listClubs()) {
    const keeper = club.roster.find(player => player.role === 'GK');
    const outfield = club.roster.find(player => player.role !== 'GK');
    assert.equal(keeper.appearance.kitVariant, 'goalkeeper');
    assert.equal(outfield.appearance.kitVariant, 'outfield');
    assert.notDeepEqual(keeper.appearance.kitColors, outfield.appearance.kitColors);
  }
});

test('P23: chaque tenue conserve les trois couleurs valides du club', () => {
  for (const club of manager.listClubs()) for (const player of club.roster) {
    const colors = player.appearance.kitColors;
    assert.ok(['primary','secondary','accent'].every(key => /^#[0-9a-f]{6}$/i.test(colors[key])));
  }
});
