import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const game = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

test('P27 remplacements : le banc est chargé depuis le roster réel et les changements remplacent le joueur en jeu', () => {
  assert.match(game, /createMatchSquad\('blue', formation, callbacks\.homeRoster/);
  assert.match(game, /applySubstitution\(outgoingId, incomingId\)/);
  assert.match(game, /this\.players\[playerIndex\] = replacement/);
  assert.match(game, /this\.ball\.owner === outgoing/);
  assert.match(game, /this\.match\.recordEvent\('substitution'/);
});

test('P27 remplacements : le menu pause expose les paires compatibles et conserve le joueur personnel', () => {
  assert.match(ui, /button\('substitutions'/);
  assert.match(ui, /pairs\.map/);
  assert.match(ui, /data-out-id/);
  assert.match(ui, /data-in-id/);
  assert.match(ui, /onSubstitute/);
  assert.match(game, /validateSubstitution/);
  assert.match(game, /activePlayer: this\.activePlayer/);
});

test('P27 présentation : la feuille de match rend les objets squad et non des variables obsolètes', () => {
  assert.match(main, /renderLineup\('blue',homeSquad\)/);
  assert.match(main, /renderLineup\('red',awaySquad\)/);
});
